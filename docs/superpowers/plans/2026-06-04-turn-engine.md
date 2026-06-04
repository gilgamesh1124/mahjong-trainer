# 逐方出牌过程 / 回合引擎 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把电脑"瞬间打第一张"的同步循环，改造成可观看的、按 ~1 秒节奏逐方轮流、带抓牌/吃/碰/杠/胡完整动作、玩家也能认领的回合引擎。

**Architecture:** 分层、纯逻辑与异步编排解耦。纯函数层（melds/patterns/claims/扩展 rules）→ 不可变状态迁移（game-state）→ AI 决策（ai）→ 可注入 delay/agents/signal 的异步回合引擎（turn-engine）→ UI（render/overlays）+ 人机 Promise 桥（main）。

**Tech Stack:** 原生 JavaScript ES Modules，零依赖，无构建工具，node:test 测试，浏览器直接运行。

Spec: [docs/superpowers/specs/2026-06-04-turn-engine-design.md](../specs/2026-06-04-turn-engine-design.md)

---

## 共享数据形状（贯穿所有任务，务必保持一致）

```js
// Tile
{ suit: 'tong' | 'wan' | 'tiao', rank: 1..9 }

// Meld（player.melds[] 元素）
{ type: 'pong' | 'chi' | 'kong' | 'concealed-kong' | 'added-kong',
  tiles: Tile[],          // pong=3张, kong/各类杠=4张, chi=排序后的3张
  from: number | null }   // 来源座位；暗杠/补杠为 null

// game 新增字段
game.lastDiscard = { seat: number, tile: Tile } | null   // 可被认领的牌
game.lastDraw    = { seat: number, tile: Tile, afterKong: boolean } | null
game.phase       = 'awaiting-discard' | 'awaiting-claim' | 'hand-over'
game.result      = null
                 | { type:'win', winner, loser|null, tile, winType:'self-draw'|'discard'|'rob-kong', afterKong, pattern }
                 | { type:'draw' }

// 座位顺序：逆时针（下家方向）next = (seat + 3) % 4  →  0→3→2→1→0

// 认领意图 / 选项
{ type: 'win' | 'kong' | 'pong' | 'chi' | 'pass', tiles?: Tile[] }

// Agent 接口（turn-engine 调用）
agent.chooseAction(game, seat) => Promise<Action>
   Action = { type:'discard', tile } | { type:'concealed-kong', tile } | { type:'added-kong', tile } | { type:'self-win' }
agent.chooseClaim(game, seat, options) => Promise<Intent>   // options: 非 pass 的选项数组
```

---

## Task 1: rules.js — 含副露的胡牌判定与带副露向听

**Files:**
- Modify: `src/core/rules.js`
- Test: `tests/rules.test.mjs`

- [ ] **Step 1: 写失败测试**（追加到 `tests/rules.test.mjs` 末尾）

```js
import {
  isWinningTiles,
  shantenWithMelds,
} from '../src/core/rules.js';

test('isWinningTiles accepts a complete hand with one exposed meld', () => {
  // 1 个副露（meldCount=1）→ 需要 concealed 形成 3 套 + 1 对 = 11 张
  const concealed = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tong', 9], ['tong', 9],
  ]);
  assert.equal(isWinningTiles(concealed, 1), true);
});

test('isWinningTiles rejects wrong tile count for meld count', () => {
  const concealed = tiles([['wan', 1], ['wan', 2], ['wan', 3]]);
  assert.equal(isWinningTiles(concealed, 1), false);
});

test('shantenWithMelds matches shantenNumber when meldCount is 0', () => {
  const hand = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5],
    ['wan', 6], ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 1], ['tong', 2], ['tong', 3], ['tiao', 1],
  ]);
  assert.equal(shantenWithMelds(hand, 0), shantenNumber(hand));
});
```

注：该测试文件已 `import { shantenNumber } from '../src/core/rules.js'`，需把 `isWinningTiles, shantenWithMelds` 加进现有 import 或新增一行 import（如上）。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/rules.test.mjs`
Expected: FAIL — `isWinningTiles`/`shantenWithMelds` 未导出。

- [ ] **Step 3: 实现**（编辑 `src/core/rules.js`）

把 `isWinningHand` 改为委托新函数，并新增两个导出。在 `// --- Shanten / Ukeire ---` 区域附近添加，复用已有的私有 `canFormSets` 与 `shantenMelds`/`tilesToCounts27`：

```js
// 通用胡牌判定：concealed 必须形成 (4 - meldCount) 套 + 1 对
export function isWinningTiles(concealed, meldCount = 0) {
  const neededSets = 4 - meldCount;
  if (neededSets < 0) return false;
  if (concealed.length !== neededSets * 3 + 2) return false;

  const counts = countTiles(concealed);
  for (const [key, count] of counts) {
    if (count < 2) continue;
    const remaining = new Map(counts);
    remaining.set(key, count - 2);
    if (canFormSets(remaining)) return true;
  }
  return false;
}
```

把现有 `isWinningHand` 改为：

```js
export function isWinningHand(hand) {
  if (hand.length !== 14) return false;
  return isWinningTiles(hand, 0);
}
```

在 `shantenNumber` 下方新增带副露向听，并让 `shantenNumber` 委托它：

```js
export function shantenWithMelds(hand, meldCount = 0) {
  const counts = tilesToCounts27(hand);
  let best = 8;

  for (let i = 0; i < 27; i++) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      best = Math.min(best, shantenMelds(counts, 0, meldCount, 0) - 1);
      counts[i] += 2;
    }
  }

  best = Math.min(best, shantenMelds(counts, 0, meldCount, 0));
  return best;
}
```

把现有 `shantenNumber` 改为：

```js
export function shantenNumber(hand) {
  return shantenWithMelds(hand, 0);
}
```

并把 `calcUkeire` 增加可选 `meldCount` 形参，内部用 `shantenWithMelds`：

```js
export function calcUkeire(hand13, visibleCounts, meldCount = 0) {
  const currentShanten = shantenWithMelds(hand13, meldCount);
  const useful = [];
  let totalCount = 0;

  for (const suit of Object.keys(SUIT_IDX)) {
    for (let rank = 1; rank <= 9; rank++) {
      const tile = { suit, rank };
      const key = `${suit}-${rank}`;
      const seenCount = visibleCounts.get(key) ?? 0;
      const inHand = hand13.filter(t => `${t.suit}-${t.rank}` === key).length;
      const remaining = 4 - seenCount - inHand;
      if (remaining <= 0) continue;

      if (shantenWithMelds([...hand13, tile], meldCount) < currentShanten) {
        useful.push({ tile, remaining });
        totalCount += remaining;
      }
    }
  }

  return { tiles: useful, totalCount };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/rules.test.mjs`
Expected: PASS（含既有的 isWinningHand/shanten/calcUkeire 测试，全部仍通过）。

- [ ] **Step 5: Commit**

```bash
git add src/core/rules.js tests/rules.test.mjs
git commit -m "rules: add isWinningTiles and shantenWithMelds for meld-aware checks"
```

---

## Task 2: melds.js — 认领可行性纯函数

**Files:**
- Create: `src/core/melds.js`
- Test: `tests/melds.test.mjs`

- [ ] **Step 1: 写失败测试** (`tests/melds.test.mjs`)

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canPong, canKongFromDiscard, canConcealedKongs, canAddedKongs,
  canChiSequences, canWinOnTile, canSelfDrawWin,
} from '../src/core/melds.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

test('canPong needs two matching tiles in hand', () => {
  assert.equal(canPong(hand([['wan', 5], ['wan', 5], ['tong', 1]]), t('wan', 5)), true);
  assert.equal(canPong(hand([['wan', 5], ['tong', 1]]), t('wan', 5)), false);
});

test('canKongFromDiscard needs three matching tiles', () => {
  assert.equal(canKongFromDiscard(hand([['wan', 5], ['wan', 5], ['wan', 5]]), t('wan', 5)), true);
  assert.equal(canKongFromDiscard(hand([['wan', 5], ['wan', 5]]), t('wan', 5)), false);
});

test('canConcealedKongs lists tiles held four times', () => {
  const result = canConcealedKongs(hand([['wan', 3], ['wan', 3], ['wan', 3], ['wan', 3], ['tong', 1]]));
  assert.deepEqual(result, [t('wan', 3)]);
});

