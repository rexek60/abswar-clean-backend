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
  ["TR","Türkiye","🇹🇷"],["US","United States","🇺🇸"],["RU","Russia","🇷🇺"],["CN","China","🇨🇳"],["DE","Germany","🇩🇪"],
  ["FR","France","🇫🇷"],["GB","United Kingdom","🇬🇧"],["BR","Brazil","🇧🇷"],["JP","Japan","🇯🇵"],["IN","India","🇮🇳"],
  ["IT","Italy","🇮🇹"],["ES","Spain","🇪🇸"],["CA","Canada","🇨🇦"],["AU","Australia","🇦🇺"],["KR","South Korea","🇰🇷"],
  ["MX","Mexico","🇲🇽"],["NL","Netherlands","🇳🇱"],["SE","Sweden","🇸🇪"],["NO","Norway","🇳🇴"],["DK","Denmark","🇩🇰"]
].map(([code,name,flag]) => ({
  code, name, flag, hp:100000, max_hp:100000, eliminated:false
}));

const players = new Map();
const recentAttacks = [];
const cooldowns = new Map();
const alliances = new Map();
const allianceFeed = [];

function getPlayer(wallet) {
  const id = String(wallet || "demo-player").toLowerCase();
  if (!players.has(id)) {
    players.set(id, {
      wallet:id,
      country_code:null,
      bullets:100,
      contribution:0,
      attacks:0,
      alliance_id:null,
      created_at:Date.now()
    });
  }
  return players.get(id);
}

function publicAlliance(a) {
  return {
    id:a.id,
    name:a.name,
    country_code:a.country_code,
    score:a.score,
    members:[...a.members],
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

  if (!country) return res.status(404).json({ error:"Country not found" });
  if (country.eliminated) return res.status(400).json({ error:"Country eliminated" });

  if (player.country_code) {
    const current = countries.find(c=>c.code===player.country_code);
    if (current && !current.eliminated) return res.status(403).json({ error:"Ülken elenmeden başka ülkeye geçemezsin" });
  }

  player.country_code = countryCode;
  emitState();
  res.json({ ok:true, player });
});

app.post("/api/market/buy-demo", (req,res)=>{
  const player = getPlayer(req.body.wallet);
  const pack = Number(req.body.pack || 1);
  const packs = { 1:100, 10:1000, 100:10000, 1000:100000 };
  const bullets = packs[pack] || 100;
  player.bullets += bullets;

  io.emit("market:purchase", { wallet:player.wallet, pack, bullets });
  emitState();
  res.json({ ok:true, player, added:bullets });
});

app.post("/api/alliance/create", (req,res)=>{
  const wallet = req.body.wallet;
  const name = String(req.body.name || "").trim().slice(0,24);
  const player = getPlayer(wallet);

  if (!name) return res.status(400).json({ error:"Alliance adı gerekli" });
  if (!player.country_code) return res.status(400).json({ error:"Önce ülke seçmelisin" });
  if (player.alliance_id) return res.status(400).json({ error:"Zaten alliance içindesin" });

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

  addAllianceFeed("CREATE", `${name} alliance kuruldu`, { id, wallet:player.wallet });
  emitState();

  res.json({ ok:true, alliance:publicAlliance(alliance), player });
});

app.post("/api/alliance/join", (req,res)=>{
  const wallet = req.body.wallet;
  const allianceId = String(req.body.allianceId || "");
  const player = getPlayer(wallet);
  const alliance = alliances.get(allianceId);

  if (!alliance) return res.status(404).json({ error:"Alliance bulunamadı" });
  if (!player.country_code) return res.status(400).json({ error:"Önce ülke seçmelisin" });
  if (player.alliance_id) return res.status(400).json({ error:"Zaten alliance içindesin" });

  player.alliance_id = allianceId;
  alliance.members.add(player.wallet);

  addAllianceFeed("JOIN", `${player.wallet.slice(0,8)} ${alliance.name} alliance'a katıldı`, { allianceId });
  emitState();

  res.json({ ok:true, alliance:publicAlliance(alliance), player });
});

app.post("/api/alliance/radio", (req,res)=>{
  const wallet = req.body.wallet;
  const command = String(req.body.command || "").toUpperCase();
  const player = getPlayer(wallet);

  const allowed = ["ATTACK_NOW","DEFEND","NEED_SUPPORT","FALL_BACK","ENEMY_DETECTED","PUSH_FINAL"];
  if (!allowed.includes(command)) return res.status(400).json({ error:"Geçersiz komut" });
  if (!player.alliance_id) return res.status(400).json({ error:"Alliance içinde değilsin" });

  const alliance = alliances.get(player.alliance_id);
  alliance.score += 1;

  const labels = {
    ATTACK_NOW:"ATTACK NOW",
    DEFEND:"DEFEND",
    NEED_SUPPORT:"NEED SUPPORT",
    FALL_BACK:"FALL BACK",
    ENEMY_DETECTED:"ENEMY DETECTED",
    PUSH_FINAL:"PUSH FINAL"
  };

  const msg = `${alliance.name}: ${labels[command]}`;
  addAllianceFeed("RADIO", msg, { allianceId:alliance.id, command, wallet:player.wallet });
  emitState();

  res.json({ ok:true, message:msg });
});

app.post("/api/game/attack", (req,res)=>{
  const player = getPlayer(req.body.wallet);
  const targetCountry = String(req.body.targetCountry || "").toUpperCase();

  const now = Date.now();
  const last = cooldowns.get(player.wallet) || 0;
  if (now - last < 350) return res.status(429).json({ error:"Cooldown aktif. Çok hızlı saldırı." });
  cooldowns.set(player.wallet, now);

  if (!player.country_code) return res.status(400).json({ error:"Önce ülke seçmelisin" });
  if (player.bullets <= 0) return res.status(400).json({ error:"Mermin yok. Marketten mermi al." });

  const own = countries.find(c=>c.code===player.country_code);
  const target = countries.find(c=>c.code===targetCountry);

  if (!target) return res.status(404).json({ error:"Target country not found" });
  if (own.code === target.code) return res.status(400).json({ error:"Kendi ülkeni vuramazsın" });
  if (target.eliminated) return res.status(400).json({ error:"Bu ülke elenmiş" });

  target.hp = Math.max(0, target.hp - 1);
  own.hp += 1;
  player.bullets -= 1;
  player.contribution += 1;
  player.attacks += 1;

  if (player.alliance_id && alliances.has(player.alliance_id)) {
    const alliance = alliances.get(player.alliance_id);
    alliance.score += 1;
  }

  if (target.hp <= 0) target.eliminated = true;

  const attack = {
    from_country: own.code,
    target_country: target.code,
    damage:1,
    wallet:player.wallet,
    alliance_id:player.alliance_id,
    created_at:Date.now()
  };

  recentAttacks.unshift(attack);
  if (recentAttacks.length > 30) recentAttacks.pop();

  io.emit("war:attack", attack);
  emitState();

  res.json({ ok:true, attack, player });
});

app.post("/api/admin/reset", (_req,res)=>{
  countries.forEach(c=>{ c.hp=100000; c.max_hp=100000; c.eliminated=false; });
  players.clear();
  recentAttacks.length=0;
  cooldowns.clear();
  alliances.clear();
  allianceFeed.length=0;
  emitState();
  res.json({ ok:true, message:"ABSWAR alliance beta reset complete" });
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
