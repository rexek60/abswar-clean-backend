import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import * as db from "./db.js";
import {
  BANNED_WORDS,
  RANKS,
  RANK_NFT_COSTS,
  getRank,
  getNextRank,
  isCleanText
} from "./lib/rules.js";

dotenv.config();

const NETWORK = (process.env.ABSWAR_NETWORK || process.env.NETWORK || "testnet").toLowerCase();
const IS_MAINNET = NETWORK === "mainnet";
const ABSTRACT_CHAINS = {
  testnet: {
    name: "Abstract Testnet",
    chainId: 11124,
    rpcUrl: "https://api.testnet.abs.xyz",
    explorerUrl: "https://sepolia.abscan.org",
    contractAddress: "0x325b18816734210e9fEbAA0516030A8Ec74bE3d4"
  },
  mainnet: {
    name: "Abstract",
    chainId: 2741,
    rpcUrl: "https://api.mainnet.abs.xyz",
    explorerUrl: "https://abscan.org",
    contractAddress: ""
  }
};
const CHAIN = ABSTRACT_CHAINS[NETWORK] || ABSTRACT_CHAINS.testnet;
const ABSWAR_RPC_URL = process.env.ABSWAR_RPC_URL || CHAIN.rpcUrl;
const ABSWAR_CONTRACT_ADDRESS = process.env.ABSWAR_CONTRACT_ADDRESS || CHAIN.contractAddress;
const AUTH_SECRET = process.env.AUTH_SECRET || randomBytes(32).toString("hex");
const AUTH_TTL_MS = Number(process.env.AUTH_TTL_MS || 24 * 60 * 60 * 1000);
const CHALLENGE_TTL_MS = Number(process.env.CHALLENGE_TTL_MS || 5 * 60 * 1000);
const ALLOW_DEMO_BUY = (process.env.ALLOW_DEMO_BUY === "true" || process.env.ALLOW_DEMO_PURCHASES === "true") && !IS_MAINNET;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://centradar.xyz,https://www.centradar.xyz,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (!process.env.AUTH_SECRET) {
  console.warn("[AUTH] AUTH_SECRET missing; sessions will reset on deploy/restart.");
  if (IS_MAINNET) {
    throw new Error("AUTH_SECRET is required when ABSWAR_NETWORK=mainnet");
  }
}
if (IS_MAINNET && !ethers.isAddress(ABSWAR_CONTRACT_ADDRESS)) {
  throw new Error("ABSWAR_CONTRACT_ADDRESS is required when ABSWAR_NETWORK=mainnet");
}
if (IS_MAINNET && !process.env.ADMIN_TOKEN) {
  throw new Error("ADMIN_TOKEN is required when ABSWAR_NETWORK=mainnet");
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;
const SERVICE_STARTED_AT = Date.now();

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

function corsOrigin(origin, callback) {
  if (!origin || ALLOWED_ORIGINS.includes(origin) || isLoopbackOrigin(origin)) return callback(null, true);
  return callback(new Error("Origin not allowed"));
}

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "64kb" }));

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
  transports: ["polling", "websocket"],   // polling ile başla, websocket'e upgrade et — proxy arkasında güvenli fallback
  pingInterval: 20000,
  pingTimeout: 25000,                       // Railway idle timeout altında tut, ölü bağlantıyı hızlı tespit et
  upgradeTimeout: 30000,
  allowUpgrades: true,
  connectionStateRecovery: {
    maxDisconnectionDuration: 120000,
    skipMiddlewares: true
  }
});

let onlinePlayers = 0;
const START_HP = 1000;
const MAX_HP = 100000;
const SUPERPOWER_ATTACK_MULTIPLIER = 1.5;
const SUPERPOWER_DAMAGE_MULTIPLIER = 0.75;

const countries = [
  ["AF","Afghanistan","🇦🇫"],
  ["AO","Angola","🇦🇴"],
  ["AR","Argentina","🇦🇷"],
  ["AU","Australia","🇦🇺"],
  ["AT","Austria","🇦🇹"],
  ["AZ","Azerbaijan","🇦🇿"],
  ["BJ","Benin","🇧🇯"],
  ["BF","Burkina Faso","🇧🇫"],
  ["BD","Bangladesh","🇧🇩"],
  ["BG","Bulgaria","🇧🇬"],
  ["BY","Belarus","🇧🇾"],
  ["BO","Bolivia","🇧🇴"],
  ["BR","Brazil","🇧🇷"],
  ["BW","Botswana","🇧🇼"],
  ["CF","Central Africa","🇨🇫"],
  ["CA","Canada","🇨🇦"],
  ["CL","Chile","🇨🇱"],
  ["CN","China","🇨🇳"],
  ["CI","Ivory Coast","🇨🇮"],
  ["CM","Cameroon","🇨🇲"],
  ["CD","DR Congo","🇨🇩"],
  ["CG","Congo","🇨🇬"],
  ["CO","Colombia","🇨🇴"],
  ["CU","Cuba","🇨🇺"],
  ["CZ","Czechia","🇨🇿"],
  ["DE","Germany","🇩🇪"],
  ["DZ","Algeria","🇩🇿"],
  ["EC","Ecuador","🇪🇨"],
  ["EG","Egypt","🇪🇬"],
  ["ER","Eritrea","🇪🇷"],
  ["ES","Spain","🇪🇸"],
  ["ET","Ethiopia","🇪🇹"],
  ["FI","Finland","🇫🇮"],
  ["FR","France","🇫🇷"],
  ["GA","Gabon","🇬🇦"],
  ["GB","United Kingdom","🇬🇧"],
  ["GH","Ghana","🇬🇭"],
  ["GN","Guinea","🇬🇳"],
  ["GR","Greece","🇬🇷"],
  ["GL","Greenland","🇬🇱"],
  ["GT","Guatemala","🇬🇹"],
  ["GY","Guyana","🇬🇾"],
  ["HN","Honduras","🇭🇳"],
  ["HU","Hungary","🇭🇺"],
  ["ID","Indonesia","🇮🇩"],
  ["IN","India","🇮🇳"],
  ["IE","Ireland","🇮🇪"],
  ["IR","Iran","🇮🇷"],
  ["IQ","Iraq","🇮🇶"],
  ["IS","Iceland","🇮🇸"],
  ["IT","Italy","🇮🇹"],
  ["JO","Jordan","🇯🇴"],
  ["JP","Japan","🇯🇵"],
  ["KZ","Kazakhstan","🇰🇿"],
  ["KE","Kenya","🇰🇪"],
  ["KG","Kyrgyzstan","🇰🇬"],
  ["KH","Cambodia","🇰🇭"],
  ["KR","South Korea","🇰🇷"],
  ["LA","Laos","🇱🇦"],
  ["LR","Liberia","🇱🇷"],
  ["LY","Libya","🇱🇾"],
  ["LT","Lithuania","🇱🇹"],
  ["LV","Latvia","🇱🇻"],
  ["MA","Morocco","🇲🇦"],
  ["MG","Madagascar","🇲🇬"],
  ["MX","Mexico","🇲🇽"],
  ["ML","Mali","🇲🇱"],
  ["MM","Myanmar","🇲🇲"],
  ["MN","Mongolia","🇲🇳"],
  ["MZ","Mozambique","🇲🇿"],
  ["MR","Mauritania","🇲🇷"],
  ["MW","Malawi","🇲🇼"],
  ["MY","Malaysia","🇲🇾"],
  ["NA","Namibia","🇳🇦"],
  ["NE","Niger","🇳🇪"],
  ["NG","Nigeria","🇳🇬"],
  ["NI","Nicaragua","🇳🇮"],
  ["NO","Norway","🇳🇴"],
  ["NP","Nepal","🇳🇵"],
  ["NZ","New Zealand","🇳🇿"],
  ["OM","Oman","🇴🇲"],
  ["PK","Pakistan","🇵🇰"],
  ["PE","Peru","🇵🇪"],
  ["PH","Philippines","🇵🇭"],
  ["PG","Papua New Guinea","🇵🇬"],
  ["PL","Poland","🇵🇱"],
  ["KP","North Korea","🇰🇵"],
  ["PT","Portugal","🇵🇹"],
  ["PY","Paraguay","🇵🇾"],
  ["RO","Romania","🇷🇴"],
  ["RU","Russia","🇷🇺"],
  ["EH","Western Sahara","🇪🇭"],
  ["SA","Saudi Arabia","🇸🇦"],
  ["SD","Sudan","🇸🇩"],
  ["SS","South Sudan","🇸🇸"],
  ["SN","Senegal","🇸🇳"],
  ["SO","Somalia","🇸🇴"],
  ["RS","Serbia","🇷🇸"],
  ["SR","Suriname","🇸🇷"],
  ["SE","Sweden","🇸🇪"],
  ["SY","Syria","🇸🇾"],
  ["TD","Chad","🇹🇩"],
  ["TH","Thailand","🇹🇭"],
  ["TJ","Tajikistan","🇹🇯"],
  ["TM","Turkmenistan","🇹🇲"],
  ["TN","Tunisia","🇹🇳"],
  ["TR","Türkiye","🇹🇷"],
  ["TZ","Tanzania","🇹🇿"],
  ["UG","Uganda","🇺🇬"],
  ["UA","Ukraine","🇺🇦"],
  ["UY","Uruguay","🇺🇾"],
  ["US","United States","🇺🇸"],
  ["UZ","Uzbekistan","🇺🇿"],
  ["VE","Venezuela","🇻🇪"],
  ["VN","Vietnam","🇻🇳"],
  ["YE","Yemen","🇾🇪"],
  ["ZA","South Africa","🇿🇦"],
  ["ZM","Zambia","🇿🇲"],
  ["ZW","Zimbabwe","🇿🇼"]
].map(([code,name,flag]) => ({
  code, name, flag, hp:START_HP, max_hp:MAX_HP, eliminated:false, isSuperpower:false
}));

const players = new Map();
const recentAttacks = [];
const feedbackItems = [];
// İlk 100 kullanıcı hediye sistemi
const GIFT_LIMIT = 100;       // İlk kaç kullanıcı bonus alır
const GIFT_AMOUNT = 100;      // Bonus mermi miktarı
const NEW_PLAYER_STARTING_BULLETS = 0; // Ayarlanabilir; mevcut DB oyuncularını etkilemez.
const giftedWallets = new Set(); // Hediye alan cüzdanlar
const cooldowns = new Map();
const chatCooldowns = new Map();
const radioCooldowns = new Map();
const alliances = new Map();
const allianceFeed = [];

const dirtyPlayerWallets = new Set();
const dirtyCountryCodes = new Set();
function flushDirtyWrites() {
  for (const w of dirtyPlayerWallets) {
    const p = players.get(w);
    if (p) db.savePlayer(p);
  }
  for (const c of dirtyCountryCodes) {
    const k = countries.find(x => x.code === c);
    if (k) db.saveCountry(k);
  }
  dirtyPlayerWallets.clear();
  dirtyCountryCodes.clear();
}
setInterval(flushDirtyWrites, 1500);

function countryHpCap(_country) {
  return MAX_HP;
}

function clampCountryHp(country) {
  if (!country) return country;
  country.max_hp = countryHpCap(country);
  country.hp = Math.max(0, Math.min(country.max_hp, Number(country.hp) || 0));
  country.isSuperpower = !!country.isSuperpower || country.hp >= MAX_HP;
  country.eliminated = !!country.eliminated || country.hp <= 0;
  return country;
}

