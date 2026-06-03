// db.js — PostgreSQL kalıcılık katmanı (write-through cache)
// Oyun bellekte çalışır; bu modül açılışta yükler ve her değişiklikte DB'ye yazar.
import pkg from "pg";
const { Pool } = pkg;

// ── BAĞLANTI YAPILANDIRMASI ──
// Öncelik sırası:
//  1) DATABASE_URL varsa onu kullan (en yaygın)
//  2) Yoksa Railway'in tek tek verdiği parçalardan (PGHOST, PGUSER...) URL kur
// Bu sayede ${{Postgres.DATABASE_URL}} referansı çözülmese bile,
// parça değişkenler (PGHOST vb.) bağlanırsa DB çalışır.
function buildPgConfig() {
  // 1) Hazır URL
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("postgres")) {
    return {
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  // 2) Parçalardan kur
  const host = process.env.PGHOST || process.env.POSTGRES_HOST;
  const port = process.env.PGPORT || process.env.POSTGRES_PORT || 5432;
  const user = process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const database = process.env.PGDATABASE || process.env.POSTGRES_DB;

  if (host && user && password && database) {
    return {
      host, port: Number(port), user, password, database,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    };
  }

  // Hiçbiri yoksa null → bellek modu
  return null;
}

const pgConfig = buildPgConfig();
const HAS_DB = !!pgConfig;

let pool = null;
if (HAS_DB) {
  pool = new Pool(pgConfig);
  pool.on("error", (err) => console.error("[DB] Pool error:", err.message));
  console.log("[DB] Bağlantı yapılandırması hazır (" +
    (process.env.DATABASE_URL ? "DATABASE_URL" : "PG parçaları") + ")");
}

export const dbEnabled = HAS_DB;

// ── ŞEMA OLUŞTURMA ──
export async function initSchema() {
  if (!HAS_DB) {
    console.log("[DB] Bağlantı bilgisi yok (ne DATABASE_URL ne PG parçaları) — kalıcılık DEVRE DIŞI, bellekte çalışıyor");
    return false;
  }
  try {
    // Önce bağlantıyı test et (asılı kalmasın diye)
    await pool.query("SELECT 1");
    console.log("[DB] PostgreSQL bağlantısı başarılı ✅");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        wallet        TEXT PRIMARY KEY,
        nickname      TEXT,
        country_code  TEXT,
        bullets       INTEGER DEFAULT 100,
        contribution  DOUBLE PRECISION DEFAULT 0,
        attacks       INTEGER DEFAULT 0,
        kills         INTEGER DEFAULT 0,
        deaths        INTEGER DEFAULT 0,
        radar_level   INTEGER DEFAULT 3,
        resources     JSONB DEFAULT '{"oil":0,"metal":0,"uranium":0,"energy":0}',
        alliance_id   TEXT,
        gifted        BOOLEAN DEFAULT FALSE,
        created_at    BIGINT
      );

      CREATE TABLE IF NOT EXISTS alliances (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        leader        TEXT,
        country_code  TEXT,
        members       JSONB DEFAULT '[]',
        score         DOUBLE PRECISION DEFAULT 0,
        created_at    BIGINT
      );

      CREATE TABLE IF NOT EXISTS countries (
        code        TEXT PRIMARY KEY,
        hp          INTEGER,
        max_hp      INTEGER,
        eliminated  BOOLEAN DEFAULT FALSE
      );

      CREATE TABLE IF NOT EXISTS game_state (
        key   TEXT PRIMARY KEY,
        value JSONB
      );

      CREATE TABLE IF NOT EXISTS gifted_wallets (
        wallet TEXT PRIMARY KEY
      );

      CREATE TABLE IF NOT EXISTS purchases (
        tx_hash      TEXT PRIMARY KEY,
        wallet       TEXT NOT NULL,
        pack         INTEGER NOT NULL,
        bullets      INTEGER NOT NULL,
        value_wei    TEXT NOT NULL,
        chain_id     INTEGER NOT NULL,
        block_number BIGINT,
        created_at   BIGINT
      );
    `);

    // ── Migration'lar — mevcut tablolara eksik sütun/tablo ekle ──
    // (CREATE TABLE IF NOT EXISTS mevcut tabloya sütun eklemez, bu yüzden ALTER gerekli)
    await pool.query(`ALTER TABLE alliances ADD COLUMN IF NOT EXISTS country_code TEXT;`);

    // Son saldırılar tablosu (radar + haber ticker için kalıcılık)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recent_attacks (
        id           BIGSERIAL PRIMARY KEY,
        data         JSONB,
        created_at   BIGINT
      );
    `);

    console.log("[DB] Şema hazır ✅");
    return true;
  } catch (e) {
    console.error("[DB] Şema oluşturma hatası:", e.message);
    return false;
  }
}

