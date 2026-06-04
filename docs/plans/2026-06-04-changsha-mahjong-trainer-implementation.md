# Changsha Mahjong Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-version browser-based Changsha Mahjong trainer with realistic random tile drawing, explainable discard recommendations, and post-hand review.

**Architecture:** Use a static web app with small JavaScript modules. The game state module owns the wall and turn flow, the rules module evaluates hand shape and useful tiles, the recommendation module reads state without mutating it, and the UI module renders the table plus advice panel.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node.js built-in `node:test`, browser manual testing. No external dependencies for the first version.

---

## File Structure

- `package.json`: Defines local test and serve scripts.
- `index.html`: Browser entry point.
- `src/main.js`: Wires the app, starts a hand, handles UI events.
- `src/styles.css`: Table layout, tiles, panels, responsive horizontal view.
- `src/core/tiles.js`: Tile definitions, display labels, sorting, tile counting.
- `src/core/random.js`: Seeded random number generator and shuffle.
- `src/core/game-state.js`: Wall creation, dealing, drawing, discarding, turn state, action history.
- `src/core/rules.js`: Standard hand completion, tenpai, and useful-tile calculation.
- `src/core/recommendation.js`: Explainable discard scoring.
- `src/core/review.js`: Decision snapshot and post-hand review summary.
- `src/ui/render.js`: DOM rendering helpers for table, hand, discards, advice, review.
- `tests/tiles.test.mjs`: Tile and wall count tests.
- `tests/game-state.test.mjs`: Deal, draw, discard, and wall immutability tests.
- `tests/rules.test.mjs`: Hand completion, tenpai, and useful-tile tests.
- `tests/recommendation.test.mjs`: Advice quality, explanation, and non-mutation tests.
- `tests/review.test.mjs`: Decision snapshot and review summary tests.

The project is not currently a Git repository. Commit steps should be skipped unless a repository is initialized before execution.

---

## Task 1: Project Shell

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.js`
- Create: `src/styles.css`

- [ ] **Step 1: Create package scripts**

Create `package.json`:

```json
{
  "name": "changsha-mahjong-trainer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "serve": "python -m http.server 5177"
  }
}
```

- [ ] **Step 2: Create the HTML entry point**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>长沙麻将训练桌</title>
    <link rel="stylesheet" href="./src/styles.css">
  </head>
  <body>
    <main id="app" class="app-shell"></main>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Create a temporary app render**

Create `src/main.js`:

```js
const app = document.querySelector("#app");

app.innerHTML = `
  <section class="table">
    <div class="seat top">对家</div>
    <div class="seat left">上家</div>
    <div class="center-area">长沙麻将训练桌</div>
    <div class="seat right">下家</div>
    <div class="player-hand">等待发牌</div>
  </section>
  <aside class="advice-panel">
    <h1>盘中提醒</h1>
    <p>开始后会显示推荐出牌和原因。</p>
  </aside>
`;
```

- [ ] **Step 4: Create the first layout CSS**

Create `src/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  font-family: "Microsoft YaHei", Arial, sans-serif;
  background: #10272a;
  color: #f6f7ee;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(720px, 1fr) 320px;
  gap: 16px;
  padding: 16px;
}

