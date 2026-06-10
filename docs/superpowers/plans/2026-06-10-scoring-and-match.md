# 番种计分 + 多局连战 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 经典长沙计分（小胡 1 分 / 大胡 6×2^(n-1) 叠加翻倍）+ 无限连战累计积分、胡者做庄流局连庄。

**Architecture:** 方案 A：纯函数 `scoring.js`（番分与付分）+ `match.js`（跨局牌桌状态）叠在单局引擎之上；`patterns.js` 增 `identifyPatterns` 返回全部大胡；`game-state` 支持 `dealerSeat`；turn-engine 在胜利分支带出 `result.patterns` 与海底 ctx；main/UI 接积分条与结算横幅。

**Tech Stack:** 原生 JS ESM、零依赖、node:test、浏览器直接运行。

Spec: [docs/superpowers/specs/2026-06-10-scoring-and-match-design.md](../specs/2026-06-10-scoring-and-match-design.md)

---

## 共享数据形状（贯穿所有任务）

```js
// scoring.scoreWin 输入/输出
scoreWin({ bigPatterns: string[], winType: 'discard'|'self-draw'|'rob-kong', winner: seat, loser: seat|null })
// → { category:'大胡'|'小胡', base, multiplier, total, payments:[{seat, delta}] }  // delta 总和为 0

// match
createMatch() // → { scores:[0,0,0,0], handIndex:0, dealerSeat:0 }
settleHand(match, game) // → { match, settlement: scoreWin结果|null }

// game.result 在 T5 后新增 patterns: string[]（大胡列表，可空）
// 按钮类名：.next-hand-button（下一局，保留积分）/ .reset-match-button（重新开桌，清零）
// renderApp 新 props：match、settlement
```

---

## Task 1: patterns.js — identifyPatterns（全部大胡）

**Files:**
- Modify: `src/core/patterns.js`
- Test: `tests/patterns.test.mjs`

- [ ] **Step 1: 写失败测试**（追加到 `tests/patterns.test.mjs`，import 处加 `identifyPatterns`）

```js
test('identifyPatterns returns empty array for a plain hand', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 5], ['tong', 5],
  ]);
  assert.deepEqual(identifyPatterns(concealed, [], t('wan', 1), { selfDraw: true }), []);
});

test('identifyPatterns stacks 清一色 and 碰碰胡', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 1], ['wan', 1],
    ['wan', 3], ['wan', 3], ['wan', 3],
    ['wan', 5], ['wan', 5], ['wan', 5],
    ['wan', 7], ['wan', 7], ['wan', 7],
    ['wan', 9], ['wan', 9],
  ]);
  const result = identifyPatterns(concealed, [], t('wan', 9), {});
  assert.ok(result.includes('清一色'));
  assert.ok(result.includes('碰碰胡'));
});

test('identifyPatterns detects 将将胡 (all tiles rank 2/5/8)', () => {
  const concealed = hand([
    ['wan', 2], ['wan', 2], ['wan', 2],
    ['wan', 5], ['wan', 5], ['wan', 5],
    ['wan', 8], ['wan', 8], ['wan', 8],
    ['tong', 2], ['tong', 2], ['tong', 2],
    ['tong', 5], ['tong', 5],
  ]);
  const result = identifyPatterns(concealed, [], t('tong', 5), {});
  assert.ok(result.includes('将将胡'));
});

test('identifyPatterns adds 海底捞月 only on self-draw with haidi ctx', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 5], ['tong', 5],
  ]);
  assert.ok(identifyPatterns(concealed, [], t('tong', 5), { selfDraw: true, haidi: true }).includes('海底捞月'));
  assert.ok(!identifyPatterns(concealed, [], t('tong', 5), { haidi: true }).includes('海底捞月'));
});

test('identifyPatterns includes 抢杠胡 and 杠上花 from ctx', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 5], ['tong', 5],
  ]);
  assert.ok(identifyPatterns(concealed, [], t('tong', 5), { robKong: true }).includes('抢杠胡'));
  assert.ok(identifyPatterns(concealed, [], t('tong', 5), { afterKong: true, selfDraw: true }).includes('杠上花'));
});
```

