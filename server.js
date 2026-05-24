import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway")
    ? { rejectUnauthorized: false }
    : false
});

const seedCountries = [
  ["TR","Türkiye","🇹🇷"],["US","United States","🇺🇸"],["RU","Russia","🇷🇺"],["CN","China","🇨🇳"],["DE","Germany","🇩🇪"],
  ["FR","France","🇫🇷"],["GB","United Kingdom","🇬🇧"],["BR","Brazil","🇧🇷"],["JP","Japan","🇯🇵"],["IN","India","🇮🇳"],
  ["IT","Italy","🇮🇹"],["ES","Spain","🇪🇸"],["CA","Canada","🇨🇦"],["AU","Australia","🇦🇺"],["KR","South Korea","🇰🇷"],
  ["MX","Mexico","🇲🇽"],["NL","Netherlands","🇳🇱"],["SE","Sweden","🇸🇪"],["NO","Norway","🇳🇴"],["DK","Denmark","🇩🇰"],
  ["FI","Finland","🇫🇮"],["PL","Poland","🇵🇱"],["UA","Ukraine","🇺🇦"],["GR","Greece","🇬🇷"],["PT","Portugal","🇵🇹"],
  ["AR","Argentina","🇦🇷"],["CL","Chile","🇨🇱"],["CO","Colombia","🇨🇴"],["ZA","South Africa","🇿🇦"],["EG","Egypt","🇪🇬"],
  ["SA","Saudi Arabia","🇸🇦"],["AE","UAE","🇦🇪"],["IL","Israel","🇮🇱"],["ID","Indonesia","🇮🇩"],["TH","Thailand","🇹🇭"],
  ["VN","Vietnam","🇻🇳"],["MY","Malaysia","🇲🇾"],["SG","Singapore","🇸🇬"],["NZ","New Zealand","🇳🇿"],["CH","Switzerland","🇨🇭"],
  ["AT","Austria","🇦🇹"],["BE","Belgium","🇧🇪"],["IE","Ireland","🇮🇪"],["CZ","Czechia","🇨🇿"],["HU","Hungary","🇭🇺"],
  ["RO","Romania","🇷🇴"],["BG","Bulgaria","🇧🇬"],["RS","Serbia","🇷🇸"],["HR","Croatia","🇭🇷"],["PK","Pakistan","🇵🇰"]
];

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS countries (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      flag TEXT NOT NULL,
      hp INTEGER NOT NULL DEFAULT 100000,
      max_hp INTEGER NOT NULL DEFAULT 100000,
      eliminated BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      wallet TEXT PRIMARY KEY,
      country_code TEXT,
      bullets INTEGER NOT NULL DEFAULT 100,
      contribution INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attacks (
      id SERIAL PRIMARY KEY,
      attacker_wallet TEXT NOT NULL,
      from_country TEXT NOT NULL,
      target_country TEXT NOT NULL,
      damage INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS war_state (
      id TEXT PRIMARY KEY DEFAULT 'global',
      total_attacks INTEGER NOT NULL DEFAULT 0,
      reward_pool_eth NUMERIC NOT NULL DEFAULT 0,
      countries_left INTEGER NOT NULL DEFAULT 50,
      final_phase BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    INSERT INTO war_state (id)
    VALUES ('global')
    ON CONFLICT (id) DO NOTHING
  `);

  for (const [code, name, flag] of seedCountries) {
    await pool.query(
      `INSERT INTO countries (code,name,flag,hp,max_hp,eliminated)
       VALUES ($1,$2,$3,100000,100000,false)
       ON CONFLICT (code) DO NOTHING`,
      [code, name, flag]
    );
  }

  const left = await pool.query("SELECT COUNT(*)::int AS count FROM countries WHERE eliminated=false");
  await pool.query(
    "UPDATE war_state SET countries_left=$1, updated_at=NOW() WHERE id='global'",
    [left.rows[0].count]
  );
}

app.get("/", (_req, res) => {
  res.json({ name: "ABSWAR Persistent Backend", status: "online" });
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, postgres: true, persistent: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/game/state", async (_req, res) => {
  const countries = await pool.query("SELECT * FROM countries ORDER BY hp DESC, name ASC");
  const war = await pool.query("SELECT * FROM war_state WHERE id='global'");
  const recentAttacks = await pool.query("SELECT * FROM attacks ORDER BY created_at DESC LIMIT 20");

  res.json({
    countries: countries.rows,
    war: war.rows[0],
    recentAttacks: recentAttacks.rows
  });
});

app.post("/api/player/connect", async (req, res) => {
  const wallet = String(req.body.wallet || "demo-player").toLowerCase();

  await pool.query(
    `INSERT INTO players (wallet)
     VALUES ($1)
     ON CONFLICT (wallet) DO NOTHING`,
    [wallet]
  );

  const player = await pool.query("SELECT * FROM players WHERE wallet=$1", [wallet]);
  res.json({ ok: true, player: player.rows[0] });
});

app.post("/api/player/choose-country", async (req, res) => {
  const wallet = String(req.body.wallet || "demo-player").toLowerCase();
  const countryCode = String(req.body.countryCode || "TR").toUpperCase();

  const country = await pool.query("SELECT * FROM countries WHERE code=$1", [countryCode]);
  if (!country.rows.length) return res.status(404).json({ error: "Country not found" });
  if (country.rows[0].eliminated) return res.status(400).json({ error: "Country eliminated" });

  await pool.query(
    `INSERT INTO players (wallet, country_code)
     VALUES ($1,$2)
     ON CONFLICT (wallet) DO UPDATE SET
       country_code=COALESCE(players.country_code, EXCLUDED.country_code),
       updated_at=NOW()`,
    [wallet, countryCode]
  );

  const player = await pool.query("SELECT * FROM players WHERE wallet=$1", [wallet]);
  res.json({ ok: true, player: player.rows[0] });
});

app.post("/api/game/attack", async (req, res) => {
  const wallet = String(req.body.wallet || "demo-player").toLowerCase();
  const targetCountry = String(req.body.targetCountry || "").toUpperCase();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO players (wallet, country_code)
       VALUES ($1,'TR')
       ON CONFLICT (wallet) DO NOTHING`,
      [wallet]
    );

    const playerResult = await client.query("SELECT * FROM players WHERE wallet=$1 FOR UPDATE", [wallet]);
    const player = playerResult.rows[0];

    if (!player.country_code) throw new Error("Choose country first");
    if (player.bullets <= 0) throw new Error("No bullets");

    const ownResult = await client.query("SELECT * FROM countries WHERE code=$1 FOR UPDATE", [player.country_code]);
    const targetResult = await client.query("SELECT * FROM countries WHERE code=$1 FOR UPDATE", [targetCountry]);

    if (!targetResult.rows.length) throw new Error("Target country not found");

    const own = ownResult.rows[0];
    const target = targetResult.rows[0];

    if (own.eliminated) throw new Error("Your country eliminated");
    if (target.eliminated) throw new Error("Target eliminated");
    if (own.code === target.code) throw new Error("Cannot attack own country");

    const damage = 1;
    const newTargetHp = Math.max(0, target.hp - damage);
    const eliminated = newTargetHp <= 0;

    await client.query(
      "UPDATE countries SET hp=$1, eliminated=$2, updated_at=NOW() WHERE code=$3",
      [newTargetHp, eliminated, target.code]
    );

    await client.query(
      "UPDATE countries SET hp=hp+1, updated_at=NOW() WHERE code=$1",
      [own.code]
    );

    await client.query(
      "UPDATE players SET bullets=bullets-1, contribution=contribution+1, updated_at=NOW() WHERE wallet=$1",
      [wallet]
    );

    await client.query(
      "INSERT INTO attacks (attacker_wallet, from_country, target_country, damage) VALUES ($1,$2,$3,$4)",
      [wallet, own.code, target.code, damage]
    );

    const countriesLeft = await client.query("SELECT COUNT(*)::int AS count FROM countries WHERE eliminated=false");

    await client.query(
      `UPDATE war_state
       SET total_attacks=total_attacks+1,
           countries_left=$1,
           final_phase=($1 <= 5),
           updated_at=NOW()
       WHERE id='global'`,
      [countriesLeft.rows[0].count]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      from_country: own.code,
      target_country: target.code,
      target_hp: newTargetHp,
      eliminated
    });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/admin/reset", async (_req, res) => {
  await pool.query("UPDATE countries SET hp=100000, max_hp=100000, eliminated=false, updated_at=NOW()");
  await pool.query("DELETE FROM attacks");
  await pool.query("UPDATE players SET bullets=100, contribution=0, country_code=NULL, updated_at=NOW()");
  await pool.query("UPDATE war_state SET total_attacks=0, countries_left=50, final_phase=false, updated_at=NOW() WHERE id='global'");
  res.json({ ok: true, message: "Game reset complete" });
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log("ABSWAR persistent backend running on port " + PORT));
  })
  .catch((err) => {
    console.error("INIT ERROR:", err);
    process.exit(1);
  });
