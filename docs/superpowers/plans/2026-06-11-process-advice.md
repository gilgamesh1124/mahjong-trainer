# 推荐过程化解释 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 推荐/备选解释从"几出几进"升级为过程叙述：手牌结构分解（面子/将/搭子+等张/孤张）+ 1 向时的进张后听张展望。

**Architecture:** 新纯函数 `decompose.js`（27 格回溯记录最优分解，向听与 `shantenWithMelds` 严格一致）；`recommendation.js` 每候选附 `decomposition`、前三候选且 shanten===1 时附 `outlook`（进张→最优弃→听张）；UI 过程块（推荐默认展开、备选点击展开）。

**Tech Stack:** 原生 JS ESM、零依赖、node:test、浏览器直接运行。

Spec: [docs/superpowers/specs/2026-06-11-process-advice-design.md](../specs/2026-06-11-process-advice-design.md)

---

## 共享数据形状

```js
// decomposeHand 返回
{ shanten,
  sets:     [{ type:'run'|'triplet', tiles: Tile[3] }],
  pair:     Tile[2] | null,
  taatsu:   [{ tiles: Tile[2], waits: Tile[] }],
  floaters: Tile[] }
// 不变量①：shanten === shantenWithMelds(concealed, meldCount, opts)
// 不变量②：sets*3 + (pair?2:0) + taatsu*2 + floaters.length === concealed.length

// recommendation choice 新增
choice.decomposition  // 上述结构（所有候选）
choice.outlook        // 仅排序后前三且 shanten===1：
// [{ tile, remaining, waits:[{tile, remaining}], waitTotal }]

// UI 状态：main.js expandedChoiceIndex: number|null；render props 增 expandedChoiceIndex
```

---

## Task P1: decompose.js — 手牌分解器

**Files:**
- Create: `src/core/decompose.js`
- Test: `tests/decompose.test.mjs`

- [ ] **Step 1: 写失败测试**（`tests/decompose.test.mjs`）

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeHand, taatsuWaits } from '../src/core/decompose.js';
import { shantenWithMelds } from '../src/core/rules.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

function tileCount(d) {
  return d.sets.length * 3 + (d.pair ? 2 : 0) + d.taatsu.length * 2 + d.floaters.length;
}

test('taatsuWaits: 对倒/两面/边张/嵌张', () => {
  assert.deepEqual(taatsuWaits([t('wan', 5), t('wan', 5)]), [t('wan', 5)]);
  assert.deepEqual(taatsuWaits([t('wan', 4), t('wan', 5)]), [t('wan', 3), t('wan', 6)]);
  assert.deepEqual(taatsuWaits([t('wan', 1), t('wan', 2)]), [t('wan', 3)]);
  assert.deepEqual(taatsuWaits([t('wan', 8), t('wan', 9)]), [t('wan', 7)]);
  assert.deepEqual(taatsuWaits([t('wan', 4), t('wan', 6)]), [t('wan', 5)]);
});

test('complete winning hand decomposes to 4 sets + pair', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tiao', 2], ['tiao', 2], ['tiao', 2],
    ['tong', 9], ['tong', 9],
  ]);
  const d = decomposeHand(concealed);
  assert.equal(d.shanten, -1);
  assert.equal(d.sets.length, 4);
  assert.deepEqual(d.pair, [t('tong', 9), t('tong', 9)]);
  assert.equal(d.taatsu.length, 0);
  assert.equal(d.floaters.length, 0);
  assert.equal(tileCount(d), 14);
});

test('tenpai hand: 3 sets + pair + one ryanmen taatsu with waits', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 9], ['tong', 9],
    ['wan', 4], ['wan', 5],
  ]);
  const d = decomposeHand(concealed);
  assert.equal(d.shanten, 0);
  assert.equal(d.sets.length, 3);
  assert.deepEqual(d.pair, [t('tong', 9), t('tong', 9)]);
  assert.equal(d.taatsu.length, 1);
  assert.deepEqual(d.taatsu[0].waits, [t('wan', 3), t('wan', 6)]);
  assert.equal(tileCount(d), 13);
});

