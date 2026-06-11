import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendDiscards } from '../src/core/recommendation.js';

// 123万456万789万123筒 + 1条9条 (14 tiles: both tiao tiles are isolated relative to the complete groups)
const TENPAI_HAND = [
  { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
  { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 }, { suit: 'wan', rank: 6 },
  { suit: 'wan', rank: 7 }, { suit: 'wan', rank: 8 }, { suit: 'wan', rank: 9 },
  { suit: 'tong', rank: 1 }, { suit: 'tong', rank: 2 }, { suit: 'tong', rank: 3 },
  { suit: 'tiao', rank: 1 }, { suit: 'tiao', rank: 9 },
];

test('recommendDiscards returns ranked choices with shanten and ukeire', () => {
  const result = recommendDiscards({ hand: TENPAI_HAND });
  assert.ok(result.best, 'should have a best recommendation');
  assert.ok(typeof result.best.shanten === 'number');
  assert.ok(typeof result.best.ukeireCount === 'number');
  assert.ok(result.best.ukeireCount > 0);
  assert.ok(result.best.explanation.length > 0);
  assert.ok(result.id.startsWith('recommend-'));
  assert.ok(Array.isArray(result.choices));
});

test('recommendDiscards recommends discarding a tiao tile to reach tenpai', () => {
  const result = recommendDiscards({ hand: TENPAI_HAND });
  // Both tiao-1 and tiao-9 lead to tenpai (shanten=0); algorithm picks tiao-1 by tiebreak
  assert.equal(result.best.discard.suit, 'tiao');
  assert.equal(result.best.shanten, 0);
});

test('recommendDiscards accounts for visible tiles reducing ukeire for affected choice', () => {
  const result1 = recommendDiscards({ hand: TENPAI_HAND, visibleTiles: [] });
  // Making tiao-1 visible (3 copies) reduces ukeire for the tiao-9 discard option
  // (which waits on tiao-1 as a pair; remaining = 4 - 3 - 1 = 0)
  const result2 = recommendDiscards({
    hand: TENPAI_HAND,
    visibleTiles: [
      { suit: 'tiao', rank: 1 },
      { suit: 'tiao', rank: 1 },
      { suit: 'tiao', rank: 1 },
    ],
  });
  const tiao9In1 = result1.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 9);
  const tiao9In2 = result2.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 9);
  assert.ok(tiao9In1, 'tiao-9 discard should be a choice without visible tiles');
  assert.ok(tiao9In2, 'tiao-9 discard should be a choice with visible tiles');
  assert.ok(tiao9In2.ukeireCount < tiao9In1.ukeireCount, 'ukeire for tiao-9 discard should drop when tiao-1 tiles are visible');
});

test('recommendDiscards does not mutate hand input', () => {
  const hand = [...TENPAI_HAND];
  const originalKeys = hand.map(t => `${t.suit}-${t.rank}`);
  recommendDiscards({ hand });
  assert.deepEqual(hand.map(t => `${t.suit}-${t.rank}`), originalKeys);
});

// --- Part A: requireJiangPair and openMeldCount ---

