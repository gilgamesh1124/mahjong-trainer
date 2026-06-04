import { createSeededRandom, shuffle } from './random.js';
import { createTileSet, removeOneTile, tileKey } from './tiles.js';

function clonePlayers(players) {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discards: [...player.discards],
    melds: [...player.melds],
  }));
}

function createPlayer(hand = []) {
  return {
    hand,
    discards: [],
    melds: [],
  };
}

export function createInitialGame({ seed = Date.now() } = {}) {
  const originalWall = shuffle(createTileSet(), createSeededRandom(seed));
  let cursor = 0;

  const players = [
    createPlayer(originalWall.slice(cursor, cursor + 14)),
    createPlayer(originalWall.slice(cursor + 14, cursor + 27)),
    createPlayer(originalWall.slice(cursor + 27, cursor + 40)),
    createPlayer(originalWall.slice(cursor + 40, cursor + 53)),
  ];
  cursor = 53;

  return {
    seed,
    players,
    wall: originalWall.slice(cursor),
    currentPlayer: 0,
    phase: 'awaiting-discard',
    history: [],
  };
}

export function drawTile(game, playerIndex) {
  const [tile, ...wall] = game.wall;

  if (!tile) {
    throw new Error('Wall is empty');
  }

  const players = clonePlayers(game.players);
  players[playerIndex] = {
    ...players[playerIndex],
    hand: [...players[playerIndex].hand, tile],
  };

  return {
    ...game,
    players,
    wall,
    currentPlayer: playerIndex,
    phase: 'awaiting-discard',
    history: [
      ...game.history,
      {
        type: 'draw',
        playerIndex,
        tileKey: tileKey(tile),
      },
    ],
  };
}

export function discardTile(game, playerIndex, tile, metadata = {}) {
  const players = clonePlayers(game.players);
  const player = players[playerIndex];

  players[playerIndex] = {
    ...player,
    hand: removeOneTile(player.hand, tile),
    discards: [...player.discards, tile],
  };

  return {
    ...game,
    players,
    currentPlayer: (playerIndex + 1) % players.length,
    phase: 'awaiting-draw',
    history: [
      ...game.history,
      {
        type: 'discard',
        playerIndex,
        tileKey: tileKey(tile),
        recommendationId: metadata.recommendationId ?? null,
      },
    ],
  };
}