test('floaters are identified and sorted', () => {
  // 123万 + 456筒 + 99筒 + 孤张 1条 9万 —— 远张孤立
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tong', 9], ['tong', 9],
    ['tiao', 1], ['wan', 9],
  ]);
  const d = decomposeHand(concealed, 1); // 1 副副露 → 10 张暗手
  assert.equal(tileCount(d), 10);
  assert.ok(d.floaters.length >= 1, 'isolated tiles should be floaters');
});

test('requireJiangPair restricts the pair to 2/5/8', () => {
  // 唯一对子是 9筒（非将）：将牌门槛下 pair 必须为 null
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 9], ['tong', 9],
    ['wan', 4], ['wan', 5],
  ]);
  const strict = decomposeHand(concealed, 0, { requireJiangPair: true });
  assert.equal(strict.pair, null);
  assert.equal(strict.shanten, shantenWithMelds(concealed, 0, { requireJiangPair: true }));
});

test('invariant: decomposition shanten matches shantenWithMelds on assorted hands', () => {
  const hands = [
    { concealed: hand([['wan', 1], ['wan', 1], ['wan', 2], ['tong', 5], ['tong', 5], ['tong', 7], ['tiao', 3], ['tiao', 4], ['tiao', 9], ['wan', 6], ['wan', 7], ['tong', 2], ['tiao', 1]]), melds: 0 },
    { concealed: hand([['wan', 2], ['wan', 2], ['wan', 5], ['wan', 8], ['tong', 2], ['tong', 5], ['tong', 8], ['tiao', 2], ['tiao', 5], ['tiao', 8], ['wan', 3], ['wan', 4], ['tong', 3]]), melds: 0 },
    { concealed: hand([['tong', 1], ['tong', 2], ['tong', 3], ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 7], ['tong', 8], ['tong', 9], ['wan', 5], ['wan', 5], ['tiao', 2], ['tiao', 3]]), melds: 0 },
    { concealed: hand([['wan', 1], ['wan', 4], ['wan', 7], ['tong', 1], ['tong', 4], ['tong', 7], ['tiao', 1], ['tiao', 4], ['tiao', 7], ['wan', 9], ['tong', 9], ['tiao', 9], ['wan', 2]]), melds: 0 },
    { concealed: hand([['wan', 3], ['wan', 4], ['wan', 5], ['tong', 6], ['tong', 7], ['tiao', 2], ['tiao', 2], ['wan', 8], ['wan', 8], ['tong', 1]]), melds: 1 },
    { concealed: hand([['tiao', 5], ['tiao', 6], ['tiao', 7], ['wan', 2], ['wan', 2], ['tong', 4], ['tong', 5]]), melds: 2 },
  ];
  for (const [i, { concealed, melds }] of hands.entries()) {
    for (const requireJiangPair of [false, true]) {
      const d = decomposeHand(concealed, melds, { requireJiangPair });
      assert.equal(
        d.shanten,
        shantenWithMelds(concealed, melds, { requireJiangPair }),
        `hand #${i} requireJiangPair=${requireJiangPair}`,
      );
      assert.equal(tileCount(d), concealed.length, `hand #${i} tile coverage`);
    }
  }
});
```

- [ ] **Step 2:** `node --test tests/decompose.test.mjs` → RED（模块不存在）。
- [ ] **Step 3: 实现**（`src/core/decompose.js`，完整代码）

```js
import { sortTiles } from './tiles.js';

const SUIT_BY_IDX = ['tong', 'wan', 'tiao'];
const SUIT_IDX = { tong: 0, wan: 1, tiao: 2 };

function idxToTile(index) {
  return { suit: SUIT_BY_IDX[Math.floor(index / 9)], rank: (index % 9) + 1 };
}

function isJiangIndex(index) {
  const rank = (index % 9) + 1;
  return rank === 2 || rank === 5 || rank === 8;
}

function tilesToCounts27(tiles) {
  const counts = new Array(27).fill(0);
  for (const tile of tiles) counts[SUIT_IDX[tile.suit] * 9 + (tile.rank - 1)] += 1;
  return counts;
}