- [ ] **Step 2:** `node --test tests/patterns.test.mjs` → FAIL（identifyPatterns 未导出）。
- [ ] **Step 3: 实现**（`src/core/patterns.js`；`identifyPattern` 保持原样不动，新增独立函数）

```js
import { countTiles } from './tiles.js';
import { isJiangTile } from './rules.js';

// （isFlush / isAllTriplets / identifyPattern 原样保留）

// 返回全部命中的大胡名（可空）。ctx = { selfDraw?, afterKong?, robKong?, haidi? }
export function identifyPatterns(concealed, melds, winningTile, ctx = {}) {
  const allTiles = [...concealed, ...melds.flatMap((meld) => meld.tiles)];
  const patterns = [];
  if (ctx.robKong) patterns.push('抢杠胡');
  if (ctx.afterKong && ctx.selfDraw) patterns.push('杠上花');
  if (ctx.haidi && ctx.selfDraw) patterns.push('海底捞月');
  if (isFlush(allTiles)) patterns.push('清一色');
  if (allTiles.length > 0 && allTiles.every((tile) => isJiangTile(tile))) patterns.push('将将胡');
  if (isAllTriplets(concealed, melds)) patterns.push('碰碰胡');
  return patterns;
}
```

- [ ] **Step 4:** `node --test tests/patterns.test.mjs` → PASS（原有 5 个 identifyPattern 测试不受影响）。
- [ ] **Step 5:** `npm test` 全绿后 commit：
```bash
git add src/core/patterns.js tests/patterns.test.mjs
git commit -m "patterns: identifyPatterns lists all big-win patterns (incl. 将将胡/海底捞月)"
```

---

## Task 2: scoring.js — 番分与付分

**Files:**
- Create: `src/core/scoring.js`
- Test: `tests/scoring.test.mjs`

- [ ] **Step 1: 写失败测试**（`tests/scoring.test.mjs`）

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreWin } from '../src/core/scoring.js';

const sum = (payments) => payments.reduce((acc, p) => acc + p.delta, 0);

test('small win by discard: loser pays 1', () => {
  const s = scoreWin({ bigPatterns: [], winType: 'discard', winner: 2, loser: 0 });
  assert.equal(s.category, '小胡');
  assert.equal(s.total, 1);
  assert.deepEqual(s.payments.find((p) => p.seat === 2), { seat: 2, delta: 1 });
  assert.deepEqual(s.payments.find((p) => p.seat === 0), { seat: 0, delta: -1 });
  assert.equal(sum(s.payments), 0);
});

test('small win by self-draw: three each pay 1, winner +3', () => {
  const s = scoreWin({ bigPatterns: [], winType: 'self-draw', winner: 1, loser: null });
  assert.equal(s.payments.find((p) => p.seat === 1).delta, 3);
  for (const seat of [0, 2, 3]) assert.equal(s.payments.find((p) => p.seat === seat).delta, -1);
  assert.equal(sum(s.payments), 0);
});

test('one big pattern = 6, two stack to 12', () => {
  assert.equal(scoreWin({ bigPatterns: ['清一色'], winType: 'discard', winner: 0, loser: 1 }).total, 6);
  const s = scoreWin({ bigPatterns: ['清一色', '碰碰胡'], winType: 'self-draw', winner: 0, loser: null });
  assert.equal(s.category, '大胡');
  assert.equal(s.total, 12);
  assert.equal(s.payments.find((p) => p.seat === 0).delta, 36); // 三家各付 12
});

test('rob-kong pays like discard: the robbed seat single-pays', () => {
  const s = scoreWin({ bigPatterns: ['抢杠胡'], winType: 'rob-kong', winner: 3, loser: 1 });
  assert.equal(s.payments.find((p) => p.seat === 1).delta, -6);
  assert.equal(s.payments.find((p) => p.seat === 3).delta, 6);
  assert.equal(sum(s.payments), 0);
});
```

- [ ] **Step 2:** `node --test tests/scoring.test.mjs` → FAIL（模块不存在）。
- [ ] **Step 3: 实现**（`src/core/scoring.js`）

```js
const BIG_BASE = 6;
const SMALL_BASE = 1;
const SEATS = [0, 1, 2, 3];

