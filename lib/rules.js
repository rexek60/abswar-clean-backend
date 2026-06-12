export const BANNED_WORDS = [
  "orospu",
  "siktir",
  "amına",
  "anandan",
  "anasını",
  "allahını",
  "piçkurusu",
  "admin",
  "official",
  "anthropic",
  "claude",
  "moderator",
  "sistem"
];

export function isCleanText(text) {
  if (!text || typeof text !== "string") return false;
  for (const w of BANNED_WORDS) {
    const re = new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`, "i");
    if (re.test(text)) return false;
  }
  return true;
}

export const RANKS = [
  { min:0,      name:"Asker",    icon:"🪖",          bonus:0    },
  { min:50,     name:"Onbaşı",   icon:"🎖",          bonus:0.05 },
  { min:200,    name:"Çavuş",    icon:"🎖🎖",        bonus:0.10 },
  { min:500,    name:"Teğmen",   icon:"⭐",          bonus:0.15 },
  { min:1500,   name:"Yüzbaşı",  icon:"⭐⭐",        bonus:0.20 },
  { min:5000,   name:"Binbaşı",  icon:"⭐⭐⭐",      bonus:0.25 },
  { min:15000,  name:"General",  icon:"⭐⭐⭐⭐",    bonus:0.30 }
];

export const RANK_NFT_COSTS = [0, 25, 50, 100, 250, 500, 1000];

export function getRank(contribution) {
  let r = RANKS[0];
  for (const rank of RANKS) {
    if (contribution >= rank.min) r = rank;
  }
  return r;
}

export function getNextRank(contribution) {
  for (const rank of RANKS) {
    if (contribution < rank.min) return rank;
  }
  return null;
}
