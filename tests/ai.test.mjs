import assert from 'node:assert/strict';
import test from 'node:test';

import { tileDanger, decideDiscard, decideClaim, decideAction } from '../src/core/ai.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

function makeGame(overrides = {}) {
  // flags: { initialNoJiang: true } → shouldRequireJiangPair returns false.
  // Pre-jiang tests were written without the jiang-pair rule; this preserves their original intent.
  const players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [], flags: { initialNoJiang: true } }));
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

// --- Part B: decideAction threads requireJiangPair via shouldRequireJiangPair ---

// Hand that wins only via a non-jiang pair: 123万+456万+789万+123筒 + 33条 (rank3=non-jiang pair)
// With requireJiangPair:true (initialNoJiang:false), this should NOT be a self-win → returns discard
// With requireJiangPair:false (initialNoJiang:true), this IS a valid win → returns self-win
const NON_JIANG_WIN_HAND = [
  t('wan', 1), t('wan', 2), t('wan', 3),
  t('wan', 4), t('wan', 5), t('wan', 6),
  t('wan', 7), t('wan', 8), t('wan', 9),
  t('tong', 1), t('tong', 2), t('tong', 3),
  t('tiao', 3), t('tiao', 3), // rank-3 pair: non-jiang
];

test('decideAction blocks self-win on non-jiang pair when seat requires jiang (initialNoJiang:false)', () => {
  const game = makeGame();
  // initialNoJiang:false means the initial hand HAD a jiang tile → jiang pair IS required
  game.players[0] = { hand: NON_JIANG_WIN_HAND, melds: [], discards: [], flags: { initialNoJiang: false } };
  game.lastDraw = { seat: 0, tile: t('tiao', 3), afterKong: false };
  const action = decideAction(game, 0);
  // Must NOT declare self-win because tiao-3 is not a jiang pair
  assert.equal(action.type, 'discard',
    'should return discard when win requires jiang pair but hand only has non-jiang pair');
});

test('decideAction allows self-win on non-jiang pair when seat has no-jiang flag (initialNoJiang:true)', () => {
  const game = makeGame();
  // initialNoJiang:true means the initial hand had NO jiang tile → jiang pair is NOT required
  game.players[0] = { hand: NON_JIANG_WIN_HAND, melds: [], discards: [], flags: { initialNoJiang: true } };
  game.lastDraw = { seat: 0, tile: t('tiao', 3), afterKong: false };
  const action = decideAction(game, 0);
  // CAN declare self-win because jiang pair not required
  assert.equal(action.type, 'self-win',
    'should return self-win when jiang pair is not required and hand is otherwise complete');
});
