import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canPong, canKongFromDiscard, canConcealedKongs, canAddedKongs,
  canChiSequences, canWinOnTile, canSelfDrawWin,
} from '../src/core/melds.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

test('canPong needs two matching tiles in hand', () => {
  assert.equal(canPong(hand([['wan', 5], ['wan', 5], ['tong', 1]]), t('wan', 5)), true);
  assert.equal(canPong(hand([['wan', 5], ['tong', 1]]), t('wan', 5)), false);
});

test('canKongFromDiscard needs three matching tiles', () => {
  assert.equal(canKongFromDiscard(hand([['wan', 5], ['wan', 5], ['wan', 5]]), t('wan', 5)), true);
  assert.equal(canKongFromDiscard(hand([['wan', 5], ['wan', 5]]), t('wan', 5)), false);
});

test('canConcealedKongs lists tiles held four times', () => {
  const result = canConcealedKongs(hand([['wan', 3], ['wan', 3], ['wan', 3], ['wan', 3], ['tong', 1]]));
  assert.deepEqual(result, [t('wan', 3)]);
});

test('canAddedKongs lists pong melds the hand can upgrade', () => {
  const melds = [{ type: 'pong', tiles: [t('tong', 2), t('tong', 2), t('tong', 2)], from: 1 }];
  assert.deepEqual(canAddedKongs(hand([['tong', 2], ['wan', 9]]), melds), [t('tong', 2)]);
  assert.deepEqual(canAddedKongs(hand([['wan', 9]]), melds), []);
});

test('canChiSequences returns all sequences completed by the tile', () => {
  const seqs = canChiSequences(hand([['wan', 3], ['wan', 4], ['wan', 6]]), t('wan', 5));
  // 5 可与 (3,4) 或 (4,6) 成顺
  assert.equal(seqs.length, 2);
  assert.ok(seqs.some(s => s[0].rank === 3 && s[1].rank === 4));
  assert.ok(seqs.some(s => s[0].rank === 4 && s[1].rank === 6));
});

test('canWinOnTile accounts for exposed melds', () => {
  // 已碰 1 副（meldCount=1），concealed 10 张 + 点炮牌 → 11 张胡
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 9], ['tong', 9],
  ]);
  const melds = [{ type: 'pong', tiles: [t('tiao', 2), t('tiao', 2), t('tiao', 2)], from: 2 }];
  assert.equal(canWinOnTile(concealed, melds, t('tong', 6)), true);
  assert.equal(canWinOnTile(concealed, melds, t('tong', 1)), false);
});

test('canSelfDrawWin checks the full concealed hand', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 9], ['tong', 9],
  ]);
  const melds = [{ type: 'pong', tiles: [t('tiao', 2), t('tiao', 2), t('tiao', 2)], from: 2 }];
  assert.equal(canSelfDrawWin(concealed, melds), true);
});

// --- requireJiangPair tests ---
// 手牌：万1(对)+ 万2-3-4 + 万5-6-7 + 筒1-2-3 + 条1-2-3（共 14 张，对为万1，非将牌）
const nonJiangWinHand = hand([
  ['wan', 1], ['wan', 1],
  ['wan', 2], ['wan', 3], ['wan', 4],
  ['wan', 5], ['wan', 6], ['wan', 7],
  ['tong', 1], ['tong', 2], ['tong', 3],
  ['tiao', 1], ['tiao', 2], ['tiao', 3],
]);

// 听牌：去掉一张万1，等万1 点炮
const nonJiangTenpaiHand = hand([
  ['wan', 1],
  ['wan', 2], ['wan', 3], ['wan', 4],
  ['wan', 5], ['wan', 6], ['wan', 7],
  ['tong', 1], ['tong', 2], ['tong', 3],
  ['tiao', 1], ['tiao', 2], ['tiao', 3],
]);

test('canWinOnTile: default (no requireJiangPair) allows non-jiang pair win', () => {
  assert.equal(canWinOnTile(nonJiangTenpaiHand, [], t('wan', 1)), true);
});

test('canWinOnTile: requireJiangPair:true blocks non-jiang pair win', () => {
  assert.equal(canWinOnTile(nonJiangTenpaiHand, [], t('wan', 1), { requireJiangPair: true }), false);
});

test('canSelfDrawWin: default (no requireJiangPair) allows non-jiang pair win', () => {
  assert.equal(canSelfDrawWin(nonJiangWinHand, []), true);
});

test('canSelfDrawWin: requireJiangPair:true blocks non-jiang pair win', () => {
  assert.equal(canSelfDrawWin(nonJiangWinHand, [], { requireJiangPair: true }), false);
});
