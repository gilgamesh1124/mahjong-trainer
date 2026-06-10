import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createInitialGame,
  drawTile,
  applyDiscard,
  applyPong,
  applyChi,
  applyKong,
  applyWin,
  markDraw,
  shouldRequireJiangPair,
} from '../src/core/game-state.js';
import { tileKey } from '../src/core/tiles.js';

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

test('drawTile rejects drawing from an empty wall', () => {
  const game = {
    ...createInitialGame({ seed: 1234 }),
    wall: [],
  };

  assert.throws(() => drawTile(game, 1), /Wall is empty/);
});

test('applyDiscard moves tile to discards and opens claim window', () => {
  const game = createInitialGame({ seed: 1234 });
  const tile = game.players[0].hand[0];

  const next = applyDiscard(game, 0, tile);

  assert.notEqual(next, game);
  assert.equal(next.players[0].hand.length, 13);
  assert.deepEqual(next.players[0].discards.at(-1), tile);
  assert.equal(next.currentPlayer, 0);            // 出牌后留在打牌者，待认领
  assert.equal(next.phase, 'awaiting-claim');
  assert.deepEqual(next.lastDiscard, { seat: 0, tile });
  assert.equal(game.players[0].hand.length, 14);  // 不可变
});

test('applyPong melds the tile, removes it from discarder pile, passes turn', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'wan', rank: 5 };
  game.players[0].discards = [tile];
  game.players[2].hand = [tile, tile, { suit: 'tong', rank: 1 }];
  game = { ...game, lastDiscard: { seat: 0, tile } };

  const next = applyPong(game, 2, tile, 0);

  assert.equal(next.players[2].melds.length, 1);
  assert.equal(next.players[2].melds[0].type, 'pong');
  assert.equal(next.players[2].hand.length, 1);
  assert.equal(next.players[0].discards.length, 0);
  assert.equal(next.currentPlayer, 2);
  assert.equal(next.phase, 'awaiting-discard');
  assert.equal(next.lastDiscard, null);
  // applyPong 不可变：输入 game 的手牌/弃牌未被改动
  assert.equal(game.players[2].hand.length, 3);
  assert.equal(game.players[0].discards.length, 1);
});

test('applyChi melds a sequence from the 上家 discard', () => {
  let game = createInitialGame({ seed: 1234 });
  const claimed = { suit: 'wan', rank: 5 };
  game.players[0].discards = [claimed];
  game.players[3].hand = [{ suit: 'wan', rank: 3 }, { suit: 'wan', rank: 4 }, { suit: 'tong', rank: 1 }];
  game = { ...game, lastDiscard: { seat: 0, tile: claimed } };

  const next = applyChi(game, 3, [{ suit: 'wan', rank: 3 }, { suit: 'wan', rank: 4 }], claimed, 0);

  assert.equal(next.players[3].melds[0].type, 'chi');
  assert.equal(next.players[3].melds[0].tiles.length, 3);
  assert.equal(next.players[3].hand.length, 1);
  assert.equal(next.currentPlayer, 3);
  assert.equal(next.phase, 'awaiting-discard');
});

test('applyKong from discard draws a replacement and flags afterKong', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'wan', rank: 5 };
  game.players[0].discards = [tile];
  game.players[2].hand = [tile, tile, tile, { suit: 'tong', rank: 1 }];
  game = { ...game, lastDiscard: { seat: 0, tile } };
  const wallTop = game.wall[0];

  const next = applyKong(game, 2, tile, 0, 'kong');

  assert.equal(next.players[2].melds[0].type, 'kong');
  assert.equal(next.players[2].melds[0].tiles.length, 4);
  assert.equal(next.players[0].discards.length, 0);
  assert.equal(next.lastDraw.afterKong, true);
  assert.ok(next.players[2].hand.some((t) => tileKey(t) === tileKey(wallTop)));
  assert.equal(next.phase, 'awaiting-discard');
});

test('applyKong added-kong upgrades an existing pong and keeps its from-seat', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'tong', rank: 3 };
  game.players[1].melds = [{ type: 'pong', tiles: [tile, tile, tile], from: 0 }];
  game.players[1].hand = [tile, { suit: 'wan', rank: 9 }];

  const next = applyKong(game, 1, tile, null, 'added-kong');

  assert.equal(next.players[1].melds.length, 1);
  assert.equal(next.players[1].melds[0].type, 'added-kong');
  assert.equal(next.players[1].melds[0].tiles.length, 4);
  assert.equal(next.players[1].melds[0].from, 0); // 保留原碰来源
  assert.equal(next.lastDraw.afterKong, true);
  assert.equal(next.players[1].hand.length, 2); // 收走 1 张 + 摸补牌 1 张
});

test('applyKong concealed-kong removes four from hand', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'tiao', rank: 7 };
  game.players[1].hand = [tile, tile, tile, tile, { suit: 'wan', rank: 2 }];

  const next = applyKong(game, 1, tile, null, 'concealed-kong');

  assert.equal(next.players[1].melds[0].type, 'concealed-kong');
  assert.equal(next.players[1].melds[0].from, null);
  assert.equal(next.lastDraw.afterKong, true);
  assert.equal(next.players[1].hand.length, 2); // 4 张入暗杠 + 摸补牌 1 张
});

