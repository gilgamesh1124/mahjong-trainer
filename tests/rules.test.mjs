import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUsefulTilesAfterDiscard,
  isTenpai,
  isWinningHand,
} from '../src/core/rules.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

test('isWinningHand detects four sets and one pair', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
  ]);

  assert.equal(isWinningHand(hand), true);
});

test('isWinningHand rejects incomplete hand', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
    ['wan', 7],
    ['wan', 8],
  ]);

  assert.equal(isWinningHand(hand), false);
});

test('isTenpai detects a 13-tile hand one tile away from winning', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 7],
    ['wan', 8],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
  ]);

  assert.equal(isTenpai(hand), true);
});

test('getUsefulTilesAfterDiscard adjusts for visible discards', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 7],
    ['wan', 8],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 1],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
  ]);
  const discard = tile('tong', 1);
  const visibleTiles = tiles([
    ['wan', 9],
    ['wan', 9],
    ['wan', 6],
    ['wan', 6],
    ['wan', 6],
    ['wan', 6],
  ]);

  const usefulTiles = getUsefulTilesAfterDiscard(hand, discard, visibleTiles);

  assert.deepEqual(usefulTiles, [{ tile: tile('wan', 9), remaining: 2 }]);
});
