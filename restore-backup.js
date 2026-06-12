import fs from "node:fs/promises";
import * as db from "./db.js";

const args = process.argv.slice(2);
const backupPath = args.find(arg => !arg.startsWith("--"));
const shouldWrite = args.includes("--yes");
const shouldWipe = args.includes("--wipe");

function fail(message) {
  console.error(`HATA: ${message}`);
  process.exitCode = 1;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePlayer(player) {
  return {
    wallet: String(player.wallet || "").toLowerCase(),
    nickname: player.nickname || null,
    country_code: player.country_code || player.countryCode || null,
    bullets: toNumber(player.bullets),
    contribution: toNumber(player.contribution),
    attacks: toNumber(player.attacks),
    kills: toNumber(player.kills),
    deaths: toNumber(player.deaths),
    radar_level: toNumber(player.radar_level || player.radarLevel, 3),
    resources: player.resources || { oil:0, metal:0, uranium:0, energy:0 },
    alliance_id: player.alliance_id || player.allianceId || null,
    gifted: !!player.gifted,
    created_at: toNumber(player.created_at || player.createdAt || Date.now(), Date.now())
  };
}

function normalizeCountry(country) {
  return {
    code: String(country.code || "").toUpperCase(),
    hp: toNumber(country.hp, 1000),
    max_hp: toNumber(country.max_hp || country.maxHP || 100000, 100000),
    eliminated: !!country.eliminated,
    isSuperpower: !!(country.isSuperpower || country.is_superpower)
  };
}

function normalizeAlliance(alliance) {
  return {
    id: String(alliance.id || ""),
    name: String(alliance.name || ""),
    leader: alliance.leader || null,
    country_code: alliance.country_code || alliance.countryCode || null,
    members: asArray(alliance.members),
    score: toNumber(alliance.score),
    created_at: toNumber(alliance.created_at || alliance.createdAt || Date.now(), Date.now())
  };
}

function normalizePurchase(purchase) {
  return {
    txHash: String(purchase.txHash || purchase.tx_hash || "").toLowerCase(),
    wallet: String(purchase.wallet || "").toLowerCase(),
    pack: toNumber(purchase.pack),
    bullets: toNumber(purchase.bullets),
    valueWei: String(purchase.valueWei || purchase.value_wei || "0"),
    chainId: toNumber(purchase.chainId || purchase.chain_id),
    blockNumber: purchase.blockNumber ?? purchase.block_number ?? null,
    createdAt: toNumber(purchase.createdAt || purchase.created_at || Date.now(), Date.now())
  };
}

function normalizeGameState(snapshot) {
  const raw = snapshot.game_state && typeof snapshot.game_state === "object"
    ? snapshot.game_state
    : {};
  const out = { ...raw };
  if (!out.round && snapshot.round) {
    out.round = {
      roundNumber: snapshot.round.roundNumber || snapshot.round.number,
      roundStatus: snapshot.round.roundStatus || snapshot.round.status,
      roundStartTime: snapshot.round.roundStartTime || snapshot.round.startTime,
      roundEndTime: snapshot.round.roundEndTime || snapshot.round.endTime,
      lastRoundResult: snapshot.round.lastRoundResult || snapshot.round.lastResult || null
    };
  }
  return out;
}

function validateSnapshot(snapshot) {
  const errors = [];
  if (!snapshot || typeof snapshot !== "object") errors.push("Yedek JSON obje degil.");
  for (const key of ["players", "countries", "alliances"]) {
    if (!Array.isArray(snapshot?.[key])) errors.push(`${key} dizisi yok.`);
  }
  const gifted = snapshot?.gifted_wallets || snapshot?.giftedWallets;
  if (!Array.isArray(gifted)) errors.push("gifted_wallets dizisi yok.");
  if (!snapshot?.game_state && !snapshot?.round) errors.push("game_state/round bilgisi yok.");
  if (!Array.isArray(snapshot?.purchases)) errors.push("purchases dizisi yok.");
  return errors;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    fail("DATABASE_URL zorunlu. Once yeni Postgres DATABASE_URL degerini ortam degiskeni olarak ayarla.");
    return;
  }
  if (!backupPath) {
    fail("Kullanim: node restore-backup.js <backup.json> [--yes] [--wipe]");
    return;
  }

  const raw = await fs.readFile(backupPath, "utf8");
  const snapshot = JSON.parse(raw);
  const errors = validateSnapshot(snapshot);
  if (errors.length) {
    errors.forEach(fail);
    return;
  }

  const players = asArray(snapshot.players).map(normalizePlayer).filter(p => p.wallet);
  const countries = asArray(snapshot.countries).map(normalizeCountry).filter(c => c.code);
  const alliances = asArray(snapshot.alliances).map(normalizeAlliance).filter(a => a.id);
  const giftedWallets = asArray(snapshot.gifted_wallets || snapshot.giftedWallets)
    .map(wallet => String(wallet || "").toLowerCase())
    .filter(Boolean);
  const purchases = asArray(snapshot.purchases).map(normalizePurchase).filter(p => p.txHash);
  const gameState = normalizeGameState(snapshot);

  const summary = {
    mode: shouldWrite ? "WRITE" : "DRY-RUN",
    wipe: shouldWipe ? "yes" : "no",
    players: players.length,
    countries: countries.length,
    alliances: alliances.length,
    gifted_wallets: giftedWallets.length,
    purchases: purchases.length,
    game_state_keys: Object.keys(gameState).length,
    duplicate_purchases: 0
  };

  if (!shouldWrite) {
    console.table(summary);
    console.log("DRY-RUN: hicbir tabloya yazilmadi. Gercek yukleme icin --yes ekle.");
    return;
  }

  await db.initSchema();
  if (shouldWipe) await db.wipeAll({ purchases:true });

  await Promise.all(players.map(player => db.savePlayer(player)));
  await db.saveAllCountries(countries);
  await Promise.all(alliances.map(alliance => db.saveAlliance(alliance)));
  await Promise.all(giftedWallets.map(wallet => db.addGiftedWallet(wallet)));
  await Promise.all(Object.entries(gameState).map(([key, value]) => db.saveGameState(key, value)));

  for (const purchase of purchases) {
    const inserted = await db.recordPurchase(purchase);
    if (!inserted) summary.duplicate_purchases += 1;
  }

  console.table(summary);
}

main()
  .catch(err => {
    fail(err && err.stack || err && err.message || String(err));
  })
  .finally(async () => {
    try { await db.closePool(); } catch {}
    if (process.exitCode) process.exit(process.exitCode);
  });
