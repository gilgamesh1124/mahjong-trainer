import test from 'node:test';
import assert from 'node:assert/strict';

import {
  claimDiscard,
  createInitialGame,
  discardTile,
  drawTile,
  passClaim,
} from '../src/core/game-state.js';
import { tileKey } from '../src/core/tiles.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

function player(hand, discards = [], melds = []) {
  return { hand, discards, melds };
}

function makeGame(players, extras = {}) {
  return {
    seed: 1,
    players,
    wall: extras.wall ?? tiles([
      ['tong', 9],
      ['wan', 9],
      ['tiao', 9],
    ]),
    currentPlayer: extras.currentPlayer ?? 0,
    phase: extras.phase ?? 'awaiting-discard',
    history: extras.history ?? [],
    ...extras,
  };
}

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
  assert.ok(nextGame.players[1].hand.some((t) => tileKey(t) === tileKey(drawnTile)));
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

test('discardTile creates pending actions for hu peng and chi without changing the random wall', () => {
  const discarded = tile('wan', 3);
  const wall = tiles([
    ['tong', 9],
    ['wan', 9],
  ]);
  const game = makeGame([
    player(tiles([
      ['wan', 3],
      ['tong', 1],
    ])),
    player(tiles([
      ['wan', 1],
      ['wan', 2],
      ['tiao', 1],
      ['tiao', 4],
      ['tiao', 7],
      ['tong', 1],
      ['tong', 4],
      ['tong', 7],
      ['wan', 5],
      ['wan', 7],
      ['wan', 9],
      ['tong', 9],
      ['tiao', 9],
    ])),
    player(tiles([
      ['wan', 3],
      ['wan', 3],
      ['tiao', 1],
      ['tiao', 4],
      ['tiao', 7],
      ['tong', 1],
      ['tong', 4],
      ['tong', 7],
      ['wan', 5],
      ['wan', 7],
      ['wan', 9],
      ['tong', 9],
      ['tiao', 9],
    ])),
    player(tiles([
      ['wan', 1],
      ['wan', 2],
      ['tong', 1],
      ['tong', 2],
      ['tong', 3],
      ['tiao', 1],
      ['tiao', 2],
      ['tiao', 3],
      ['tong', 5],
      ['tong', 5],
      ['tong', 5],
      ['tiao', 9],
      ['tiao', 9],
    ])),
  ], { wall });

  const nextGame = discardTile(game, 0, discarded);

  assert.deepEqual(nextGame.wall, wall);
  assert.equal(nextGame.phase, 'awaiting-claim');
  assert.equal(nextGame.pendingAction.tileKey, 'wan-3');
  assert.deepEqual(
    nextGame.pendingAction.responses.map((response) => ({
      playerIndex: response.playerIndex,
      actions: response.actions,
      chiCount: response.chiOptions.length,
    })),
    [
      { playerIndex: 3, actions: ['hu'], chiCount: 0 },
      { playerIndex: 2, actions: ['peng'], chiCount: 0 },
      { playerIndex: 1, actions: ['chi'], chiCount: 1 },
    ],
  );
});

test('claimDiscard applies chi meld from the next player and removes the source discard', () => {
  const discarded = tile('wan', 3);
  const game = discardTile(makeGame([
    player(tiles([
      ['wan', 3],
      ['tong', 1],
    ])),
    player(tiles([
      ['wan', 1],
      ['wan', 2],
      ['tong', 4],
      ['tong', 5],
      ['tong', 6],
      ['tiao', 1],
      ['tiao', 2],
      ['tiao', 3],
      ['wan', 7],
      ['wan', 8],
      ['wan', 9],
      ['tong', 8],
      ['tong', 8],
    ])),
    player(tiles([['tong', 1]])),
    player(tiles([['tong', 2]])),
  ]), 0, discarded);
  const chiTiles = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
  ]);

  const nextGame = claimDiscard(game, 1, 'chi', chiTiles);

  assert.equal(nextGame.phase, 'awaiting-discard');
  assert.equal(nextGame.currentPlayer, 1);
  assert.equal(nextGame.pendingAction, null);
  assert.equal(nextGame.players[0].discards.length, 0);
  assert.equal(nextGame.players[1].hand.length, 11);
  assert.deepEqual(nextGame.players[1].melds, [{
    type: 'chi',
    fromPlayerIndex: 0,
    tiles: chiTiles,
  }]);
});

test('claimDiscard applies peng meld and gives the claimer the next discard', () => {
  const discarded = tile('wan', 3);
  const game = discardTile(makeGame([
    player(tiles([
      ['wan', 3],
      ['tong', 1],
    ])),
    player(tiles([['tong', 1]])),
    player(tiles([
      ['wan', 3],
      ['wan', 3],
      ['tong', 4],
      ['tong', 5],
      ['tong', 6],
      ['tiao', 1],
      ['tiao', 2],
      ['tiao', 3],
      ['wan', 7],
      ['wan', 8],
      ['wan', 9],
      ['tong', 8],
      ['tong', 8],
    ])),
    player(tiles([['tong', 2]])),
  ]), 0, discarded);

  const nextGame = claimDiscard(game, 2, 'peng');

  assert.equal(nextGame.phase, 'awaiting-discard');
  assert.equal(nextGame.currentPlayer, 2);
  assert.equal(nextGame.players[0].discards.length, 0);
  assert.equal(nextGame.players[2].hand.length, 11);
  assert.deepEqual(nextGame.players[2].melds, [{
    type: 'peng',
    fromPlayerIndex: 0,
    tiles: [discarded, discarded, discarded],
  }]);
});

test('claimDiscard ends the hand when a player claims hu', () => {
  const discarded = tile('wan', 3);
  const game = discardTile(makeGame([
    player(tiles([
      ['wan', 3],
      ['tong', 1],
    ])),
    player(tiles([['tong', 1]])),
    player(tiles([['tong', 2]])),
    player(tiles([
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
    ])),
  ]), 0, discarded);

  const nextGame = claimDiscard(game, 3, 'hu');

  assert.equal(nextGame.phase, 'ended');
  assert.deepEqual(nextGame.result, {
    type: 'ron',
    winnerIndex: 3,
    fromPlayerIndex: 0,
    tileKey: 'wan-3',
  });
});

test('passClaim clears pending action and continues to the next draw when all responders pass', () => {
  const discarded = tile('wan', 3);
  const game = discardTile(makeGame([
    player(tiles([
      ['wan', 3],
      ['tong', 1],
    ])),
    player(tiles([
      ['wan', 1],
      ['wan', 2],
      ['tong', 4],
      ['tong', 5],
      ['tong', 6],
      ['tiao', 1],
      ['tiao', 2],
      ['tiao', 3],
      ['wan', 7],
      ['wan', 8],
      ['wan', 9],
      ['tong', 8],
      ['tong', 8],
    ])),
    player(tiles([['tong', 1]])),
    player(tiles([['tong', 2]])),
  ]), 0, discarded);

  const nextGame = passClaim(game, 1);

  assert.equal(nextGame.phase, 'awaiting-draw');
  assert.equal(nextGame.currentPlayer, 1);
  assert.equal(nextGame.pendingAction, null);
});
