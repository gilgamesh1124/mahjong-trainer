import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendDiscards } from '../src/core/recommendation.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

const TENPAI_HAND = tiles([
  ['wan', 1],
  ['wan', 2],
  ['wan', 3],
  ['wan', 4],
  ['wan', 5],
  ['wan', 6],
  ['wan', 7],
  ['wan', 8],
  ['wan', 9],
  ['tong', 1],
  ['tong', 2],
  ['tong', 3],
  ['tiao', 1],
  ['tiao', 9],
]);

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

  assert.equal(result.best.discard.suit, 'tiao');
  assert.equal(result.best.shanten, 0);
});

test('recommendDiscards accounts for visible tiles reducing ukeire for affected choice', () => {
  const result1 = recommendDiscards({ hand: TENPAI_HAND, visibleTiles: [] });
  const result2 = recommendDiscards({
    hand: TENPAI_HAND,
    visibleTiles: tiles([
      ['tiao', 1],
      ['tiao', 1],
      ['tiao', 1],
    ]),
  });
  const tiao9In1 = result1.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 9);
  const tiao9In2 = result2.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 9);

  assert.ok(tiao9In1, 'tiao-9 discard should be a choice without visible tiles');
  assert.ok(tiao9In2, 'tiao-9 discard should be a choice with visible tiles');
  assert.ok(tiao9In2.ukeireCount < tiao9In1.ukeireCount, 'ukeire should drop when visible tiles are exhausted');
});

test('recommendDiscards does not mutate hand input', () => {
  const hand = [...TENPAI_HAND];
  const originalKeys = hand.map(t => `${t.suit}-${t.rank}`);

  recommendDiscards({ hand });

  assert.deepEqual(hand.map(t => `${t.suit}-${t.rank}`), originalKeys);
});

test('recommendDiscards applies 2 5 8 pair rule to useful tile counts', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
    ['tiao', 2],
    ['tiao', 3],
    ['wan', 9],
    ['tiao', 9],
  ]);

  const strict = recommendDiscards({ hand, requireJiangPair: true });
  const relaxed = recommendDiscards({ hand, requireJiangPair: false });
  const strictChoice = strict.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 9);
  const relaxedChoice = relaxed.choices.find(c => c.discard.suit === 'tiao' && c.discard.rank === 9);

  assert.equal(strictChoice.ukeireCount, 0);
  assert.equal(relaxedChoice.ukeireCount, 3);
  assert.match(strictChoice.explanation, /2\/5\/8 作将/);
  assert.match(relaxedChoice.explanation, /起手无将/);
});