// 搭子等张：对倒→同张成刻；连张→两面（边界裁剪成边张）；跳张→嵌张
export function taatsuWaits([a, b]) {
  if (a.rank === b.rank) return [{ suit: a.suit, rank: a.rank }];
  if (b.rank - a.rank === 1) {
    const waits = [];
    if (a.rank - 1 >= 1) waits.push({ suit: a.suit, rank: a.rank - 1 });
    if (b.rank + 1 <= 9) waits.push({ suit: a.suit, rank: b.rank + 1 });
    return waits;
  }
  return [{ suit: a.suit, rank: a.rank + 1 }];
}

// 与 rules.js 的 shanten 公式严格一致：8 - 2*mentsu - min(taatsu, 4-mentsu) - (有将 ? 1 : 0)
function shantenValue(setCount, taatsuCount, hasPair, meldCount) {
  const mentsu = meldCount + setCount;
  return 8 - 2 * mentsu - Math.min(taatsuCount, 4 - mentsu) - (hasPair ? 1 : 0);
}

// 回溯枚举：刻子→顺子→对塔→两面/边张→嵌张→跳过(孤张)。
// 分支顺序固定 + 严格小于才更新 best ⇒ 输出确定。
function searchGroups(counts, idx, state, best) {
  while (idx < 27 && counts[idx] === 0) idx += 1;

  if (idx === 27) {
    const value = shantenValue(state.sets.length, state.taatsu.length, state.hasPair, state.meldCount);
    if (value < best.value) {
      best.value = value;
      best.result = {
        sets: state.sets.map((s) => ({ type: s.type, tiles: [...s.tiles] })),
        taatsu: state.taatsu.map((g) => ({ tiles: [...g.tiles] })),
        floaters: [...state.floaters],
      };
    }
    return;
  }

  const rank = idx % 9;
  const tile = idxToTile(idx);

  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    state.sets.push({ type: 'triplet', tiles: [tile, tile, tile] });
    searchGroups(counts, idx, state, best);
    state.sets.pop();
    counts[idx] += 3;
  }

  if (rank <= 6 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
    counts[idx] -= 1; counts[idx + 1] -= 1; counts[idx + 2] -= 1;
    state.sets.push({ type: 'run', tiles: [tile, idxToTile(idx + 1), idxToTile(idx + 2)] });
    searchGroups(counts, idx, state, best);
    state.sets.pop();
    counts[idx] += 1; counts[idx + 1] += 1; counts[idx + 2] += 1;
  }

  if (counts[idx] >= 2) {
    counts[idx] -= 2;
    state.taatsu.push({ tiles: [tile, tile] });
    searchGroups(counts, idx, state, best);
    state.taatsu.pop();
    counts[idx] += 2;
  }

  if (rank <= 7 && counts[idx + 1] >= 1) {
    counts[idx] -= 1; counts[idx + 1] -= 1;
    state.taatsu.push({ tiles: [tile, idxToTile(idx + 1)] });
    searchGroups(counts, idx, state, best);
    state.taatsu.pop();
    counts[idx] += 1; counts[idx + 1] += 1;
  }

  if (rank <= 6 && counts[idx + 2] >= 1) {
    counts[idx] -= 1; counts[idx + 2] -= 1;
    state.taatsu.push({ tiles: [tile, idxToTile(idx + 2)] });
    searchGroups(counts, idx, state, best);
    state.taatsu.pop();
    counts[idx] += 1; counts[idx + 2] += 1;
  }

  const c = counts[idx];
  counts[idx] = 0;
  for (let i = 0; i < c; i += 1) state.floaters.push(tile);
  searchGroups(counts, idx + 1, state, best);
  for (let i = 0; i < c; i += 1) state.floaters.pop();
  counts[idx] = c;
}

function runSearch(counts, hasPair, meldCount) {
  const best = { value: Infinity, result: null };
  searchGroups(counts, 0, { sets: [], taatsu: [], floaters: [], hasPair, meldCount }, best);
  return best;
}

