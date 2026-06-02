import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { ethers } from "ethers";
import * as db from "./db.js";

// ═══════════════════════════════════════════════
console.log("🟢🟢🟢 ABSWAR SERVER v5 — BOOTSTRAP + DB + ADMIN — BUILD CHECK 🟢🟢🟢");
// ═══════════════════════════════════════════════

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
const ALLOW_DEMO_PURCHASES = process.env.ALLOW_DEMO_PURCHASES === "true" && !IS_MAINNET;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://abswar.xyz,https://www.abswar.xyz,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173")
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

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

function corsOrigin(origin, callback) {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
  return callback(new Error("Origin not allowed"));
}

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "64kb" }));

const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true }
});

let onlinePlayers = 0;

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
  code, name, flag, hp:1000, max_hp:1000, eliminated:false
}));

const players = new Map();
const recentAttacks = [];
// İlk 100 kullanıcı hediye sistemi
const GIFT_LIMIT = 100;       // İlk kaç kullanıcı bonus alır
const GIFT_AMOUNT = 100;      // Bonus mermi miktarı
const giftedWallets = new Set(); // Hediye alan cüzdanlar
const cooldowns = new Map();
const alliances = new Map();
const allianceFeed = [];

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
  console.log(`[ROUND ${roundNumber}] BİTTİ — Kazananlar:`, winners.map(w=>`${w.flag} ${w.country} (${w.sharePct}%)`).join(' | '));
}

function startNewRound() {
  roundNumber++;
  roundStartTime = Date.now();
  roundEndTime = roundStartTime + ROUND_DURATION_MS;
  roundStatus = 'active';
  // Ülkeleri sıfırla
  countries.forEach(c => { c.hp = 1000; c.max_hp = 1000; c.eliminated = false; });
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

function normalizeWallet(w) {
  if (typeof w !== "string") return null;
  try {
    if (!ethers.isAddress(w)) return null;
    return ethers.getAddress(w).toLowerCase();
  } catch {
    return null;
  }
}

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
    "ABSWAR wallet login",
    "",
    `Wallet: ${ethers.getAddress(wallet)}`,
    `Network: ${CHAIN.name}`,
    `Nonce: ${nonce}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    "",
    "Only sign this message on abswar.xyz. This does not authorize a blockchain transaction."
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

// --- CHAIN PAYMENT VERIFICATION ---
const provider = new ethers.JsonRpcProvider(ABSWAR_RPC_URL, CHAIN.chainId);
const BUY_AMMO_SELECTOR = "0x499eb3de";
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

function apiError(code, message, status = 400) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
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
    throw apiError("TX_TO_MISMATCH", "Islem ABSWAR kontratina gitmiyor");
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

// Yasaklı/küfür kelime filtresi (basit)
// Küfür / kötü kullanım filtresi
// Önemli: 'aq', 'oç' gibi kısa parçalar "Yaqar", "Boçak" gibi normal isimlere
// substring olarak takılıyordu. Şimdi tam kelime eşleşmesi yapıyoruz.
const BANNED_WORDS = ['orospu','siktir','amına','anandan','anasını','allahını','piçkurusu','admin','official','anthropic','claude','moderator','sistem'];
function isCleanText(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  // Tam kelime veya kelime başında/sonunda kontrol (substring değil)
  // Boşluk veya kelime sınırlarıyla ayrılmış olmalı
  for (const w of BANNED_WORDS) {
    const re = new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`, 'i');
    if (re.test(text)) return false;
  }
  return true;
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
      bullets:100,
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

/* ── RÜTBE SİSTEMİ ── */
const RANKS = [
  { min:0,      name:'Asker',    icon:'🪖',          bonus:0   },
  { min:50,     name:'Onbaşı',   icon:'🎖',          bonus:0.05 },
  { min:200,    name:'Çavuş',    icon:'🎖🎖',        bonus:0.10 },
  { min:500,    name:'Teğmen',   icon:'⭐',          bonus:0.15 },
  { min:1500,   name:'Yüzbaşı',  icon:'⭐⭐',        bonus:0.20 },
  { min:5000,   name:'Binbaşı',  icon:'⭐⭐⭐',      bonus:0.25 },
  { min:15000,  name:'General',  icon:'⭐⭐⭐⭐',    bonus:0.30 }
];