function resetCountryForNewRound(country) {
  country.hp = START_HP;
  country.max_hp = MAX_HP;
  country.eliminated = false;
  country.isSuperpower = false;
}

function markSuperpower(country) {
  if (!country || country.isSuperpower) return false;
  country.isSuperpower = true;
  country.hp = MAX_HP;
  const message = `🌟 ${country.flag || ""} ${country.name || country.code} SÜPER GÜÇ oldu!`;
  io.emit("country:superpower", { country:country.code, hp:country.hp, isSuperpower:true, message });
  addAllianceFeed("SUPERPOWER", message, { country:country.code });
  return true;
}

function addCountryHp(country, amount) {
  if (!country || country.eliminated) return false;
  const beforeSuperpower = !!country.isSuperpower;
  country.max_hp = MAX_HP;
  country.hp = Math.min(MAX_HP, Math.max(0, Number(country.hp) || 0) + Math.max(0, Number(amount) || 0));
  if (!beforeSuperpower && country.hp >= MAX_HP) return markSuperpower(country);
  return false;
}

// ── TUR / OYUN DÖNGÜSÜ ─────────────────────────
const ROUND_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 gün
let roundNumber = 1;
let roundStartTime = Date.now();
let roundEndTime = roundStartTime + ROUND_DURATION_MS;
let roundStatus = 'active'; // active | ended | claiming
let lastRoundResult = null;  // { roundNumber, winners:[{rank,country,share,topPlayer}], endedAt, totalPool }

function timeRemainingMs() {
  return Math.max(0, roundEndTime - Date.now());
}

function getLeaderboard() {
  return [...countries]
    .filter(c => !c.eliminated)
    .sort((a,b) => (b.hp||0) - (a.hp||0));
}

function getTopPlayerOfCountry(countryCode) {
  let top = null;
  for (const p of players.values()) {
    if (p.country_code === countryCode) {
      if (!top || (p.contribution||0) > (top.contribution||0)) top = p;
    }
  }
  return top;
}

function computeRoundResult() {
  // Önce eliminasyon kontrolü — bir tek ülke kaldıysa veya hepsi gitti
  const alive = countries.filter(c => !c.eliminated);
  let winners;

  if (alive.length === 1) {
    // Mutlak galip
    const sorted = getLeaderboard();
    winners = sorted.slice(0,3);
  } else {
    // Süre doldu — en yüksek HP'li 3 ülke
    winners = getLeaderboard().slice(0,3);
  }

  // %60 / %25 / %15
  const shares = [60, 25, 15];
  return winners.map((c, i) => ({
    rank: i+1,
    country: c.code,
    countryName: c.name,
    flag: c.flag,
    hp: c.hp,
    isSuperpower: !!c.isSuperpower,
    sharePct: shares[i] || 0,
    topPlayer: getTopPlayerOfCountry(c.code)?.wallet || null,
    topPlayerContribution: getTopPlayerOfCountry(c.code)?.contribution || 0
  }));
}

function persistRoundState() {
  db.saveGameState('round', { roundNumber, roundStatus, roundStartTime, roundEndTime, lastRoundResult });
}

// İttifakı DB'ye kaydet — members Set'ini array'e çevirir (DB JSON array bekler)
function persistAlliance(a) {
  if (!a) return;
  db.saveAlliance({
    id: a.id,
    name: a.name,
    leader: a.leader,
    country_code: a.country_code || null,
    members: a.members instanceof Set ? [...a.members] : (a.members || []),
    score: a.score || 0,
    created_at: a.created_at || Date.now()
  });
}

function endRound() {
  if (roundStatus !== 'active') return;
  roundStatus = 'ended';
  const winners = computeRoundResult();
  lastRoundResult = {
    roundNumber,
    endedAt: Date.now(),
    winners,
    note: 'Ödüller admin onayı bekliyor (smart contract payReward).'
  };
  io.emit('round:ended', lastRoundResult);
  persistRoundState();
  try {
    const economy = economyState();
    const winnerLines = winners.slice(0, 3).map(w =>
      `${w.rank}. ${w.flag || ""} ${w.countryName || w.country} - %${w.sharePct} - top: ${w.topPlayer || "-"}`
    );
    sendDiscordAlert(`🏁 TUR ${roundNumber} BİTTİ — ödeme bekleniyor`, [
      ...winnerLines,
      `Ödül havuzu: ${economy.rewardPoolEth || "0"} ETH`,
      `Top oyuncular: ${winners.map(w => w.topPlayer).filter(Boolean).join(", ") || "-"}`
    ]).catch(e => console.warn("[ROUND] Discord alert failed:", e.message));
  } catch (e) {
    console.warn("[ROUND] Discord alert skipped:", e.message);
  }
  console.log(`[ROUND ${roundNumber}] BİTTİ — Kazananlar:`, winners.map(w=>`${w.flag} ${w.country} (${w.sharePct}%)`).join(' | '));
}

function startNewRound() {
  roundNumber++;
  roundStartTime = Date.now();
  roundEndTime = roundStartTime + ROUND_DURATION_MS;
  roundStatus = 'active';
  // Ülkeleri sıfırla
  countries.forEach(resetCountryForNewRound);
  // Saldırı geçmişi & ittifak feed temizle (oyuncular ve mermileri korunur)
  recentAttacks.length = 0;
  cooldowns.clear();
  allianceFeed.length = 0;
  // İttifak skorlarını sıfırla
  alliances.forEach(a => { a.score = 0; persistAlliance(a); });
  // DB'ye yaz: ülkeler + tur durumu
  db.saveAllCountries(countries);
  persistRoundState();
  io.emit('round:started', { roundNumber, roundStartTime, roundEndTime });
  emitState();
  console.log(`[ROUND ${roundNumber}] BAŞLADI`);
}

// Her dakika kontrol et — tur süresi doldu mu?
setInterval(() => {
  if (roundStatus === 'active') {
    const alive = countries.filter(c => !c.eliminated);
    if (Date.now() >= roundEndTime || alive.length <= 1) {
      endRound();
    }
  }
}, 60 * 1000);

// --- AUTH / WALLET OWNERSHIP ---
const authChallenges = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [wallet, challenge] of authChallenges) {
    if (!challenge || challenge.expiresAt < now) authChallenges.delete(wallet);
  }
}, 60 * 1000);

function normalizeWallet(w) {
  if (typeof w !== "string") return null;
  try {
    if (!ethers.isAddress(w)) return null;
    return ethers.getAddress(w).toLowerCase();
  } catch {
    return null;
  }
}

const ADMIN_OWNER_WALLET = normalizeWallet(
  process.env.ADMIN_OWNER_WALLET || "0x9C5e9dB5836e9c95be7cBec023D543c36E865B5B"
);

function safeEq(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function signTokenPayload(payload) {
  return createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
}

function issueSessionToken(wallet) {
  const exp = Date.now() + AUTH_TTL_MS;
  const payload = base64url(JSON.stringify({
    wallet,
    exp,
    iat: Date.now(),
    sid: randomBytes(12).toString("hex")
  }));
  return { token: `${payload}.${signTokenPayload(payload)}`, expiresAt: exp };
}

function verifySessionToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEq(signature, signTokenPayload(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || Date.now() > data.exp) return null;
    const wallet = normalizeWallet(data.wallet);
    if (!wallet) return null;
    return { wallet, expiresAt: data.exp };
  } catch {
    return null;
  }
}