// 经典长沙：小胡 1 分；大胡 6 × 2^(n-1)。点炮/抢杠放炮者单付；自摸三家各付。
export function scoreWin({ bigPatterns = [], winType, winner, loser = null }) {
  const isBig = bigPatterns.length > 0;
  const multiplier = isBig ? 2 ** (bigPatterns.length - 1) : 1;
  const base = isBig ? BIG_BASE : SMALL_BASE;
  const total = base * multiplier;

  const payments = SEATS.map((seat) => {
    if (winType === 'self-draw') {
      return { seat, delta: seat === winner ? total * 3 : -total };
    }
    if (seat === winner) return { seat, delta: total };
    return { seat, delta: seat === loser ? -total : 0 };
  });

  return { category: isBig ? '大胡' : '小胡', base, multiplier, total, payments };
}
```

- [ ] **Step 4:** PASS 后 `npm test` 全绿。
- [ ] **Step 5: Commit**
```bash
git add src/core/scoring.js tests/scoring.test.mjs
git commit -m "scoring: classic Changsha small/big win payouts"
```

---

## Task 3: match.js — 牌桌层

**Files:**
- Create: `src/core/match.js`
- Test: `tests/match.test.mjs`

- [ ] **Step 1: 写失败测试**（`tests/match.test.mjs`）

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { createMatch, settleHand } from '../src/core/match.js';

const winGame = (over = {}) => ({
  result: { type: 'win', winner: 2, loser: 0, winType: 'discard', patterns: [], ...over },
});

test('createMatch starts zeroed with dealer 0', () => {
  assert.deepEqual(createMatch(), { scores: [0, 0, 0, 0], handIndex: 0, dealerSeat: 0 });
});

test('settleHand applies payments and makes the winner dealer', () => {
  const { match, settlement } = settleHand(createMatch(), winGame());
  assert.equal(settlement.total, 1);
  assert.deepEqual(match.scores, [-1, 0, 1, 0]);
  assert.equal(match.dealerSeat, 2);
  assert.equal(match.handIndex, 1);
});

test('settleHand stacks scores across hands (big self-draw)', () => {
  const first = settleHand(createMatch(), winGame());
  const second = settleHand(first.match, winGame({
    winner: 1, loser: null, winType: 'self-draw', patterns: ['清一色'],
  }));
  assert.deepEqual(second.match.scores, [-7, 18, -5, -6]); // -1-6, 0+18, 1-6, 0-6
  assert.equal(second.match.dealerSeat, 1);
  assert.equal(second.match.handIndex, 2);
});

test('settleHand on a draw keeps scores and dealer (连庄), null settlement', () => {
  const start = { scores: [3, -1, -1, -1], handIndex: 4, dealerSeat: 2 };
  const { match, settlement } = settleHand(start, { result: { type: 'draw' } });
  assert.equal(settlement, null);
  assert.deepEqual(match.scores, [3, -1, -1, -1]);
  assert.equal(match.dealerSeat, 2);
  assert.equal(match.handIndex, 5);
  assert.deepEqual(start.scores, [3, -1, -1, -1]); // 不可变
});
```

- [ ] **Step 2:** FAIL（模块不存在）。
- [ ] **Step 3: 实现**（`src/core/match.js`）

```js
import { scoreWin } from './scoring.js';

export function createMatch() {
  return { scores: [0, 0, 0, 0], handIndex: 0, dealerSeat: 0 };
}

// 局终结算：胡者做庄，流局连庄；返回新 match（不可变）与 settlement（流局为 null）
export function settleHand(match, game) {
  const result = game.result;
  if (!result || result.type !== 'win') {
    return {
      match: { ...match, scores: [...match.scores], handIndex: match.handIndex + 1 },
      settlement: null,
    };
  }

  const settlement = scoreWin({
    bigPatterns: result.patterns ?? [],
    winType: result.winType,
    winner: result.winner,
    loser: result.loser,
  });
  const scores = match.scores.map((score, seat) => (
    score + (settlement.payments.find((p) => p.seat === seat)?.delta ?? 0)
  ));

  return {
    match: { scores, handIndex: match.handIndex + 1, dealerSeat: result.winner },
    settlement,
  };
}
```

