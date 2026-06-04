import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUsefulTilesAfterDiscard,
  isTenpai,
  isWinningHand,
  shantenNumber,
  calcUkeire,
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

test('shantenNumber returns -1 for a winning hand', () => {
  const hand = tiles([
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
    ['tiao', 1],
  ]);
  assert.equal(shantenNumber(hand), -1);
});

test('shantenNumber returns 0 for a tenpai hand', () => {
  const hand = tiles([
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
  ]);
  assert.equal(shantenNumber(hand), 0);
});

test('shantenNumber returns 1 for a hand one step from tenpai', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tiao', 1],
    ['tiao', 1],
    ['tong', 5],
    ['tong', 9],
  ]);
  assert.equal(shantenNumber(hand), 1);
});

test('calcUkeire returns tiles and count for a tenpai hand', () => {
  const hand = tiles([
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
  ]);
  const visible = new Map();
  const result = calcUkeire(hand, visible);
  assert.ok(result.tiles.some(u => u.tile.suit === 'tiao' && u.tile.rank === 1));
  assert.ok(result.totalCount > 0);
});

test('shantenNumber accounts for an exposed meld already being complete', () => {
  const concealedHand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
    ['tiao', 2],
    ['wan', 9],
    ['wan', 9],
  ]);

  assert.equal(shantenNumber(concealedHand, 1), 0);
});

test('calcUkeire accounts for exposed melds when counting useful tiles', () => {
  const concealedHand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
    ['tiao', 2],
    ['wan', 9],
    ['wan', 9],
  ]);
  const visibleCounts = new Map([
    ['tiao-3', 1],
  ]);

  const result = calcUkeire(concealedHand, visibleCounts, 1);

  assert.deepEqual(result.tiles, [{
    tile: tile('tiao', 3),
    remaining: 3,
  }]);
  assert.equal(result.totalCount, 3);
});