// 最优手牌分解。契约：concealed 为暗手牌；shanten 与 shantenWithMelds(concealed, meldCount, opts) 一致。
export function decomposeHand(concealed, meldCount = 0, { requireJiangPair = false } = {}) {
  const counts = tilesToCounts27(concealed);
  let best = { value: Infinity, result: null };
  let bestPair = null;

  for (let i = 0; i < 27; i += 1) {
    if (counts[i] < 2) continue;
    if (requireJiangPair && !isJiangIndex(i)) continue;
    counts[i] -= 2;
    const sub = runSearch(counts, true, meldCount);
    counts[i] += 2;
    if (sub.result && sub.value < best.value) {
      best = sub;
      bestPair = [idxToTile(i), idxToTile(i)];
    }
  }

  const noPair = runSearch(counts, false, meldCount);
  if (noPair.result && noPair.value < best.value) {
    best = noPair;
    bestPair = null;
  }

  return {
    shanten: best.value,
    sets: best.result.sets,
    pair: bestPair,
    taatsu: best.result.taatsu.map((g) => ({ tiles: g.tiles, waits: taatsuWaits(g.tiles) })),
    floaters: sortTiles(best.result.floaters),
  };
}
```

- [ ] **Step 4:** `node --test tests/decompose.test.mjs` → GREEN；`npm test` 全绿（当前 143 + 6 新）。
- [ ] **Step 5: Commit**
```bash
git add src/core/decompose.js tests/decompose.test.mjs
git commit -m "decompose: optimal hand decomposition (sets/pair/taatsu+waits/floaters)"
```

---

## Task P2: recommendation.js — decomposition + outlook + 过程文案

**Files:**
- Modify: `src/core/recommendation.js`
- Test: `tests/recommendation.test.mjs`

- [ ] **Step 1: 写失败测试**（追加；文件顶部已有 TENPAI_HAND 等夹具）

```js
// --- 过程化解释：decomposition + outlook ---

// 1 向手：123万 456筒 789条 + 99筒(将) + 45万(搭子) + 孤张1条 → 打1条后差1向？
// 不对——13张打1张后12张…夹具用 14 张：上述 = 3*3+2+2+1 = 14 ✓
const ONE_SHANTEN_HAND = [
  { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
  { suit: 'tong', rank: 4 }, { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 6 },
  { suit: 'tiao', rank: 7 }, { suit: 'tiao', rank: 8 }, { suit: 'tiao', rank: 9 },
  { suit: 'tong', rank: 9 }, { suit: 'tong', rank: 9 },
  { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 },
  { suit: 'tiao', rank: 1 },
];

test('every choice carries a decomposition consistent with its shanten', () => {
  const result = recommendDiscards({ hand: ONE_SHANTEN_HAND });
  for (const choice of result.choices) {
    assert.ok(choice.decomposition, 'decomposition attached');
    assert.equal(choice.decomposition.shanten, choice.shanten);
  }
});

test('top choices at shanten 1 carry outlook with waits', () => {
  // 打 1条 → 听牌(shanten 0)！该夹具 best 是 0 向；outlook 针对 1 向 choice 验证：
  // 用一手真正 1 向的：把 45万 改成 4万+7万（两孤张）→ 打孤张后仍差 1 向
  const oneShanten = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
    { suit: 'tong', rank: 4 }, { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 6 },
    { suit: 'tiao', rank: 7 }, { suit: 'tiao', rank: 8 }, { suit: 'tiao', rank: 9 },
    { suit: 'tong', rank: 9 }, { suit: 'tong', rank: 9 },
    { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 },
    { suit: 'wan', rank: 9 },
  ];
  const result = recommendDiscards({ hand: oneShanten });
  // 打 9万 → 3面子+将+45万搭 = 听牌（0向）→ best 应为 0 向无 outlook（听张走 usefulTiles）
  assert.equal(result.best.shanten, 0);
  assert.ok(!result.best.outlook, 'tenpai choice has no outlook');
  // 找一个 1 向的备选（如打 9筒 拆将）验证 outlook
  const oneShantenChoice = result.choices.find((c) => c.shanten === 1);
  if (oneShantenChoice) {
    assert.ok(Array.isArray(oneShantenChoice.outlook), '1-shanten top choice has outlook');
    const withWaits = oneShantenChoice.outlook.find((o) => o.waitTotal > 0);
    assert.ok(withWaits, 'some draw leads to a real wait');
    assert.ok(withWaits.waits.length > 0);
    assert.ok(withWaits.waits[0].remaining > 0);
  }
});

