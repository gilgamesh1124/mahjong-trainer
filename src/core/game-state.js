import { createSeededRandom, shuffle } from './random.js';
import { hasJiangTile } from './rules.js';
import { createTileSet, removeOneTile, sortTiles, tileKey } from './tiles.js';

function clonePlayers(players) {
  return players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discards: [...player.discards],
    melds: [...player.melds],
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

export function shouldRequireJiangPair(player) {
  return !player.flags?.initialNoJiang;
}

export function createInitialGame({ seed = Date.now(), dealerSeat = 0 } = {}) {
  const originalWall = shuffle(createTileSet(), createSeededRandom(seed));
  const handSizes = [13, 13, 13, 13];
  handSizes[dealerSeat] = 14;

  let cursor = 0;
  const players = handSizes.map((size) => {
    const hand = sortTiles(originalWall.slice(cursor, cursor + size));
    cursor += size;
    return createPlayer(hand);
  });

  return {
    seed,
    players,
    wall: originalWall.slice(cursor),
    currentPlayer: dealerSeat,
    phase: 'awaiting-discard',
    history: [],
    lastDiscard: null,
    lastDraw: null,
    result: null,
  };
}

export function drawTile(game, playerIndex, { afterKong = false } = {}) {
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
    lastDraw: { seat: playerIndex, tile, afterKong },
    lastDiscard: null,
    history: [...game.history, { type: 'draw', playerIndex, tileKey: tileKey(tile) }],
  };
}

export function applyDiscard(game, seat, tile) {
  const players = clonePlayers(game.players);
  players[seat] = {
    ...players[seat],
    hand: removeOneTile(players[seat].hand, tile),
    discards: [...players[seat].discards, tile],
  };
  return {
    ...game,
    players,
    phase: 'awaiting-claim',
    lastDiscard: { seat, tile },
    lastDraw: null,
    history: [...game.history, { type: 'discard', playerIndex: seat, tileKey: tileKey(tile) }],
  };
}

function meldThenTurn(game, players, seat, type, tileK, fromSeat) {
  return {
    ...game,
    players,
    currentPlayer: seat,
    phase: 'awaiting-discard',
    lastDiscard: null,
    lastDraw: null,
    history: [...game.history, { type, playerIndex: seat, tileKey: tileK, from: fromSeat ?? null }],
  };
}

export function applyPong(game, seat, tile, fromSeat) {
  const players = clonePlayers(game.players);
  let hand = players[seat].hand;
  hand = removeOneTile(hand, tile);
  hand = removeOneTile(hand, tile);
  players[seat] = { ...players[seat], hand, melds: [...players[seat].melds, { type: 'pong', tiles: [tile, tile, tile], from: fromSeat }] };
  players[fromSeat] = { ...players[fromSeat], discards: removeOneTile(players[fromSeat].discards, tile) };
  return meldThenTurn(game, players, seat, 'pong', tileKey(tile), fromSeat);
}

export function applyChi(game, seat, seqTiles, claimedTile, fromSeat) {
  const players = clonePlayers(game.players);
  let hand = players[seat].hand;
  for (const tile of seqTiles) hand = removeOneTile(hand, tile);
  const meldTiles = sortTiles([...seqTiles, claimedTile]);
  players[seat] = { ...players[seat], hand, melds: [...players[seat].melds, { type: 'chi', tiles: meldTiles, from: fromSeat }] };
  players[fromSeat] = { ...players[fromSeat], discards: removeOneTile(players[fromSeat].discards, claimedTile) };
  return meldThenTurn(game, players, seat, 'chi', tileKey(claimedTile), fromSeat);
}

export function applyKong(game, seat, tile, fromSeat, kind) {
  const players = clonePlayers(game.players);
  let hand = players[seat].hand;
  let melds = [...players[seat].melds];

  if (kind === 'kong') {
    // 明杠：手里 3 张 + 弃牌区那张 = 4 张
    hand = removeOneTile(hand, tile);
    hand = removeOneTile(hand, tile);
    hand = removeOneTile(hand, tile);
    melds.push({ type: 'kong', tiles: [tile, tile, tile, tile], from: fromSeat });
    players[fromSeat] = { ...players[fromSeat], discards: removeOneTile(players[fromSeat].discards, tile) };
  } else if (kind === 'concealed-kong') {
    for (let i = 0; i < 4; i += 1) hand = removeOneTile(hand, tile);
    melds.push({ type: 'concealed-kong', tiles: [tile, tile, tile, tile], from: null });
  } else if (kind === 'added-kong') {
    hand = removeOneTile(hand, tile);
    melds = melds.map((meld) => (
      meld.type === 'pong' && tileKey(meld.tiles[0]) === tileKey(tile)
        ? { type: 'added-kong', tiles: [tile, tile, tile, tile], from: meld.from }
        : meld
    ));
  } else {
    throw new Error(`Unknown kong kind: ${kind}`);
  }

  players[seat] = { ...players[seat], hand, melds };
  const afterMeld = {
    ...game,
    players,
    currentPlayer: seat,
    lastDiscard: null,
    history: [...game.history, { type: 'kong', kind, playerIndex: seat, tileKey: tileKey(tile), from: fromSeat ?? null }],
  };
  return drawTile(afterMeld, seat, { afterKong: true });
}

export function applyWin(game, seat, info) {
  return {
    ...game,
    phase: 'hand-over',
    result: {
      type: 'win',
      winner: seat,
      loser: info.loser ?? null,
      tile: info.tile,
      winType: info.winType,
      afterKong: !!info.afterKong,
      pattern: info.pattern,
    },
    history: [...game.history, { type: 'win', playerIndex: seat, winType: info.winType }],
  };
}

export function markDraw(game) {
  return {
    ...game,
    phase: 'hand-over',
    result: { type: 'draw' },
    history: [...game.history, { type: 'draw-game' }],
  };
}