function getRank(contribution) {
  let r = RANKS[0];
  for (const rank of RANKS) {
    if (contribution >= rank.min) r = rank;
  }
  return r;
}

function getNextRank(contribution) {
  for (const rank of RANKS) {
    if (contribution < rank.min) return rank;
  }
  return null; // En yüksek rütbedeyiz
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
    allianceFeed,
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
      nft:false,
      token:false
    }
  };
}

function emitState() {
  io.emit("war:state", state());
}

function addAllianceFeed(type, message, payload={}) {
  const item = { type, message, payload, created_at:Date.now() };
  allianceFeed.unshift(item);
  if (allianceFeed.length > 30) allianceFeed.pop();
  io.emit("alliance:feed", item);
}

app.get("/", (_req,res)=>res.json({ ok:true, name:"ABSWAR Alliance Beta Backend" }));
app.get("/health", (_req,res)=>res.json({
  ok:true,
  realtime:true,
  alliance:true,
  noNFT:true,
  noToken:true,
  onlinePlayers,
  network: NETWORK,
  chainId: CHAIN.chainId,
  paymentVerification: true
}));
app.get("/api/game/state", (_req,res)=>res.json(state()));

app.post("/api/auth/challenge", rateLimited, (req,res)=>{
  const wallet = normalizeWallet(req.body && req.body.wallet);
  if (!wallet) return res.status(400).json({ code:"INVALID_WALLET", error:"Gecersiz cuzdan" });
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const message = makeChallengeMessage(wallet, nonce, expiresAt);
  authChallenges.set(wallet, { nonce, message, expiresAt });
  res.json({ ok:true, wallet, message, expiresAt });
});