test('choices beyond top-3 or shanten>=2 have no outlook', () => {
  // 散牌（高向听）：任何候选 shanten>=2 → 无 outlook
  const scattered = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 9 },
    { suit: 'tong', rank: 2 }, { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 9 },
    { suit: 'tiao', rank: 1 }, { suit: 'tiao', rank: 4 }, { suit: 'tiao', rank: 9 },
    { suit: 'wan', rank: 2 }, { suit: 'tong', rank: 7 }, { suit: 'tiao', rank: 6 },
    { suit: 'wan', rank: 6 }, { suit: 'tiao', rank: 2 },
  ];
  const result = recommendDiscards({ hand: scattered });
  for (const choice of result.choices) {
    assert.ok(!choice.outlook, 'no outlook at shanten>=2');
  }
});

test('explanation narrates the process at shanten 1', () => {
  const oneShanten = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
    { suit: 'tong', rank: 4 }, { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 6 },
    { suit: 'tiao', rank: 7 }, { suit: 'tiao', rank: 8 }, { suit: 'tiao', rank: 9 },
    { suit: 'tong', rank: 9 }, { suit: 'tong', rank: 9 },
    { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 7 },
    { suit: 'wan', rank: 9 },
  ];
  const result = recommendDiscards({ hand: oneShanten });
  const oneChoice = result.choices.find((c) => c.shanten === 1);
  assert.ok(oneChoice);
  assert.ok(oneChoice.explanation.includes('副面子') || oneChoice.explanation.includes('即听牌'),
    `process narrative expected, got: ${oneChoice.explanation}`);
});
```

- [ ] **Step 2:** RED。
- [ ] **Step 3: 实现**（修改 `src/core/recommendation.js`）

(a) import 增加：`import { decomposeHand } from './decompose.js';`（`removeOneTile, tileKey, tileLabel, countTiles` 已有）。

(b) `buildChoice` 增加分解并传给 explanation：

```js
function buildChoice(hand, discard, visibleCounts, openMeldCount, requireJiangPair, melds) {
  const afterDiscard = removeOneTile(hand, discard);
  const shanten = shantenWithMelds(afterDiscard, openMeldCount, { requireJiangPair });
  const ukeire = calcUkeire(afterDiscard, visibleCounts, openMeldCount, { requireJiangPair });
  const decomposition = decomposeHand(afterDiscard, openMeldCount, { requireJiangPair });
  const value = patternValue(afterDiscard, melds, requireJiangPair);
  const danger = discardDanger(discard, visibleCounts);
  const score = (8 - shanten) * 1000 + ukeire.totalCount + value - Math.round(danger * DANGER_WEIGHT);

  return {
    discard, shanten,
    ukeireCount: ukeire.totalCount,
    usefulTiles: ukeire.tiles,
    decomposition,
    patternValue: value,
    danger,
    score,
    explanation: buildExplanation(discard, shanten, ukeire, value, danger, decomposition),
  };
}
```

(c) `recommendDiscards` 排序后附 outlook（前三 × 仅 1 向）：

```js
  const choices = uniqueDiscards
    .map((discard) => buildChoice(hand, discard, visibleCounts, openMeldCount, requireJiangPair, melds))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return tileKey(a.discard).localeCompare(tileKey(b.discard));
    });

  for (const choice of choices.slice(0, 3)) {
    if (choice.shanten === 1) {
      choice.outlook = buildOutlook(
        removeOneTile(hand, choice.discard), choice.usefulTiles,
        visibleCounts, openMeldCount, requireJiangPair,
      );
    }
  }