- [ ] **Step 4:** PASS + `npm test` 全绿。
- [ ] **Step 5: Commit**
```bash
git add src/core/match.js tests/match.test.mjs
git commit -m "match: cross-hand scores, winner-takes-dealer, draw keeps dealer"
```

---

## Task 4: game-state — dealerSeat 发牌

**Files:**
- Modify: `src/core/game-state.js`
- Test: `tests/game-state.test.mjs`

- [ ] **Step 1: 写失败测试**（追加）

```js
test('createInitialGame deals 14 tiles to a non-zero dealer who acts first', () => {
  const game = createInitialGame({ seed: 1234, dealerSeat: 2 });
  assert.equal(game.players[2].hand.length, 14);
  for (const seat of [0, 1, 3]) assert.equal(game.players[seat].hand.length, 13);
  assert.equal(game.currentPlayer, 2);
  assert.equal(game.wall.length, 55);
  assert.equal(typeof game.players[2].flags.initialNoJiang, 'boolean');
});
```

- [ ] **Step 2:** FAIL。
- [ ] **Step 3: 实现** — 替换 `createInitialGame`：

```js
export function createInitialGame({ seed = Date.now(), dealerSeat = 0 } = {}) {
  const originalWall = shuffle(createTileSet(), createSeededRandom(seed));
  const handSizes = [13, 13, 13, 13];
  handSizes[dealerSeat] = 14;

  let cursor = 0;
  const players = handSizes.map((size) => {
    const hand = sortTiles(originalWall.slice(cursor, cursor + size));
    cursor += size;
    return createPlayer(hand);
  });

  return {
    seed,
    players,
    wall: originalWall.slice(cursor),
    currentPlayer: dealerSeat,
    phase: 'awaiting-discard',
    history: [],
    lastDiscard: null,
    lastDraw: null,
    result: null,
  };
}
```

注意：默认 `dealerSeat=0` 时发牌顺序与原实现一致（依次切片），既有 `createInitialGame deals...` 测试必须保持绿色。

- [ ] **Step 4:** PASS + `npm test` 全绿。
- [ ] **Step 5: Commit**
```bash
git add src/core/game-state.js tests/game-state.test.mjs
git commit -m "game-state: dealerSeat option (14 tiles + first move to dealer)"
```

---

## Task 5: turn-engine — 海底 ctx + result.patterns

**Files:**
- Modify: `src/core/turn-engine.js`, `src/core/game-state.js`（applyWin 一行）
- Test: `tests/turn-engine.test.mjs`

- [ ] **Step 1: 写失败测试**（追加；该文件已有 makeGame/scripted/passAgent/handOf/t/noDelay 工具）

```js
test('haidi self-draw win reports 海底捞月 in result.patterns', async () => {
  const game = makeGame({
    currentPlayer: 0,
    wall: [],
    lastDraw: { seat: 0, tile: t('tiao', 1), afterKong: false },
  });
  game.players[0].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  const agents = [scripted({ actions: [{ type: 'self-win' }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.ok(Array.isArray(result.result.patterns));
  assert.ok(result.result.patterns.includes('海底捞月'));
});

test('non-haidi self-draw does not report 海底捞月', async () => {
  const game = makeGame({
    currentPlayer: 0,
    wall: [t('tong', 9)],
    lastDraw: { seat: 0, tile: t('tiao', 1), afterKong: false },
  });
  game.players[0].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  const agents = [scripted({ actions: [{ type: 'self-win' }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.ok(!result.result.patterns.includes('海底捞月'));
});
```

- [ ] **Step 2:** FAIL（result.patterns 为 undefined）。
- [ ] **Step 3: 实现**

(a) `src/core/game-state.js` 的 `applyWin` result 对象增加一行：

```js
      pattern: info.pattern,
      patterns: info.patterns ?? [],
```

(b) `src/core/turn-engine.js`：import 增加 `identifyPatterns`（来自 './patterns.js'，与 identifyPattern 并列）。三个胜利分支改为同时计算 patterns 并传入 applyWin：

自摸分支（替换原 self-win 块的 pattern 计算与 applyWin 调用）：

