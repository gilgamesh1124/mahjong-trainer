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
