import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOperation } from '../src/core/operation-advice.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

function player(hand, melds = []) {
  return {
    hand,
    discards: [],
    melds,
  };
}

function makePendingGame({ hand, discardedTile, actions, chiOptions = [], melds = [] }) {
  return {
    seed: 1,
    players: [
      player(hand, melds),
      player(tiles([
        ['tong', 1],
        ['tong', 2],
        ['tong', 3],
        ['wan', 7],
        ['wan', 8],
        ['wan', 9],
        ['tiao', 1],
        ['tiao', 2],
        ['tiao', 3],
        ['tong', 8],
        ['tong', 8],
        ['wan', 5],
        ['wan', 6],
      ])),
      player([]),
      player([]),
    ],
    wall: [],
    currentPlayer: 0,
    phase: 'awaiting-claim',
    pendingAction: {
      tile: discardedTile,
      tileKey: `${discardedTile.suit}-${discardedTile.rank}`,
      fromPlayerIndex: 1,
      responses: [{
        playerIndex: 0,
        actions,
        chiOptions,
      }],
      passedPlayerIndexes: [],
    },
    result: null,
    history: [],
  };
}

test('recommendOperation recommends hu whenever a winning claim is available', () => {
  const game = makePendingGame({
    discardedTile: tile('wan', 3),
    actions: ['hu', 'peng'],
    hand: tiles([
      ['wan', 1],
      ['wan', 2],
      ['wan', 3],
      ['tong', 1],
      ['tong', 2],
      ['tong', 3],
      ['tiao', 1],
      ['tiao', 2],
      ['tiao', 3],
      ['tong', 5],
      ['tong', 5],
      ['tong', 5],
      ['wan', 3],
    ]),
  });

  const advice = recommendOperation({ game, playerIndex: 0 });

  assert.equal(advice.best.action, 'hu');
  assert.match(advice.best.explanation, /能胡/);
});

test('recommendOperation recommends pass when peng worsens the hand structure', () => {
  const game = makePendingGame({
    discardedTile: tile('wan', 9),
    actions: ['peng'],
    hand: tiles([
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
      ['tong', 7],
      ['tiao', 8],
      ['tiao', 9],
    ]),
  });

  const advice = recommendOperation({ game, playerIndex: 0 });

  assert.equal(advice.best.action, 'pass');
  assert.match(advice.best.explanation, /过/);
});

test('recommendOperation scores chi choices with Chinese explanations', () => {
  const chiTiles = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
  ]);
  const game = makePendingGame({
    discardedTile: tile('wan', 3),
    actions: ['chi'],
    chiOptions: [chiTiles],
    hand: tiles([
      ['wan', 1],
      ['wan', 2],
      ['tong', 1],
      ['tong', 2],
      ['tong', 3],
      ['tiao', 1],
      ['tiao', 2],
      ['tiao', 3],
      ['wan', 8],
      ['wan', 8],
      ['tong', 7],
      ['tiao', 8],
      ['tiao', 9],
    ]),
  });

  const advice = recommendOperation({ game, playerIndex: 0 });
  const chiChoice = advice.choices.find((choice) => choice.action === 'chi');

  assert.ok(chiChoice);
  assert.equal(chiChoice.tiles.length, 3);
  assert.match(chiChoice.explanation, /吃/);
  assert.ok(Number.isInteger(chiChoice.ukeireCount));
});

test('recommendOperation explains the active jiang pair route', () => {
  const game = makePendingGame({
    discardedTile: tile('wan', 9),
    actions: ['peng'],
    hand: tiles([
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
      ['tong', 7],
      ['tiao', 8],
      ['tiao', 9],
    ]),
  });

  const advice = recommendOperation({
    game,
    playerIndex: 0,
    requireJiangPair: true,
  });

  assert.match(advice.ruleNote, /2\/5\/8 作将/);
  assert.ok(advice.choices.every((choice) => /2\/5\/8 作将/.test(choice.explanation)));
});