// ── AÇILIŞTA YÜKLEME ──
// Döndürür: { players: Map, alliances: Map, countriesData: [], gifted: Set, gameState: {} }
export async function loadAll() {
  if (!HAS_DB) return null;
  try {
    const out = { players: new Map(), alliances: new Map(), countries: [], gifted: new Set(), gameState: {} };

    const pr = await pool.query("SELECT * FROM players");
    for (const row of pr.rows) {
      out.players.set(row.wallet, {
        wallet: row.wallet,
        nickname: row.nickname,
        country_code: row.country_code,
        bullets: row.bullets,
        contribution: Number(row.contribution),
        attacks: row.attacks,
        kills: row.kills,
        deaths: row.deaths,
        radar_level: row.radar_level,
        resources: row.resources || { oil:0, metal:0, uranium:0, energy:0 },
        alliance_id: row.alliance_id,
        gifted: row.gifted,
        created_at: Number(row.created_at) || Date.now(),
      });
    }

    const ar = await pool.query("SELECT * FROM alliances");
    for (const row of ar.rows) {
      out.alliances.set(row.id, {
        id: row.id,
        name: row.name,
        leader: row.leader,
        country_code: row.country_code || null,
        members: row.members || [],
        score: Number(row.score),
        created_at: Number(row.created_at) || Date.now(),
      });
    }

    const cr = await pool.query("SELECT * FROM countries");
    out.countries = cr.rows.map(r => ({
      code: r.code, hp: r.hp, max_hp: r.max_hp, eliminated: r.eliminated
    }));

    const gr = await pool.query("SELECT wallet FROM gifted_wallets");
    for (const row of gr.rows) out.gifted.add(row.wallet);

    const sr = await pool.query("SELECT * FROM game_state");
    for (const row of sr.rows) out.gameState[row.key] = row.value;

    console.log(`[DB] Yüklendi: ${out.players.size} oyuncu, ${out.alliances.size} ittifak, ${out.countries.length} ülke, ${out.gifted.size} hediye`);
    return out;
  } catch (e) {
    console.error("[DB] Yükleme hatası:", e.message);
    return null;
  }
}

// ── YAZMA FONKSİYONLARI (write-through) ──
// Hepsi "fire and forget" — hata olsa bile oyun bellekte çalışmaya devam eder.
// await edilmezler ki oyun yavaşlamasın; hatalar loglanır.

export function savePlayer(p) {
  if (!HAS_DB || !p) return;
  pool.query(
    `INSERT INTO players (wallet,nickname,country_code,bullets,contribution,attacks,kills,deaths,radar_level,resources,alliance_id,gifted,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (wallet) DO UPDATE SET
       nickname=$2, country_code=$3, bullets=$4, contribution=$5, attacks=$6,
       kills=$7, deaths=$8, radar_level=$9, resources=$10, alliance_id=$11, gifted=$12`,
    [p.wallet, p.nickname, p.country_code, p.bullets, p.contribution, p.attacks,
     p.kills, p.deaths, p.radar_level, JSON.stringify(p.resources||{}), p.alliance_id,
     !!p.gifted, p.created_at || Date.now()]
  ).catch(e => console.error("[DB] savePlayer:", e.message));
}

export function saveAlliance(a) {
  if (!HAS_DB || !a) return;
  pool.query(
    `INSERT INTO alliances (id,name,leader,country_code,members,score,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (id) DO UPDATE SET name=$2, leader=$3, country_code=$4, members=$5, score=$6`,
    [a.id, a.name, a.leader, a.country_code || null, JSON.stringify(a.members||[]), a.score, a.created_at || Date.now()]
  ).catch(e => console.error("[DB] saveAlliance:", e.message));
}

export function deleteAlliance(id) {
  if (!HAS_DB || !id) return;
  pool.query("DELETE FROM alliances WHERE id=$1", [id])
    .catch(e => console.error("[DB] deleteAlliance:", e.message));
}

