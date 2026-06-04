import assert from 'node:assert/strict';
import test from 'node:test';

import { tileDanger, decideDiscard, decideClaim, decideAction } from '../src/core/ai.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

function makeGame(overrides = {}) {
  const players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
  return { players, wall: [], currentPlayer: 0, phase: 'awaiting-discard', lastDiscard: null, lastDraw: null, result: null, history: [], ...overrides };
}

test('tileDanger: a tile already discarded by every opponent is 0 danger', () => {
  const game = makeGame();
  game.players[1].discards = [t('wan', 5)];
  game.players[2].discards = [t('wan', 5)];
  game.players[3].discards = [t('wan', 5)];
  assert.equal(tileDanger(t('wan', 5), game, 0), 0);
});

test('tileDanger: an unseen middle tile is more dangerous than an unseen terminal', () => {
  const game = makeGame();
  assert.ok(tileDanger(t('wan', 5), game, 0) > tileDanger(t('wan', 1), game, 0));
});

test('decideDiscard returns a tile from the hand', () => {
  const game = makeGame();
  game.players[0].hand = hand([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3], ['tiao', 7], ['tiao', 8],
    ['tiao', 9], ['tong', 9], ['tong', 9], ['tiao', 1],
  ]);
  const tile = decideDiscard(game, 0);
  assert.ok(game.players[0].hand.some((h) => h.suit === tile.suit && h.rank === tile.rank));
});

test('decideClaim always takes a win', () => {
  const game = makeGame();
  const intent = decideClaim(game, 2, [{ type: 'pong' }, { type: 'win' }]);
  assert.equal(intent.type, 'win');
});

test('decideClaim passes a pong that does not help a far-from-ready hand', () => {
  const game = makeGame();
  // 一手散牌（向听很大），碰一对中张无益 → 过
  game.players[2].hand = hand([
    ['wan', 1], ['wan', 5], ['wan', 5], ['tong', 2], ['tong', 7],
    ['tiao', 3], ['tiao', 8], ['wan', 9], ['tong', 4], ['tiao', 6], ['tong', 9],
  ]);
  game.lastDiscard = { seat: 0, tile: t('wan', 5) }; // decideClaim 读取被打出的牌
  const intent = decideClaim(game, 2, [{ type: 'pong' }]);
  assert.equal(intent.type, 'pass');
});

test('decideAction returns self-win when the hand is complete', () => {
  const game = makeGame();
  game.players[0].hand = hand([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  game.lastDraw = { seat: 0, tile: t('tiao', 1), afterKong: false };
  const action = decideAction(game, 0);
  assert.equal(action.type, 'self-win');
});