```js
    if (action.type === 'self-win') {
      const tile = game.lastDraw?.tile ?? action.tile;
      const ctx = { selfDraw: true, afterKong: !!game.lastDraw?.afterKong, haidi: game.wall.length === 0 };
      const concealed = winningConcealed(game.players[seat]);
      const patterns = identifyPatterns(concealed, game.players[seat].melds, tile, ctx);
      const pattern = identifyPattern(concealed, game.players[seat].melds, tile, ctx);
      game = applyWin(game, seat, { winType: 'self-draw', tile, loser: null, afterKong: ctx.afterKong, pattern, patterns });
      onUpdate(game);
      continue;
    }
```

抢杠分支（findRobKong 命中后）：

```js
          const concealed = winningConcealed(game.players[robber], action.tile);
          const ctx = { robKong: true };
          const patterns = identifyPatterns(concealed, game.players[robber].melds, action.tile, ctx);
          const pattern = identifyPattern(concealed, game.players[robber].melds, action.tile, ctx);
          game = applyWin(game, robber, { winType: 'rob-kong', tile: action.tile, loser: seat, afterKong: false, pattern, patterns });
```

点炮分支（claim 'win'）：

```js
    if (winner.claim.type === 'win') {
      const concealed = winningConcealed(game.players[winner.seat], claimedTile);
      const patterns = identifyPatterns(concealed, game.players[winner.seat].melds, claimedTile, {});
      const pattern = identifyPattern(concealed, game.players[winner.seat].melds, claimedTile, {});
      game = applyWin(game, winner.seat, { winType: 'discard', tile: claimedTile, loser: seat, afterKong: false, pattern, patterns });
    }
```

- [ ] **Step 4:** PASS + `npm test` 全绿（既有 self-draw 测试断言 winType/pattern 不受影响）。
- [ ] **Step 5: Commit**
```bash
git add src/core/turn-engine.js src/core/game-state.js tests/turn-engine.test.mjs
git commit -m "turn-engine: haidi ctx + result.patterns via identifyPatterns"
```

---

## Task 6: main + UI — 牌桌接线、积分条、结算横幅

DOM 层无 node 单测，验证靠 `node --check` + DOM 桩烟测 + 浏览器。

**Files:**
- Modify: `src/main.js`, `src/ui/render.js`, `src/ui/overlays.js`, `src/styles.css`

- [ ] **Step 1: main.js**

(a) import 增加：`import { createMatch, settleHand } from './core/match.js';`
(b) 模块状态增加：

```js
let match = createMatch();
let lastSettlement = null;
let handSettled = false;
```

(c) `onUpdate` 在 hand-over 时结算一次（onUpdate 在终局会触发多次，需 handSettled 守卫）：

```js
function onUpdate(next) {
  game = next;
  if (game.phase === 'hand-over' && !handSettled) {
    handSettled = true;
    const outcome = settleHand(match, game);
    match = outcome.match;
    lastSettlement = outcome.settlement;
  }
  if (game.phase === 'awaiting-discard' && game.currentPlayer === 0) {
    currentRecommendation = recommendCurrentHand();
  }
  render();
}
```

(d) `startNewHand` 改为带重置语义的 `startHand`：

```js
function startHand({ resetMatch = false } = {}) {
  if (controller) controller.abort();
  controller = new AbortController();
  if (resetMatch) match = createMatch();
  handSettled = false;
  lastSettlement = null;
  game = createInitialGame({ dealerSeat: match.dealerSeat });
  reviewRecords = [];
  operationReviewRecords = [];
  pending = null;
  currentRecommendation = recommendCurrentHand();
  render();
  runHand(game, agents, { delay, onUpdate, signal: controller.signal }).catch(() => {});
}
```

注意：非庄家开局只有 13 张，`recommendCurrentHand` 仍可计算（13 张向听），无碍。文件末尾启动调用改为 `startHand()`。

(e) 点击处理：删除 `.new-hand-button` 分支，换成：

```js
  if (event.target.closest('.next-hand-button')) { startHand(); return; }
  if (event.target.closest('.reset-match-button')) { startHand({ resetMatch: true }); return; }
```

(f) `render()` 传新 props：