export function saveCountry(c) {
  if (!HAS_DB || !c) return;
  pool.query(
    `INSERT INTO countries (code,hp,max_hp,eliminated)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (code) DO UPDATE SET hp=$2, max_hp=$3, eliminated=$4`,
    [c.code, c.hp, c.max_hp, c.eliminated]
  ).catch(e => console.error("[DB] saveCountry:", e.message));
}

// Tüm ülkeleri toplu kaydet (tur başlangıcı / reset)
export function saveAllCountries(countries) {
  if (!HAS_DB) return;
  for (const c of countries) saveCountry(c);
}

export function saveGameState(key, value) {
  if (!HAS_DB) return;
  pool.query(
    `INSERT INTO game_state (key,value) VALUES ($1,$2)
     ON CONFLICT (key) DO UPDATE SET value=$2`,
    [key, JSON.stringify(value)]
  ).catch(e => console.error("[DB] saveGameState:", e.message));
}

// ── SON SALDIRILAR (radar + haber ticker için) ──
// Yeni saldırı ekle, sadece son 100'ü tut (eski kayıtları sil)
export function saveAttack(attack) {
  if (!HAS_DB || !attack) return;
  pool.query(
    `INSERT INTO recent_attacks (data, created_at) VALUES ($1, $2)`,
    [JSON.stringify(attack), attack.created_at || Date.now()]
  ).then(() => {
    // Ara sıra eski kayıtları temizle (her ~20 saldırıda bir, rastgele)
    if (Math.random() < 0.05) {
      pool.query(`
        DELETE FROM recent_attacks
        WHERE id NOT IN (SELECT id FROM recent_attacks ORDER BY id DESC LIMIT 100)
      `).catch(()=>{});
    }
  }).catch(e => console.error("[DB] saveAttack:", e.message));
}

// Başlangıçta son saldırıları yükle (en yeniden eskiye)
export async function loadRecentAttacks(limit = 100) {
  if (!HAS_DB) return [];
  try {
    const r = await pool.query(
      `SELECT data FROM recent_attacks ORDER BY id DESC LIMIT $1`, [limit]
    );
    return r.rows.map(row => (typeof row.data === 'string' ? JSON.parse(row.data) : row.data));
  } catch (e) {
    console.error("[DB] loadRecentAttacks:", e.message);
    return [];
  }
}

export function addGiftedWallet(wallet) {
  if (!HAS_DB) return;
  pool.query("INSERT INTO gifted_wallets (wallet) VALUES ($1) ON CONFLICT DO NOTHING", [wallet])
    .catch(e => console.error("[DB] addGiftedWallet:", e.message));
}

export async function recordPurchase(purchase) {
  if (!HAS_DB || !purchase) return null;
  try {
    const r = await pool.query(
      `INSERT INTO purchases (tx_hash,wallet,pack,bullets,value_wei,chain_id,block_number,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tx_hash) DO NOTHING
       RETURNING tx_hash`,
      [
        purchase.txHash,
        purchase.wallet,
        purchase.pack,
        purchase.bullets,
        purchase.valueWei,
        purchase.chainId,
        purchase.blockNumber || null,
        purchase.createdAt || Date.now()
      ]
    );
    return r.rowCount === 1;
  } catch (e) {
    console.error("[DB] recordPurchase:", e.message);
    throw e;
  }
}

export async function loadPurchaseTotals() {
  if (!HAS_DB) return { purchaseCount:0, totalBullets:0, totalWei:"0" };
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)::int AS purchase_count,
        COALESCE(SUM(bullets), 0)::bigint::text AS total_bullets,
        COALESCE(SUM(value_wei::numeric), 0)::text AS total_wei
      FROM purchases
    `);
    const row = r.rows[0] || {};
    return {
      purchaseCount: Number(row.purchase_count) || 0,
      totalBullets: Number(row.total_bullets) || 0,
      totalWei: String(row.total_wei || "0").split(".")[0]
    };
  } catch (e) {
    console.error("[DB] loadPurchaseTotals:", e.message);
    return { purchaseCount:0, totalBullets:0, totalWei:"0" };
  }
}

// Tam reset (admin)
export async function wipeAll() {
  if (!HAS_DB) return;
  try {
    await pool.query("TRUNCATE players, alliances, gifted_wallets, recent_attacks");
    await pool.query("DELETE FROM game_state");
    // countries silinmez — HP'leri reset endpoint'i güncelleyecek
    console.log("[DB] Tüm veriler silindi (reset)");
  } catch (e) {
    console.error("[DB] wipeAll:", e.message);
  }
}