test('applyKong throws on an unknown kind', () => {
  const game = createInitialGame({ seed: 1234 });
  assert.throws(
    () => applyKong(game, 0, { suit: 'wan', rank: 1 }, null, 'bogus'),
    /Unknown kong kind/,
  );
});

test('applyWin and markDraw set hand-over result', () => {
  const game = createInitialGame({ seed: 1234 });
  const won = applyWin(game, 1, { winType: 'self-draw', tile: { suit: 'wan', rank: 1 }, loser: null, afterKong: false, pattern: '自摸' });
  assert.equal(won.phase, 'hand-over');
  assert.equal(won.result.winner, 1);
  assert.equal(won.result.pattern, '自摸');

  const drawn = markDraw(game);
  assert.equal(drawn.phase, 'hand-over');
  assert.equal(drawn.result.type, 'draw');
});

// M2: per-player initialNoJiang flag + shouldRequireJiangPair

test('createInitialGame sets flags.initialNoJiang as a boolean on every player', () => {
  const game = createInitialGame({ seed: 1234 });
  for (const player of game.players) {
    assert.ok('flags' in player, 'player must have flags');
    assert.equal(typeof player.flags.initialNoJiang, 'boolean');
  }
});

test('shouldRequireJiangPair returns false when initialNoJiang is true (no jiang in starting hand)', () => {
  const player = { flags: { initialNoJiang: true } };
  assert.equal(shouldRequireJiangPair(player), false);
});

test('shouldRequireJiangPair returns true when initialNoJiang is false (has jiang in starting hand)', () => {
  const player = { flags: { initialNoJiang: false } };
  assert.equal(shouldRequireJiangPair(player), true);
});

test('shouldRequireJiangPair returns true when flags are missing (safe default)', () => {
  assert.equal(shouldRequireJiangPair({}), true);
  assert.equal(shouldRequireJiangPair({ flags: {} }), true);
});

test('flags.initialNoJiang correctly reflects presence of 2/5/8-rank tiles in dealt hand', () => {
  // A hand with only rank-1 tiles has no jiang → initialNoJiang must be true
  const noJiangGame = {
    ...createInitialGame({ seed: 1234 }),
    players: [
      { hand: [{ suit: 'tong', rank: 1 }, { suit: 'wan', rank: 1 }], discards: [], melds: [], flags: { initialNoJiang: true } },
    ],
  };
  assert.equal(shouldRequireJiangPair(noJiangGame.players[0]), false);

  // A hand with a rank-2 tile has jiang → initialNoJiang must be false
  const hasJiangGame = {
    ...createInitialGame({ seed: 1234 }),
    players: [
      { hand: [{ suit: 'tong', rank: 2 }, { suit: 'wan', rank: 1 }], discards: [], melds: [], flags: { initialNoJiang: false } },
    ],
  };
  assert.equal(shouldRequireJiangPair(hasJiangGame.players[0]), true);
});

test('flags survive applyDiscard transition', () => {
  const game = createInitialGame({ seed: 1234 });
  const originalFlags = { ...game.players[0].flags };
  const tile = game.players[0].hand[0];
  const next = applyDiscard(game, 0, tile);
  assert.deepEqual(next.players[0].flags, originalFlags);
});

test('flags survive drawTile transition', () => {
  const game = createInitialGame({ seed: 1234 });
  const originalFlags = { ...game.players[1].flags };
  // first discard so we can draw
  const afterDiscard = applyDiscard(game, 0, game.players[0].hand[0]);
  const next = drawTile(afterDiscard, 1);
  assert.deepEqual(next.players[1].flags, originalFlags);
});

test('flags survive applyPong transition', () => {
  let game = createInitialGame({ seed: 1234 });
  const tile = { suit: 'wan', rank: 1 };
  game.players[0].discards = [tile];
  game.players[2].hand = [tile, tile, { suit: 'tong', rank: 1 }];
  game.players[2].flags = { initialNoJiang: true };
  game = { ...game, lastDiscard: { seat: 0, tile } };

  const next = applyPong(game, 2, tile, 0);
  assert.deepEqual(next.players[2].flags, { initialNoJiang: true });
});

test('flags survive markDraw', () => {
  const game = createInitialGame({ seed: 1234 });
  const originalFlags = game.players.map((p) => ({ ...p.flags }));
  const next = markDraw(game);
  for (let i = 0; i < 4; i++) {
    assert.deepEqual(next.players[i].flags, originalFlags[i]);
  }
});

test('createInitialGame deals 14 tiles to a non-zero dealer who acts first', () => {
  const game = createInitialGame({ seed: 1234, dealerSeat: 2 });
  assert.equal(game.players[2].hand.length, 14);
  for (const seat of [0, 1, 3]) assert.equal(game.players[seat].hand.length, 13);
  assert.equal(game.currentPlayer, 2);
  assert.equal(game.wall.length, 55);
  assert.equal(typeof game.players[2].flags.initialNoJiang, 'boolean');
});

test('createInitialGame throws on out-of-range dealerSeat', () => {
  assert.throws(() => createInitialGame({ seed: 1, dealerSeat: 5 }), /dealerSeat out of range/);
  assert.throws(() => createInitialGame({ seed: 1, dealerSeat: -1 }), /dealerSeat out of range/);
});