test('canAddedKongs lists pong melds the hand can upgrade', () => {
  const melds = [{ type: 'pong', tiles: [t('tong', 2), t('tong', 2), t('tong', 2)], from: 1 }];
  assert.deepEqual(canAddedKongs(hand([['tong', 2], ['wan', 9]]), melds), [t('tong', 2)]);
  assert.deepEqual(canAddedKongs(hand([['wan', 9]]), melds), []);
});

test('canChiSequences returns all sequences completed by the tile', () => {
  const seqs = canChiSequences(hand([['wan', 3], ['wan', 4], ['wan', 6]]), t('wan', 5));
  // 5 可与 (3,4) 或 (4,6) 成顺
  assert.equal(seqs.length, 2);
  assert.ok(seqs.some(s => s[0].rank === 3 && s[1].rank === 4));
  assert.ok(seqs.some(s => s[0].rank === 4 && s[1].rank === 6));
});

test('canWinOnTile accounts for exposed melds', () => {
  // 已碰 1 副（meldCount=1），concealed 10 张 + 点炮牌 → 11 张胡
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 9], ['tong', 9],
  ]);
  const melds = [{ type: 'pong', tiles: [t('tiao', 2), t('tiao', 2), t('tiao', 2)], from: 2 }];
  assert.equal(canWinOnTile(concealed, melds, t('tong', 6)), true);
  assert.equal(canWinOnTile(concealed, melds, t('tong', 1)), false);
});

test('canSelfDrawWin checks the full concealed hand', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 9], ['tong', 9],
  ]);
  const melds = [{ type: 'pong', tiles: [t('tiao', 2), t('tiao', 2), t('tiao', 2)], from: 2 }];
  assert.equal(canSelfDrawWin(concealed, melds), true);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/melds.test.mjs`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** (`src/core/melds.js`)

```js
import { countTiles, tileKey } from './tiles.js';
import { isWinningTiles } from './rules.js';

function countOf(tiles, tile) {
  const key = tileKey(tile);
  return tiles.filter((candidate) => tileKey(candidate) === key).length;
}

function keyToTile(key) {
  const dash = key.lastIndexOf('-');
  return { suit: key.slice(0, dash), rank: Number(key.slice(dash + 1)) };
}

export function canPong(hand, tile) {
  return countOf(hand, tile) >= 2;
}

export function canKongFromDiscard(hand, tile) {
  return countOf(hand, tile) >= 3;
}

export function canConcealedKongs(hand) {
  const result = [];
  for (const [key, count] of countTiles(hand)) {
    if (count >= 4) result.push(keyToTile(key));
  }
  return result;
}

export function canAddedKongs(hand, melds) {
  const result = [];
  for (const meld of melds) {
    if (meld.type === 'pong' && countOf(hand, meld.tiles[0]) >= 1) {
      result.push(meld.tiles[0]);
    }
  }
  return result;
}

export function canChiSequences(hand, tile) {
  const { suit, rank } = tile;
  const has = (r) => r >= 1 && r <= 9 && countOf(hand, { suit, rank: r }) >= 1;
  const seqs = [];
  if (has(rank - 2) && has(rank - 1)) seqs.push([{ suit, rank: rank - 2 }, { suit, rank: rank - 1 }]);
  if (has(rank - 1) && has(rank + 1)) seqs.push([{ suit, rank: rank - 1 }, { suit, rank: rank + 1 }]);
  if (has(rank + 1) && has(rank + 2)) seqs.push([{ suit, rank: rank + 1 }, { suit, rank: rank + 2 }]);
  return seqs;
}

export function canWinOnTile(hand, melds, tile) {
  return isWinningTiles([...hand, tile], melds.length);
}

export function canSelfDrawWin(hand, melds) {
  return isWinningTiles(hand, melds.length);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/melds.test.mjs`
Expected: PASS（7 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/core/melds.js tests/melds.test.mjs
git commit -m "melds: pure claim-feasibility functions (pong/chi/kong/win)"
```

---

## Task 3: patterns.js — 牌型识别

**Files:**
- Create: `src/core/patterns.js`
- Test: `tests/patterns.test.mjs`

- [ ] **Step 1: 写失败测试** (`tests/patterns.test.mjs`)

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { identifyPattern } from '../src/core/patterns.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

test('rob-kong context wins naming priority', () => {
  assert.equal(identifyPattern(hand([['wan', 1]]), [], t('wan', 1), { robKong: true }), '抢杠胡');
});

test('after-kong self draw is 杠上花', () => {
  assert.equal(identifyPattern(hand([['wan', 1]]), [], t('wan', 1), { afterKong: true, selfDraw: true }), '杠上花');
});

test('all one suit is 清一色', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5],
    ['wan', 6], ['wan', 7], ['wan', 8], ['wan', 9], ['wan', 9],
    ['wan', 9], ['wan', 1], ['wan', 1], ['wan', 1],
  ]);
  assert.equal(identifyPattern(concealed, [], t('wan', 1), {}), '清一色');
});

test('all triplets is 碰碰胡', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 1], ['wan', 1],
    ['tong', 5], ['tong', 5], ['tong', 5],
    ['tiao', 9], ['tiao', 9], ['tiao', 9],
    ['tiao', 3], ['tiao', 3], ['tiao', 3],
    ['wan', 4], ['wan', 4],
  ]);
  assert.equal(identifyPattern(concealed, [], t('wan', 1), {}), '碰碰胡');
});

test('plain self draw is 自摸; plain discard win is 平胡', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 5], ['tong', 5],
  ]);
  assert.equal(identifyPattern(concealed, [], t('wan', 1), { selfDraw: true }), '自摸');
  assert.equal(identifyPattern(concealed, [], t('wan', 1), {}), '平胡');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/patterns.test.mjs`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** (`src/core/patterns.js`)

```js
import { countTiles } from './tiles.js';

function isFlush(tiles) {
  return tiles.length > 0 && tiles.every((tile) => tile.suit === tiles[0].suit);
}

// 假定 concealed 已是一个合法胡牌的牌组；判断其是否可全部拆成刻子+一对（无顺子）
function isAllTriplets(concealed, melds) {
  if (melds.some((meld) => meld.type === 'chi')) return false;
  let pairLike = 0;
  for (const count of countTiles(concealed).values()) {
    const r = count % 3;
    if (r === 2) pairLike += 1;
    else if (r !== 0) return false;
  }
  return pairLike === 1;
}