.table {
  position: relative;
  min-height: 620px;
  border-radius: 8px;
  background: radial-gradient(circle at center, #1aa889 0, #087968 70%);
  border: 2px solid #0bd0a9;
  overflow: hidden;
}

.center-area {
  position: absolute;
  inset: 220px 260px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.seat {
  position: absolute;
  color: #dceee8;
}

.top {
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
}

.left {
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
}

.right {
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
}

.player-hand {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 24px;
  min-height: 88px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.advice-panel {
  border-radius: 8px;
  background: #f8f3e7;
  color: #172a2a;
  padding: 16px;
}
```

- [ ] **Step 5: Smoke test in browser**

Run:

```powershell
python -m http.server 5177
```

Expected: Opening `http://localhost:5177` shows a green mahjong table and a reminder panel.

---

## Task 2: Tile Model and Random Wall

**Files:**
- Create: `src/core/tiles.js`
- Create: `src/core/random.js`
- Create: `tests/tiles.test.mjs`

- [ ] **Step 1: Write tile and wall tests**

Create `tests/tiles.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createTileSet, countTiles, sortTiles, tileKey } from "../src/core/tiles.js";
import { createSeededRandom, shuffle } from "../src/core/random.js";

test("createTileSet creates 108 suited tiles", () => {
  const tiles = createTileSet();
  assert.equal(tiles.length, 108);
  const counts = countTiles(tiles);
  assert.equal(counts.get("wan-1"), 4);
  assert.equal(counts.get("tiao-9"), 4);
  assert.equal(counts.get("tong-5"), 4);
});

test("shuffle preserves every tile count", () => {
  const original = createTileSet();
  const shuffled = shuffle(original, createSeededRandom(20260604));
  assert.equal(shuffled.length, original.length);
  assert.deepEqual(countTiles(shuffled), countTiles(original));
});

test("shuffle returns a new array and does not mutate source", () => {
  const original = createTileSet();
  const before = original.map(tileKey).join(",");
  const shuffled = shuffle(original, createSeededRandom(7));
  assert.notEqual(shuffled, original);
  assert.equal(original.map(tileKey).join(","), before);
});

test("sortTiles orders by suit then rank", () => {
  const sorted = sortTiles([
    { suit: "tong", rank: 9 },
    { suit: "wan", rank: 2 },
    { suit: "tiao", rank: 1 },
    { suit: "wan", rank: 1 }
  ]);
  assert.deepEqual(sorted.map(tileKey), ["wan-1", "wan-2", "tiao-1", "tong-9"]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test
```

Expected: FAIL because `src/core/tiles.js` and `src/core/random.js` do not exist.

- [ ] **Step 3: Implement tiles**

Create `src/core/tiles.js`:

```js
export const SUITS = ["wan", "tiao", "tong"];

export const SUIT_LABELS = {
  wan: "万",
  tiao: "条",
  tong: "筒"
};

export function createTileSet() {
  const tiles = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({ suit, rank });
      }
    }
  }
  return tiles;
}

export function tileKey(tile) {
  return `${tile.suit}-${tile.rank}`;
}

export function tileLabel(tile) {
  return `${tile.rank}${SUIT_LABELS[tile.suit]}`;
}

export function sortTiles(tiles) {
  const suitOrder = new Map(SUITS.map((suit, index) => [suit, index]));
  return [...tiles].sort((a, b) => {
    const suitDiff = suitOrder.get(a.suit) - suitOrder.get(b.suit);
    return suitDiff === 0 ? a.rank - b.rank : suitDiff;
  });
}

export function countTiles(tiles) {
  const counts = new Map();
  for (const tile of tiles) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function removeOneTile(tiles, target) {
  const targetKey = tileKey(target);
  const index = tiles.findIndex((tile) => tileKey(tile) === targetKey);
  if (index === -1) {
    throw new Error(`Tile not in hand: ${targetKey}`);
  }
  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}
```

- [ ] **Step 4: Implement seeded random shuffle**

Create `src/core/random.js`:

```js
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function shuffle(items, random = Math.random) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }
  return output;
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
npm test
```

Expected: PASS for tile and shuffle tests.

---

## Task 3: Game State and Real Draw Flow

**Files:**
- Create: `src/core/game-state.js`
- Create: `tests/game-state.test.mjs`

- [ ] **Step 1: Write game-state tests**

Create `tests/game-state.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialGame, drawTile, discardTile } from "../src/core/game-state.js";
import { tileKey } from "../src/core/tiles.js";

test("createInitialGame deals 14 tiles to player 0 and 13 to others", () => {
  const game = createInitialGame({ seed: 20260604 });
  assert.equal(game.players[0].hand.length, 14);
  assert.equal(game.players[1].hand.length, 13);
  assert.equal(game.players[2].hand.length, 13);
  assert.equal(game.players[3].hand.length, 13);
  assert.equal(game.wall.length, 55);
  assert.equal(game.currentPlayer, 0);
});

test("drawTile consumes exactly the next wall tile", () => {
  const game = createInitialGame({ seed: 9 });
  const next = game.wall[0];
  const drawn = drawTile(game, 1);
  assert.equal(tileKey(drawn.players[1].hand.at(-1)), tileKey(next));
  assert.equal(drawn.wall.length, game.wall.length - 1);
  assert.equal(game.wall.length, 55);
});

test("discardTile removes a tile from hand and records history", () => {
  const game = createInitialGame({ seed: 3 });
  const tile = game.players[0].hand[0];
  const updated = discardTile(game, 0, tile, { recommendationId: "rec-1" });
  assert.equal(updated.players[0].hand.length, 13);
  assert.equal(updated.players[0].discards.length, 1);
  assert.equal(tileKey(updated.players[0].discards[0]), tileKey(tile));
  assert.equal(updated.history.at(-1).type, "discard");
  assert.equal(updated.history.at(-1).recommendationId, "rec-1");
});

test("discardTile rejects a tile not in hand", () => {
  const game = createInitialGame({ seed: 5 });
  assert.throws(
    () => discardTile(game, 0, { suit: "wan", rank: 9, impossible: true }),
    /Tile not in hand/
  );
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test
```

Expected: FAIL because `game-state.js` does not exist.

- [ ] **Step 3: Implement game state**

Create `src/core/game-state.js`:

```js
import { createSeededRandom, shuffle } from "./random.js";
import { createTileSet, removeOneTile, sortTiles, tileKey } from "./tiles.js";

export function createInitialGame({ seed = Date.now() } = {}) {
  const wall = shuffle(createTileSet(), createSeededRandom(seed));
  const players = [0, 1, 2, 3].map((seat) => ({
    seat,
    hand: [],
    discards: [],
    melds: []
  }));

  let cursor = 0;
  for (let round = 0; round < 13; round += 1) {
    for (const player of players) {
      player.hand.push(wall[cursor]);
      cursor += 1;
    }
  }
  players[0].hand.push(wall[cursor]);
  cursor += 1;

  for (const player of players) {
    player.hand = sortTiles(player.hand);
  }

  return {
    seed,
    wall: wall.slice(cursor),
    originalWall: wall,
    players,
    currentPlayer: 0,
    phase: "awaiting-discard",
    history: []
  };
}

export function drawTile(game, playerIndex) {
  if (game.wall.length === 0) {
    throw new Error("Cannot draw from an empty wall");
  }

  const tile = game.wall[0];
  const players = clonePlayers(game.players);
  players[playerIndex] = {
    ...players[playerIndex],
    hand: sortTiles([...players[playerIndex].hand, tile])
  };

  return {
    ...game,
    wall: game.wall.slice(1),
    players,
    currentPlayer: playerIndex,
    phase: "awaiting-discard",
    history: [
      ...game.history,
      { type: "draw", playerIndex, tile, wallRemaining: game.wall.length - 1 }
    ]
  };
}

export function discardTile(game, playerIndex, tile, metadata = {}) {
  const players = clonePlayers(game.players);
  const hand = removeOneTile(players[playerIndex].hand, tile);
  players[playerIndex] = {
    ...players[playerIndex],
    hand: sortTiles(hand),
    discards: [...players[playerIndex].discards, tile]
  };

  return {
    ...game,
    players,
    currentPlayer: (playerIndex + 1) % 4,
    phase: "awaiting-draw",
    history: [
      ...game.history,
      {
        type: "discard",
        playerIndex,
        tile,
        tileKey: tileKey(tile),
        recommendationId: metadata.recommendationId ?? null
      }
    ]
  };
}

function clonePlayers(players) {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discards: [...player.discards],
    melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] }))
  }));
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test
```

Expected: PASS for tile, shuffle, and game-state tests.

---

## Task 4: Basic Rules Engine

**Files:**
- Create: `src/core/rules.js`
- Create: `tests/rules.test.mjs`

- [ ] **Step 1: Write rules tests**

Create `tests/rules.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { isWinningHand, getUsefulTilesAfterDiscard, isTenpai } from "../src/core/rules.js";
import { tileKey } from "../src/core/tiles.js";

const t = (suit, rank) => ({ suit, rank });

test("isWinningHand detects four sets and one pair", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 3),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9), t("wan", 9)
  ];
  assert.equal(isWinningHand(hand), true);
});

test("isWinningHand rejects incomplete hand", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 4),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9), t("wan", 9)
  ];
  assert.equal(isWinningHand(hand), false);
});

test("isTenpai detects a hand one tile away from winning", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 3),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9)
  ];
  assert.equal(isTenpai(hand), true);
});

test("getUsefulTilesAfterDiscard adjusts for visible discards", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 3),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9), t("tong", 1)
  ];
  const useful = getUsefulTilesAfterDiscard(hand, t("tong", 1), [t("wan", 9), t("wan", 9)]);
  const nineWan = useful.find((item) => tileKey(item.tile) === "wan-9");
  assert.equal(nineWan.remaining, 2);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test
```

Expected: FAIL because `rules.js` does not exist.

- [ ] **Step 3: Implement standard hand checks and useful tiles**

Create `src/core/rules.js`:

```js
import { createTileSet, removeOneTile, tileKey } from "./tiles.js";

export function isWinningHand(hand) {
  if (hand.length !== 14) {
    return false;
  }

  const counts = toCountObject(hand);
  for (const key of Object.keys(counts)) {
    if (counts[key] >= 2) {
      counts[key] -= 2;
      if (canFormSets(counts)) {
        counts[key] += 2;
        return true;
      }
      counts[key] += 2;
    }
  }
  return false;
}

export function isTenpai(hand) {
  if (hand.length !== 13) {
    return false;
  }
  return getWinningTiles(hand, []).length > 0;
}

export function getUsefulTilesAfterDiscard(hand, discard, visibleTiles = []) {
  const nextHand = removeOneTile(hand, discard);
  return getWinningTiles(nextHand, visibleTiles);
}

export function getWinningTiles(hand, visibleTiles = []) {
  const uniqueTiles = uniqueTileTypes(createTileSet());
  const visibleCounts = toCountObject(visibleTiles);
  const handCounts = toCountObject(hand);

  return uniqueTiles
    .map((tile) => {
      const key = tileKey(tile);
      const remaining = 4 - (visibleCounts[key] ?? 0) - (handCounts[key] ?? 0);
      return { tile, remaining };
    })
    .filter((item) => item.remaining > 0)
    .filter((item) => isWinningHand([...hand, item.tile]));
}

function uniqueTileTypes(tiles) {
  const seen = new Set();
  const output = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(tile);
    }
  }
  return output;
}

function toCountObject(tiles) {
  const counts = {};
  for (const tile of tiles) {
    const key = tileKey(tile);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function canFormSets(counts) {
  const key = Object.keys(counts).find((item) => counts[item] > 0);
  if (!key) {
    return true;
  }

  if (counts[key] >= 3) {
    counts[key] -= 3;
    if (canFormSets(counts)) {
      counts[key] += 3;
      return true;
    }
    counts[key] += 3;
  }

  const [suit, rankText] = key.split("-");
  const rank = Number(rankText);
  const key2 = `${suit}-${rank + 1}`;
  const key3 = `${suit}-${rank + 2}`;

  if (rank <= 7 && counts[key2] > 0 && counts[key3] > 0) {
    counts[key] -= 1;
    counts[key2] -= 1;
    counts[key3] -= 1;
    if (canFormSets(counts)) {
      counts[key] += 1;
      counts[key2] += 1;
      counts[key3] += 1;
      return true;
    }
    counts[key] += 1;
    counts[key2] += 1;
    counts[key3] += 1;
  }

  return false;
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test
```

Expected: PASS for rules tests.

---

## Task 5: Explainable Recommendation Engine

**Files:**
- Create: `src/core/recommendation.js`
- Create: `tests/recommendation.test.mjs`

- [ ] **Step 1: Write recommendation tests**

Create `tests/recommendation.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { recommendDiscards } from "../src/core/recommendation.js";
import { tileKey } from "../src/core/tiles.js";

const t = (suit, rank) => ({ suit, rank });

test("recommendDiscards returns ranked choices with explanations", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 3),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9), t("tong", 1)
  ];
  const result = recommendDiscards({ hand, visibleTiles: [t("wan", 9)] });
  assert.equal(result.choices.length > 0, true);
  assert.equal(typeof result.best.explanation, "string");
  assert.equal(result.best.explanation.includes("有效进张"), true);
});

test("recommendDiscards accounts for visible useful tiles", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 3),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9), t("tong", 1)
  ];
  const result = recommendDiscards({ hand, visibleTiles: [t("wan", 9), t("wan", 9)] });
  const tongOne = result.choices.find((choice) => tileKey(choice.discard) === "tong-1");
  assert.equal(tongOne.usefulTiles.some((item) => item.remaining === 2), true);
});

test("recommendDiscards does not mutate hand or wall", () => {
  const hand = [
    t("wan", 1), t("wan", 2), t("wan", 3),
    t("wan", 4), t("wan", 5), t("wan", 6),
    t("tiao", 2), t("tiao", 3), t("tiao", 4),
    t("tong", 7), t("tong", 7), t("tong", 7),
    t("wan", 9), t("tong", 1)
  ];
  const wall = [t("wan", 8), t("wan", 9)];
  const beforeHand = JSON.stringify(hand);
  const beforeWall = JSON.stringify(wall);
  recommendDiscards({ hand, visibleTiles: [], wall });
  assert.equal(JSON.stringify(hand), beforeHand);
  assert.equal(JSON.stringify(wall), beforeWall);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test
```

Expected: FAIL because `recommendation.js` does not exist.

- [ ] **Step 3: Implement recommendation scoring**

Create `src/core/recommendation.js`:

```js
import { getUsefulTilesAfterDiscard } from "./rules.js";
import { removeOneTile, tileKey, tileLabel } from "./tiles.js";

export function recommendDiscards({ hand, visibleTiles = [] }) {
  const uniqueDiscards = uniqueTiles(hand);
  const choices = uniqueDiscards
    .map((discard) => scoreDiscard(hand, discard, visibleTiles))
    .sort((a, b) => b.score - a.score);

  return {
    id: `rec-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    best: choices[0],
    choices: choices.slice(0, 3)
  };
}

function scoreDiscard(hand, discard, visibleTiles) {
  const usefulTiles = getUsefulTilesAfterDiscard(hand, discard, visibleTiles);
  const remainingUsefulCount = usefulTiles.reduce((sum, item) => sum + item.remaining, 0);
  const nextHand = removeOneTile(hand, discard);
  const flexibility = estimateFlexibility(nextHand);
  const visibleDiscardCount = visibleTiles.filter((tile) => tileKey(tile) === tileKey(discard)).length;
  const dangerPenalty = visibleDiscardCount === 0 ? 1 : 0;
  const score = remainingUsefulCount * 10 + usefulTiles.length * 4 + flexibility - dangerPenalty;

  return {
    discard,
    score,
    usefulTiles,
    remainingUsefulCount,
    explanation: explainDiscard(discard, usefulTiles, remainingUsefulCount, flexibility, dangerPenalty)
  };
}

function explainDiscard(discard, usefulTiles, remainingUsefulCount, flexibility, dangerPenalty) {
  const usefulText = usefulTiles.length === 0
    ? "暂未形成直接听牌进张"
    : usefulTiles.map((item) => `${tileLabel(item.tile)}剩${item.remaining}张`).join("、");
  const riskText = dangerPenalty > 0
    ? "这张牌公开信息较少，存在一定未知风险"
    : "这张牌已有同类牌出现，风险相对可控";

  return `建议打${tileLabel(discard)}。有效进张：${usefulText}；合计${remainingUsefulCount}张。牌型灵活度评分${flexibility}。${riskText}。`;
}

function estimateFlexibility(hand) {
  let score = 0;
  const keys = new Set(hand.map(tileKey));
  for (const tile of hand) {
    if (keys.has(`${tile.suit}-${tile.rank}`)) score += 1;
    if (keys.has(`${tile.suit}-${tile.rank + 1}`)) score += 2;
    if (keys.has(`${tile.suit}-${tile.rank + 2}`)) score += 1;
  }
  return score;
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const output = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) {
      seen.add(key);
      output.push(tile);
    }
  }
  return output;
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test
```

Expected: PASS for recommendation tests.

---

## Task 6: Review Engine

**Files:**
- Create: `src/core/review.js`
- Create: `tests/review.test.mjs`

- [ ] **Step 1: Write review tests**

Create `tests/review.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { recordDecision, summarizeReview } from "../src/core/review.js";