function makeChallengeMessage(wallet, nonce, expiresAt) {
  return [
    "Centradar wallet login",
    "",
    `Wallet: ${ethers.getAddress(wallet)}`,
    `Network: ${CHAIN.name}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "Only sign this message on centradar.xyz. This does not authorize a blockchain transaction."
  ].join("\n");
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = verifySessionToken(token);
  if (!session) {
    return res.status(401).json({ code:"AUTH_REQUIRED", error:"Cuzdan imzasi gerekli" });
  }
  const bodyWallet = normalizeWallet(req.body && req.body.wallet);
  if (bodyWallet && bodyWallet !== session.wallet) {
    return res.status(403).json({ code:"WALLET_MISMATCH", error:"Oturum cuzdanla eslesmiyor" });
  }
  req.wallet = session.wallet;
  if (req.body) req.body.wallet = session.wallet;
  next();
}

function allianceRoomId(allianceId) {
  return `alliance:${String(allianceId || "")}`;
}

function socketSession(socket) {
  const token = socket && socket.handshake && socket.handshake.auth && socket.handshake.auth.token;
  const session = verifySessionToken(token);
  if (!session) return null;
  const player = players.get(session.wallet);
  const allianceId = player && player.alliance_id && alliances.has(player.alliance_id) ? player.alliance_id : null;
  return { wallet:session.wallet, allianceId };
}

// --- CHAIN PAYMENT VERIFICATION ---
const provider = new ethers.JsonRpcProvider(ABSWAR_RPC_URL, CHAIN.chainId);
const BUY_AMMO_SELECTOR = "0x499eb3de";
const REWARD_POOL_SELECTOR = "0x66666aa9";
const ERC1271_MAGIC_VALUE = "0x1626ba7e";
const AGW_FACTORY_ADDRESS = process.env.AGW_FACTORY_ADDRESS || "0xe86Bf72715dF28a0b7c3C8F596E7fE05a22A139c";
const signatureInterface = new ethers.Interface([
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"
]);
const agwFactoryInterface = new ethers.Interface([
  "function getAddressForSalt(bytes32 salt) view returns (address)"
]);
const ammoInterface = new ethers.Interface([
  "event AmmoPurchased(address indexed buyer, uint256 amount, uint256 ethPaid)"
]);
const AMMO_PACKS = {
  100:  { bullets:100,    valueWei: ethers.parseEther("0.001") },
  500:  { bullets:1000,   valueWei: ethers.parseEther("0.01") },
  2000: { bullets:10000,  valueWei: ethers.parseEther("0.1") },
  9999: { bullets:100000, valueWei: ethers.parseEther("1.0") }
};
const memoryPurchases = new Set();
const memoryPurchaseList = [];
const memoryBulletGrants = [];
const MAX_ADMIN_BULLET_GRANT = Math.max(1, Number(process.env.ADMIN_BULLET_GRANT_MAX || 100000));
const MAX_PLAYER_BULLETS = 2147483647;
let purchaseTotals = { purchaseCount:0, totalBullets:0, totalWei:"0" };
let onchainRewardPoolWei = 0n;

function setPurchaseTotals(totals={}) {
  purchaseTotals = {
    purchaseCount: Number(totals.purchaseCount) || 0,
    totalBullets: Number(totals.totalBullets) || 0,
    totalWei: String(totals.totalWei || "0")
  };
}

function addPurchaseToTotals(purchase) {
  const currentWei = BigInt(purchaseTotals.totalWei || "0");
  purchaseTotals = {
    purchaseCount: purchaseTotals.purchaseCount + 1,
    totalBullets: purchaseTotals.totalBullets + (Number(purchase.bullets) || 0),
    totalWei: (currentWei + BigInt(purchase.valueWei || "0")).toString()
  };
}

function rememberPurchase(purchase) {
  if (!purchase) return;
  memoryPurchaseList.unshift({ ...purchase });
  if (memoryPurchaseList.length > 200) memoryPurchaseList.length = 200;
}

function rememberBulletGrant(grant) {
  if (!grant) return;
  memoryBulletGrants.unshift({ ...grant });
  if (memoryBulletGrants.length > 200) memoryBulletGrants.length = 200;
}

function cleanWei(value) {
  return String(value || "0").split(".")[0];
}

function purchasePublicItem(purchase) {
  const valueWei = cleanWei(purchase.valueWei || purchase.value_wei);
  const rewardWei = ((BigInt(valueWei || "0") * 70n) / 100n).toString();
  const txHash = String(purchase.txHash || purchase.tx_hash || "").toLowerCase();
  return {
    txHash,
    wallet: normalizeWallet(purchase.wallet) || String(purchase.wallet || ""),
    pack: Number(purchase.pack) || 0,
    bullets: Number(purchase.bullets) || 0,
    valueWei,
    valueEth: ethers.formatEther(valueWei),
    rewardWei,
    rewardEth: ethers.formatEther(rewardWei),
    chainId: Number(purchase.chainId || purchase.chain_id || CHAIN.chainId),
    blockNumber: purchase.blockNumber || purchase.block_number || null,
    createdAt: Number(purchase.createdAt || purchase.created_at || Date.now()),
    explorerUrl: txHash ? `${CHAIN.explorerUrl}/tx/${txHash}` : null
  };
}

function walletDepositPublicItem(row) {
  const totalWei = cleanWei(row.totalWei || row.total_wei);
  const rewardWei = ((BigInt(totalWei || "0") * 70n) / 100n).toString();
  return {
    wallet: normalizeWallet(row.wallet) || String(row.wallet || ""),
    purchaseCount: Number(row.purchaseCount || row.purchase_count) || 0,
    totalBullets: Number(row.totalBullets || row.total_bullets) || 0,
    totalWei,
    totalEth: ethers.formatEther(totalWei),
    rewardWei,
    rewardEth: ethers.formatEther(rewardWei),
    lastPurchaseAt: Number(row.lastPurchaseAt || row.last_purchase_at) || 0
  };
}

function purchaseBackupItem(purchase) {
  const item = purchasePublicItem(purchase);
  return {
    tx_hash: item.txHash,
    wallet: item.wallet,
    pack: item.pack,
    bullets: item.bullets,
    value_wei: item.valueWei,
    chain_id: item.chainId,
    block_number: item.blockNumber,
    created_at: item.createdAt
  };
}

function bulletGrantPublicItem(grant) {
  return {
    wallet: normalizeWallet(grant.wallet) || String(grant.wallet || ""),
    bullets: Number(grant.bullets) || 0,
    reason: String(grant.reason || "").slice(0, 120),
    adminWallet: normalizeWallet(grant.adminWallet || grant.admin_wallet) || String(grant.adminWallet || grant.admin_wallet || ""),
    createdAt: Number(grant.createdAt || grant.created_at || Date.now())
  };
}

function memoryWalletDepositTotals() {
  const totals = new Map();
  for (const purchase of memoryPurchaseList) {
    const wallet = normalizeWallet(purchase.wallet) || String(purchase.wallet || "");
    if (!wallet) continue;
    const current = totals.get(wallet) || {
      wallet,
      purchaseCount: 0,
      totalBullets: 0,
      totalWei: "0",
      lastPurchaseAt: 0
    };
    current.purchaseCount += 1;
    current.totalBullets += Number(purchase.bullets) || 0;
    current.totalWei = (BigInt(current.totalWei || "0") + BigInt(cleanWei(purchase.valueWei))).toString();
    current.lastPurchaseAt = Math.max(current.lastPurchaseAt, Number(purchase.createdAt) || 0);
    totals.set(wallet, current);
  }
  return [...totals.values()].sort((a,b) => {
    const byWei = BigInt(b.totalWei || "0") - BigInt(a.totalWei || "0");
    if (byWei > 0n) return 1;
    if (byWei < 0n) return -1;
    return (b.lastPurchaseAt || 0) - (a.lastPurchaseAt || 0);
  });
}

async function refreshOnchainRewardPool() {
  if (!ethers.isAddress(ABSWAR_CONTRACT_ADDRESS)) return;
  try {
    const result = await provider.call({
      to: ethers.getAddress(ABSWAR_CONTRACT_ADDRESS),
      data: REWARD_POOL_SELECTOR
    });
    if (result && result !== "0x") onchainRewardPoolWei = BigInt(result);
  } catch (e) {
    console.warn("[CHAIN] Odul havuzu okunamadi:", e.message);
  }
}

function economyState() {
  const recordedTotalWei = BigInt(purchaseTotals.totalWei || "0");
  const recordedRewardPoolWei = (recordedTotalWei * 70n) / 100n;
  const rewardPoolWei = onchainRewardPoolWei > recordedRewardPoolWei ? onchainRewardPoolWei : recordedRewardPoolWei;
  const totalWei = recordedTotalWei > 0n ? recordedTotalWei : (rewardPoolWei * 100n) / 70n;
  return {
    purchaseCount: purchaseTotals.purchaseCount,
    totalBullets: purchaseTotals.totalBullets,
    totalWei: totalWei.toString(),
    totalEth: ethers.formatEther(totalWei),
    rewardPoolWei: rewardPoolWei.toString(),
    rewardPoolEth: ethers.formatEther(rewardPoolWei)
  };
}

function apiError(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

async function getAgwAddressFromInitialSigner(signerWallet) {
  if (!ethers.isAddress(AGW_FACTORY_ADDRESS) || !signerWallet) return null;
  try {
    const salt = ethers.keccak256(ethers.getBytes(ethers.getAddress(signerWallet)));
    const data = agwFactoryInterface.encodeFunctionData("getAddressForSalt", [salt]);
    const result = await provider.call({ to: AGW_FACTORY_ADDRESS, data });
    const [smartAccount] = agwFactoryInterface.decodeFunctionResult("getAddressForSalt", result);
    return normalizeWallet(smartAccount);
  } catch {
    return null;
  }
}

async function verifyWalletMessage(wallet, message, signature, signerWallet=null) {
  let recovered = null;
  try {
    recovered = normalizeWallet(ethers.verifyMessage(message, signature));
    if (recovered === wallet) return true;
  } catch {}

  try {
    const code = await provider.getCode(wallet);
    if (code && code !== "0x") {
      const data = signatureInterface.encodeFunctionData("isValidSignature", [
        ethers.hashMessage(message),
        signature
      ]);
      const result = await provider.call({ to: wallet, data });
      const [magicValue] = signatureInterface.decodeFunctionResult("isValidSignature", result);
      if (String(magicValue).toLowerCase() === ERC1271_MAGIC_VALUE) return true;
    }
  } catch {
    // Counterfactual AGW accounts may not have code yet. In that case,
    // accept only the documented signer EOA if it deterministically maps to this AGW.
  }

  const signer = normalizeWallet(signerWallet);
  if (signer && recovered && recovered === signer) {
    return await getAgwAddressFromInitialSigner(signer) === wallet;
  }

  return false;
}

async function verifyAmmoPurchase({ wallet, pack, txHash }) {
  const cfg = AMMO_PACKS[pack];
  if (!cfg) throw apiError("INVALID_PACK", "Gecersiz paket");
  if (!ethers.isAddress(ABSWAR_CONTRACT_ADDRESS)) {
    throw apiError("CONTRACT_NOT_CONFIGURED", "Kontrat adresi ayarli degil", 503);
  }
  if (!ethers.isHexString(txHash, 32)) {
    throw apiError("INVALID_TX_HASH", "Gecersiz islem hash'i");
  }

  const network = await provider.getNetwork();
  if (Number(network.chainId) !== CHAIN.chainId) {
    throw apiError("WRONG_RPC_CHAIN", "RPC zinciri beklenen Abstract agi degil", 503);
  }

  const [receipt, tx] = await Promise.all([
    provider.getTransactionReceipt(txHash),
    provider.getTransaction(txHash)
  ]);
  if (!receipt || !tx) throw apiError("TX_PENDING", "Islem henuz onaylanmadi", 202);
  if (receipt.status !== 1) throw apiError("TX_FAILED", "Blockchain islemi basarisiz");
  if (normalizeWallet(tx.from) !== wallet) throw apiError("TX_FROM_MISMATCH", "Islem farkli cuzdan tarafindan gonderildi");
  if (normalizeWallet(tx.to) !== normalizeWallet(ABSWAR_CONTRACT_ADDRESS)) {
    throw apiError("TX_TO_MISMATCH", "Islem Centradar kontratina gitmiyor");
  }
  if (String(tx.data || "").toLowerCase() !== BUY_AMMO_SELECTOR) {
    throw apiError("TX_METHOD_MISMATCH", "Islem buyAmmo() cagrisi degil");
  }
  if (tx.value !== cfg.valueWei) {
    throw apiError("TX_VALUE_MISMATCH", "Islem tutari secilen paketle eslesmiyor");
  }

  const contractAddress = normalizeWallet(ABSWAR_CONTRACT_ADDRESS);
  const purchaseEvent = receipt.logs
    .filter(log => normalizeWallet(log.address) === contractAddress)
    .map(log => {
      try { return ammoInterface.parseLog(log); } catch { return null; }
    })
    .find(log => log && log.name === "AmmoPurchased");

  if (!purchaseEvent) throw apiError("AMMO_EVENT_MISSING", "Kontrat satin alma eventi bulunamadi");
  if (normalizeWallet(purchaseEvent.args.buyer) !== wallet) {
    throw apiError("AMMO_EVENT_BUYER_MISMATCH", "Kontrat eventi cuzdanla eslesmiyor");
  }
  if (purchaseEvent.args.ethPaid !== cfg.valueWei) {
    throw apiError("AMMO_EVENT_VALUE_MISMATCH", "Kontrat eventi paket tutariyla eslesmiyor");
  }

  return {
    txHash: txHash.toLowerCase(),
    wallet,
    pack,
    bullets: cfg.bullets,
    valueWei: cfg.valueWei.toString(),
    chainId: CHAIN.chainId,
    blockNumber: receipt.blockNumber,
    createdAt: Date.now()
  };
}

async function recordPurchaseOnce(purchase) {
  if (memoryPurchases.has(purchase.txHash)) return false;
  if (db.dbEnabled) {
    const inserted = await db.recordPurchase(purchase);
    if (!inserted) return false;
  } else if (IS_MAINNET) {
    throw apiError("DB_REQUIRED", "Mainnet odeme kaydi icin PostgreSQL gerekli", 503);
  }
  memoryPurchases.add(purchase.txHash);
  addPurchaseToTotals(purchase);
  rememberPurchase(purchase);
  return true;
}

// ── KÖTÜYE KULLANIM KORUMASI ─────────────────────
const rateLimits = new Map(); // wallet -> { count, windowStart }
const RATE_LIMIT_WINDOW = 10000; // 10 saniye
const RATE_LIMIT_MAX = 30;       // 10 saniyede max 30 istek
const ATTACK_COOLDOWN = 250;     // saldırılar arası min 250ms

function checkRateLimit(key) {
  const now = Date.now();
  const r = rateLimits.get(key) || { count:0, windowStart:now };
  if (now - r.windowStart > RATE_LIMIT_WINDOW) {
    r.count = 0;
    r.windowStart = now;
  }
  r.count++;
  rateLimits.set(key, r);
  return r.count <= RATE_LIMIT_MAX;
}

function validWallet(w) {
  return !!normalizeWallet(w);
}

// Middleware
function rateLimited(req, res, next) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon").split(",")[0].trim();
  const wallet = req.wallet || normalizeWallet(req.body && req.body.wallet);
  const key = wallet || `ip:${ip}`;
  const keys = [...new Set([key, `ip:${ip}`])];
  if (!keys.every(checkRateLimit)) {
    return res.status(429).json({ code:'RATE_LIMITED', error: 'Çok fazla istek. Lütfen yavaşla.' });
  }
  next();
}

function getPlayer(wallet) {
  const id = normalizeWallet(wallet);
  if (!id) throw apiError("INVALID_WALLET", "Gecersiz cuzdan");
  if (!players.has(id)) {
    players.set(id, {
      wallet:id,
      nickname:null,
      country_code:null,
      bullets:NEW_PLAYER_STARTING_BULLETS,
      contribution:0,
      attacks:0,
      kills:0,
      deaths:0,
      radar_level:3,
      resources: {       // 0-100 arası seviyeler
        oil:0,     // Petrol — %100'de +10 mermi
        metal:0,   // Metal — seviye×%1 hasar bonusu
        uranium:0, // Uranyum — seviye×%1 kalkan
        energy:0   // Enerji — %100'de +50 HP
      },
      created_at:Date.now(),
      alliance_id:null
    });
  }
  return players.get(id);
}

// --- RANK NFT CLAIMS ---
const RANK_NFT_MAINNET_CONTRACT_ADDRESS = "0xB58581518367607fe730c33b23df2bc0A8ae1113";
const RANK_NFT_CONTRACT_ADDRESS = RANK_NFT_MAINNET_CONTRACT_ADDRESS;
const RANK_NFT_SIGNER_PRIVATE_KEY = process.env.RANK_NFT_SIGNER_PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY || "";
const RANK_NFT_CLAIM_TTL_MS = Number(process.env.RANK_NFT_CLAIM_TTL_MS || 10 * 60 * 1000);
const rankNftInterface = new ethers.Interface([
  "function hasRankNFT(address player,uint8 rank) view returns (bool)"
]);

let rankNftSigner = null;
if (RANK_NFT_SIGNER_PRIVATE_KEY) {
  try {
    rankNftSigner = new ethers.Wallet(RANK_NFT_SIGNER_PRIVATE_KEY);
    console.log("[RANK NFT] signer configured");
  } catch {
    console.warn("[RANK NFT] invalid signer private key; NFT claim signatures disabled.");
  }
}

function rankNftConfigured() {
  return !!rankNftSigner && ethers.isAddress(RANK_NFT_CONTRACT_ADDRESS);
}

function publicRank(rank, index) {
  return {
    index,
    name: rank.name,
    icon: rank.icon,
    min: rank.min,
    bonusPct: Math.round((rank.bonus || 0) * 100),
    costBullets: RANK_NFT_COSTS[index] || 0
  };
}

function rankNftPublicState() {
  return {
    enabled: rankNftConfigured(),
    contractAddress: ethers.isAddress(RANK_NFT_CONTRACT_ADDRESS) ? ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS) : null,
    signerAddress: rankNftSigner ? rankNftSigner.address : null,
    claimTtlMs: RANK_NFT_CLAIM_TTL_MS,
    ranks: RANKS.map(publicRank)
  };
}

async function hasMintedRankNft(wallet, rankIndex) {
  if (!rankNftConfigured()) return false;
  try {
    const data = rankNftInterface.encodeFunctionData("hasRankNFT", [ethers.getAddress(wallet), rankIndex]);
    const result = await provider.call({ to: ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS), data });
    const [minted] = rankNftInterface.decodeFunctionResult("hasRankNFT", result);
    return !!minted;
  } catch {
    return false;
  }
}

async function createRankNftSignature(wallet, rankIndex, fixedDeadline) {
  const deadline = fixedDeadline ? Number(fixedDeadline) : Math.floor((Date.now() + RANK_NFT_CLAIM_TTL_MS) / 1000);
  const digest = ethers.solidityPackedKeccak256(
    ["address", "uint256", "address", "uint8", "uint256"],
    [
      ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS),
      CHAIN.chainId,
      ethers.getAddress(wallet),
      rankIndex,
      deadline
    ]
  );
  const signature = await rankNftSigner.signMessage(ethers.getBytes(digest));
  return { deadline, digest, signature };
}

async function createRankNftClaimPayload(wallet, rankIndex) {
  const rank = RANKS[rankIndex];
  if (await hasMintedRankNft(wallet, rankIndex)) {
    return {
      ok:true,
      status:"owned",
      wallet,
      rank: publicRank(rank, rankIndex),
      chainId: CHAIN.chainId,
      contractAddress: ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS)
    };
  }

  const claim = await createRankNftSignature(wallet, rankIndex);
  return {
    ok:true,
    status:"claimable",
    wallet,
    rank: publicRank(rank, rankIndex),
    chainId: CHAIN.chainId,
    contractAddress: ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS),
    signerAddress: rankNftSigner.address,
    deadline: claim.deadline,
    signature: claim.signature
  };
}

function publicAlliance(a) {
  return {
    id:a.id,
    name:a.name,
    country_code:a.country_code,
    leader:a.leader,
    score:a.score,
    members:[...a.members],
    memberCount:a.members.size,
    created_at:a.created_at
  };
}

function state() {
  const leaderboard = [...players.values()].sort((a,b)=>b.contribution-a.contribution).slice(0,10);
  const allianceList = [...alliances.values()].map(publicAlliance).sort((a,b)=>b.score-a.score);

  return {
    countries,
    recentAttacks,
    onlinePlayers,
    giftSlotsLeft: Math.max(0, GIFT_LIMIT - giftedWallets.size),
    leaderboard,
    alliances: allianceList,
    allianceFeed: [],
    economy: economyState(),
    round: {
      number: roundNumber,
      status: roundStatus,
      startTime: roundStartTime,
      endTime: roundEndTime,
      remainingMs: timeRemainingMs(),
      lastResult: lastRoundResult
    },
    war:{
      total_attacks: recentAttacks.length,
      countries_left: countries.filter(c=>!c.eliminated).length,
      nft:rankNftConfigured(),
      token:false
    },
    rankNft: rankNftPublicState()
  };
}

function publicStatus() {
  return {
    ok: true,
    name: "Centradar",
    network: NETWORK,
    chainId: CHAIN.chainId,
    uptimeSec: Math.floor((Date.now() - SERVICE_STARTED_AT) / 1000),
    startedAt: SERVICE_STARTED_AT,
    dbEnabled: db.dbEnabled,
    onlinePlayers,
    round: {
      number: roundNumber,
      status: roundStatus,
      remainingMs: timeRemainingMs()
    },
    economy: economyState(),
    countries: {
      total: countries.length,
      alive: countries.filter(c => !c.eliminated).length,
      startHp: START_HP,
      maxHp: MAX_HP
    },
    rankNft: {
      enabled: rankNftConfigured(),
      contractAddress: ethers.isAddress(RANK_NFT_CONTRACT_ADDRESS) ? ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS) : null
    },
    security: {
      paymentVerification: true,
      serverSideAttacks: true,
      rateLimit: true,
      independentAudit: false,
      auditNote: "Independent smart contract/security audit is still recommended before heavy public launch."
    }
  };
}

async function adminBackupSnapshot() {
  const purchases = db.dbEnabled
    ? await db.loadAllPurchases()
    : memoryPurchaseList.slice().reverse().map(purchaseBackupItem);
  const gameState = {
    round: {
      roundNumber,
      roundStatus,
      roundStartTime,
      roundEndTime,
      lastRoundResult
    }
  };
  return {
    ok: true,
    generatedAt: Date.now(),
    network: NETWORK,
    chainId: CHAIN.chainId,
    dbEnabled: db.dbEnabled,
    round: {
      number: roundNumber,
      status: roundStatus,
      startTime: roundStartTime,
      endTime: roundEndTime,
      lastResult: lastRoundResult
    },
    game_state: gameState,
    economy: economyState(),
    countries,
    players: [...players.values()],
    alliances: [...alliances.values()].map(publicAlliance),
    recentAttacks,
    allianceFeed,
    gifted_wallets: [...giftedWallets],
    giftedWallets: [...giftedWallets],
    purchases,
    feedback: feedbackItems.map(feedbackPublicItem),
    rankNft: rankNftPublicState()
  };
}

function rewardStatus() {
  const lastPayouts = Array.isArray(lastRoundResult && lastRoundResult.payouts)
    ? lastRoundResult.payouts
    : [];
  return {
    ok: true,
    network: NETWORK,
    chainId: CHAIN.chainId,
    contractAddress: ethers.isAddress(ABSWAR_CONTRACT_ADDRESS) ? ethers.getAddress(ABSWAR_CONTRACT_ADDRESS) : null,
    economy: economyState(),
    round: {
      number: roundNumber,
      status: roundStatus,
      endTime: roundEndTime,
      remainingMs: timeRemainingMs(),
      lastResult: lastRoundResult
    },
    rules: {
      durationDays: 7,
      winnerSharesPct: [60, 25, 15],
      rewardPoolPct: 70,
      treasuryPct: 20,
      operationsPct: 10,
      payoutMode: "admin-payReward-log",
      payoutModeNote: "Current version records admin payReward transaction hashes; fully automatic escrow payout requires a new contract version."
    },
    payouts: lastPayouts,
    transparency: {
      paymentVerification: true,
      payoutHashesRecorded: lastPayouts.length,
      independentAudit: false
    }
  };
}

function emitState() {
  io.emit("war:state", state());
}

let stateDirty = false;
function scheduleStateBroadcast() {
  stateDirty = true;
}
setInterval(() => {
  if (stateDirty) {
    stateDirty = false;
    io.emit("war:state", state());
  }
}, 3000);

function addAllianceFeed(type, message, payload={}) {
  const item = { type, message, payload, created_at:Date.now() };
  allianceFeed.unshift(item);
  if (allianceFeed.length > 30) allianceFeed.pop();
  const allianceId = payload && payload.allianceId;
  if (allianceId) {
    io.to(allianceRoomId(allianceId)).emit("alliance:feed", item);
  }
}

app.get("/", (_req,res)=>res.json({ ok:true, name:"Centradar Tactical Gridwar Backend" }));
app.get("/api/status", (_req,res)=>res.json(publicStatus()));
app.get("/api/reward/status", (_req,res)=>res.json(rewardStatus()));
app.get("/health", (_req,res)=>res.json({
  ok:true,
  realtime:true,
  alliance:true,
  noNFT:!rankNftConfigured(),
  noToken:true,
  onlinePlayers,
  network: NETWORK,
  chainId: CHAIN.chainId,
  startHp: START_HP,
  maxHp: MAX_HP,
  paymentVerification: true,
  walletAuth: "eip1271",
  uptimeSec: Math.floor((Date.now() - SERVICE_STARTED_AT) / 1000),
  dbEnabled: db.dbEnabled,
  rankNft: rankNftPublicState()
}));
app.get("/api/game/state", (_req,res)=>res.json(state()));
app.get("/api/health", (_req,res)=>res.json({
  ok: true,
  status: "online",
  onlinePlayers,
  dbEnabled: db.dbEnabled,
  uptimeSec: Math.floor((Date.now() - SERVICE_STARTED_AT) / 1000),
  buildAt: new Date(SERVICE_STARTED_AT).toISOString()
}));

app.get("/api/alliance/feed", authRequired, (req,res) => {
  const player = players.get(req.wallet);
  if (!player || !player.alliance_id || !alliances.has(player.alliance_id)) {
    return res.json({ ok:true, feed:[] });
  }
  const feed = allianceFeed
    .filter(item => item && item.payload && item.payload.allianceId === player.alliance_id)
    .slice()
    .reverse();
  res.json({ ok:true, feed });
});

const FEEDBACK_TYPES = new Set(["bug", "idea", "praise", "other"]);
function feedbackPublicItem(item) {
  return {
    id: item.id,
    type: item.type,
    wallet: item.wallet,
    country: item.country,
    message: item.message,
    url: item.url,
    userAgent: item.userAgent,
    created_at: item.created_at
  };
}

async function forwardFeedbackToDiscord(item) {
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL || process.env.FEEDBACK_WEBHOOK_URL || "";
  if (!webhookUrl) return;
  const content = [
    `Centradar feedback: ${item.type}`,
    `Wallet: ${item.wallet || "not connected"}`,
    `Country: ${item.country || "-"}`,
    `URL: ${item.url || "-"}`,
    "",
    item.message
  ].join("\n").slice(0, 1900);
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content })
  });
}

const discordAlertLastSent = new Map();

async function sendDiscordAlert(title, lines = []) {
  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL
    || process.env.DISCORD_FEEDBACK_WEBHOOK_URL
    || process.env.FEEDBACK_WEBHOOK_URL
    || "";
  if (!webhookUrl) return false;

  const safeTitle = String(title || "CENTRADAR ALERT").slice(0, 120);
  const now = Date.now();
  const last = discordAlertLastSent.get(safeTitle) || 0;
  if (now - last < 60_000) return false;
  discordAlertLastSent.set(safeTitle, now);

  const content = [
    safeTitle,
    ...lines.map(line => String(line || "").slice(0, 350))
  ].filter(Boolean).join("\n").slice(0, 1900);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    return res.ok;
  } catch (e) {
    console.warn("[ALERT] Discord webhook failed:", e.message);
    return false;
  }
}

db.setAlertHook((title, lines) => {
  sendDiscordAlert(title, lines).catch(e => console.warn("[ALERT] DB hook failed:", e.message));
});

app.post("/api/feedback", rateLimited, async (req,res,next)=>{
  try {
    const type = FEEDBACK_TYPES.has(req.body && req.body.type) ? req.body.type : "other";
    const message = String(req.body && req.body.message || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
    if (message.length < 5) return res.status(400).json({ code:"FEEDBACK_TOO_SHORT", error:"Mesaj cok kisa" });

    const wallet = normalizeWallet(req.body && req.body.wallet);
    const item = {
      id: randomBytes(8).toString("hex"),
      type,
      wallet,
      country: String(req.body && req.body.country || "").trim().slice(0, 3).toUpperCase() || null,
      message,
      url: String(req.body && req.body.url || "").trim().slice(0, 300),
      userAgent: String(req.headers["user-agent"] || "").slice(0, 160),
      created_at: Date.now()
    };

    feedbackItems.unshift(item);
    if (feedbackItems.length > 100) feedbackItems.pop();
    forwardFeedbackToDiscord(item).catch(e => console.warn("[FEEDBACK] Discord webhook failed:", e.message));
    res.status(202).json({ ok:true, id:item.id });
  } catch (e) {
    next(e);
  }
});

app.post("/api/auth/challenge", rateLimited, (req,res)=>{
  const wallet = normalizeWallet(req.body && req.body.wallet);
  if (!wallet) return res.status(400).json({ code:"INVALID_WALLET", error:"Gecersiz cuzdan" });
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = makeChallengeMessage(wallet, nonce, expiresAt);
  authChallenges.set(wallet, { nonce, message, expiresAt });
  res.json({ ok:true, wallet, message, expiresAt });
});

app.post("/api/auth/verify", rateLimited, async (req,res)=>{
  const wallet = normalizeWallet(req.body && req.body.wallet);
  const signerWallet = normalizeWallet(req.body && (req.body.signerWallet || req.body.signerAddress));
  const signature = req.body && req.body.signature;
  const message = req.body && req.body.message;
  if (!wallet || typeof signature !== "string" || typeof message !== "string") {
    return res.status(400).json({ code:"INVALID_AUTH_PAYLOAD", error:"Eksik imza bilgisi" });
  }
  const challenge = authChallenges.get(wallet);
  if (!challenge || challenge.expiresAt < Date.now()) {
    authChallenges.delete(wallet);
    return res.status(401).json({ code:"CHALLENGE_EXPIRED", error:"Giris imzasi suresi doldu" });
  }
  if (message !== challenge.message) {
    return res.status(401).json({ code:"CHALLENGE_MISMATCH", error:"Giris mesaji eslesmiyor" });
  }
  try {
    if (!await verifyWalletMessage(wallet, message, signature, signerWallet)) {
      return res.status(401).json({ code:"SIGNATURE_MISMATCH", error:"Imza cuzdanla eslesmiyor" });
    }
    authChallenges.delete(wallet);
    const session = issueSessionToken(wallet);
    res.json({ ok:true, wallet, token:session.token, expiresAt:session.expiresAt });
  } catch {
    return res.status(401).json({ code:"INVALID_SIGNATURE", error:"Imza dogrulanamadi" });
  }
});

app.get("/api/nft/rank/status", (_req,res) => {
  res.json({ ok:true, rankNft: rankNftPublicState() });
});

app.post("/api/nft/claim-signature", authRequired, rateLimited, async (req,res) => {
  try {
    if (!rankNftConfigured()) {
      return res.status(503).json({
        code:"RANK_NFT_NOT_READY",
        error:"Rutbe NFT kontrati veya signer henuz ayarlanmadi",
        rankNft: rankNftPublicState()
      });
    }

    const wallet = req.wallet;
    const rankIndex = Number(req.body && req.body.rank);
    if (!Number.isInteger(rankIndex) || rankIndex < 0 || rankIndex >= RANKS.length) {
      return res.status(400).json({ code:"INVALID_RANK", error:"Gecersiz rutbe" });
    }

    const player = getPlayer(wallet);
    const rank = RANKS[rankIndex];
    const contribution = Number(player.contribution || 0);
    if (contribution < rank.min) {
      return res.status(403).json({
        code:"RANK_NOT_EARNED",
        error:`Bu rutbe icin ${rank.min} katkı gerekir`,
        contribution,
        required: rank.min,
        rank: publicRank(rank, rankIndex)
      });
    }

    if (await hasMintedRankNft(wallet, rankIndex)) {
      await db.deleteRankClaim(wallet, rankIndex);
      return res.status(409).json({
        code:"RANK_NFT_ALREADY_MINTED",
        error:"Bu rutbe NFT'si daha once alinmis",
        rank: publicRank(rank, rankIndex)
      });
    }

    const savedClaim = await db.getRankClaim(wallet, rankIndex);
    if (savedClaim && savedClaim.deadline * 1000 > Date.now() + 30000) {
      const claim = await createRankNftSignature(wallet, rankIndex, savedClaim.deadline);
      return res.json({
        ok:true,
        status:"claimable",
        wallet,
        rank: publicRank(rank, rankIndex),
        chainId: CHAIN.chainId,
        contractAddress: ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS),
        signerAddress: rankNftSigner.address,
        deadline: claim.deadline,
        signature: claim.signature,
        charged:false,
        costBullets: RANK_NFT_COSTS[rankIndex] || 0,
        player
      });
    }

    const cost = RANK_NFT_COSTS[rankIndex] || 0;
    if (player.bullets < cost) {
      return res.status(400).json({
        code:"INSUFFICIENT_BULLETS",
        error:`Bu rozet icin ${cost} mermi gerekir`,
        required:cost,
        bullets:player.bullets
      });
    }

    player.bullets -= cost;
    db.savePlayer(player);
    const claim = await createRankNftSignature(wallet, rankIndex);
    const claimSaved = await db.saveRankClaim({ wallet, rankIndex, deadline:claim.deadline });
    if (!claimSaved) {
      player.bullets += cost;
      db.savePlayer(player);
      return res.status(503).json({ code:"RANK_CLAIM_SAVE_FAILED", error:"Rozet imza kaydi tutulamadi" });
    }

    res.json({
      ok:true,
      status:"claimable",
      wallet,
      rank: publicRank(rank, rankIndex),
      chainId: CHAIN.chainId,
      contractAddress: ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS),
      signerAddress: rankNftSigner.address,
      deadline: claim.deadline,
      signature: claim.signature,
      charged:true,
      costBullets:cost,
      player
    });
  } catch (e) {
    res.status(500).json({ code:"RANK_NFT_SIGNATURE_FAILED", error:e.message || "NFT imzasi uretilemedi" });
  }
});

app.post("/api/admin/nft/rank-grant", adminRequired, rateLimited, async (req,res) => {
  try {
    if (!rankNftConfigured()) {
      return res.status(503).json({
        code:"RANK_NFT_NOT_READY",
        error:"Rutbe NFT kontrati veya signer henuz ayarlanmadi",
        rankNft: rankNftPublicState()
      });
    }

    const adminWallet = req.adminWallet || req.wallet;
    const targetWallet = normalizeWallet(req.body && req.body.wallet) || adminWallet;
    if (adminWallet !== ADMIN_OWNER_WALLET || targetWallet !== ADMIN_OWNER_WALLET) {
      return res.status(403).json({
        code:"ADMIN_NFT_WALLET_ONLY",
        error:"Admin rozet mint izni sadece bagli owner cuzdanina verilir"
      });
    }

    const requestedRanks = Array.isArray(req.body && req.body.ranks)
      ? req.body.ranks.map(Number)
      : RANKS.map((_rank, index) => index);
    const rankIndexes = [...new Set(requestedRanks)]
      .filter(rank => Number.isInteger(rank) && rank >= 0 && rank < RANKS.length)
      .sort((a,b) => a-b);

    if (rankIndexes.length === 0) {
      return res.status(400).json({ code:"INVALID_RANKS", error:"Gecerli rutbe bulunamadi" });
    }

    const claims = [];
    for (const rankIndex of rankIndexes) {
      claims.push(await createRankNftClaimPayload(targetWallet, rankIndex));
    }

    res.json({
      ok:true,
      wallet: targetWallet,
      chainId: CHAIN.chainId,
      contractAddress: ethers.getAddress(RANK_NFT_CONTRACT_ADDRESS),
      claims,
      claimable: claims.filter(c => c.status === "claimable").length,
      owned: claims.filter(c => c.status === "owned").length
    });
  } catch (e) {
    res.status(500).json({ code:"ADMIN_RANK_NFT_GRANT_FAILED", error:e.message || "Admin NFT imzasi uretilemedi" });
  }
});

app.post("/api/player/connect", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const id = req.wallet;
  const isNewPlayer = !players.has(id);
  const player = getPlayer(req.body.wallet);

  // İlk 100 kullanıcı hediye mermi sistemi
  let gift = null;
  if (isNewPlayer && !giftedWallets.has(id) && giftedWallets.size < GIFT_LIMIT) {
    giftedWallets.add(id);
    player.bullets += GIFT_AMOUNT;
    player.gifted = true;
    gift = {
      amount: GIFT_AMOUNT,
      rank: giftedWallets.size, // Kaçıncı kullanıcı olduğu (1-100)
      remaining: GIFT_LIMIT - giftedWallets.size
    };
    db.addGiftedWallet(id);
  }
  // Yeni oyuncu veya hediye verildi → kaydet
  if (isNewPlayer || gift) db.savePlayer(player);

  res.json({ ok:true, player, gift, giftSlotsLeft: Math.max(0, GIFT_LIMIT - giftedWallets.size) });
});

app.post("/api/player/choose-country", authRequired, rateLimited, (req,res)=>{
  const wallet = req.body.wallet;
  const countryCode = String(req.body.countryCode || "").toUpperCase();
  const player = getPlayer(wallet);
  const country = countries.find(c=>c.code===countryCode);

  if (!country) return res.status(404).json({ code:"COUNTRY_NOT_FOUND", error:"Ülke bulunamadı" });
  if (country.eliminated) return res.status(400).json({ code:"COUNTRY_ELIMINATED", error:"Bu ülke elenmiş" });

  if (player.country_code) {
    const current = countries.find(c=>c.code===player.country_code);
    if (current && !current.eliminated) return res.status(403).json({ code:"CANT_CHANGE_COUNTRY", error:"Ülken elenmeden başka ülkeye geçemezsin" });
  }

  player.country_code = countryCode;
  db.savePlayer(player);
  emitState();
  res.json({ ok:true, player });
});

// Nickname ayarlama (oyun başlangıcında bir kez veya değiştirme)
app.post("/api/player/nickname", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  const nickname = String(req.body.nickname || "").trim().slice(0,16);

  if (nickname.length < 3) return res.status(400).json({ code:"NICKNAME_TOO_SHORT", error:"Nickname en az 3 karakter olmalı" });
  if (!isCleanText(nickname)) return res.status(400).json({ code:"NICKNAME_INAPPROPRIATE", error:"Uygunsuz nickname — başka bir isim seç" });
  // Geçerli karakter kontrolü (harf, rakam, _, -, boşluk)
  if (!/^[\p{L}\p{N}_\- ]+$/u.test(nickname)) {
    return res.status(400).json({ code:"NICKNAME_INVALID_CHARS", error:"Nickname sadece harf, rakam, _, - içerebilir" });
  }
  // Aynı nickname kontrolü
  for (const p of players.values()) {
    if (p.wallet !== player.wallet && p.nickname && p.nickname.toLowerCase() === nickname.toLowerCase()) {
      return res.status(400).json({ code:"NICKNAME_TAKEN", error:"Bu nickname zaten alınmış" });
    }
  }
  player.nickname = nickname;
  db.savePlayer(player);
  res.json({ ok:true, player });
});

// Radar yükseltme — 5 mermi karşılığı seviye atlat
app.post("/api/player/radar-upgrade", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  if (!player.radar_level) player.radar_level = 3;
  if (player.radar_level >= 10) return res.status(400).json({ code:"RADAR_MAX", error:"Radar zaten maksimum seviyede (10)" });
  const cost = 5;
  if (player.bullets < cost) return res.status(400).json({ code:"INSUFFICIENT_BULLETS", error:`Yetersiz mermi (${cost} gerekir)` });
  player.bullets -= cost;
  player.radar_level++;
  db.savePlayer(player);
  res.json({ ok:true, player });
});

// Kaynak üretimi — 1 mermi → seviye +10. %100'de bonus alır ve sıfırlanır.
app.post("/api/player/produce-resource", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  const which = String(req.body.resource || "").toLowerCase();
  if (!['oil','metal','uranium','energy'].includes(which)) {
    return res.status(400).json({ code:"INVALID_RESOURCE", error:"Geçersiz kaynak" });
  }
  if (player.bullets < 1) return res.status(400).json({ code:"INSUFFICIENT_BULLETS", error:"Yetersiz mermi (1 gerekir)" });
  if (!player.resources) player.resources = { oil:0, metal:0, uranium:0, energy:0 };

  player.bullets -= 1;
  player.resources[which] = Math.min(100, (player.resources[which]||0) + 10);

  let bonus = null;
  // %100'e ulaştıysa ödülü ver ve sıfırla
  if (player.resources[which] >= 100) {
    if (which === 'oil') {
      player.bullets += 10;
      bonus = { type:'bullets', amount:10, message:'🛢️ Petrol %100! +10 mermi' };
    } else if (which === 'energy') {
      // Kendi ülkene +50 HP
      if (player.country_code) {
        const myCountry = countries.find(c => c.code === player.country_code);
        if (myCountry && !myCountry.eliminated) {
          addCountryHp(myCountry, 50);
          bonus = { type:'hp', amount:50, message:'⚡ Enerji %100! Ülken +50 HP' };
          io.emit("hp:update", { target: myCountry.code, newHP: myCountry.hp, maxHP: myCountry.max_hp, isSuperpower: !!myCountry.isSuperpower });
          db.saveCountry(myCountry);
        }
      }
    }
    // Metal ve uranyum %100'de aktif kalır — seviye yüksek tutmak fayda sağlar
    // ama 100'de kalsın, sıfırlamayalım çünkü kalkan/hasar bonusu sürekli aktif
    if (which !== 'metal' && which !== 'uranium') {
      player.resources[which] = 0;
    }
  }
  db.savePlayer(player);
  scheduleStateBroadcast();
  res.json({ ok:true, player, bonus });
});

app.post("/api/market/buy", authRequired, rateLimited, async (req,res)=>{
  try {
    const wallet = req.wallet;
    const pack = Number(req.body.pack || 0);
    const txHash = String(req.body.txHash || "");
    const purchase = await verifyAmmoPurchase({ wallet, pack, txHash });
    const inserted = await recordPurchaseOnce(purchase);
    if (!inserted) {
      return res.status(409).json({ code:"TX_ALREADY_USED", error:"Bu blockchain islemi daha once kullanildi" });
    }

    const player = getPlayer(wallet);
    player.bullets += purchase.bullets;
    db.savePlayer(player);

    io.emit("market:purchase", { wallet:player.wallet, pack, bullets:purchase.bullets, txHash:purchase.txHash });
    emitState();
    res.json({ ok:true, player, added:purchase.bullets, txHash:purchase.txHash, blockNumber:purchase.blockNumber });
  } catch (e) {
    const status = e.status || 500;
    res.status(status).json({ code:e.code || "BUY_FAILED", error:e.message || "Satin alma dogrulanamadi" });
  }
});

app.post("/api/market/buy-demo", authRequired, rateLimited, (req,res)=>{
  if (!ALLOW_DEMO_BUY) {
    return res.status(403).json({ code:"DEMO_DISABLED", error:"Demo alım kapalı" });
  }
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  const pack = Number(req.body.pack || 1);
  const packs = { 100:100, 500:1000, 2000:10000, 9999:100000 };
  const bullets = packs[pack] || 100;
  player.bullets += bullets;
  db.savePlayer(player);

  io.emit("market:purchase", { wallet:player.wallet, pack, bullets });
  emitState();
  res.json({ ok:true, player, added:bullets });
});

app.post("/api/alliance/create", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const wallet = req.body.wallet;
  const name = String(req.body.name || "").trim().slice(0,24);
  const player = getPlayer(wallet);

  if (!name) return res.status(400).json({ code:"ALLIANCE_NAME_REQUIRED", error:"İttifak adı gerekli" });
  if (name.length < 3) return res.status(400).json({ code:"ALLIANCE_NAME_TOO_SHORT", error:"İttifak adı en az 3 karakter" });
  if (alliances.size >= 100) return res.status(400).json({ code:"ALLIANCE_LIMIT", error:"Maksimum ittifak sayısına ulaşıldı (100). Sonraki turda dene." });
  // Aynı isimde ittifak var mı?
  for (const a of alliances.values()) {
    if (a.name.toLowerCase() === name.toLowerCase()) {
      return res.status(400).json({ code:"ALLIANCE_NAME_TAKEN", error:"Bu isimde bir ittifak zaten var" });
    }
  }
  if (!isCleanText(name)) return res.status(400).json({ code:"INAPPROPRIATE_NAME", error:"Uygunsuz isim — lütfen başka bir isim seç" });
  if (!player.country_code) return res.status(400).json({ code:"NO_COUNTRY_SELECTED", error:"Önce ülke seçmelisin" });
  if (player.alliance_id) return res.status(400).json({ code:"ALREADY_IN_ALLIANCE", error:"Zaten bir ittifaktasın" });

  const id = "A-" + Math.random().toString(36).slice(2,8).toUpperCase();

  const alliance = {
    id,
    name,
    country_code:player.country_code,
    leader:player.wallet,
    members:new Set([player.wallet]),
    score:0,
    created_at:Date.now()
  };

  alliances.set(id, alliance);
  player.alliance_id = id;
  persistAlliance(alliance);
  db.savePlayer(player);

  addAllianceFeed("CREATE", name + " alliance kuruldu", { id, allianceId:id, wallet:player.wallet });
  emitState();

  res.json({ ok:true, alliance:publicAlliance(alliance), player });
});

app.post("/api/alliance/join", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const wallet = req.body.wallet;
  const allianceId = String(req.body.allianceId || "");
  const player = getPlayer(wallet);
  const alliance = alliances.get(allianceId);

  if (!alliance) return res.status(404).json({ code:"ALLIANCE_NOT_FOUND", error:"İttifak bulunamadı" });
  if (!player.country_code) return res.status(400).json({ code:"NO_COUNTRY_SELECTED", error:"Önce ülke seçmelisin" });
  if (player.alliance_id) return res.status(400).json({ code:"ALREADY_IN_ALLIANCE", error:"Zaten bir ittifaktasın" });
  if (alliance.members.size >= 50) return res.status(400).json({ code:"ALLIANCE_FULL", error:"İttifak dolu (maks 50 üye)" });

  player.alliance_id = allianceId;
  alliance.members.add(player.wallet);
  persistAlliance(alliance);
  db.savePlayer(player);

  addAllianceFeed("JOIN", player.wallet.slice(0,8) + " " + alliance.name + " alliance'a katildi", { allianceId });
  emitState();

  res.json({ ok:true, alliance:publicAlliance(alliance), player });
});

app.post("/api/alliance/leave", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  if (!player.alliance_id) return res.status(400).json({ code:"NOT_IN_ALLIANCE", error:"İttifakta değilsin" });
  const alliance = alliances.get(player.alliance_id);
  if (!alliance) {
    player.alliance_id = null;
    db.savePlayer(player);
    return res.json({ ok:true, message:"Ittifak silinmis — durum temizlendi", player });
  }
  alliance.members.delete(player.wallet);
  const wasLeader = alliance.leader === player.wallet;
  player.alliance_id = null;

  // Lider ayrıldı VE üye varsa → en eski üyeyi yeni lider yap
  if (wasLeader && alliance.members.size > 0) {
    alliance.leader = [...alliance.members][0];
    addAllianceFeed("LEADER", "Yeni lider: " + alliance.leader.slice(0,8), { allianceId:alliance.id });
  }
  // Üye kalmadıysa ittifağı sil
  if (alliance.members.size === 0) {
    alliances.delete(alliance.id);
    db.deleteAlliance(alliance.id);
    addAllianceFeed("DISBAND", alliance.name + " ittifaki dagildi", { allianceId:alliance.id });
  } else {
    persistAlliance(alliance);
    addAllianceFeed("LEAVE", player.wallet.slice(0,8) + " ittifaktan ayrildi", { allianceId:alliance.id });
  }
  db.savePlayer(player);
  emitState();
  res.json({ ok:true, player });
});

app.post("/api/alliance/chat", authRequired, rateLimited, (req,res)=>{
  const player = getPlayer(req.wallet);
  const message = String(req.body.message || "").trim().slice(0, 200);
  if (!message) return res.status(400).json({ code:"MESSAGE_EMPTY", error:"Mesaj bos" });
  if (!isCleanText(message)) return res.status(400).json({ code:"MESSAGE_INAPPROPRIATE", error:"Mesaj uygun degil" });
  if (!player.alliance_id || !alliances.has(player.alliance_id)) {
    return res.status(400).json({ code:"NOT_IN_ALLIANCE", error:"Ittifakta degilsin" });
  }

  const now = Date.now();
  const last = chatCooldowns.get(player.wallet) || 0;
  if (now - last < 2000) {
    return res.status(429).json({ code:"CHAT_COOLDOWN", error:"Sohbet icin biraz bekle" });
  }
  chatCooldowns.set(player.wallet, now);

  const alliance = alliances.get(player.alliance_id);
  addAllianceFeed("CHAT", message, {
    allianceId: alliance.id,
    wallet: player.wallet,
    nickname: player.nickname,
    country: player.country_code,
    message
  });
  res.json({ ok:true });
});

app.post("/api/alliance/radio", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const wallet = req.body.wallet;
  const command = String(req.body.command || "").toUpperCase();
  const player = getPlayer(wallet);

  const allowed = ["ATTACK_NOW","DEFEND","NEED_SUPPORT","FALL_BACK","ENEMY_DETECTED","PUSH_FINAL","REGROUP","RETREAT","FOCUS_FIRE","SCATTER"];
  if (!allowed.includes(command)) return res.status(400).json({ code:"INVALID_COMMAND", error:"Geçersiz komut" });
  if (!player.alliance_id || !alliances.has(player.alliance_id)) return res.status(400).json({ code:"NOT_IN_ALLIANCE", error:"İttifakta değilsin" });

  const now = Date.now();
  const last = radioCooldowns.get(player.wallet) || 0;
  if (now - last < 15000) {
    return res.status(429).json({ code:"RADIO_COOLDOWN", error:"Telsiz komutu icin biraz bekle" });
  }
  radioCooldowns.set(player.wallet, now);

  const alliance = alliances.get(player.alliance_id);
  const msg = alliance.name + ": " + command;
  addAllianceFeed("RADIO", msg, { allianceId:alliance.id, command, wallet:player.wallet, nickname:player.nickname, country:player.country_code });

  res.json({ ok:true, message:msg });
});

app.post("/api/game/attack", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  const targetCountry = String(req.body.targetCountry || "").toUpperCase().slice(0,3);

  // Saldırı cooldown — flood koruması
  const now = Date.now();
  const last = cooldowns.get(player.wallet) || 0;
  if (now - last < ATTACK_COOLDOWN) {
    return res.status(429).json({ code:'ATTACK_COOLDOWN', error: "Çok hızlı saldırı — biraz yavaşla." });
  }
  cooldowns.set(player.wallet, now);

  if (roundStatus !== 'active') return res.status(400).json({ code:"ROUND_INACTIVE", error:"Tur aktif değil — yeni tur bekleniyor" });
  if (!player.country_code) return res.status(400).json({ code:"NO_COUNTRY_SELECTED", error:"Önce ülke seçmelisin" });
  if (player.bullets <= 0) return res.status(400).json({ code:"NO_BULLETS", error:"Mermin yok! Pazardan mermi al." });

  const own = countries.find(c=>c.code===player.country_code);
  const target = countries.find(c=>c.code===targetCountry);

  if (!target) return res.status(404).json({ code:"TARGET_NOT_FOUND", error:"Hedef ülke bulunamadı" });
  if (own.code === target.code) return res.status(400).json({ code:"CANT_ATTACK_SELF", error:"Kendi ülkeni vuramazsın" });
  if (target.eliminated) return res.status(400).json({ code:"COUNTRY_ELIMINATED", error:"Bu ülke elenmiş" });
  if (own.eliminated) return res.status(400).json({ code:"YOUR_COUNTRY_ELIMINATED", error:"Ülken elenmiş — saldıramazsın" });

  player.bullets -= 1;

  // ── KAYNAK ETKİLERİ ──
  if (!player.resources) player.resources = { oil:0, metal:0, uranium:0, energy:0 };
  // Saldıran: Metal seviyesi×%1 ekstra hasar (max %10)
  const attackerMetal = Math.min(player.resources.metal||0, 10);
  // Hedef ülkenin en katkılı oyuncusunun uranyumu kalkan olarak çalışır
  let defenderUranium = 0;
  const defenderTop = [...players.values()]
    .filter(p => p.country_code === target.code)
    .sort((a,b) => (b.contribution||0) - (a.contribution||0))[0];
  if (defenderTop && defenderTop.resources) {
    defenderUranium = Math.min(defenderTop.resources.uranium||0, 10);
  }

  clampCountryHp(target);
  clampCountryHp(own);
  // Hasar server-side hesaplanır: kaynak bonusları + süper güç buffları.
  let rawDamage = 1 + (attackerMetal/100) - (defenderUranium/100);
  if (own.isSuperpower) rawDamage *= SUPERPOWER_ATTACK_MULTIPLIER;
  if (target.isSuperpower) rawDamage *= SUPERPOWER_DAMAGE_MULTIPLIER;
  const damage = Math.max(1, Math.round(rawDamage));

  target.hp = Math.max(0, target.hp - damage);
  addCountryHp(own, damage);

  // ── RÜTBE BONUSU ──
  const rank = getRank(player.contribution);
  const contribGain = 1 + rank.bonus; // %5-%30 arası ekstra puan
  player.contribution += contribGain;
  player.attacks += 1;

  if (player.alliance_id && alliances.has(player.alliance_id)) {
    const alliance = alliances.get(player.alliance_id);
    alliance.score += contribGain;
    persistAlliance(alliance);
  }

  if (target.hp <= 0 && !target.eliminated) {
    target.eliminated = true;
    // Saldıran oyuncuya "kill" katkısı
    player.kills = (player.kills || 0) + 1;
    // Elenen ülkenin tüm oyuncularına "death" işle
    for (const p of players.values()) {
      if (p.country_code === target.code) {
        p.deaths = (p.deaths || 0) + 1;
        db.savePlayer(p);
      }
    }
    io.emit("country:eliminated", { country: target.code, by: player.wallet });
    // Tek ülke kaldı mı?
    const alive = countries.filter(c => !c.eliminated);
    if (alive.length <= 1 && roundStatus === 'active') {
      endRound();
    }
  }

  // ── KALICILIK: saldıran oyuncu + iki ülke ──
  dirtyPlayerWallets.add(player.wallet);
  dirtyCountryCodes.add(target.code);
  dirtyCountryCodes.add(own.code);

  const attack = {
    from_country: own.code,
    target_country: target.code,
    attackerCountry: own.code,
    targetCountry: target.code,
    damage:damage,
    newHp: target.hp,
    attackerHp: own.hp,
    attackerSuperpower: !!own.isSuperpower,
    targetSuperpower: !!target.isSuperpower,
    wallet:player.wallet,
    alliance_id:player.alliance_id,
    created_at:Date.now()
  };

  recentAttacks.unshift(attack);
  if (recentAttacks.length > 100) recentAttacks.pop();
  db.saveAttack(attack);

  io.emit("war:attack", attack);
  io.emit("hp:update", { target: target.code, newHP: target.hp, maxHP: target.max_hp, isSuperpower: !!target.isSuperpower });
  io.emit("hp:update", { target: own.code, newHP: own.hp, maxHP: own.max_hp, isSuperpower: !!own.isSuperpower });
  scheduleStateBroadcast();

  res.json({ ok:true, attack, player, newHp: target.hp, damage:damage });
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || (!IS_MAINNET ? "dev-admin-token" : "");

app.post("/api/admin/reset", adminRequired, (req,res)=>{
  if (roundStatus === 'active') {
    return res.status(400).json({ code:"RESET_REQUIRES_ENDED_ROUND", error:"Tam reset aktif turda kapali. Once turu bitir." });
  }
  countries.forEach(resetCountryForNewRound);
  players.clear();
  recentAttacks.length=0;
  cooldowns.clear();
  alliances.clear();
  allianceFeed.length=0;
  giftedWallets.clear();  // Hediye sayacını da sıfırla (tam reset)
  // DB'yi de temizle ve ülkeleri sıfırlanmış haliyle yaz
  db.wipeAll();
  db.saveAllCountries(countries);
  persistRoundState();
  emitState();
  res.json({ ok:true, message:"Centradar alliance reset complete" });
});

// ── ADMIN: TUR YÖNETİMİ ─────────────────────────
function checkAdmin(req) {
  const token = req.headers['x-admin-token'] || (req.body && req.body.token);
  if (!ADMIN_TOKEN || !safeEq(token || "", ADMIN_TOKEN)) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const session = verifySessionToken(bearer);
  if (!session || session.wallet !== ADMIN_OWNER_WALLET) return false;
  req.adminWallet = session.wallet;
  return true;
}

function adminRequired(req, res, next) {
  if (!checkAdmin(req)) return res.status(403).json({ code:"UNAUTHORIZED", error:"Yetkin yok" });
  next();
}

// Tur durumu — herkes görebilir
app.get("/api/round/status", (_req,res) => {
  res.json({
    round: {
      number: roundNumber,
      status: roundStatus,
      startTime: roundStartTime,
      endTime: roundEndTime,
      remainingMs: timeRemainingMs(),
      lastResult: lastRoundResult
    }
  });
});

// Admin: kazanan listesini gör (ödeme yapmadan önce kontrol)
app.get("/api/admin/round/winners", adminRequired, (req,res) => {
  if (roundStatus === 'active') {
    return res.json({
      preview: true,
      message: "Tur henüz aktif — bunlar şu anki sıralama (kazanan adayları)",
      winners: computeRoundResult()
    });
  }
  res.json({ preview:false, winners: lastRoundResult?.winners || [] });
});

app.get("/api/admin/feedback", adminRequired, (_req,res) => {
  res.json({ ok:true, feedback: feedbackItems.map(feedbackPublicItem) });
});

app.get("/api/admin/metrics", adminRequired, (_req,res) => {
  res.json({
    ok: true,
    generatedAt: Date.now(),
    uptimeSec: Math.floor((Date.now() - SERVICE_STARTED_AT) / 1000),
    dbEnabled: db.dbEnabled,
    onlinePlayers,
    playerCount: players.size,
    allianceCount: alliances.size,
    giftedCount: giftedWallets.size,
    feedbackCount: feedbackItems.length,
    recentAttackCount: recentAttacks.length,
    economy: economyState(),
    round: {
      number: roundNumber,
      status: roundStatus,
      remainingMs: timeRemainingMs()
    },
    countries: {
      total: countries.length,
      alive: countries.filter(c => !c.eliminated).length,
      eliminated: countries.filter(c => c.eliminated).length,
      superpowers: countries.filter(c => c.isSuperpower).length
    },
    rankNft: rankNftPublicState()
  });
});

app.get("/api/admin/purchases", adminRequired, async (req,res) => {
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  let purchases = [];
  let wallets = [];
  let grants = [];

  if (db.dbEnabled) {
    [purchases, wallets, grants] = await Promise.all([
      db.loadRecentPurchases(limit),
      db.loadWalletDepositTotals(100),
      db.loadRecentBulletGrants(20)
    ]);
  } else {
    purchases = memoryPurchaseList.slice(0, limit);
    wallets = memoryWalletDepositTotals().slice(0, 100);
    grants = memoryBulletGrants.slice(0, 20);
  }

  res.json({
    ok: true,
    generatedAt: Date.now(),
    dbEnabled: db.dbEnabled,
    network: NETWORK,
    chainId: CHAIN.chainId,
    explorerUrl: CHAIN.explorerUrl,
    economy: economyState(),
    wallets: wallets.map(walletDepositPublicItem),
    purchases: purchases.map(purchasePublicItem),
    grants: grants.map(bulletGrantPublicItem)
  });
});

app.post("/api/admin/bullets/grant", adminRequired, rateLimited, async (req,res) => {
  const targetWallet = normalizeWallet(req.body && req.body.wallet);
  const requestedBullets = Math.trunc(Number(req.body && (req.body.bullets ?? req.body.amount)));
  const reason = String(req.body && req.body.reason || "").trim().slice(0, 120);

  if (!targetWallet) return res.status(400).json({ code:"INVALID_WALLET", error:"Gecersiz cuzdan" });
  if (!Number.isSafeInteger(requestedBullets) || requestedBullets < 1) {
    return res.status(400).json({ code:"INVALID_BULLET_AMOUNT", error:"Gecersiz mermi miktari" });
  }
  if (requestedBullets > MAX_ADMIN_BULLET_GRANT) {
    return res.status(400).json({
      code:"ADMIN_BULLET_GRANT_LIMIT",
      error:`Tek seferde en fazla ${MAX_ADMIN_BULLET_GRANT} mermi verilebilir`
    });
  }

  const player = getPlayer(targetWallet);
  const before = Number(player.bullets) || 0;
  const after = Math.min(MAX_PLAYER_BULLETS, before + requestedBullets);
  const added = after - before;
  if (added < 1) {
    return res.status(400).json({ code:"PLAYER_BULLET_CAP", error:"Oyuncu mermi sinirinda" });
  }

  player.bullets = after;
  db.savePlayer(player);

  const grant = {
    wallet: player.wallet,
    bullets: added,
    reason,
    adminWallet: req.adminWallet,
    createdAt: Date.now()
  };
  rememberBulletGrant(grant);
  await db.recordBulletGrant(grant);

  const publicGrant = bulletGrantPublicItem(grant);
  io.emit("admin:bullet-grant", publicGrant);
  emitState();
  res.json({ ok:true, player, grant:publicGrant });
});

app.post("/api/admin/player/grant-bullets", adminRequired, rateLimited, async (req,res) => {
  const target = normalizeWallet(req.body && req.body.wallet);
  if (!target) return res.status(400).json({ code:"INVALID_WALLET", error:"Gecersiz cuzdan" });

  const amount = Math.trunc(Number(req.body && req.body.amount));
  const reason = String(req.body && req.body.reason || "").trim().slice(0, 120);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    return res.status(400).json({ code:"INVALID_AMOUNT", error:"Gecersiz mermi miktari" });
  }
  if (amount > MAX_ADMIN_BULLET_GRANT) {
    return res.status(400).json({
      code:"ADMIN_BULLET_GRANT_LIMIT",
      error:`Tek seferde en fazla ${MAX_ADMIN_BULLET_GRANT} mermi verilebilir`
    });
  }

  const player = getPlayer(target);
  const before = Number(player.bullets) || 0;
  const after = Math.min(MAX_PLAYER_BULLETS, before + amount);
  const added = after - before;
  if (added < 1) {
    return res.status(400).json({ code:"PLAYER_BULLET_CAP", error:"Oyuncu mermi sinirinda" });
  }

  player.bullets = after;
  db.savePlayer(player);

  const grant = {
    wallet: player.wallet,
    bullets: added,
    reason,
    adminWallet: req.adminWallet,
    createdAt: Date.now()
  };
  rememberBulletGrant(grant);
  await db.recordBulletGrant(grant);

  const publicGrant = bulletGrantPublicItem(grant);
  io.emit("admin:bullet-grant", publicGrant);
  emitState();
  console.log(`[ADMIN] ${req.adminWallet} -> ${target} +${added} mermi`);
  res.json({ ok:true, wallet:target, amount:added, newBalance:player.bullets, player, grant:publicGrant });
});

app.get("/api/admin/backup", adminRequired, async (_req,res,next) => {
  try {
    res.setHeader("Content-Disposition", `attachment; filename="centradar-backup-${Date.now()}.json"`);
    res.json(await adminBackupSnapshot());
  } catch (e) {
    next(e);
  }
});

app.post("/api/admin/round/payout-log", adminRequired, (req,res) => {
  if (!lastRoundResult) return res.status(400).json({ code:"NO_ROUND_RESULT", error:"Kaydedilecek bitmis tur yok" });
  const rank = Number(req.body && req.body.rank);
  const txHash = String(req.body && req.body.txHash || "").trim();
  if (!Number.isInteger(rank) || rank < 1 || rank > 3) {
    return res.status(400).json({ code:"INVALID_RANK", error:"Gecersiz odul sirasi" });
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ code:"INVALID_TX_HASH", error:"Gecersiz islem hash'i" });
  }
  const payout = {
    rank,
    txHash,
    explorerUrl: `${CHAIN.explorerUrl}/tx/${txHash}`,
    recordedAt: Date.now()
  };
  const payouts = Array.isArray(lastRoundResult.payouts) ? lastRoundResult.payouts.filter(p => p.rank !== rank) : [];
  payouts.push(payout);
  payouts.sort((a,b)=>a.rank-b.rank);
  lastRoundResult.payouts = payouts;
  persistRoundState();
  res.json({ ok:true, payout, payouts });
});

// Admin: turu manuel bitir
app.post("/api/admin/round/end", adminRequired, (req,res) => {
  if (roundStatus !== 'active') return res.status(400).json({ code:"ROUND_ALREADY_ENDED", error:"Tur zaten bitmiş" });
  endRound();
  res.json({ ok:true, result: lastRoundResult });
});

// Admin: yeni tur başlat (ödüller dağıtıldıktan SONRA)
app.post("/api/admin/round/start", adminRequired, (req,res) => {
  if (roundStatus === 'active') return res.status(400).json({ code:"ROUND_ALREADY_ACTIVE", error:"Zaten aktif tur var" });
  startNewRound();
  res.json({ ok:true, round: { number: roundNumber, startTime: roundStartTime, endTime: roundEndTime } });
});

io.on("connection", socket=>{
  onlinePlayers++;
  const session = socketSession(socket);
  if (session) {
    socket.data.wallet = session.wallet;
    socket.data.allianceId = session.allianceId;
    if (session.allianceId) socket.join(allianceRoomId(session.allianceId));
  }
  io.emit("players:online", { onlinePlayers });
  socket.emit("war:state", state());

  socket.on("heartbeat", ()=>{
    socket.data.lastSeen = Date.now();
  });

  socket.on("disconnect", ()=>{
    onlinePlayers = Math.max(0, onlinePlayers - 1);
    io.emit("players:online", { onlinePlayers });
  });
});

process.on("SIGTERM", ()=>{
  try { flushDirtyWrites(); } catch(e) {}
  server.close(()=>process.exit(0));
  setTimeout(()=>process.exit(0), 3000);
});

// ── BAŞLANGIÇ: DB'yi kur, veriyi belleğe yükle, sonra sunucuyu başlat ──
app.use((err, _req, res, _next) => {
  console.error("[SERVER_ERROR]", err && (err.stack || err.message || err));
  try {
    const stackLines = String(err && err.stack || "").split("\n").slice(0, 3);
    sendDiscordAlert("🔥 SERVER_ERROR", [
      String(err && err.message || err || "Unknown error"),
      ...stackLines
    ]).catch(e => console.warn("[SERVER_ERROR] Discord alert failed:", e.message));
  } catch {}
  if (res.headersSent) return;
  res.status(500).json({ code:"SERVER_ERROR", error:"Beklenmeyen sunucu hatasi" });
});

async function bootstrap() {
  await db.initSchema();
  const loaded = await db.loadAll();

  // Son saldırıları yükle (radar + haber ticker bootstrap için)
  try {
    const attacks = await db.loadRecentAttacks(100);
    if (attacks && attacks.length > 0) {
      // En yeni en başta olacak şekilde belleğe koy
      for (const a of attacks) recentAttacks.push(a);
      console.log(`[DB] ${attacks.length} son saldırı yüklendi`);
    }
  } catch(e) { /* sessizce geç */ }

  if (loaded) {
    // Oyuncuları belleğe yükle
    if (loaded.players && loaded.players.size > 0) {
      for (const [k, v] of loaded.players) players.set(k, v);
    }
    // İttifakları yükle (members array → Set'e çevir)
    if (loaded.alliances && loaded.alliances.size > 0) {
      for (const [k, v] of loaded.alliances) {
        v.members = new Set(Array.isArray(v.members) ? v.members : []);
        alliances.set(k, v);
      }
    }
    // Hediye sayacını yükle
    if (loaded.gifted && loaded.gifted.size > 0) {
      for (const w of loaded.gifted) giftedWallets.add(w);
    }
    // Ülke HP durumlarını yükle (DB'de varsa, mevcut bellek countries'i güncelle)
    if (loaded.countries && loaded.countries.length > 0) {
      for (const dbC of loaded.countries) {
        const memC = countries.find(c => c.code === dbC.code);
        if (memC) {
          memC.hp = dbC.hp;
          memC.max_hp = dbC.max_hp;
          memC.eliminated = dbC.eliminated;
          memC.isSuperpower = !!dbC.isSuperpower;
          clampCountryHp(memC);
          db.saveCountry(memC);
        }
      }
    } else {
      // DB'de ülke yoksa ilk kez — mevcut bellek durumunu DB'ye yaz
      db.saveAllCountries(countries);
    }
    // Tur durumunu yükle
    const gs = loaded.gameState || {};
    if (gs.round) {
      const r = gs.round;
      if (r.roundNumber != null) roundNumber = r.roundNumber;
      if (r.roundStatus) roundStatus = r.roundStatus;
      if (r.roundStartTime) roundStartTime = r.roundStartTime;
      if (r.roundEndTime) roundEndTime = r.roundEndTime;
      if (r.lastRoundResult !== undefined) lastRoundResult = r.lastRoundResult;
    }
  }

  try {
    setPurchaseTotals(await db.loadPurchaseTotals());
    console.log(`[DB] Satin alma ozeti: ${purchaseTotals.purchaseCount} islem, ${ethers.formatEther(purchaseTotals.totalWei)} ETH`);
  } catch(e) {
    console.error("[DB] Satin alma ozeti yuklenemedi:", e.message);
  }

  await refreshOnchainRewardPool();
  setInterval(refreshOnchainRewardPool, 60 * 1000);

  server.listen(PORT, "0.0.0.0", ()=>{
    console.log(`🟢 CENTRADAR BACKEND ONLINE — port ${PORT} — build ${new Date(SERVICE_STARTED_AT).toISOString()}`);
    console.log("[DB] Durum:", db.dbEnabled ? "PostgreSQL aktif" : "Bellek modu");
  });
}

bootstrap();
