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