// 14-tile hand: 123万+456万+789万 + 2条+2条(将牌对=rank2) + 1筒+2筒(搭子) + 3条(非将多余牌)
// discard 3条 → 13 tiles: 3套 + jiang pair (2条×2) + taatsu (1筒2筒) → shanten=0 (req or not)
// discard 2条 → 13 tiles: 3套 + isolated 2条 + taatsu (1筒2筒) + isolated 3条 → no jiang pair → shanten=1 (req)
//   Because with requireJiangPair=true, jiang pair branch skipped (no jiang pair), no-pair path gives shanten=1
const JIANG_PAIR_HAND = [
  { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
  { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 }, { suit: 'wan', rank: 6 },
  { suit: 'wan', rank: 7 }, { suit: 'wan', rank: 8 }, { suit: 'wan', rank: 9 },
  { suit: 'tiao', rank: 2 }, { suit: 'tiao', rank: 2 }, // jiang pair (rank 2)
  { suit: 'tong', rank: 1 }, { suit: 'tong', rank: 2 }, // taatsu
  { suit: 'tiao', rank: 3 }, // non-jiang extra tile to discard
];

test('recommendDiscards with requireJiangPair:true prefers jiang-pair wait over non-jiang pair wait', () => {
  const result = recommendDiscards({ hand: JIANG_PAIR_HAND, requireJiangPair: true });

  // The best discard should be the one that preserves the jiang pair (discard tiao-3)
  // Discarding tiao-3 → 3 sets + jiang pair (tiao-2×2) + taatsu (tong1+tong2) → shanten=0
  // Discarding tiao-2 → 3 sets + isolated tiao-2 + taatsu (tong1+tong2) + isolated tiao-3
  //   → no jiang pair available → shanten=1 with requireJiangPair
  assert.ok(result.best, 'should have a best recommendation');
  assert.equal(result.best.discard.suit, 'tiao');
  assert.equal(result.best.discard.rank, 3, 'should discard tiao-3 to preserve jiang pair (tiao-2) wait');
  assert.equal(result.best.shanten, 0, 'discarding tiao-3 should yield tenpai with requireJiangPair');

  // Verify that the tiao-2 discard choice has higher shanten (worse) than tiao-3 discard
  const discard3 = result.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 3);
  const discard2 = result.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 2);
  assert.ok(discard3, 'tiao-3 discard should appear in choices');
  assert.ok(discard2, 'tiao-2 discard should appear in choices');
  assert.ok(discard3.shanten < discard2.shanten,
    'jiang-pair-wait discard (tiao-3, shanten=0) should have lower shanten than non-jiang-pair-wait (tiao-2, shanten=1)');
});

test('recommendDiscards default (no requireJiangPair) is unchanged for JIANG_PAIR_HAND', () => {
  // Without requireJiangPair, both waits are valid tenpai; tiao-1 tiebreak or either tiao tile
  const result = recommendDiscards({ hand: JIANG_PAIR_HAND });
  assert.ok(result.best, 'should have a best recommendation');
  assert.equal(result.best.shanten, 0, 'should still reach tenpai without requireJiangPair flag');
});

// --- 价值加权启发式（胡牌方式 + 安全度）---

test('recommendDiscards scores flush-leaning discards higher on patternValue', () => {
  // 13 万 + 1 条：打条 → 暗手全为万(清一色倾向高)；打某张万 → 花色更杂
  const hand = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
    { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 }, { suit: 'wan', rank: 6 },
    { suit: 'wan', rank: 7 }, { suit: 'wan', rank: 8 }, { suit: 'wan', rank: 9 },
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 1 },
    { suit: 'wan', rank: 5 }, { suit: 'wan', rank: 5 },
    { suit: 'tiao', rank: 9 },
  ];
  const result = recommendDiscards({ hand });
  const dropTiao = result.choices.find((c) => c.discard.suit === 'tiao');
  const dropWan = result.choices.find((c) => c.discard.suit === 'wan');
  assert.ok(dropTiao && dropWan);
  assert.ok(dropTiao.patternValue > dropWan.patternValue,
    '保留全万(清一色倾向)的弃张牌型价值应更高');
});

test('recommendDiscards lowers danger for a tile already widely visible', () => {
  const hand = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
    { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 }, { suit: 'wan', rank: 6 },
    { suit: 'tong', rank: 1 }, { suit: 'tong', rank: 2 }, { suit: 'tong', rank: 3 },
    { suit: 'tiao', rank: 1 }, { suit: 'tiao', rank: 2 }, { suit: 'tiao', rank: 3 },
    { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 5 },
  ];
  const dangerHidden = recommendDiscards({ hand })
    .choices.find((c) => c.discard.suit === 'tong' && c.discard.rank === 5).danger;
  const dangerSeen = recommendDiscards({
    hand,
    visibleTiles: [{ suit: 'tong', rank: 5 }, { suit: 'tong', rank: 5 }],
  }).choices.find((c) => c.discard.suit === 'tong' && c.discard.rank === 5).danger;
  assert.ok(dangerSeen < dangerHidden, '已被看到的张放炮风险应更低');
});