const t = (suit, rank) => ({ suit, rank });

test("recordDecision stores recommendation snapshot", () => {
  const review = recordDecision([], {
    turn: 1,
    chosenDiscard: t("tong", 1),
    recommendation: {
      best: { discard: t("wan", 9), score: 32, explanation: "建议打9万。" },
      choices: []
    }
  });

  assert.equal(review.length, 1);
  assert.equal(review[0].followedBest, false);
  assert.equal(review[0].bestExplanation, "建议打9万。");
});

test("summarizeReview highlights ignored recommendations", () => {
  const records = [
    {
      turn: 1,
      followedBest: false,
      chosenLabel: "1筒",
      bestLabel: "9万",
      bestExplanation: "建议打9万。"
    }
  ];
  const summary = summarizeReview(records);
  assert.equal(summary.keyMoments.length, 1);
  assert.equal(summary.keyMoments[0].includes("第1巡"), true);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test
```

Expected: FAIL because `review.js` does not exist.

- [ ] **Step 3: Implement review records**

Create `src/core/review.js`:

```js
import { tileKey, tileLabel } from "./tiles.js";

export function recordDecision(records, { turn, chosenDiscard, recommendation }) {
  const best = recommendation.best;
  const followedBest = tileKey(chosenDiscard) === tileKey(best.discard);

  return [
    ...records,
    {
      turn,
      chosenDiscard,
      chosenLabel: tileLabel(chosenDiscard),
      bestDiscard: best.discard,
      bestLabel: tileLabel(best.discard),
      followedBest,
      bestScore: best.score,
      bestExplanation: best.explanation
    }
  ];
}

export function summarizeReview(records) {
  const keyMoments = records
    .filter((record) => !record.followedBest)
    .map((record) => `第${record.turn}巡：你打了${record.chosenLabel}，系统建议打${record.bestLabel}。${record.bestExplanation}`);

  return {
    totalDecisions: records.length,
    followedBestCount: records.filter((record) => record.followedBest).length,
    keyMoments
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
npm test
```

Expected: PASS for review tests.

---

## Task 7: Browser UI Wiring

**Files:**
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Create: `src/ui/render.js`

- [ ] **Step 1: Implement render helpers**

Create `src/ui/render.js`:

```js
import { tileLabel } from "../core/tiles.js";

export function renderApp({ game, recommendation, reviewSummary }) {
  return `
    <section class="table">
      <div class="opponent top-seat">对家 ${renderBacks(game.players[2].hand.length)}</div>
      <div class="opponent left-seat">上家 ${renderBacks(game.players[3].hand.length)}</div>
      <div class="opponent right-seat">下家 ${renderBacks(game.players[1].hand.length)}</div>
      <div class="center-area">
        <div>牌墙剩余 ${game.wall.length}</div>
        <div class="discard-grid">${renderAllDiscards(game)}</div>
      </div>
      <div class="player-hand">${renderPlayerHand(game.players[0].hand)}</div>
    </section>
    <aside class="advice-panel">
      ${renderRecommendation(recommendation)}
      ${renderReview(reviewSummary)}
      <button class="new-hand-button" type="button">新开一局</button>
    </aside>
  `;
}

function renderPlayerHand(hand) {
  return hand.map((tile, index) => `
    <button class="tile" data-discard-index="${index}" type="button">${tileLabel(tile)}</button>
  `).join("");
}

function renderBacks(count) {
  return `<span class="tile-back-row">${Array.from({ length: count }, () => `<span class="tile-back"></span>`).join("")}</span>`;
}

function renderAllDiscards(game) {
  return game.players.map((player) => `
    <div class="discard-row">玩家${player.seat}：${player.discards.map((tile) => `<span class="mini-tile">${tileLabel(tile)}</span>`).join("")}</div>
  `).join("");
}

function renderRecommendation(recommendation) {
  if (!recommendation?.best) {
    return `<h1>盘中提醒</h1><p>等待你的出牌。</p>`;
  }

  return `
    <h1>盘中提醒</h1>
    <p class="best-discard">推荐打：${tileLabel(recommendation.best.discard)}</p>
    <p>${recommendation.best.explanation}</p>
    <h2>备选</h2>
    <ol>
      ${recommendation.choices.map((choice) => `<li>${tileLabel(choice.discard)}：${choice.score}分</li>`).join("")}
    </ol>
  `;
}

function renderReview(summary) {
  if (!summary) {
    return `<section class="review"><h2>复盘</h2><p>本局操作会记录在这里。</p></section>`;
  }
  return `
    <section class="review">
      <h2>复盘</h2>
      <p>决策次数：${summary.totalDecisions}，采纳建议：${summary.followedBestCount}</p>
      ${summary.keyMoments.map((item) => `<p>${item}</p>`).join("")}
    </section>
  `;
}
```

- [ ] **Step 2: Wire game and recommendation into main**

Replace `src/main.js` with:

```js
import { createInitialGame, discardTile, drawTile } from "./core/game-state.js";
import { recommendDiscards } from "./core/recommendation.js";
import { recordDecision, summarizeReview } from "./core/review.js";
import { renderApp } from "./ui/render.js";

const app = document.querySelector("#app");
let game = createInitialGame();
let reviewRecords = [];
let currentRecommendation = recommendForPlayer();

render();

function render() {
  app.innerHTML = renderApp({
    game,
    recommendation: currentRecommendation,
    reviewSummary: summarizeReview(reviewRecords)
  });
}

app.addEventListener("click", (event) => {
  const discardButton = event.target.closest("[data-discard-index]");
  if (discardButton) {
    const tile = game.players[0].hand[Number(discardButton.dataset.discardIndex)];
    reviewRecords = recordDecision(reviewRecords, {
      turn: reviewRecords.length + 1,
      chosenDiscard: tile,
      recommendation: currentRecommendation
    });
    game = discardTile(game, 0, tile, { recommendationId: currentRecommendation.id });
    runComputerTurns();
    currentRecommendation = recommendForPlayer();
    render();
  }

  if (event.target.closest(".new-hand-button")) {
    game = createInitialGame();
    reviewRecords = [];
    currentRecommendation = recommendForPlayer();
    render();
  }
});

function recommendForPlayer() {
  return recommendDiscards({
    hand: game.players[0].hand,
    visibleTiles: game.players.flatMap((player) => player.discards)
  });
}

function runComputerTurns() {
  for (let playerIndex = 1; playerIndex <= 3; playerIndex += 1) {
    if (game.wall.length === 0) {
      return;
    }
    game = drawTile(game, playerIndex);
    const discard = game.players[playerIndex].hand[0];
    game = discardTile(game, playerIndex, discard);
  }
  if (game.wall.length > 0) {
    game = drawTile(game, 0);
  }
}
```

- [ ] **Step 3: Extend styles for tiles and panels**

Append to `src/styles.css`:

```css
.opponent {
  position: absolute;
  font-size: 14px;
}

.top-seat {
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
}

.left-seat {
  left: 20px;
  top: 180px;
  width: 150px;
}

.right-seat {
  right: 20px;
  top: 180px;
  width: 150px;
}

.tile,
.mini-tile {
  border: 1px solid #d7d2bf;
  border-radius: 6px;
  background: #fffaf0;
  color: #153832;
  box-shadow: 0 2px 0 #c3b894;
}

.tile {
  width: 54px;
  height: 78px;
  font-size: 20px;
  cursor: pointer;
}

.tile:hover {
  transform: translateY(-4px);
}

.mini-tile {
  display: inline-grid;
  place-items: center;
  min-width: 32px;
  height: 42px;
  margin: 2px;
  font-size: 13px;
}

.tile-back-row {
  display: inline-flex;
  max-width: 420px;
  flex-wrap: wrap;
  gap: 2px;
  vertical-align: middle;
}

.tile-back {
  width: 18px;
  height: 28px;
  border-radius: 3px;
  background: linear-gradient(#1ed45a, #08913e);
  border: 1px solid #a1f0a8;
}

.discard-grid {
  width: min(460px, 100%);
  font-size: 13px;
}

.best-discard {
  font-size: 22px;
  font-weight: 700;
  color: #b64021;
}

.advice-panel h1,
.advice-panel h2 {
  margin-top: 0;
}

.new-hand-button {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 6px;
  background: #0d7f68;
  color: #fff;
  cursor: pointer;
}
```

- [ ] **Step 4: Run automated tests**

Run:

```powershell
npm test
```

Expected: PASS for all core tests.

- [ ] **Step 5: Browser smoke test**

Run:

```powershell
python -m http.server 5177
```

Expected:

- The browser shows the table.
- The bottom hand has clickable tiles.
- Clicking a tile discards it.
- Three computer players take turns.
- The human player draws again.
- The reminder panel updates.
- The review section records the decision.

---

## Task 8: Final Verification

**Files:**
- Read: all created files
- Run: automated and browser tests

- [ ] **Step 1: Run full test suite**

Run:

```powershell
npm test
```

Expected: all tests PASS.

- [ ] **Step 2: Verify random-wall protection**

Run the game-state and recommendation tests:

```powershell
node --test tests/game-state.test.mjs tests/recommendation.test.mjs
```

Expected:

- Drawing consumes from the top of the wall.
- Original game objects are not mutated by draw and discard helpers.
- Recommendation does not mutate hand or wall.

- [ ] **Step 3: Verify the first-version user flow**

Open `http://localhost:5177` and play at least five human discards.

Expected:

- No visible tile overlap in the desktop horizontal layout.
- A recommendation appears before each human discard.
- The explanation mentions useful tiles and visible information.
- Review records each human decision.
- A new hand resets the table and review.

- [ ] **Step 4: Update the design note if implementation differs**

If an implementation choice changes a design requirement, update:

`docs/2026-06-03-changsha-mahjong-trainer-design.md`

Expected: design and implementation remain consistent.

