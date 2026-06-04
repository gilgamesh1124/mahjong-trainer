import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialGame,
  discardTile,
  drawTile,
} from '../src/core/game-state.js';

test('createInitialGame deals the starting hands and sets turn state', () => {
  const game = createInitialGame({ seed: 1234 });

  assert.equal(game.players[0].hand.length, 14);
  assert.equal(game.players[1].hand.length, 13);
  assert.equal(game.players[2].hand.length, 13);
  assert.equal(game.players[3].hand.length, 13);
  assert.equal(game.wall.length, 55);
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.phase, 'awaiting-discard');
  assert.equal(game.seed, 1234);
  assert.equal('originalWall' in game, false);
  assert.deepEqual(game.history, []);
});

test('drawTile consumes the next wall tile without mutating the input game', () => {
  const game = createInitialGame({ seed: 1234 });
  const drawnTile = game.wall[0];
  const originalWallLength = game.wall.length;

  const nextGame = drawTile(game, 1);

  assert.notEqual(nextGame, game);
  assert.deepEqual(nextGame.players[1].hand.at(-1), drawnTile);
  assert.equal(nextGame.wall.length, originalWallLength - 1);
  assert.deepEqual(nextGame.wall, game.wall.slice(1));
  assert.equal(game.wall.length, 55);
  assert.deepEqual(game.wall[0], drawnTile);
  assert.deepEqual(nextGame.history.at(-1), {
    type: 'draw',
    playerIndex: 1,
    tileKey: `${drawnTile.suit}-${drawnTile.rank}`,
  });
});

test('discardTile removes one matching tile, appends discard, and records recommendation metadata', () => {
  const game = createInitialGame({ seed: 1234 });
  const tile = game.players[0].hand[0];
  const originalHandLength = game.players[0].hand.length;
  const originalDiscardsLength = game.players[0].discards.length;

  const nextGame = discardTile(game, 0, tile, { recommendationId: 'rec-1' });

  assert.notEqual(nextGame, game);
  assert.equal(nextGame.players[0].hand.length, originalHandLength - 1);
  assert.equal(nextGame.players[0].discards.length, originalDiscardsLength + 1);
  assert.deepEqual(nextGame.players[0].discards.at(-1), tile);
  assert.equal(game.players[0].hand.length, originalHandLength);
  assert.equal(game.players[0].discards.length, originalDiscardsLength);
  assert.equal(nextGame.currentPlayer, 1);
  assert.equal(nextGame.phase, 'awaiting-draw');
  assert.deepEqual(nextGame.history.at(-1), {
    type: 'discard',
    playerIndex: 0,
    tileKey: `${tile.suit}-${tile.rank}`,
    recommendationId: 'rec-1',
  });
});

test('discardTile rejects a tile that is not in the player hand', () => {
  const game = createInitialGame({ seed: 1234 });

  assert.throws(
    () => discardTile(game, 0, { suit: 'wan', rank: 10 }),
    /Tile not in hand/,
  );
});

test('drawTile rejects drawing from an empty wall', () => {
  const game = {
    ...createInitialGame({ seed: 1234 }),
    wall: [],
  };

  assert.throws(() => drawTile(game, 1), /Wall is empty/);
});