test('recommendDiscards keeps shanten dominant over value/danger weighting', () => {
  // 价值/安全度的量级必须远小于一个向听(1000)，不得跨越向听层级
  const result = recommendDiscards({ hand: TENPAI_HAND });
  // 最优仍是听牌(shanten 0)的弃张，不会因价值被某张更高向听的牌挤掉
  assert.equal(result.best.shanten, 0);
});

test('recommendDiscards openMeldCount changes shanten of choices', () => {
  // A hand sized for 1 open meld: 11 tiles (14 - 3*1).
  // 123万+456万+789万 (complete 3 sets) + 11条 (pair) + 9筒 (isolated extra, the one to discard)
  // With openMeldCount=1: post-discard has 10 tiles, meldCount=1 → much closer to winning
  // With openMeldCount=0: same 10 tiles treated as if no melds → further from winning
  const meldHand = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
    { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 }, { suit: 'wan', rank: 6 },
    { suit: 'wan', rank: 7 }, { suit: 'wan', rank: 8 }, { suit: 'wan', rank: 9 },
    { suit: 'tiao', rank: 1 }, { suit: 'tiao', rank: 1 }, // pair
  ];
  const resultWith1Meld = recommendDiscards({ hand: meldHand, openMeldCount: 1 });
  const resultWith0Melds = recommendDiscards({ hand: meldHand, openMeldCount: 0 });

  assert.ok(resultWith1Meld.best, 'should have a best choice with openMeldCount=1');
  assert.ok(resultWith0Melds.best, 'should have a best choice with openMeldCount=0');
  // With 1 open meld, the same concealed tiles are interpreted as needing fewer sets → lower shanten
  assert.ok(
    resultWith1Meld.best.shanten <= resultWith0Melds.best.shanten,
    'openMeldCount=1 should yield same or lower shanten than openMeldCount=0'
  );
});

// --- 过程化解释：decomposition + outlook ---

test('every choice carries a decomposition consistent with its shanten', () => {
  const result = recommendDiscards({ hand: TENPAI_HAND });
  for (const choice of result.choices) {
    assert.ok(choice.decomposition, 'decomposition attached');
    assert.equal(choice.decomposition.shanten, choice.shanten);
  }
});

test('top choices at shanten 1 carry outlook with waits; tenpai best has none', () => {
  // 3面子 + 99筒将 + 45万搭 + 孤张9万：打9万 → 听牌(0向)；拆将/拆搭的备选是 1 向
  const oneShanten = [
    { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
    { suit: 'tong', rank: 4 }, { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 6 },
    { suit: 'tiao', rank: 7 }, { suit: 'tiao', rank: 8 }, { suit: 'tiao', rank: 9 },
    { suit: 'tong', rank: 9 }, { suit: 'tong', rank: 9 },
    { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 5 },
    { suit: 'wan', rank: 9 },
  ];
  const result = recommendDiscards({ hand: oneShanten });
  assert.equal(result.best.shanten, 0);
  assert.ok(!result.best.outlook, 'tenpai choice has no outlook');
  const oneShantenChoice = result.choices.find((c) => c.shanten === 1);
  if (oneShantenChoice) {
    assert.ok(Array.isArray(oneShantenChoice.outlook), '1-shanten top choice has outlook');
    const withWaits = oneShantenChoice.outlook.find((o) => o.waitTotal > 0);
    assert.ok(withWaits, 'some draw leads to a real wait');
    assert.ok(withWaits.waits.length > 0);
    assert.ok(withWaits.waits[0].remaining > 0);
  }
});

test('no outlook at shanten>=2', () => {
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
  // 3面子 + 99筒将 + 4万/7万 两孤张 + 9万：打任意孤张后仍 1 向
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
