import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

let onlinePlayers = 0;

const countries = [
  { code:"TR", name:"Türkiye", flag:"🇹🇷", hp:100000, max_hp:100000 },
  { code:"US", name:"United States", flag:"🇺🇸", hp:100000, max_hp:100000 },
  { code:"RU", name:"Russia", flag:"🇷🇺", hp:100000, max_hp:100000 },
  { code:"CN", name:"China", flag:"🇨🇳", hp:100000, max_hp:100000 },
  { code:"DE", name:"Germany", flag:"🇩🇪", hp:100000, max_hp:100000 }
];

let recentAttacks = [];

function gameState() {
  return {
    countries,
    recentAttacks,
    onlinePlayers,
    war: {
      total_attacks: recentAttacks.length
    }
  };
}

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "ABSWAR CLEAN BACKEND ONLINE"
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    realtime: true,
    onlinePlayers
  });
});

app.get("/api/game/state", (_req, res) => {
  res.json(gameState());
});

app.post("/api/game/attack", (req, res) => {
  const targetCountry = req.body.targetCountry;

  const country = countries.find(c => c.code === targetCountry);

  if (!country) {
    return res.status(404).json({
      error: "Country not found"
    });
  }

  country.hp = Math.max(0, country.hp - 1);

  const attack = {
    from_country: "TR",
    target_country: country.code,
    damage: 1,
    created_at: Date.now()
  };

  recentAttacks.unshift(attack);

  if (recentAttacks.length > 20) {
    recentAttacks.pop();
  }

  io.emit("war:attack", attack);
  io.emit("war:state", gameState());

  res.json({
    ok: true,
    attack
  });
});

io.on("connection", socket => {
  onlinePlayers++;

  io.emit("players:online", {
    onlinePlayers
  });

  socket.emit("war:state", gameState());

  socket.on("disconnect", () => {
    onlinePlayers--;

    if (onlinePlayers < 0) {
      onlinePlayers = 0;
    }

    io.emit("players:online", {
      onlinePlayers
    });
  });
});

server.listen(PORT, () => {
  console.log("ABSWAR CLEAN FIXED REALTIME BACKEND RUNNING ON PORT " + PORT);
});
