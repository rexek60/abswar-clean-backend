import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "*", credentials: true }
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
  alliances.forEach(a => { a.score = 0; });
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

// ── KÖTÜYE KULLANIM KORUMASI ─────────────────────
const rateLimits = new Map(); // wallet -> { count, windowStart }
const RATE_LIMIT_WINDOW = 10000; // 10 saniye
const RATE_LIMIT_MAX = 30;       // 10 saniyede max 30 istek
const ATTACK_COOLDOWN = 250;     // saldırılar arası min 250ms

function checkRateLimit(wallet) {
  const now = Date.now();
  const r = rateLimits.get(wallet) || { count:0, windowStart:now };
  if (now - r.windowStart > RATE_LIMIT_WINDOW) {
    r.count = 0;
    r.windowStart = now;
  }
  r.count++;
  rateLimits.set(wallet, r);
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
  return typeof w === 'string' && /^0x[a-f0-9]{40}$/i.test(w) || w === 'demo-player' || (typeof w === 'string' && w.length > 0 && w.length < 50);
}

// Middleware
function rateLimited(req, res, next) {
  const wallet = (req.body && req.body.wallet) || 'anon';
  if (!checkRateLimit(String(wallet).toLowerCase())) {
    return res.status(429).json({ code:'RATE_LIMITED', error: 'Çok fazla istek. Lütfen yavaşla.' });
  }
  next();
}

function getPlayer(wallet) {
  const id = String(wallet || "demo-player").toLowerCase();
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
app.get("/health", (_req,res)=>res.json({ ok:true, realtime:true, alliance:true, noNFT:true, noToken:true, onlinePlayers }));
app.get("/api/game/state", (_req,res)=>res.json(state()));

app.post("/api/player/connect", (req,res)=>{
  const player = getPlayer(req.body.wallet);
  res.json({ ok:true, player });
});

app.post("/api/player/choose-country", (req,res)=>{
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
  emitState();
  res.json({ ok:true, player });
});

// Nickname ayarlama (oyun başlangıcında bir kez veya değiştirme)
app.post("/api/player/nickname", rateLimited, (req,res)=>{
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
  res.json({ ok:true, player });
});

// Radar yükseltme — 5 mermi karşılığı seviye atlat
app.post("/api/player/radar-upgrade", rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  if (!player.radar_level) player.radar_level = 3;
  if (player.radar_level >= 10) return res.status(400).json({ code:"RADAR_MAX", error:"Radar zaten maksimum seviyede (10)" });
  const cost = 5;
  if (player.bullets < cost) return res.status(400).json({ code:"INSUFFICIENT_BULLETS", error:`Yetersiz mermi (${cost} gerekir)` });
  player.bullets -= cost;
  player.radar_level++;
  res.json({ ok:true, player });
});

// Kaynak üretimi — 1 mermi → seviye +10. %100'de bonus alır ve sıfırlanır.
app.post("/api/player/produce-resource", rateLimited, (req,res)=>{
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
        }
      }
    }
    // Metal ve uranyum %100'de aktif kalır — seviye yüksek tutmak fayda sağlar
    // ama 100'de kalsın, sıfırlamayalım çünkü kalkan/hasar bonusu sürekli aktif
    if (which !== 'metal' && which !== 'uranium') {
      player.resources[which] = 0;
    }
  }
  emitState();
  res.json({ ok:true, player, bonus });
});

app.post("/api/market/buy-demo", rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  const pack = Number(req.body.pack || 1);
  const packs = { 100:100, 500:1000, 2000:10000, 9999:100000 };
  const bullets = packs[pack] || 100;
  player.bullets += bullets;

  io.emit("market:purchase", { wallet:player.wallet, pack, bullets });
  emitState();
  res.json({ ok:true, player, added:bullets });
});

app.post("/api/alliance/create", rateLimited, (req,res)=>{
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

  addAllianceFeed("CREATE", name + " alliance kuruldu", { id, wallet:player.wallet });
  emitState();

  res.json({ ok:true, alliance:publicAlliance(alliance), player });
});

app.post("/api/alliance/join", rateLimited, (req,res)=>{
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

  addAllianceFeed("JOIN", player.wallet.slice(0,8) + " " + alliance.name + " alliance'a katildi", { allianceId });
  emitState();

  res.json({ ok:true, alliance:publicAlliance(alliance), player });
});

app.post("/api/alliance/leave", rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const player = getPlayer(req.body.wallet);
  if (!player.alliance_id) return res.status(400).json({ code:"NOT_IN_ALLIANCE", error:"İttifakta değilsin" });
  const alliance = alliances.get(player.alliance_id);
  if (!alliance) {
    player.alliance_id = null;
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
    addAllianceFeed("DISBAND", alliance.name + " ittifaki dagildi", { allianceId:alliance.id });
  } else {
    addAllianceFeed("LEAVE", player.wallet.slice(0,8) + " ittifaktan ayrildi", { allianceId:alliance.id });
  }
  emitState();
  res.json({ ok:true, player });
});

app.post("/api/alliance/radio", rateLimited, (req,res)=>{
  if (!validWallet(req.body.wallet)) return res.status(400).json({ code:"INVALID_WALLET", error:"Geçersiz cüzdan" });
  const wallet = req.body.wallet;
  const command = String(req.body.command || "").toUpperCase();
  const player = getPlayer(wallet);

  const allowed = ["ATTACK_NOW","DEFEND","NEED_SUPPORT","FALL_BACK","ENEMY_DETECTED","PUSH_FINAL","REGROUP","RETREAT","FOCUS_FIRE","SCATTER"];
  if (!allowed.includes(command)) return res.status(400).json({ code:"INVALID_COMMAND", error:"Geçersiz komut" });
  if (!player.alliance_id) return res.status(400).json({ code:"NOT_IN_ALLIANCE", error:"İttifakta değilsin" });

  const alliance = alliances.get(player.alliance_id);
  alliance.score += 1;

  const msg = alliance.name + ": " + command;
  addAllianceFeed("RADIO", msg, { allianceId:alliance.id, command, wallet:player.wallet, nickname:player.nickname, country:player.country_code });
  emitState();

  res.json({ ok:true, message:msg });
});

app.post("/api/game/attack", rateLimited, (req,res)=>{
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
  own.hp += damage;

  // ── RÜTBE BONUSU ──
  const rank = getRank(player.contribution);
  const contribGain = 1 + rank.bonus; // %5-%30 arası ekstra puan
  player.contribution += contribGain;
  player.attacks += 1;

  if (player.alliance_id && alliances.has(player.alliance_id)) {
    const alliance = alliances.get(player.alliance_id);
    alliance.score += contribGain;
  }

  if (target.hp <= 0 && !target.eliminated) {
    target.eliminated = true;
    // Saldıran oyuncuya "kill" katkısı
    player.kills = (player.kills || 0) + 1;
    // Elenen ülkenin tüm oyuncularına "death" işle
    for (const p of players.values()) {
      if (p.country_code === target.code) {
        p.deaths = (p.deaths || 0) + 1;
      }
    }
    io.emit("country:eliminated", { country: target.code, by: player.wallet });
    // Tek ülke kaldı mı?
    const alive = countries.filter(c => !c.eliminated);
    if (alive.length <= 1 && roundStatus === 'active') {
      endRound();
    }
  }

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

server.listen(PORT, ()=>console.log("ABSWAR ALLIANCE BETA BACKEND RUNNING ON PORT " + PORT));