```

(d) 新增 `buildOutlook`（进张 → 最优弃 → 听张）：

```js
// 1 向展望：对每个进张，进张后枚举弃张取「听牌且听张数最大」者，列出听张明细
function buildOutlook(hand13, usefulTiles, visibleCounts, openMeldCount, requireJiangPair) {
  return usefulTiles.map(({ tile, remaining }) => {
    const hand14 = [...hand13, tile];
    let best = null;
    for (const discard of uniqueTiles(hand14)) {
      const after = removeOneTile(hand14, discard);
      if (shantenWithMelds(after, openMeldCount, { requireJiangPair }) !== 0) continue;
      const ukeire = calcUkeire(after, visibleCounts, openMeldCount, { requireJiangPair });
      if (!best || ukeire.totalCount > best.waitTotal) {
        best = { waits: ukeire.tiles, waitTotal: ukeire.totalCount };
      }
    }
    return { tile, remaining, waits: best?.waits ?? [], waitTotal: best?.waitTotal ?? 0 };
  });
}
```

(e) `buildExplanation` 重写（签名加 `decomposition`，标签逻辑保留）：

```js
function buildExplanation(discard, shanten, ukeire, value, danger, decomposition) {
  const label = tileLabel(discard);
  const tags = [];
  if (value >= 18) tags.push('牌型价值高');
  if (danger >= 0.7) tags.push('注意放炮');
  else if (danger <= 0.2) tags.push('较安全');
  const tagText = tags.length ? `（${tags.join('、')}）` : '';

  if (shanten < 0) return `打${label}后已和牌。`;
  if (shanten === 0) {
    const waits = ukeire.tiles.slice(0, 4).map((u) => tileLabel(u.tile)).join('/');
    const more = ukeire.tiles.length > 4 ? '等' : '';
    return `打${label}后听牌：听 ${waits}${more}，共 ${ukeire.totalCount} 张${tagText}。`;
  }
  if (shanten === 1) {
    const sets = decomposition.sets.length;
    const pairText = decomposition.pair ? `、${tileLabel(decomposition.pair[0])}对作将` : '';
    const draws = ukeire.tiles.slice(0, 4).map((u) => tileLabel(u.tile)).join('/');
    const more = ukeire.tiles.length > 4 ? '等' : '';
    return `打${label}后差 1 向：已成 ${sets} 副面子${pairText}，进 ${draws}${more} 即听牌${tagText}。`;
  }
  return `打${label}后还差 ${shanten} 向，共 ${ukeire.totalCount} 张进张（${ukeire.tiles.length} 种）${tagText}。`;
}
```

- [ ] **Step 4:** GREEN；`npm test` 全绿（既有 recommendation/review 测试只断言 includes('向听数增加') 与字段存在，不受文案重写影响——跑全量确认）。
- [ ] **Step 5: Commit**
```bash
git add src/core/recommendation.js tests/recommendation.test.mjs
git commit -m "recommendation: decomposition per choice, 1-shanten outlook, process narrative"
```

---

## Task P3: UI — 过程块 + 备选展开

DOM 层无 node 单测；`node --check` + DOM 桩烟测 + 浏览器验收。

**Files:**
- Modify: `src/ui/render.js`, `src/main.js`, `src/styles.css`

- [ ] **Step 1: render.js — 过程块渲染**（新增 helpers，放 waitBlock 附近）

```js
const PROC_LIMIT = 8;

function procTile(tile, badge = null) {
  const badgeHtml = badge != null ? `<em>${escapeHtml(badge)}</em>` : '';
  return `<span class="proc-tile" aria-label="${escapeHtml(tileLabel(tile))}">${tileFaceSvg(tile)}${badgeHtml}</span>`;
}

// 结构行：面子 | 将 | 搭子(标等张) | 孤张
function structureRow(decomposition) {
  if (!decomposition) return '';
  const groups = [];
  for (const set of decomposition.sets) {
    groups.push(`<span class="proc-group">${set.tiles.map((tile) => procTile(tile)).join('')}</span>`);
  }
  if (decomposition.pair) {
    groups.push(`<span class="proc-group is-pair">${decomposition.pair.map((tile) => procTile(tile)).join('')}<i class="proc-tag">将</i></span>`);
  }
  for (const group of decomposition.taatsu) {
    const waits = group.waits.map(tileLabel).join('/');
    groups.push(`<span class="proc-group is-taatsu">${group.tiles.map((tile) => procTile(tile)).join('')}<i class="proc-tag">等${escapeHtml(waits)}</i></span>`);
  }
  if (decomposition.floaters.length > 0) {
    groups.push(`<span class="proc-group is-floater">${decomposition.floaters.map((tile) => procTile(tile)).join('')}<i class="proc-tag">孤</i></span>`);
  }
  if (groups.length === 0) return '';
  return `<div class="proc-row proc-structure">${groups.join('')}</div>`;
}

// 进张行：牌面 + 剩余张数角标
function drawsRow(usefulTiles) {
  if (!usefulTiles || usefulTiles.length === 0) return '';
  const shown = usefulTiles.slice(0, PROC_LIMIT);
  const rest = usefulTiles.length - shown.length;
  const faces = shown.map((u) => procTile(u.tile, u.remaining)).join('');
  const more = rest > 0 ? `<span class="proc-more">等 ${rest} 种</span>` : '';
  return `<div class="proc-row proc-draws"><span class="proc-label">进张</span>${faces}${more}</div>`;
}