app.post("/api/auth/verify", rateLimited, (req,res)=>{
  const wallet = normalizeWallet(req.body && req.body.wallet);
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
    const recovered = normalizeWallet(ethers.verifyMessage(message, signature));
    if (recovered !== wallet) {
      return res.status(401).json({ code:"SIGNATURE_MISMATCH", error:"Imza cuzdanla eslesmiyor" });
    }
    authChallenges.delete(wallet);
    const session = issueSessionToken(wallet);
    res.json({ ok:true, wallet, token:session.token, expiresAt:session.expiresAt });
  } catch {
    return res.status(401).json({ code:"INVALID_SIGNATURE", error:"Imza dogrulanamadi" });
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
          myCountry.hp = Math.min(myCountry.max_hp, myCountry.hp + 50);
          bonus = { type:'hp', amount:50, message:'⚡ Enerji %100! Ülken +50 HP' };
          io.emit("hp:update", { target: myCountry.code, newHP: myCountry.hp });
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
  emitState();
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
  if (!ALLOW_DEMO_PURCHASES) {
    return res.status(410).json({ code:"PAYMENT_VERIFICATION_REQUIRED", error:"Demo satin alma kapali; blockchain islemi gerekli" });
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

  addAllianceFeed("CREATE", name + " alliance kuruldu", { id, wallet:player.wallet });
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

app.post("/api/alliance/radio", authRequired, rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const wallet = req.body.wallet;
  const command = String(req.body.command || "").toUpperCase();
  const player = getPlayer(wallet);

  const allowed = ["ATTACK_NOW","DEFEND","NEED_SUPPORT","FALL_BACK","ENEMY_DETECTED","PUSH_FINAL","REGROUP","RETREAT","FOCUS_FIRE","SCATTER"];
  if (!allowed.includes(command)) return res.status(400).json({ code:"INVALID_COMMAND", error:"Geçersiz komut" });
  if (!player.alliance_id) return res.status(400).json({ code:"NOT_IN_ALLIANCE", error:"İttifakta değilsin" });

  const alliance = alliances.get(player.alliance_id);
  alliance.score += 1;
  persistAlliance(alliance);

  const msg = alliance.name + ": " + command;
  addAllianceFeed("RADIO", msg, { allianceId:alliance.id, command, wallet:player.wallet, nickname:player.nickname, country:player.country_code });
  emitState();

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

  // Hasar hesaplaması: 1 + metal bonus - uranyum kalkanı (min 1 olur)
  const damage = Math.max(1, Math.round(1 + (attackerMetal/100) - (defenderUranium/100)));

  target.hp = Math.max(0, target.hp - damage);
  // Saldıran ülkenin HP'si artar ama 100.000 tavanını geçemez (sınırsız büyümeyi önler)
  const HP_CAP = 100000;
  own.hp = Math.min(HP_CAP, own.hp + damage);

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
  db.savePlayer(player);
  db.saveCountry(target);
  db.saveCountry(own);

  const attack = {
    from_country: own.code,
    target_country: target.code,
    attackerCountry: own.code,
    targetCountry: target.code,
    damage:damage,
    newHp: target.hp,
    wallet:player.wallet,
    alliance_id:player.alliance_id,
    created_at:Date.now()
  };

  recentAttacks.unshift(attack);
  if (recentAttacks.length > 100) recentAttacks.pop();
  db.saveAttack(attack);

  io.emit("war:attack", attack);
  io.emit("hp:update", { target: target.code, newHP: target.hp });
  emitState();

  res.json({ ok:true, attack, player, newHp: target.hp, damage:damage });
});

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ("abswar-admin-" + Math.random().toString(36).slice(2,10));
console.log("ADMIN_TOKEN (kullan x-admin-token header):", ADMIN_TOKEN);

app.post("/api/admin/reset", (req,res)=>{
  const token = req.headers['x-admin-token'] || (req.body && req.body.token);
  if (token !== ADMIN_TOKEN) return res.status(403).json({ code:"UNAUTHORIZED", error:"Yetkin yok" });
  countries.forEach(c=>{ c.hp=1000; c.max_hp=1000; c.eliminated=false; });
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
  res.json({ ok:true, message:"ABSWAR alliance beta reset complete" });
});

// ── ADMIN: TUR YÖNETİMİ ─────────────────────────
function checkAdmin(req) {
  const token = req.headers['x-admin-token'] || (req.body && req.body.token);
  return token === ADMIN_TOKEN;
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
app.get("/api/admin/round/winners", (req,res) => {
  if (!checkAdmin(req)) return res.status(403).json({ code:"UNAUTHORIZED", error:"Yetkin yok" });
  if (roundStatus === 'active') {
    return res.json({
      preview: true,
      message: "Tur henüz aktif — bunlar şu anki sıralama (kazanan adayları)",
      winners: computeRoundResult()
    });
  }
  res.json({ preview:false, winners: lastRoundResult?.winners || [] });
});

// Admin: turu manuel bitir
app.post("/api/admin/round/end", (req,res) => {
  if (!checkAdmin(req)) return res.status(403).json({ code:"UNAUTHORIZED", error:"Yetkin yok" });
  if (roundStatus !== 'active') return res.status(400).json({ code:"ROUND_ALREADY_ENDED", error:"Tur zaten bitmiş" });
  endRound();
  res.json({ ok:true, result: lastRoundResult });
});

// Admin: yeni tur başlat (ödüller dağıtıldıktan SONRA)
app.post("/api/admin/round/start", (req,res) => {
  if (!checkAdmin(req)) return res.status(403).json({ code:"UNAUTHORIZED", error:"Yetkin yok" });
  if (roundStatus === 'active') return res.status(400).json({ code:"ROUND_ALREADY_ACTIVE", error:"Zaten aktif tur var" });
  startNewRound();
  res.json({ ok:true, round: { number: roundNumber, startTime: roundStartTime, endTime: roundEndTime } });
});

io.on("connection", socket=>{
  onlinePlayers++;
  io.emit("players:online", { onlinePlayers });
  socket.emit("war:state", state());

  socket.on("disconnect", ()=>{
    onlinePlayers = Math.max(0, onlinePlayers - 1);
    io.emit("players:online", { onlinePlayers });
  });
});

// ── BAŞLANGIÇ: DB'yi kur, veriyi belleğe yükle, sonra sunucuyu başlat ──
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

  server.listen(PORT, ()=>{
    console.log("ABSWAR ALLIANCE BETA BACKEND RUNNING ON PORT " + PORT);
    console.log("[DB] Durum:", db.dbEnabled ? "PostgreSQL aktif" : "Bellek modu");
  });
}

bootstrap();