```js
  renderApp({
    game,
    recommendation: currentRecommendation,
    reviewSummary: summarizeReview(reviewRecords),
    operationReviewSummary: summarizeOperationReview(operationReviewRecords),
    interaction,
    adviceCollapsed,
    match,
    settlement: lastSettlement,
  });
```

- [ ] **Step 2: render.js**

(a) `renderApp` 签名增加 `match, settlement`。
(b) 新增积分条（放 center-area 的 wall-status 之前）：

```js
// 第 N 局：终局时显示刚结束的一局（settle 已使 handIndex 指向下一局）
function scoreboard(match, phase) {
  if (!match) return '';
  const handNo = phase === 'hand-over' ? match.handIndex : match.handIndex + 1;
  const cells = PLAYER_NAMES.map((name, seat) => `
    <span class="score-cell${seat === match.dealerSeat ? ' is-dealer' : ''}">
      <b>${escapeHtml(name)}</b>${seat === match.dealerSeat ? '<i class="dealer-badge">庄</i>' : ''}
      <em>${escapeHtml(match.scores[seat])}</em>
    </span>`).join('');
  return `<div class="scoreboard"><span class="hand-no">第 ${escapeHtml(handNo)} 局</span>${cells}</div>`;
}
```

center-area 内：

```js
      <div class="center-area">
        ${scoreboard(match, game.phase)}
        <div class="wall-status">…（原样）
```

(c) 结局横幅调用改为 `resultBanner(game, PLAYER_NAMES, settlement)`。
(d) advice-panel 底部按钮替换：

```js
        <button class="next-hand-button" type="button">下一局</button>
        <button class="reset-match-button" type="button">重新开桌</button>
```

- [ ] **Step 3: overlays.js — resultBanner 升级**

签名 `resultBanner(game, names, settlement)`；流局与胡牌横幅按钮统一换成两个新按钮；胡牌横幅在明牌之上加番种与分数行：

```js
function settlementBlock(settlement, names, result) {
  if (!settlement) return '';
  const fanText = result.patterns?.length
    ? `${result.patterns.join(' × ')} → ${settlement.total} 分`
    : `平胡 · ${settlement.total} 分`;
  const deltas = settlement.payments
    .filter((p) => p.delta !== 0)
    .map((p) => `<span class="delta ${p.delta > 0 ? 'is-plus' : 'is-minus'}">${escapeHtml(names[p.seat])} ${p.delta > 0 ? '+' : ''}${escapeHtml(p.delta)}</span>`)
    .join('');
  return `
    <div class="settlement">
      <p class="fan-line">${escapeHtml(fanText)}</p>
      <div class="delta-line">${deltas}</div>
    </div>
  `;
}

const BANNER_BUTTONS = `
  <div class="banner-buttons">
    <button class="next-hand-button" type="button">下一局</button>
    <button class="reset-match-button" type="button">重新开桌</button>
  </div>
`;

export function resultBanner(game, names, settlement) {
  const result = game?.result;
  if (!result) return '';
  if (result.type === 'draw') {
    return `<div class="result-banner"><div class="result-card"><h2>流局</h2><p class="result-way">连庄，积分不变</p>${BANNER_BUTTONS}</div></div>`;
  }
  const who = names[result.winner];
  const way = result.winType === 'self-draw' ? '自摸' : result.winType === 'rob-kong' ? '抢杠胡' : `点炮（${names[result.loser]} 放炮）`;
  return `<div class="result-banner"><div class="result-card">
    <h2>${escapeHtml(who)} 胡牌</h2>
    <p class="result-way">${escapeHtml(way)} · ${escapeHtml(result.pattern)}</p>
    ${settlementBlock(settlement, names, result)}
    ${revealHand(game.players[result.winner], result)}
    ${BANNER_BUTTONS}
  </div></div>`;
}
```

注意 `escapeHtml` 内嵌 fanText 时 `→` 是普通字符无需处理；`tests/overlays.test.mjs` 既有 3 个测试调用 `resultBanner(game, names)`（两参）——settlement 为 undefined 时 settlementBlock 返回空串，断言仍应全绿；其中按钮断言若有 `.new-hand-button` 引用需同步改为新按钮类名（检查并更新该测试文件）。

