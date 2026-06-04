import { createSeededRandom, shuffle } from './random.js';
import { hasJiangTile, isWinningHand } from './rules.js';
import { createTileSet, removeOneTile, sortTiles, tileKey } from './tiles.js';

const ACTION_PRIORITY = {
  hu: 0,
  gang: 1,
  peng: 2,
  chi: 3,
};

function clonePlayers(players) {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discards: [...player.discards],
    melds: player.melds.map((meld) => ({
      ...meld,
      tiles: [...meld.tiles],
    })),
    flags: { ...(player.flags ?? {}) },
  }));
}

function createPlayer(hand = []) {
  return {
    hand,
    discards: [],
    melds: [],
    flags: {
      initialNoJiang: !hasJiangTile(hand),
    },
  };
}

export function createInitialGame({ seed = Date.now() } = {}) {
  const originalWall = shuffle(createTileSet(), createSeededRandom(seed));
  let cursor = 0;

  const players = [
    createPlayer(sortTiles(originalWall.slice(cursor, cursor + 14))),
    createPlayer(sortTiles(originalWall.slice(cursor + 14, cursor + 27))),
    createPlayer(sortTiles(originalWall.slice(cursor + 27, cursor + 40))),
    createPlayer(sortTiles(originalWall.slice(cursor + 40, cursor + 53))),
  ];
  cursor = 53;

  return {
    seed,
    players,
    wall: originalWall.slice(cursor),
    currentPlayer: 0,
    phase: 'awaiting-discard',
    pendingAction: null,
    result: null,
    history: [],
  };
}

function tileMatches(a, b) {
  return tileKey(a) === tileKey(b);
}

function countMatchingTiles(tiles, tileToMatch) {
  return tiles.filter((tile) => tileMatches(tile, tileToMatch)).length;
}

function nextPlayerIndex(playerIndex, playerCount = 4) {
  return (playerIndex + 1) % playerCount;
}

function turnDistance(fromPlayerIndex, playerIndex, playerCount = 4) {
  return (playerIndex - fromPlayerIndex + playerCount) % playerCount;
}

function removeLastDiscard(players, fromPlayerIndex, discardedTile) {
  const discards = players[fromPlayerIndex].discards;
  const lastDiscard = discards.at(-1);

  if (!lastDiscard || !tileMatches(lastDiscard, discardedTile)) {
    throw new Error('Claimed discard is not available');
  }

  players[fromPlayerIndex] = {
    ...players[fromPlayerIndex],
    discards: discards.slice(0, -1),
  };
}

function removeTilesFromHand(hand, tilesToRemove) {
  return tilesToRemove.reduce(
    (remainingHand, tile) => removeOneTile(remainingHand, tile),
    hand,
  );
}

function getChiOptions(hand, discardedTile) {
  const options = [];

  for (const ranks of [
    [discardedTile.rank - 2, discardedTile.rank - 1, discardedTile.rank],
    [discardedTile.rank - 1, discardedTile.rank, discardedTile.rank + 1],
    [discardedTile.rank, discardedTile.rank + 1, discardedTile.rank + 2],
  ]) {
    if (ranks.some((rank) => rank < 1 || rank > 9)) {
      continue;
    }

    const neededTiles = ranks
      .filter((rank) => rank !== discardedTile.rank)
      .map((rank) => ({ suit: discardedTile.suit, rank }));

    if (neededTiles.every((tile) => countMatchingTiles(hand, tile) > 0)) {
      options.push(ranks.map((rank) => ({ suit: discardedTile.suit, rank })));
    }
  }

  return options;
}

export function getAvailableActions(game, playerIndex, discardedTile, fromPlayerIndex) {
  if (playerIndex === fromPlayerIndex) {
    return {
      playerIndex,
      actions: [],
      chiOptions: [],
    };
  }

  const hand = game.players[playerIndex].hand;
  const matchingCount = countMatchingTiles(hand, discardedTile);
  const requireJiangPair = shouldRequireJiangPair(game.players[playerIndex]);
  const actions = [];
  const chiOptions = [];

  if (isWinningHand([...hand, discardedTile], { requireJiangPair })) {
    actions.push('hu');
  }

  if (matchingCount >= 3) {
    actions.push('gang');
  }

  if (matchingCount >= 2) {
    actions.push('peng');
  }

  if (playerIndex === nextPlayerIndex(fromPlayerIndex, game.players.length)) {
    chiOptions.push(...getChiOptions(hand, discardedTile));
    if (chiOptions.length > 0) {
      actions.push('chi');
    }
  }

  return {
    playerIndex,
    actions,
    chiOptions,
  };
}