export function identifyPattern(concealed, melds, winningTile, ctx = {}) {
  const allTiles = [...concealed, ...melds.flatMap((meld) => meld.tiles)];

  if (ctx.robKong) return '抢杠胡';
  if (ctx.afterKong && ctx.selfDraw) return '杠上花';
  if (isFlush(allTiles)) return '清一色';
  if (isAllTriplets(concealed, melds)) return '碰碰胡';
  if (ctx.selfDraw) return '自摸';
  return '平胡';
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/patterns.test.mjs`
Expected: PASS（5 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/core/patterns.js tests/patterns.test.mjs
git commit -m "patterns: identifyPattern for win-type naming"
```

---

## Task 4: claims.js — 认领选项与优先级裁决

**Files:**
- Create: `src/core/claims.js`
- Test: `tests/claims.test.mjs`

- [ ] **Step 1: 写失败测试** (`tests/claims.test.mjs`)

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { claimOptionsFor, resolveClaims } from '../src/core/claims.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));
const player = (specs, melds = []) => ({ hand: hand(specs), melds, discards: [] });

test('claimOptionsFor offers chi only when seat is the discarder 下家', () => {
  const p = player([['wan', 3], ['wan', 4]]);
  // discarder=0; 下家 = (0+3)%4 = 3 → seat 3 可吃，seat 1 不可吃
  const asNext = claimOptionsFor(3, p, t('wan', 5), 0);
  const notNext = claimOptionsFor(1, p, t('wan', 5), 0);
  assert.ok(asNext.some((o) => o.type === 'chi'));
  assert.ok(!notNext.some((o) => o.type === 'chi'));
});

test('claimOptionsFor includes pong/kong/win when available', () => {
  const p = player([['wan', 5], ['wan', 5], ['wan', 5]]);
  const opts = claimOptionsFor(2, p, t('wan', 5), 0);
  assert.ok(opts.some((o) => o.type === 'pong'));
  assert.ok(opts.some((o) => o.type === 'kong'));
});

test('resolveClaims: win beats pong beats chi', () => {
  const winner = resolveClaims([
    { seat: 1, claim: { type: 'chi' } },
    { seat: 2, claim: { type: 'pong' } },
    { seat: 3, claim: { type: 'win' } },
  ], 0);
  assert.equal(winner.seat, 3);
});

test('resolveClaims: equal priority picks closest counterclockwise to discarder', () => {
  // discarder 0；下家方向 0→3→2→1。两家都要碰，座位 3 比座位 2 更近
  const winner = resolveClaims([
    { seat: 2, claim: { type: 'pong' } },
    { seat: 3, claim: { type: 'pong' } },
  ], 0);
  assert.equal(winner.seat, 3);
});

test('resolveClaims returns null when everyone passes', () => {
  assert.equal(resolveClaims([{ seat: 1, claim: { type: 'pass' } }], 0), null);
  assert.equal(resolveClaims([], 0), null);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/claims.test.mjs`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** (`src/core/claims.js`)

```js
import { canPong, canKongFromDiscard, canChiSequences, canWinOnTile } from './melds.js';

const PRIORITY = { win: 3, kong: 2, pong: 2, chi: 1 };

// 逆时针（下家方向）从 from 到 to 的步数：每步 (s+3)%4
function ccwDistance(from, to) {
  let distance = 0;
  let seat = from;
  while (seat !== to && distance <= 4) {
    seat = (seat + 3) % 4;
    distance += 1;
  }
  return distance;
}

export function claimOptionsFor(seat, player, tile, discarderSeat) {
  const options = [];
  if (canWinOnTile(player.hand, player.melds, tile)) options.push({ type: 'win' });
  if (canKongFromDiscard(player.hand, tile)) options.push({ type: 'kong' });
  if (canPong(player.hand, tile)) options.push({ type: 'pong' });
  if (seat === (discarderSeat + 3) % 4) {
    for (const seq of canChiSequences(player.hand, tile)) {
      options.push({ type: 'chi', tiles: seq });
    }
  }
  return options;
}

export function resolveClaims(intents, discarderSeat) {
  const active = intents.filter((i) => i.claim && i.claim.type !== 'pass');
  let best = null;
  for (const intent of active) {
    if (!best) { best = intent; continue; }
    const p = PRIORITY[intent.claim.type];
    const bp = PRIORITY[best.claim.type];
    if (p > bp) best = intent;
    else if (p === bp
      && ccwDistance(discarderSeat, intent.seat) < ccwDistance(discarderSeat, best.seat)) {
      best = intent;
    }
  }
  return best;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/claims.test.mjs`
Expected: PASS（5 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/core/claims.js tests/claims.test.mjs
git commit -m "claims: claimOptionsFor + resolveClaims priority arbitration"
```

---

## Task 5: game-state.js — 状态字段与副露迁移

**Files:**
- Modify: `src/core/game-state.js`
- Test: `tests/game-state.test.mjs`（替换 discardTile 测试 + 新增迁移测试）

- [ ] **Step 1: 改写/新增失败测试**

在 `tests/game-state.test.mjs`：把现有 `discardTile ...` 的两个测试整段删除，import 改为：

```js
import {
  createInitialGame,
  drawTile,
  applyDiscard,
  applyPong,
  applyChi,
  applyKong,
  applyWin,
  markDraw,
} from '../src/core/game-state.js';
```

并新增测试：

```js
test('applyDiscard moves tile to discards and opens claim window', () => {
  const game = createInitialGame({ seed: 1234 });
  const tile = game.players[0].hand[0];

  const next = applyDiscard(game, 0, tile);

  assert.notEqual(next, game);
  assert.equal(next.players[0].hand.length, 13);
  assert.deepEqual(next.players[0].discards.at(-1), tile);
  assert.equal(next.currentPlayer, 0);            // 出牌后留在打牌者，待认领
  assert.equal(next.phase, 'awaiting-claim');
  assert.deepEqual(next.lastDiscard, { seat: 0, tile });
  assert.equal(game.players[0].hand.length, 14);  // 不可变
});

test('applyPong melds the tile, removes it from discarder pile, passes turn', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'wan', rank: 5 };
  // 构造可碰局面：座位 0 打 5万，座位 2 手里有两张 5万
  game.players[0].discards = [tile];
  game.players[2].hand = [tile, tile, { suit: 'tong', rank: 1 }];
  game = { ...game, lastDiscard: { seat: 0, tile } };

  const next = applyPong(game, 2, tile, 0);

  assert.equal(next.players[2].melds.length, 1);
  assert.equal(next.players[2].melds[0].type, 'pong');
  assert.equal(next.players[2].hand.length, 1);             // 剩 1万
  assert.equal(next.players[0].discards.length, 0);          // 被碰的牌移出弃牌堆
  assert.equal(next.currentPlayer, 2);
  assert.equal(next.phase, 'awaiting-discard');
  assert.equal(next.lastDiscard, null);
});

test('applyChi melds a sequence from the 上家 discard', () => {
  let game = createInitialGame({ seed: 1234 });
  const claimed = { suit: 'wan', rank: 5 };
  game.players[0].discards = [claimed];
  game.players[3].hand = [{ suit: 'wan', rank: 3 }, { suit: 'wan', rank: 4 }, { suit: 'tong', rank: 1 }];
  game = { ...game, lastDiscard: { seat: 0, tile: claimed } };

  const next = applyChi(game, 3, [{ suit: 'wan', rank: 3 }, { suit: 'wan', rank: 4 }], claimed, 0);

  assert.equal(next.players[3].melds[0].type, 'chi');
  assert.equal(next.players[3].melds[0].tiles.length, 3);
  assert.equal(next.players[3].hand.length, 1);
  assert.equal(next.currentPlayer, 3);
  assert.equal(next.phase, 'awaiting-discard');
});

test('applyKong from discard draws a replacement and flags afterKong', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'wan', rank: 5 };
  game.players[0].discards = [tile];
  game.players[2].hand = [tile, tile, tile, { suit: 'tong', rank: 1 }];
  game = { ...game, lastDiscard: { seat: 0, tile } };
  const wallTop = game.wall[0];

  const next = applyKong(game, 2, tile, 0, 'kong');

  assert.equal(next.players[2].melds[0].type, 'kong');
  assert.equal(next.players[2].melds[0].tiles.length, 4);
  assert.equal(next.players[0].discards.length, 0);
  assert.equal(next.lastDraw.afterKong, true);
  assert.ok(next.players[2].hand.some((t) => tileKey(t) === tileKey(wallTop)));
  assert.equal(next.phase, 'awaiting-discard');
});

test('applyWin and markDraw set hand-over result', () => {
  const game = createInitialGame({ seed: 1234 });
  const won = applyWin(game, 1, { winType: 'self-draw', tile: { suit: 'wan', rank: 1 }, loser: null, afterKong: false, pattern: '自摸' });
  assert.equal(won.phase, 'hand-over');
  assert.equal(won.result.winner, 1);
  assert.equal(won.result.pattern, '自摸');

  const drawn = markDraw(game);
  assert.equal(drawn.phase, 'hand-over');
  assert.equal(drawn.result.type, 'draw');
});
```

同时更新 `createInitialGame deals ...` 测试：现有断言保持不变（仍 14/13/13/13、wall 55、currentPlayer 0、phase 'awaiting-discard'、history []）——新增字段不破坏这些断言。

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/game-state.test.mjs`
Expected: FAIL — `applyDiscard` 等未导出。

- [ ] **Step 3: 实现**（编辑 `src/core/game-state.js`）

在 `createInitialGame` 返回对象里新增 `lastDiscard: null, lastDraw: null, result: null`（其余不变）。

把现有 `drawTile` 替换为（新增 options + lastDraw，普通摸牌的 history 形状保持 `{type:'draw', playerIndex, tileKey}` 不变）：

```js
export function drawTile(game, playerIndex, { afterKong = false } = {}) {
  const [tile, ...wall] = game.wall;
  if (!tile) {
    throw new Error('Wall is empty');
  }

  const players = clonePlayers(game.players);
  players[playerIndex] = {
    ...players[playerIndex],
    hand: sortTiles([...players[playerIndex].hand, tile]),
  };

  return {
    ...game,
    players,
    wall,
    currentPlayer: playerIndex,
    phase: 'awaiting-discard',
    lastDraw: { seat: playerIndex, tile, afterKong },
    lastDiscard: null,
    history: [...game.history, { type: 'draw', playerIndex, tileKey: tileKey(tile) }],
  };
}
```

删除旧的 `discardTile`，新增以下迁移（全部不可变、追加 history）：

```js
export function applyDiscard(game, seat, tile) {
  const players = clonePlayers(game.players);
  players[seat] = {
    ...players[seat],
    hand: removeOneTile(players[seat].hand, tile),
    discards: [...players[seat].discards, tile],
  };
  return {
    ...game,
    players,
    phase: 'awaiting-claim',
    lastDiscard: { seat, tile },
    lastDraw: null,
    history: [...game.history, { type: 'discard', playerIndex: seat, tileKey: tileKey(tile) }],
  };
}

function meldThenTurn(game, players, seat, type, tileK, fromSeat) {
  return {
    ...game,
    players,
    currentPlayer: seat,
    phase: 'awaiting-discard',
    lastDiscard: null,
    lastDraw: null,
    history: [...game.history, { type, playerIndex: seat, tileKey: tileK, from: fromSeat ?? null }],
  };
}

export function applyPong(game, seat, tile, fromSeat) {
  const players = clonePlayers(game.players);
  let hand = players[seat].hand;
  hand = removeOneTile(hand, tile);
  hand = removeOneTile(hand, tile);
  players[seat] = { ...players[seat], hand, melds: [...players[seat].melds, { type: 'pong', tiles: [tile, tile, tile], from: fromSeat }] };
  players[fromSeat] = { ...players[fromSeat], discards: removeOneTile(players[fromSeat].discards, tile) };
  return meldThenTurn(game, players, seat, 'pong', tileKey(tile), fromSeat);
}

export function applyChi(game, seat, seqTiles, claimedTile, fromSeat) {
  const players = clonePlayers(game.players);
  let hand = players[seat].hand;
  for (const tile of seqTiles) hand = removeOneTile(hand, tile);
  const meldTiles = sortTiles([...seqTiles, claimedTile]);
  players[seat] = { ...players[seat], hand, melds: [...players[seat].melds, { type: 'chi', tiles: meldTiles, from: fromSeat }] };
  players[fromSeat] = { ...players[fromSeat], discards: removeOneTile(players[fromSeat].discards, claimedTile) };
  return meldThenTurn(game, players, seat, 'chi', tileKey(claimedTile), fromSeat);
}

export function applyKong(game, seat, tile, fromSeat, kind) {
  const players = clonePlayers(game.players);
  let hand = players[seat].hand;
  let melds = [...players[seat].melds];

  if (kind === 'kong') {
    hand = removeOneTile(hand, tile);
    hand = removeOneTile(hand, tile);
    hand = removeOneTile(hand, tile);
    melds.push({ type: 'kong', tiles: [tile, tile, tile, tile], from: fromSeat });
    players[fromSeat] = { ...players[fromSeat], discards: removeOneTile(players[fromSeat].discards, tile) };
  } else if (kind === 'concealed-kong') {
    for (let i = 0; i < 4; i += 1) hand = removeOneTile(hand, tile);
    melds.push({ type: 'concealed-kong', tiles: [tile, tile, tile, tile], from: null });
  } else if (kind === 'added-kong') {
    hand = removeOneTile(hand, tile);
    melds = melds.map((meld) => (
      meld.type === 'pong' && tileKey(meld.tiles[0]) === tileKey(tile)
        ? { type: 'added-kong', tiles: [tile, tile, tile, tile], from: meld.from }
        : meld
    ));
  }

  players[seat] = { ...players[seat], hand, melds };
  const afterMeld = {
    ...game,
    players,
    currentPlayer: seat,
    lastDiscard: null,
    history: [...game.history, { type: 'kong', kind, playerIndex: seat, tileKey: tileKey(tile), from: fromSeat ?? null }],
  };
  return drawTile(afterMeld, seat, { afterKong: true });
}

export function applyWin(game, seat, info) {
  return {
    ...game,
    phase: 'hand-over',
    result: {
      type: 'win',
      winner: seat,
      loser: info.loser ?? null,
      tile: info.tile,
      winType: info.winType,
      afterKong: !!info.afterKong,
      pattern: info.pattern,
    },
    history: [...game.history, { type: 'win', playerIndex: seat, winType: info.winType }],
  };
}

export function markDraw(game) {
  return {
    ...game,
    phase: 'hand-over',
    result: { type: 'draw' },
    history: [...game.history, { type: 'draw-game' }],
  };
}
```

确保文件顶部 import 仍包含 `removeOneTile, sortTiles, tileKey`（已有）。

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/game-state.test.mjs`
Expected: PASS（createInitialGame、drawTile、applyDiscard、applyPong、applyChi、applyKong、applyWin/markDraw 等）。

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.js tests/game-state.test.mjs
git commit -m "game-state: meld transitions, lastDiscard/lastDraw/result fields"
```

---

## Task 6: ai.js — 牌效+安全度决策

**Files:**
- Create: `src/core/ai.js`
- Test: `tests/ai.test.mjs`

- [ ] **Step 1: 写失败测试** (`tests/ai.test.mjs`)

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { tileDanger, decideDiscard, decideClaim, decideAction } from '../src/core/ai.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

function makeGame(overrides = {}) {
  const players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
  return { players, wall: [], currentPlayer: 0, phase: 'awaiting-discard', lastDiscard: null, lastDraw: null, result: null, history: [], ...overrides };
}

test('tileDanger: a tile already discarded by every opponent is 0 danger', () => {
  const game = makeGame();
  game.players[1].discards = [t('wan', 5)];
  game.players[2].discards = [t('wan', 5)];
  game.players[3].discards = [t('wan', 5)];
  assert.equal(tileDanger(t('wan', 5), game, 0), 0);
});

test('tileDanger: an unseen middle tile is more dangerous than an unseen terminal', () => {
  const game = makeGame();
  assert.ok(tileDanger(t('wan', 5), game, 0) > tileDanger(t('wan', 1), game, 0));
});

test('decideDiscard returns a tile from the hand', () => {
  const game = makeGame();
  game.players[0].hand = hand([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3], ['tiao', 7], ['tiao', 8],
    ['tiao', 9], ['tong', 9], ['tong', 9], ['tiao', 1],
  ]);
  const tile = decideDiscard(game, 0);
  assert.ok(game.players[0].hand.some((h) => h.suit === tile.suit && h.rank === tile.rank));
});

test('decideClaim always takes a win', () => {
  const game = makeGame();
  const intent = decideClaim(game, 2, [{ type: 'pong' }, { type: 'win' }]);
  assert.equal(intent.type, 'win');
});

test('decideClaim passes a pong that does not help a far-from-ready hand', () => {
  const game = makeGame();
  // 一手散牌（向听很大），碰一对中张无益 → 过
  game.players[2].hand = hand([
    ['wan', 1], ['wan', 5], ['wan', 5], ['tong', 2], ['tong', 7],
    ['tiao', 3], ['tiao', 8], ['wan', 9], ['tong', 4], ['tiao', 6], ['tong', 9],
  ]);
  game.lastDiscard = { seat: 0, tile: t('wan', 5) }; // decideClaim 读取被打出的牌
  const intent = decideClaim(game, 2, [{ type: 'pong' }]);
  assert.equal(intent.type, 'pass');
});

test('decideAction returns self-win when the hand is complete', () => {
  const game = makeGame();
  game.players[0].hand = hand([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  game.lastDraw = { seat: 0, tile: t('tiao', 1), afterKong: false };
  const action = decideAction(game, 0);
  assert.equal(action.type, 'self-win');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/ai.test.mjs`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** (`src/core/ai.js`)

```js
import { shantenWithMelds, calcUkeire } from './rules.js';
import { canSelfDrawWin } from './melds.js';
import { tileKey, removeOneTile } from './tiles.js';

const DANGER_BY_RANK = { 1: 0.2, 2: 0.3, 3: 0.4, 4: 0.6, 5: 0.6, 6: 0.6, 7: 0.4, 8: 0.3, 9: 0.2 };
const DANGER_WEIGHT = 80; // 与 (8-shanten)*1000 + ukeire 同量纲下的安全度权重

// 0..1：对单个对手而言，现物=0；否则按中张程度，并随该对手是否有副露略放大
function dangerVsOpponent(tile, opponent) {
  const isGenbutsu = opponent.discards.some((d) => tileKey(d) === tileKey(tile));
  if (isGenbutsu) return 0;
  const base = DANGER_BY_RANK[tile.rank] ?? 0.4;
  const threat = opponent.melds.length > 0 ? 1.2 : 1;
  return Math.min(1, base * threat);
}

export function tileDanger(tile, game, mySeat) {
  let worst = 0;
  for (let seat = 0; seat < game.players.length; seat += 1) {
    if (seat === mySeat) continue;
    worst = Math.max(worst, dangerVsOpponent(tile, game.players[seat]));
  }
  return worst;
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const out = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) { seen.add(key); out.push(tile); }
  }
  return out;
}

function visibleCounts(game) {
  const counts = new Map();
  for (const player of game.players) {
    for (const tile of player.discards) counts.set(tileKey(tile), (counts.get(tileKey(tile)) ?? 0) + 1);
    for (const meld of player.melds) for (const tile of meld.tiles) counts.set(tileKey(tile), (counts.get(tileKey(tile)) ?? 0) + 1);
  }
  return counts;
}

export function decideDiscard(game, seat) {
  const player = game.players[seat];
  const meldCount = player.melds.length;
  const seen = visibleCounts(game);

  let bestTile = player.hand[0];
  let bestScore = -Infinity;

  for (const discard of uniqueTiles(player.hand)) {
    const after = removeOneTile(player.hand, discard);
    const shanten = shantenWithMelds(after, meldCount);
    const ukeire = calcUkeire(after, seen, meldCount);
    const danger = tileDanger(discard, game, seat);
    const score = (8 - shanten) * 1000 + ukeire.totalCount - DANGER_WEIGHT * danger;
    if (score > bestScore) { bestScore = score; bestTile = discard; }
  }
  return bestTile;
}

export function decideClaim(game, seat, options) {
  const win = options.find((o) => o.type === 'win');
  if (win) return win;

  const player = game.players[seat];
  const meldCount = player.melds.length;
  const current = shantenWithMelds(player.hand, meldCount);

  // 评估非胡认领：碰/杠移出对应牌+多一副；吃移出两张顺子搭子+多一副。
  // 仅当能降向听，或已接近听牌(<=1)且不升向听时才认领。
  for (const option of options) {
    let after = player.hand;
    let removed = true;
    try {
      if (option.type === 'pong') {
        after = removeOneTile(removeOneTile(after, lastTile(game)), lastTile(game));
      } else if (option.type === 'kong') {
        after = removeOneTile(removeOneTile(removeOneTile(after, lastTile(game)), lastTile(game)), lastTile(game));
      } else if (option.type === 'chi') {
        for (const tile of option.tiles) after = removeOneTile(after, tile);
      }
    } catch { removed = false; }
    if (!removed) continue;

    const next = shantenWithMelds(after, meldCount + 1);
    if (next < current || (next === current && current <= 1)) return option;
  }
  return { type: 'pass' };
}

function lastTile(game) {
  return game.lastDiscard.tile;
}

export function decideAction(game, seat) {
  const player = game.players[seat];
  if (canSelfDrawWin(player.hand, player.melds)) {
    return { type: 'self-win' };
  }
  // 简化：AI 不主动暗杠/补杠（机制保留给玩家）
  return { type: 'discard', tile: decideDiscard(game, seat) };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/ai.test.mjs`
Expected: PASS（6 个测试）。

- [ ] **Step 5: Commit**

```bash
git add src/core/ai.js tests/ai.test.mjs
git commit -m "ai: efficiency+danger discard, claim and action decisions"
```

---

## Task 7: turn-engine.js — 异步回合引擎

**Files:**
- Create: `src/core/turn-engine.js`
- Test: `tests/turn-engine.test.mjs`

- [ ] **Step 1: 写失败测试** (`tests/turn-engine.test.mjs`)

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { runHand } from '../src/core/turn-engine.js';
import { tileKey } from '../src/core/tiles.js';

const t = (suit, rank) => ({ suit, rank });
const handOf = (specs) => specs.map(([s, r]) => t(s, r));
const noDelay = () => Promise.resolve();

function makeGame(overrides = {}) {
  const players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
  return { players, wall: [], currentPlayer: 0, phase: 'awaiting-discard', lastDiscard: null, lastDraw: null, result: null, history: [], ...overrides };
}

// 脚本 agent：按数组依次返回动作/认领；用尽则默认 pass / 由测试提前中止
function scripted({ actions = [], claims = [] } = {}) {
  let ai = 0; let ci = 0;
  return {
    chooseAction: async () => actions[ai++],
    chooseClaim: async () => claims[ci++] ?? { type: 'pass' },
  };
}
const passAgent = { chooseAction: async () => ({ type: 'discard' }), chooseClaim: async () => ({ type: 'pass' }) };

test('self-draw win ends the hand with a pattern', async () => {
  const game = makeGame({
    currentPlayer: 0,
    lastDraw: { seat: 0, tile: t('tiao', 1), afterKong: false },
  });
  game.players[0].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  const agents = [scripted({ actions: [{ type: 'self-win' }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.equal(result.phase, 'hand-over');
  assert.equal(result.result.winner, 0);
  assert.equal(result.result.winType, 'self-draw');
  assert.equal(typeof result.result.pattern, 'string');
});

test('no claim passes the turn to the 下家 who then draws', async () => {
  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 7)] });
  const discardTile = t('tiao', 9);
  game.players[0].hand = [discardTile, ...handOf([
    ['wan', 1], ['wan', 4], ['wan', 7], ['tong', 2], ['tong', 5], ['tong', 8],
    ['tiao', 1], ['tiao', 4], ['tiao', 7], ['wan', 2], ['wan', 5], ['wan', 8], ['tong', 1],
  ])];
  // 其他三家空手 → 无人能认领
  const controller = new AbortController();
  const captured = [];
  const seat3 = {
    chooseAction: async () => { controller.abort(); return { type: 'discard', tile: game.wall[0] }; },
    chooseClaim: async () => ({ type: 'pass' }),
  };
  const agents = [scripted({ actions: [{ type: 'discard', tile: discardTile }] }), passAgent, passAgent, seat3];

  const result = await runHand(game, agents, { delay: noDelay, signal: controller.signal, onUpdate: (g) => captured.push(g) });

  // 中止前最后状态：座位 3 已摸牌、轮到 3、awaiting-discard
  assert.equal(result.currentPlayer, 3);
  assert.equal(result.phase, 'awaiting-discard');
  assert.equal(result.history.at(-1).type, 'draw');
  assert.equal(result.history.at(-1).playerIndex, 3);
});

test('a pong claim redirects the turn to the claimer and melds the tile', async () => {
  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 1)] });
  const claimed = t('wan', 5);
  game.players[0].hand = [claimed, ...handOf([
    ['wan', 1], ['wan', 4], ['wan', 7], ['tong', 2], ['tong', 5], ['tong', 8],
    ['tiao', 1], ['tiao', 4], ['tiao', 7], ['wan', 2], ['wan', 8], ['tong', 1], ['tong', 3],
  ])];
  game.players[2].hand = handOf([['wan', 5], ['wan', 5], ['tong', 9]]);

  const controller = new AbortController();
  const seat2 = {
    chooseAction: async () => { controller.abort(); return { type: 'discard', tile: t('tong', 9) }; },
    chooseClaim: async (g, s, options) => options.find((o) => o.type === 'pong') ?? { type: 'pass' },
  };
  const agents = [scripted({ actions: [{ type: 'discard', tile: claimed }] }), passAgent, seat2, passAgent];

  const result = await runHand(game, agents, { delay: noDelay, signal: controller.signal });

  assert.equal(result.currentPlayer, 2);
  assert.equal(result.players[2].melds[0].type, 'pong');
  assert.ok(!result.players[0].discards.some((d) => tileKey(d) === tileKey(claimed)));
});