- [ ] **Step 4: styles.css 追加**

```css
/* 积分条 */
.scoreboard {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  color: #dff5e6;
  font-size: 13px;
}
.hand-no { color: #ffe27a; font-weight: 700; }
.score-cell { display: inline-flex; align-items: center; gap: 4px; }
.score-cell em { color: #fff2aa; font-style: normal; font-weight: 800; }
.score-cell.is-dealer b { color: #ffe27a; }
.dealer-badge {
  display: inline-grid; place-items: center;
  width: 16px; height: 16px;
  border-radius: 50%;
  background: #ffcf3f; color: #1b2422;
  font-size: 10px; font-weight: 900; font-style: normal;
}

/* 结算 */
.settlement { display: grid; gap: 6px; justify-items: center; }
.fan-line { margin: 0; color: #ffe27a; font-weight: 800; }
.delta-line { display: flex; gap: 12px; flex-wrap: wrap; }
.delta.is-plus { color: #6bd18b; font-weight: 700; }
.delta.is-minus { color: #ff8d7a; font-weight: 700; }

.banner-buttons { display: flex; gap: 10px; }
.reset-match-button {
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid #888;
  border-radius: 8px;
  background: #2a322f;
  color: #dce8e1;
  cursor: pointer;
  font-weight: 700;
}
.reset-match-button:hover { border-color: #ffe27a; color: #ffe27a; }
.next-hand-button { /* 与原 .new-hand-button 同样式 */
  min-height: 42px;
  padding: 0 14px;
  border: 1px solid #73d38f;
  border-radius: 8px;
  background: #3eb969;
  color: #082017;
  cursor: pointer;
  font-weight: 800;
}
.next-hand-button:hover { background: #56d17f; }
```

同时检查旧 `.new-hand-button` 样式块：advice-panel 中已无该按钮，样式可保留或删除（建议删除避免死样式；先 grep 确认无引用）。

- [ ] **Step 5: 验证**

```bash
node --check src/main.js && node --check src/ui/render.js && node --check src/ui/overlays.js
npm test   # overlays.test 若引用旧按钮类名需同步更新后全绿
```
再跑 DOM 桩烟测（项目根创建临时 __smoke.mjs，模式同前：document/querySelector 桩 + import main.js + 断言 innerHTML 含 `scoreboard`、`第 1 局`、`下一局`），通过后删除。

- [ ] **Step 6: Commit**
```bash
git add src/main.js src/ui/render.js src/ui/overlays.js src/styles.css tests/overlays.test.mjs
git commit -m "ui+main: match scoreboard, settlement banner, next-hand/reset-match flow"
```

---

## Task 7: 端到端验证 + 推送

- [ ] **Step 1:** `npm test` 全绿（预计 ~135+）。
- [ ] **Step 2:** 浏览器/预览验证：积分条显示四家分数与庄标识；打完一局后横幅显示番种与 ± 分数；「下一局」积分保留且胡者做庄（庄家先手、14 张）；「重新开桌」清零回到玩家做庄；流局连庄。
- [ ] **Step 3:** `git push origin feature/scoring-match`，汇报结果。

---

## 自检（写计划时已核对）

- **Spec 覆盖**：identifyPatterns+将将胡+海底(T1)、计分付分(T2)、match/连庄/做庄(T3)、dealerSeat(T4)、haidi ctx+result.patterns(T5)、积分条/结算横幅/下一局/重新开桌(T6)、端到端(T7)。排除项（杠即时分/海底炮/AI 分数策略）无任务，正确。
- **类型一致**：`scoreWin({bigPatterns,winType,winner,loser})` 与 settleHand 调用一致；`result.patterns` T5 产出、T3 stub/T6 显示消费；按钮类名 `.next-hand-button`/`.reset-match-button` 在 main/render/overlays/styles 一致；`renderApp` 新 props `match`/`settlement` 两端一致。
- **无占位**：各步含完整代码与命令。
- **兼容**：identifyPattern 原样保留（其 5 个既有测试不动）；resultBanner 两参调用兼容（overlays.test 按钮断言需检查更新，已在 T3/T5 步骤注明）。