function buildPendingAction(game, fromPlayerIndex, discardedTile) {
  const responses = game.players
    .map((_, playerIndex) => getAvailableActions(game, playerIndex, discardedTile, fromPlayerIndex))
    .filter((response) => response.actions.length > 0)
    .sort((a, b) => {
      const priorityA = Math.min(...a.actions.map((action) => ACTION_PRIORITY[action]));
      const priorityB = Math.min(...b.actions.map((action) => ACTION_PRIORITY[action]));

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return turnDistance(fromPlayerIndex, a.playerIndex, game.players.length)
        - turnDistance(fromPlayerIndex, b.playerIndex, game.players.length);
    });

  if (responses.length === 0) {
    return null;
  }

  return {
    tile: discardedTile,
    tileKey: tileKey(discardedTile),
    fromPlayerIndex,
    responses,
    passedPlayerIndexes: [],
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
    hand: sortTiles([...players[playerIndex].hand, tile]),
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

  const baseGame = {
    ...game,
    players,
    currentPlayer: nextPlayerIndex(playerIndex, players.length),
    phase: 'awaiting-draw',
    pendingAction: null,
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

  const pendingAction = buildPendingAction(baseGame, playerIndex, tile);

  if (!pendingAction) {
    return baseGame;
  }

  return {
    ...baseGame,
    phase: 'awaiting-claim',
    pendingAction,
  };
}

function getPendingResponse(game, playerIndex, action) {
  const response = game.pendingAction?.responses.find(
    (candidate) => candidate.playerIndex === playerIndex,
  );

  if (!response || !response.actions.includes(action)) {
    throw new Error(`Action ${action} is not available for player ${playerIndex}`);
  }

  return response;
}

export function claimDiscard(game, playerIndex, action, tiles = []) {
  if (!game.pendingAction) {
    throw new Error('No pending action to claim');
  }

  const response = getPendingResponse(game, playerIndex, action);
  const discardedTile = game.pendingAction.tile;
  const fromPlayerIndex = game.pendingAction.fromPlayerIndex;
  const players = clonePlayers(game.players);

  if (action === 'hu') {
    return {
      ...game,
      phase: 'ended',
      currentPlayer: playerIndex,
      pendingAction: null,
      result: {
        type: 'ron',
        winnerIndex: playerIndex,
        fromPlayerIndex,
        tileKey: tileKey(discardedTile),
      },
      history: [
        ...game.history,
        {
          type: 'hu',
          playerIndex,
          fromPlayerIndex,
          tileKey: tileKey(discardedTile),
        },
      ],
    };
  }

  removeLastDiscard(players, fromPlayerIndex, discardedTile);

  let meldTiles;
  let handTilesToRemove;

  if (action === 'chi') {
    const selectedTiles = tiles.length > 0 ? tiles : response.chiOptions[0];
    const selectedKey = selectedTiles.map(tileKey).join(',');
    const allowedKeys = response.chiOptions.map((option) => option.map(tileKey).join(','));

    if (!allowedKeys.includes(selectedKey)) {
      throw new Error('Chi option is not available');
    }

    meldTiles = selectedTiles;
    handTilesToRemove = selectedTiles.filter((tile) => !tileMatches(tile, discardedTile));
  } else if (action === 'peng') {
    meldTiles = [discardedTile, discardedTile, discardedTile];
    handTilesToRemove = [discardedTile, discardedTile];
  } else if (action === 'gang') {
    meldTiles = [discardedTile, discardedTile, discardedTile, discardedTile];
    handTilesToRemove = [discardedTile, discardedTile, discardedTile];
  } else {
    throw new Error(`Unsupported claim action: ${action}`);
  }

  players[playerIndex] = {
    ...players[playerIndex],
    hand: sortTiles(removeTilesFromHand(players[playerIndex].hand, handTilesToRemove)),
    melds: [
      ...players[playerIndex].melds,
      {
        type: action,
        fromPlayerIndex,
        tiles: meldTiles,
      },
    ],
  };

  return {
    ...game,
    players,
    currentPlayer: playerIndex,
    phase: 'awaiting-discard',
    pendingAction: null,
    history: [
      ...game.history,
      {
        type: action,
        playerIndex,
        fromPlayerIndex,
        tileKey: tileKey(discardedTile),
      },
    ],
  };
}

export function passClaim(game, playerIndex) {
  if (!game.pendingAction) {
    return game;
  }

  const response = game.pendingAction.responses.find(
    (candidate) => candidate.playerIndex === playerIndex,
  );

  if (!response) {
    return game;
  }

  const passedPlayerIndexes = [
    ...game.pendingAction.passedPlayerIndexes,
    playerIndex,
  ];
  const remainingResponses = game.pendingAction.responses.filter(
    (candidate) => !passedPlayerIndexes.includes(candidate.playerIndex),
  );

  if (remainingResponses.length > 0) {
    return {
      ...game,
      pendingAction: {
        ...game.pendingAction,
        responses: remainingResponses,
        passedPlayerIndexes,
      },
    };
  }

  return {
    ...game,
    phase: 'awaiting-draw',
    currentPlayer: nextPlayerIndex(game.pendingAction.fromPlayerIndex, game.players.length),
    pendingAction: null,
    history: [
      ...game.history,
      {
        type: 'pass',
        playerIndex,
      },
    ],
  };
}

export function declareSelfWin(game, playerIndex) {
  const requireJiangPair = shouldRequireJiangPair(game.players[playerIndex]);

  if (!isWinningHand(game.players[playerIndex].hand, { requireJiangPair })) {
    throw new Error('Player does not have a winning hand');
  }

  const winningTile = game.players[playerIndex].hand.at(-1);

  return {
    ...game,
    phase: 'ended',
    currentPlayer: playerIndex,
    pendingAction: null,
    result: {
      type: 'zimo',
      winnerIndex: playerIndex,
      fromPlayerIndex: null,
      tileKey: winningTile ? tileKey(winningTile) : null,
    },
    history: [
      ...game.history,
      {
        type: 'zimo',
        playerIndex,
        tileKey: winningTile ? tileKey(winningTile) : null,
      },
    ],
  };
}

export function shouldRequireJiangPair(player) {
  return !player.flags?.initialNoJiang;
}
