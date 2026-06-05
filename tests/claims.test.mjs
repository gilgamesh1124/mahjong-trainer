import assert from 'node:assert/strict';
import test from 'node:test';

import { claimOptionsFor, resolveClaims } from '../src/core/claims.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));
const player = (specs, melds = []) => ({ hand: hand(specs), melds, discards: [] });

test('claimOptionsFor offers chi only when seat is the discarder 下家', () => {
  const p = player([['wan', 3], ['wan', 4]]);
  // discarder=0; 下家 = (0+3)%4 = 3 → seat 3 可吃，seat 1 不可吃
  const asNext = claimOptionsFor(3, p, t('wan', 5), 0);
  const notNext = claimOptionsFor(1, p, t('wan', 5), 0);
  assert.ok(asNext.some((o) => o.type === 'chi'));
  assert.ok(!notNext.some((o) => o.type === 'chi'));
});

test('claimOptionsFor includes pong/kong/win when available', () => {
  const p = player([['wan', 5], ['wan', 5], ['wan', 5]]);
  const opts = claimOptionsFor(2, p, t('wan', 5), 0);
  assert.ok(opts.some((o) => o.type === 'pong'));
  assert.ok(opts.some((o) => o.type === 'kong'));
});

test('resolveClaims: win beats pong beats chi', () => {
  const winner = resolveClaims([
    { seat: 1, claim: { type: 'chi' } },
    { seat: 2, claim: { type: 'pong' } },
    { seat: 3, claim: { type: 'win' } },
  ], 0);
  assert.equal(winner.seat, 3);
});

test('resolveClaims: equal priority picks closest counterclockwise to discarder', () => {
  // discarder 0；下家方向 0→3→2→1。两家都要碰，座位 3 比座位 2 更近
  const winner = resolveClaims([
    { seat: 2, claim: { type: 'pong' } },
    { seat: 3, claim: { type: 'pong' } },
  ], 0);
  assert.equal(winner.seat, 3);
});

test('resolveClaims returns null when everyone passes', () => {
  assert.equal(resolveClaims([{ seat: 1, claim: { type: 'pass' } }], 0), null);
  assert.equal(resolveClaims([], 0), null);
});

// --- requireJiangPair tests for claimOptionsFor ---
// 听牌：万1-2-3-4-5-6-7 + 筒1-2-3 + 条1-2-3，等万1（非将牌对）胡牌
const nonJiangTenpaiHand = [
  t('wan', 1),
  t('wan', 2), t('wan', 3), t('wan', 4),
  t('wan', 5), t('wan', 6), t('wan', 7),
  t('tong', 1), t('tong', 2), t('tong', 3),
  t('tiao', 1), t('tiao', 2), t('tiao', 3),
];

test('claimOptionsFor: default includes win on non-jiang pair tile', () => {
  const p = { hand: nonJiangTenpaiHand, melds: [], discards: [] };
  const opts = claimOptionsFor(2, p, t('wan', 1), 0);
  assert.ok(opts.some((o) => o.type === 'win'), 'should include win by default');
});

test('claimOptionsFor: requireJiangPair:true excludes win on non-jiang pair tile', () => {
  const p = { hand: nonJiangTenpaiHand, melds: [], discards: [] };
  const opts = claimOptionsFor(2, p, t('wan', 1), 0, { requireJiangPair: true });
  assert.ok(!opts.some((o) => o.type === 'win'), 'win should be blocked by requireJiangPair');
});
