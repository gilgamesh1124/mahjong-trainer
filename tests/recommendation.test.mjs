import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendDiscards } from '../src/core/recommendation.js';
import { createInitialGame } from '../src/core/game-state.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

const readyHand = tiles([
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

test('recommendDiscards returns ranked choices with explanations', () => {
  const result = recommendDiscards({
    hand: readyHand,
    visibleTiles: [tile('wan', 9)],
  });

  assert.equal(typeof result.id, 'string');
  assert.ok(result.choices.length > 0);
  assert.equal(result.best, result.choices[0]);
  assert.equal(typeof result.best.explanation, 'string');
  assert.match(result.best.explanation, /有效进张/);
});

test('recommendDiscards accounts for visible useful tiles', () => {
  const result = recommendDiscards({
    hand: readyHand,
    visibleTiles: [
      tile('wan', 9),
      tile('wan', 9),
    ],
  });

  const tongOneChoice = result.choices.find((choice) => (
    choice.discard.suit === 'tong' && choice.discard.rank === 1
  ));

  assert.ok(tongOneChoice);
  const wanNine = tongOneChoice.usefulTiles.find((item) => (
    item.tile.suit === 'wan' && item.tile.rank === 9
  ));

  assert.deepEqual(wanNine, { tile: tile('wan', 9), remaining: 2 });
});

test('recommendDiscards identifies improvement tiles in an ordinary starting hand', () => {
  const game = createInitialGame({ seed: 1 });
  const result = recommendDiscards({
    hand: game.players[0].hand,
    visibleTiles: [],
  });

  assert.ok(result.best.remainingUsefulCount > 0);
  assert.ok(result.best.usefulTiles.length > 0);
  assert.doesNotMatch(result.best.explanation, /暂无直接有效牌/);
});

test('recommendDiscards does not mutate hand or wall', () => {
  const hand = readyHand.map((item) => ({ ...item }));
  const visibleTiles = [tile('wan', 9), tile('wan', 9)];
  const wall = tiles([
    ['wan', 4],
    ['wan', 5],
    ['tong', 7],
  ]);
  const originalHand = JSON.stringify(hand);
  const originalVisibleTiles = JSON.stringify(visibleTiles);
  const originalWall = JSON.stringify(wall);

  recommendDiscards({ hand, visibleTiles, wall });

  assert.equal(JSON.stringify(hand), originalHand);
  assert.equal(JSON.stringify(visibleTiles), originalVisibleTiles);
  assert.equal(JSON.stringify(wall), originalWall);
});