// 展望行：进 X → 听 Y/Z · N 张（仅 1 向）
function outlookRows(outlook) {
  if (!outlook || outlook.length === 0) return '';
  const shown = outlook.slice(0, PROC_LIMIT);
  const rest = outlook.length - shown.length;
  const items = shown.map((o) => {
    const waits = o.waits.slice(0, 4).map((w) => procTile(w.tile, w.remaining)).join('');
    const moreWaits = o.waits.length > 4 ? '<span class="proc-more">…</span>' : '';
    return `<div class="proc-outlook-item">进 ${procTile(o.tile)} <span class="proc-arrow">→</span> 听 ${waits}${moreWaits}<span class="proc-count">· ${escapeHtml(o.waitTotal)} 张</span></div>`;
  }).join('');
  const more = rest > 0 ? `<div class="proc-outlook-item proc-more">等 ${rest} 种进张…</div>` : '';
  return `<div class="proc-row proc-outlooks"><span class="proc-label">展望</span><div class="proc-outlook-list">${items}${more}</div></div>`;
}

// 完整过程块：结构 + 进张(非听牌) + 展望(1向)。0 向听张走既有 wait-block。
function processBlock(choice) {
  if (!choice?.decomposition) return '';
  const draws = choice.shanten >= 1 ? drawsRow(choice.usefulTiles) : '';
  const outlooks = outlookRows(choice.outlook);
  return `<div class="process-block">${structureRow(choice.decomposition)}${draws}${outlooks}</div>`;
}
```

- [ ] **Step 2: render.js — 接入**

(a) `renderApp` 解构加 `expandedChoiceIndex = null`。
(b) advice 区：在 `${waitBlock(recommendation, isPlayerDiscardTurn)}` 之后插入：

```js
        ${isPlayerDiscardTurn && best ? processBlock(best) : ''}
```

(c) `choicesList(recommendation)` 改签名 `choicesList(recommendation, expandedChoiceIndex)`（调用处同步），li 变成可展开项：

```js
function choicesList(recommendation, expandedChoiceIndex) {
  const choices = recommendation?.choices?.slice(0, 3) ?? [];
  if (choices.length === 0) return '<li>暂无备选</li>';

  return choices.map((choice, index) => {
    const expanded = expandedChoiceIndex === index;
    return `
    <li class="choice-item${expanded ? ' is-expanded' : ''}">
      <div class="choice-head">
        <span class="choice-rank">${index + 1}</span>
        <span class="choice-tile">${tileFaceSvg(choice.discard)}</span>
        <strong class="choice-meta">${escapeHtml(choiceMeta(choice))}</strong>
        <button class="choice-expand" type="button" data-choice-expand="${index}">${expanded ? '收起' : '过程'}</button>
      </div>
      ${expanded ? processBlock(choice) : ''}
    </li>
  `;
  }).join('');
}
```

注意保留原 `.choice-list li` 样式兼容：原 li 直接 flex；现在头部信息移入 `.choice-head`，需要在 styles 给 `.choice-head` 原 li 的 flex 行为（见 Step 4），`.choice-list li` 改为纵向块。

- [ ] **Step 3: main.js — 展开状态**

(a) 模块状态：`let expandedChoiceIndex = null;`
(b) `render()` 传 `expandedChoiceIndex,`。
(c) 推荐刷新处重置：`onUpdate` 中 `currentRecommendation = recommendCurrentHand();` 之后加 `expandedChoiceIndex = null;`；`startHand` 中同样在 `currentRecommendation = ...` 后加。
(d) 点击分支（放在 collapse-toggle 分支之后）：

```js
  const expandEl = event.target.closest('[data-choice-expand]');
  if (expandEl) {
    const index = Number(expandEl.dataset.choiceExpand);
    expandedChoiceIndex = expandedChoiceIndex === index ? null : index;
    render();
    return;
  }
