import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

const countries = [
  { code:"TR", name:"Türkiye", flag:"🇹🇷", hp:100000, max_hp:100000 },
  { code:"US", name:"United States", flag:"🇺🇸", hp:98000, max_hp:100000 },
  { code:"RU", name:"Russia", flag:"🇷🇺", hp:96000, max_hp:100000 },
  { code:"CN", name:"China", flag:"🇨🇳", hp:97000, max_hp:100000 },
  { code:"DE", name:"Germany", flag:"🇩🇪", hp:95000, max_hp:100000 },
  { code:"FR", name:"France", flag:"🇫🇷", hp:93000, max_hp:100000 },
  { code:"GB", name:"United Kingdom", flag:"🇬🇧", hp:92000, max_hp:100000 },
  { code:"BR", name:"Brazil", flag:"🇧🇷", hp:91000, max_hp:100000 },
  { code:"JP", name:"Japan", flag:"🇯🇵", hp:94000, max_hp:100000 },
  { code:"IN", name:"India", flag:"🇮🇳", hp:97000, max_hp:100000 }
];

const recentAttacks = [];

app.get("/", (req,res)=>{
  res.json({
    name:"ABSWAR Backend",
    status:"online"
  });
});

app.get("/health",(req,res)=>{
  res.json({
    ok:true,
    postgres:true,
    redis:true
  });
});

app.get("/api/game/state",(req,res)=>{
  res.json({
    countries,
    war:{
      total_attacks: recentAttacks.length,
      reward_pool_eth: 12345
    },
    recentAttacks
  });
});

app.post("/api/player/connect",(req,res)=>{
  res.json({
    ok:true,
    wallet:req.body.wallet || "demo-player"
  });
});

app.post("/api/player/choose-country",(req,res)=>{
  res.json({
    ok:true,
    country:req.body.countryCode || "TR"
  });
});

app.post("/api/game/attack",(req,res)=>{
  const targetCode = req.body.targetCountry;

  const country = countries.find(c=>c.code===targetCode);

  if(!country){
    return res.status(404).json({
      error:"Country not found"
    });
  }

  country.hp = Math.max(0, country.hp - 100);

  const attack = {
    from_country:"TR",
    target_country:targetCode,
    damage:100,
    time:Date.now()
  };

  recentAttacks.unshift(attack);

  if(recentAttacks.length > 20){
    recentAttacks.pop();
  }

  res.json({
    ok:true,
    targetCountry:targetCode,
    hp:country.hp
  });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, ()=>{
  console.log("ABSWAR MMO backend running on port " + PORT);
});