test('an already-aborted signal returns immediately', async () => {
  const controller = new AbortController();
  controller.abort();
  const game = makeGame({ currentPlayer: 0 });
  const result = await runHand(game, [passAgent, passAgent, passAgent, passAgent], { delay: noDelay, signal: controller.signal });
  assert.equal(result.phase, 'awaiting-discard'); // 未推进
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/turn-engine.test.mjs`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现** (`src/core/turn-engine.js`)

```js
import { sortTiles } from './tiles.js';
import { applyDiscard, applyPong, applyChi, applyKong, applyWin, markDraw, drawTile } from './game-state.js';
import { claimOptionsFor, resolveClaims } from './claims.js';
import { canWinOnTile } from './melds.js';
import { identifyPattern } from './patterns.js';

const NEXT = (seat) => (seat + 3) % 4;

function winningConcealed(player, extraTile) {
  return sortTiles(extraTile ? [...player.hand, extraTile] : [...player.hand]);
}

// 补杠被抢：返回可胡的最近座位，否则 null
function findRobKong(game, kongSeat, tile) {
  let found = null;
  for (let step = 1; step <= 3; step += 1) {
    const seat = (kongSeat + 3 * step) % 4;
    if (seat === kongSeat) continue;
    if (canWinOnTile(game.players[seat].hand, game.players[seat].melds, tile)) { found = seat; break; }
  }
  return found;
}

export async function runHand(game, agents, { delay = () => Promise.resolve(), onUpdate = () => {}, signal } = {}) {
  const aborted = () => signal?.aborted;

  onUpdate(game);

  while (game.phase !== 'hand-over') {
    if (aborted()) return game;
    const seat = game.currentPlayer;

    const action = await agents[seat].chooseAction(game, seat);
    if (aborted()) return game;

    if (action.type === 'self-win') {
      const tile = game.lastDraw?.tile ?? action.tile;
      const pattern = identifyPattern(winningConcealed(game.players[seat]), game.players[seat].melds, tile, { selfDraw: true, afterKong: !!game.lastDraw?.afterKong });
      game = applyWin(game, seat, { winType: 'self-draw', tile, loser: null, afterKong: !!game.lastDraw?.afterKong, pattern });
      onUpdate(game);
      continue;
    }

    if (action.type === 'concealed-kong' || action.type === 'added-kong') {
      if (action.type === 'added-kong') {
        const robber = findRobKong(game, seat, action.tile);
        if (robber !== null) {
          const pattern = identifyPattern(winningConcealed(game.players[robber], action.tile), game.players[robber].melds, action.tile, { robKong: true });
          game = applyWin(game, robber, { winType: 'rob-kong', tile: action.tile, loser: seat, afterKong: false, pattern });
          onUpdate(game);
          continue;
        }
      }
      game = applyKong(game, seat, action.tile, null, action.type);
      onUpdate(game);
      await delay();
      continue; // 杠后回到同座位出牌（或杠上花）
    }

    // 普通出牌
    game = applyDiscard(game, seat, action.tile);
    onUpdate(game);
    await delay();
    if (aborted()) return game;

    // 认领窗口
    const intents = [];
    for (let step = 1; step <= 3; step += 1) {
      const other = (seat + 3 * step) % 4;
      if (other === seat) continue;
      const options = claimOptionsFor(other, game.players[other], game.lastDiscard.tile, seat);
      if (options.length === 0) continue;
      const intent = await agents[other].chooseClaim(game, other, options);
      if (aborted()) return game;
      intents.push({ seat: other, claim: intent });
    }

    const winner = resolveClaims(intents, seat);

    if (!winner) {
      const next = NEXT(seat);
      if (game.wall.length === 0) { game = markDraw(game); onUpdate(game); continue; }
      game = drawTile(game, next);
      onUpdate(game);
      await delay();
      continue;
    }

    const claimedTile = game.lastDiscard.tile;
    if (winner.claim.type === 'win') {
      const pattern = identifyPattern(winningConcealed(game.players[winner.seat], claimedTile), game.players[winner.seat].melds, claimedTile, {});
      game = applyWin(game, winner.seat, { winType: 'discard', tile: claimedTile, loser: seat, afterKong: false, pattern });
    } else if (winner.claim.type === 'pong') {
      game = applyPong(game, winner.seat, claimedTile, seat);
    } else if (winner.claim.type === 'kong') {
      game = applyKong(game, winner.seat, claimedTile, seat, 'kong');
    } else if (winner.claim.type === 'chi') {
      game = applyChi(game, winner.seat, winner.claim.tiles, claimedTile, seat);
    }
    onUpdate(game);
    await delay();
  }

  onUpdate(game);
  return game;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `node --test tests/turn-engine.test.mjs`
Expected: PASS（4 个测试）。

- [ ] **Step 5: 运行全部测试**

Run: `npm test`
Expected: 全绿（rules/tiles/game-state/melds/patterns/claims/ai/turn-engine/recommendation/review/tile-face）。

- [ ] **Step 6: Commit**

```bash
git add src/core/turn-engine.js tests/turn-engine.test.mjs
git commit -m "turn-engine: async runHand loop with claim window and abort"
```

---

## Task 8: UI — 副露/回合高亮/动作浮标/认领按钮/结局横幅

DOM 渲染不做 node 单测，用浏览器预览人工验证。

**Files:**
- Create: `src/ui/overlays.js`
- Modify: `src/ui/render.js`

- [ ] **Step 1: 新增 `src/ui/overlays.js`**

```js
import { tileFaceSvg } from './tile-face.js';
import { tileLabel } from '../core/tiles.js';

const ACTION_LABEL = { pong: '碰', kong: '杠', chi: '吃', win: '胡', 'self-win': '自摸' };

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// 玩家可认领时的按钮条；options 为 claimOptionsFor 结果
export function claimControls(options) {
  if (!options || options.length === 0) return '';
  const buttons = options.map((option, index) => {
    const label = option.type === 'chi'
      ? `吃 ${option.tiles.map(tileLabel).join('')}`
      : ACTION_LABEL[option.type] ?? option.type;
    return `<button class="claim-button" type="button" data-claim-index="${index}">${escapeHtml(label)}</button>`;
  }).join('');
  return `<div class="claim-bar">${buttons}<button class="claim-button claim-pass" type="button" data-claim-pass="1">过</button></div>`;
}

// 自己回合的额外动作（自摸/暗杠/补杠）
export function selfActionControls(selfActions) {
  if (!selfActions || selfActions.length === 0) return '';
  const buttons = selfActions.map((action, index) => {
    const label = action.type === 'self-win' ? '自摸' : action.type === 'concealed-kong' ? `暗杠 ${tileLabel(action.tile)}` : `补杠 ${tileLabel(action.tile)}`;
    return `<button class="self-action-button" type="button" data-self-action-index="${index}">${escapeHtml(label)}</button>`;
  }).join('');
  return `<div class="self-action-bar">${buttons}</div>`;
}

// 一组副露的牌面
export function meldsStrip(melds) {
  if (!melds || melds.length === 0) return '';
  const groups = melds.map((meld) => {
    const faces = meld.tiles.map((tile) => `<span class="meld-tile">${tileFaceSvg(tile)}</span>`).join('');
    const concealed = meld.type === 'concealed-kong' ? ' is-concealed' : '';
    return `<span class="meld-group${concealed}">${faces}</span>`;
  }).join('');
  return `<div class="melds-strip">${groups}</div>`;
}

// 动作浮标：碰/吃/杠 时在桌面中央闪现（胡由结局横幅承担，不重复）
const FLASH_LABEL = { pong: '碰', chi: '吃', kong: '杠' };
export function actionFlash(game) {
  const last = game.history.at(-1);
  const text = last ? FLASH_LABEL[last.type] : undefined;
  if (!text) return '';
  return `<div class="action-flash" aria-hidden="true">${text}!</div>`;
}

// 结局横幅
export function resultBanner(result, names) {
  if (!result) return '';
  if (result.type === 'draw') {
    return `<div class="result-banner"><div class="result-card"><h2>流局</h2><button class="new-hand-button" type="button">新开一局</button></div></div>`;
  }
  const who = names[result.winner];
  const way = result.winType === 'self-draw' ? '自摸' : result.winType === 'rob-kong' ? '抢杠胡' : `点炮（${names[result.loser]} 放炮）`;
  return `<div class="result-banner"><div class="result-card">
    <h2>${escapeHtml(who)} 胡牌</h2>
    <div class="result-face">${tileFaceSvg(result.tile)}</div>
    <p>${escapeHtml(way)} · ${escapeHtml(result.pattern)}</p>
    <button class="new-hand-button" type="button">新开一局</button>
  </div></div>`;
}
```

- [ ] **Step 2: 修改 `src/ui/render.js`**

(a) 顶部 import 增加：

```js
import { claimControls, selfActionControls, meldsStrip, resultBanner, actionFlash } from './overlays.js';
```

(b) `findDrawnIndex` 改为读取 `game.lastDraw`（替换原先遍历 history 的实现）：

```js
function findDrawnIndex(game) {
  const draw = game.lastDraw;
  if (!draw || draw.seat !== 0) return -1;
  return game.players[0].hand.findIndex((tile) => tileKey(tile) === tileKey(draw.tile));
}
```

(c) `opponentSeat` 增加回合高亮和副露：

```js
function opponentSeat(player, playerIndex, activeSeat) {
  const seatClass = SEAT_CLASS_BY_PLAYER[playerIndex];
  const playerName = escapeHtml(PLAYER_NAMES[playerIndex]);
  const active = playerIndex === activeSeat ? ' is-active' : '';
  return `
    <div class="seat ${seatClass}${active}" aria-label="${playerName}">
      <div class="seat-name">${playerName}</div>
      <div class="opponent-tiles">${tileBacks(player.hand.length)}</div>
      ${meldsStrip(player.melds)}
    </div>
  `;
}
```

(d) `renderApp` 的签名扩展为接收交互上下文，并把控件/横幅/玩家副露/回合高亮接入。把现有 `renderApp` 函数整体替换为：

```js
export function renderApp({ game, recommendation, reviewSummary, interaction = {} }) {
  const best = recommendation?.best ?? null;
  const bestDiscardFace = best ? tileFaceSvg(best.discard) : '<span class="best-empty">暂无</span>';
  const explanation = best?.explanation ?? '等待可分析的手牌。';

  const hand = game.players[0].hand;
  const isPlayerDiscardTurn = game.phase === 'awaiting-discard' && game.currentPlayer === 0;
  const recommendedIndex = isPlayerDiscardTurn ? findRecommendedIndex(hand, recommendation) : -1;
  const drawnIndex = findDrawnIndex(game);
  const activeSeat = game.phase === 'hand-over' ? -1 : game.currentPlayer;

  const handDisabled = isPlayerDiscardTurn ? '' : ' is-disabled';

  app.innerHTML = `
    <section class="table" aria-label="长沙麻将训练桌">
      ${actionFlash(game)}
      ${opponentSeat(game.players[2], 2, activeSeat)}
      ${opponentSeat(game.players[1], 1, activeSeat)}
      ${opponentSeat(game.players[3], 3, activeSeat)}

      <div class="center-area">
        <div class="wall-status">牌墙剩余 <strong>${escapeHtml(game.wall.length)}</strong></div>
        <div class="discard-grid" aria-label="四家弃牌">
          ${discardGrid(game)}
        </div>
      </div>

      <div class="player-zone${activeSeat === 0 ? ' is-active' : ''}">
        ${meldsStrip(game.players[0].melds)}
        ${selfActionControls(interaction.selfActions)}
        ${claimControls(interaction.claimOptions)}
        <div class="player-hand${handDisabled}" aria-label="玩家手牌">
          ${hand.map((tile, index) => tileButton(tile, index, {
            recommended: index === recommendedIndex,
            drawn: index === drawnIndex,
          })).join('')}
        </div>
      </div>
    </section>

    <aside class="advice-panel" aria-label="盘中提醒">
      <h1>盘中提醒</h1>
      <div class="best-discard">
        <span>推荐打</span>
        <div class="best-discard-face">${bestDiscardFace}</div>
      </div>
      <p class="advice-explanation">${escapeHtml(isPlayerDiscardTurn ? explanation : statusText(game))}</p>
      <h2>备选前三</h2>
      <ol class="choice-list">${choicesList(recommendation)}</ol>
      <h2>复盘</h2>
      <div class="review-summary">${reviewBlock(reviewSummary)}</div>
      <button class="new-hand-button" type="button">新开一局</button>
    </aside>

    ${resultBanner(game.result, PLAYER_NAMES)}
  `;
}

function statusText(game) {
  if (game.phase === 'hand-over') return '本局结束。';
  return `轮到 ${PLAYER_NAMES[game.currentPlayer]}…`;
}
```

- [ ] **Step 3: 浏览器人工验证（先用静态状态）**

启动预览：把 `.claude/launch.json` 的 `mahjong` 配置跑起来（端口 5177 被占用时改用空闲端口）。打开页面，确认：渲染不报错、布局未塌陷、对家副露区为空时不显示空块。

Run（开发者控制台或 preview_eval）：检查 `document.querySelector('.player-zone')` 存在。

- [ ] **Step 4: Commit**

```bash
git add src/ui/overlays.js src/ui/render.js
git commit -m "ui: melds strip, turn highlight, claim/self-action controls, result banner"
```

---

## Task 9: main.js — 引擎编排 + 人类 Promise 桥

**Files:**
- Modify: `src/main.js`（整体重写编排）

- [ ] **Step 1: 重写 `src/main.js`**

```js
import { createInitialGame } from './core/game-state.js';
import { runHand } from './core/turn-engine.js';
import { recommendDiscards } from './core/recommendation.js';
import { decideAction, decideClaim } from './core/ai.js';
import { canSelfDrawWin, canConcealedKongs, canAddedKongs } from './core/melds.js';
import { recordDecision, summarizeReview } from './core/review.js';
import { renderApp } from './ui/render.js';
import { tileKey } from './core/tiles.js';

const app = document.querySelector('#app');

let game = null;
let reviewRecords = [];
let controller = null;
let pending = null;           // { kind:'action'|'claim', resolve, ... }
let currentRecommendation = null;

const DELAY_MS = 1000;
const delay = () => new Promise((r) => setTimeout(r, DELAY_MS));

function visibleTiles() {
  return game.players.flatMap((player) => player.discards);
}

function recommendCurrentHand() {
  return recommendDiscards({ hand: game.players[0].hand, visibleTiles: visibleTiles() });
}

function render() {
  const interaction = {};
  if (pending?.kind === 'claim') interaction.claimOptions = pending.options;
  if (pending?.kind === 'action') interaction.selfActions = pending.selfActions;
  renderApp({ game, recommendation: currentRecommendation, reviewSummary: summarizeReview(reviewRecords), interaction });
}

function onUpdate(next) {
  game = next;
  if (game.phase === 'awaiting-discard' && game.currentPlayer === 0) {
    currentRecommendation = recommendCurrentHand();
  }
  render();
}

// 人类 agent
const humanAgent = {
  chooseAction: (g) => new Promise((resolve) => {
    const player = g.players[0];
    const selfActions = [];
    if (canSelfDrawWin(player.hand, player.melds)) selfActions.push({ type: 'self-win' });
    for (const tile of canConcealedKongs(player.hand)) selfActions.push({ type: 'concealed-kong', tile });
    for (const tile of canAddedKongs(player.hand, player.melds)) selfActions.push({ type: 'added-kong', tile });
    pending = { kind: 'action', resolve, selfActions };
    render();
  }),
  chooseClaim: (g, seat, options) => new Promise((resolve) => {
    pending = { kind: 'claim', resolve, options };
    render();
  }),
};

// 电脑 agent
function computerAgent() {
  return {
    chooseAction: async (g, seat) => { const action = decideAction(g, seat); await delay(); return action; },
    chooseClaim: async (g, seat, options) => { const intent = decideClaim(g, seat, options); await delay(); return intent; },
  };
}

const agents = [humanAgent, computerAgent(), computerAgent(), computerAgent()];

function resolvePending(value) {
  const p = pending;
  pending = null;
  p.resolve(value);
}

function startNewHand() {
  if (controller) controller.abort();
  controller = new AbortController();
  game = createInitialGame();
  reviewRecords = [];
  pending = null;
  currentRecommendation = recommendCurrentHand();
  render();
  runHand(game, agents, { delay, onUpdate, signal: controller.signal }).catch(() => {});
}

app.addEventListener('click', (event) => {
  if (event.target.closest('.new-hand-button')) { startNewHand(); return; }

  // 玩家出牌（仅当引擎在等玩家动作时）
  const tileButton = event.target.closest('.player-hand:not(.is-disabled) .tile[data-discard-index]');
  if (tileButton && pending?.kind === 'action') {
    const index = Number(tileButton.dataset.discardIndex);
    const tile = game.players[0].hand[index];
    reviewRecords = recordDecision(reviewRecords, { turn: reviewRecords.length + 1, chosenDiscard: tile, recommendation: currentRecommendation });
    resolvePending({ type: 'discard', tile });
    return;
  }

  const selfActionEl = event.target.closest('[data-self-action-index]');
  if (selfActionEl && pending?.kind === 'action') {
    resolvePending(pending.selfActions[Number(selfActionEl.dataset.selfActionIndex)]);
    return;
  }

  const claimEl = event.target.closest('[data-claim-index]');
  if (claimEl && pending?.kind === 'claim') {
    resolvePending(pending.options[Number(claimEl.dataset.claimIndex)]);
    return;
  }
  if (event.target.closest('[data-claim-pass]') && pending?.kind === 'claim') {
    resolvePending({ type: 'pass' });
  }
});

startNewHand();
```

- [ ] **Step 2: 浏览器人工验证（核心流程）**

启动预览，打开页面。逐项确认：
1. 开局后电脑按 ~1 秒逐个行动（看牌墙数下降、弃牌出现、回合高亮转移）。
2. 轮到玩家时手牌可点击出牌；非己回合手牌呈禁用态。
3. 当别家打出你能碰/吃/杠/胡的牌时，出现 `碰/杠/吃/胡/过` 按钮，点击生效，副露出现在你手牌上方。
4. 有人胡牌或流局时弹出结局横幅，点「新开一局」可重开（旧循环被 AbortController 取消，不串局）。

- [ ] **Step 3: Commit**

```bash
git add src/main.js
git commit -m "main: wire turn-engine with human Promise bridge and computer agents"
```

---

## Task 10: styles.css — 新 UI 样式

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: 追加样式**（追加到文件末尾，放在媒体查询之前合适位置；保持现有变量风格）

```css
/* 回合高亮 */
.seat.is-active,
.player-zone.is-active {
  outline: 2px solid #ffe27a;
  outline-offset: 2px;
}

/* 玩家区域：副露 + 控件 + 手牌 */
.player-zone {
  position: absolute;
  right: 32px;
  bottom: 28px;
  left: 32px;
  display: grid;
  gap: 8px;
}

.player-hand.is-disabled {
  opacity: 0.7;
  pointer-events: none;
}

/* 副露 */
.melds-strip { display: flex; flex-wrap: wrap; gap: 8px; }
.meld-group { display: inline-flex; gap: 2px; padding: 2px; border-radius: 4px; background: rgba(0, 0, 0, 0.18); }
.meld-group.is-concealed { opacity: 0.85; }
.meld-tile { width: 20px; height: 26px; display: inline-grid; place-items: center; background: linear-gradient(180deg, #fffdf6, #ece0c5); border-radius: 3px; }
.meld-tile .tile-face { width: 100%; height: 100%; display: block; }
.seat .melds-strip { margin-top: 6px; justify-content: center; }

/* 认领 / 自动作按钮 */
.claim-bar, .self-action-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.claim-button, .self-action-button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #73d38f;
  border-radius: 8px;
  background: #3eb969;
  color: #082017;
  font-weight: 800;
  cursor: pointer;
}
.claim-button:hover, .self-action-button:hover { background: #56d17f; }
.claim-pass { border-color: #888; background: #2a322f; color: #dce8e1; }

/* 动作浮标 */
.action-flash {
  position: absolute;
  top: 38%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  padding: 6px 22px;
  border-radius: 12px;
  background: rgba(255, 226, 122, 0.92);
  color: #1b2422;
  font-size: 40px;
  font-weight: 900;
  pointer-events: none;
  animation: action-flash-pop 0.9s ease forwards;
}
@keyframes action-flash-pop {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); }
  25% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
  70% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -70%) scale(1); }
}

/* 结局横幅 */
.result-banner {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  background: rgba(0, 0, 0, 0.55);
}
.result-card {
  display: grid; gap: 12px; justify-items: center;
  padding: 28px 36px;
  border: 1px solid #ffe27a; border-radius: 12px;
  background: #1b2422; color: #f4f7f1;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
.result-card h2 { margin: 0; color: #ffe27a; }
.result-face { width: 56px; height: 74px; padding: 5px; border-radius: 8px; background: linear-gradient(180deg, #fffdf6, #ece0c5); }
.result-face .tile-face { width: 100%; height: 100%; display: block; }
```

把旧的 `.player-hand { position:absolute; right:32px; bottom:28px; left:32px; ... }` 中的定位职责交给 `.player-zone`：修改 `.player-hand` 规则，删除 `position/right/bottom/left`，保留 `display:grid; grid-template-columns: repeat(14, minmax(38px,1fr)); gap:8px;`。

移动端媒体查询里 `.player-hand` 的 `position:static` 覆盖改为作用于 `.player-zone`（把 `.player-hand` 加入 static 列表即可，已在 `position:static` 组中——同时把 `.player-zone` 加入该组）。

- [ ] **Step 2: 浏览器人工验证（视觉）**

预览确认：玩家副露条显示在手牌上方、认领按钮醒目可点、回合高亮清晰、结局横幅居中且「新开一局」可用；窄屏布局不塌陷。用 preview_screenshot 截图核对。

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "styles: melds, claim controls, turn highlight, result banner"
```

---

## Task 11: 端到端验证与收尾

**Files:** 无新增（验证 + 文档勾选）

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿。各测试文件：tiles / random(若有) / rules / game-state / melds / patterns / claims / ai / turn-engine / recommendation / review / tile-face。

- [ ] **Step 2: 浏览器整局走查**

启动预览，连续打几局，确认：
- 四家按 ~1 秒节奏推进，动作（摸/打/碰/吃/杠/胡）可观察。
- 玩家认领（碰/杠/吃/胡）与「过」均生效，优先级正确（胡盖过碰）。
- 自摸/暗杠/补杠按钮在可用时出现并生效；补杠被抢杠时正确判负。
- 胡牌横幅显示 谁胡·胡哪张·方式·牌型名；流局正确；「新开一局」不串局。
- 座位顺序为 0→下家→对家→上家（修正后）。

- [ ] **Step 3: 视觉抽查截图**

用 preview_screenshot 截 1–2 张（含一局结束横幅），核对观感。

- [ ] **Step 4: 完成提交（若有零散修复）**

```bash
git add -A
git commit -m "turn-engine: end-to-end fixes from manual verification"
```

---

## 自检（实现前已核对）

- **Spec 覆盖**：抓牌/吃/碰/杠/胡/出牌（Task 2/5/7）、玩家认领（Task 9）、~1 秒节奏（Task 9 delay）、电脑牌效+安全度（Task 6）、胡牌判定+牌型名+结束（Task 3/5/7）、座位顺序修正（Task 4/5/7 的 `(seat+3)%4`）、流局（Task 7 markDraw）、AbortController 不串局（Task 7/9）、UI 副露/回合高亮/动作浮标/认领按钮/结局横幅（Task 8/10）。
- **简化项（与 spec 一致 + 一处补充）**：杠补牌从牌墙正面摸；一炮多响取最近；不计番分；**新增**：AI 不主动暗杠/补杠（机制保留给玩家），已在 Task 6 注明。
- **类型一致性**：Meld `{type,tiles,from}`、Action `{type:'discard'|'concealed-kong'|'added-kong'|'self-win', tile?}`、Intent/Option `{type, tiles?}`、`game.lastDiscard={seat,tile}`、`game.lastDraw={seat,tile,afterKong}`、`game.result` 形状贯穿 Task 5/7/8/9 保持一致；`(seat+3)%4` 在 claims/turn-engine 一致。
- **无占位**：各步含完整代码与确切命令。
```