```

- [ ] **Step 4: styles.css 追加**（第一个 @media 之前）

```css
/* 过程块 */
.process-block {
  display: grid;
  gap: 8px;
  border-left: 3px solid #6bd18b;
  border-radius: 6px;
  background: #20292a;
  padding: 10px 12px;
}
.proc-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.proc-label { color: #8fe0aa; font-size: 12px; font-weight: 700; flex: none; }
.proc-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px 5px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
}
.proc-group.is-pair { outline: 1px solid rgba(255, 226, 122, 0.55); }
.proc-group.is-taatsu { outline: 1px dashed rgba(143, 224, 170, 0.55); }
.proc-group.is-floater { opacity: 0.66; }
.proc-tag {
  margin-left: 3px;
  color: #ffe27a;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  white-space: nowrap;
}
.proc-tile {
  position: relative;
  width: 24px;
  height: 32px;
  padding: 2px;
  border-radius: 4px;
  background: linear-gradient(180deg, #fffdf6, #ece0c5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 1px 2px rgba(0, 0, 0, 0.25);
}
.proc-tile .tile-face { width: 100%; height: 100%; display: block; }
.proc-tile em {
  position: absolute;
  right: -4px;
  bottom: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  background: #3eb969;
  color: #07210f;
  font-size: 10px;
  font-weight: 800;
  font-style: normal;
}
.proc-more { color: #9fb8ab; font-size: 12px; }
.proc-outlook-list { display: grid; gap: 6px; }
.proc-outlook-item { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; color: #dce8e1; font-size: 13px; }
.proc-arrow { color: #8fe0aa; }
.proc-count { color: #cfe9d8; font-size: 12px; }

/* 备选展开 */
.choice-list li.choice-item { display: block; }
.choice-head { display: flex; align-items: center; gap: 10px; }
.choice-item .process-block { margin-top: 8px; }
.choice-expand {
  margin-left: auto;
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid #3a4744;
  border-radius: 6px;
  background: #222d2b;
  color: #cfe9d8;
  cursor: pointer;
  font-size: 12px;
}
.choice-expand:hover,
.choice-expand:focus-visible { border-color: #ffe27a; color: #ffe27a; }
```

注意：原 `.choice-list li { display:flex; ... }` 会与新结构冲突——保留原规则（用于空态"暂无备选"），`.choice-item` 覆盖为 block（如上）。

- [ ] **Step 5: 验证**

```bash
node --check src/ui/render.js && node --check src/main.js
npm test
```
DOM 桩烟测（项目根临时 `__smoke.mjs`，同既有模式：document 桩 + import main.js + 断言）：`process-block`、`proc-structure`、`data-choice-expand` 出现在 innerHTML；跑完删除。

- [ ] **Step 6: Commit**
```bash
git add src/ui/render.js src/main.js src/styles.css
git commit -m "ui: process block (structure/draws/outlook) + expandable choices"
```

---

## Task P4: 端到端验证 + 推送

- [ ] **Step 1:** `npm test` 全绿（预计 ~154）。
- [ ] **Step 2:** 浏览器/预览验证：推荐区显示过程块（结构分组、搭子等张标注、进张角标）；1 向时展望行「进 X → 听 Y · N 张」；备选点「过程」展开/收起、换推荐自动收起；0 向时 wait-block 与结构行并存不重复；面板不溢出（必要时收紧间距）。
- [ ] **Step 3:** `git push -u origin feature/process-advice`，汇报。

---

## 自检（写计划时已核对）

- **Spec 覆盖**：分解器+waits+不变量(P1)、decomposition/outlook 预算/文案(P2)、过程块/推荐展开/备选点击展开/截断(P3)、e2e(P4)。错误处理：分解器对任意输入尽力分解不抛错（实现天然如此）；outlook 无解时 waits 空数组（buildOutlook 兜底已写）。
- **类型一致**：decomposition/outlook 形状在 P1/P2/P3 一致；`buildExplanation(discard, shanten, ukeire, value, danger, decomposition)` 调用与定义一致；`choicesList(recommendation, expandedChoiceIndex)`、`data-choice-expand`、`expandedChoiceIndex` 贯穿 P3。
- **无占位**：每步含完整代码/命令。
- **兼容**：既有测试只查 explanation 存在性与 '向听数增加' 子串，不锁旧模板；`.choice-list li` 空态样式保留。
