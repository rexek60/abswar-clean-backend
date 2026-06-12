import test from "node:test";
import assert from "node:assert/strict";
import {
  BANNED_WORDS,
  RANKS,
  RANK_NFT_COSTS,
  getRank,
  getNextRank,
  isCleanText
} from "../lib/rules.js";

test("rank thresholds and previous threshold edges", () => {
  const expected = [
    [0, "Asker"],
    [50, "Onbaşı"],
    [200, "Çavuş"],
    [500, "Teğmen"],
    [1500, "Yüzbaşı"],
    [5000, "Binbaşı"],
    [15000, "General"]
  ];

  for (const [min, name] of expected) {
    assert.equal(getRank(min).name, name);
  }

  for (let i = 1; i < RANKS.length; i++) {
    assert.equal(getRank(RANKS[i].min - 1).name, RANKS[i - 1].name);
  }

  assert.equal(getNextRank(15000), null);
  assert.equal(getNextRank(14999).name, "General");
});

test("rank bonus sequence and nft costs stay aligned", () => {
  assert.deepEqual(RANKS.map(rank => rank.bonus), [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30]);
  assert.equal(RANK_NFT_COSTS.length, RANKS.length);
});

test("clean text filter uses whole-word matches", () => {
  assert.equal(isCleanText("Yaqar"), true);
  assert.equal(isCleanText("Boçak"), true);
  assert.equal(isCleanText(""), false);
  assert.equal(isCleanText("admin"), false);
  assert.equal(isCleanText("administrator"), true);

  assert.ok(BANNED_WORDS.includes("siktir"));
  assert.ok(BANNED_WORDS.includes("official"));
  assert.equal(isCleanText("siktir"), false);
  assert.equal(isCleanText("official"), false);
});
