import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreWin } from '../src/core/scoring.js';

const sum = (payments) => payments.reduce((acc, p) => acc + p.delta, 0);

test('small win by discard: loser pays 1', () => {
  const s = scoreWin({ bigPatterns: [], winType: 'discard', winner: 2, loser: 0 });
  assert.equal(s.category, '小胡');
  assert.equal(s.total, 1);
  assert.deepEqual(s.payments.find((p) => p.seat === 2), { seat: 2, delta: 1 });
  assert.deepEqual(s.payments.find((p) => p.seat === 0), { seat: 0, delta: -1 });
  assert.equal(sum(s.payments), 0);
});

test('small win by self-draw: three each pay 1, winner +3', () => {
  const s = scoreWin({ bigPatterns: [], winType: 'self-draw', winner: 1, loser: null });
  assert.equal(s.payments.find((p) => p.seat === 1).delta, 3);
  for (const seat of [0, 2, 3]) assert.equal(s.payments.find((p) => p.seat === seat).delta, -1);
  assert.equal(sum(s.payments), 0);
});

test('one big pattern = 6, two stack to 12', () => {
  assert.equal(scoreWin({ bigPatterns: ['清一色'], winType: 'discard', winner: 0, loser: 1 }).total, 6);
  const s = scoreWin({ bigPatterns: ['清一色', '碰碰胡'], winType: 'self-draw', winner: 0, loser: null });
  assert.equal(s.category, '大胡');
  assert.equal(s.total, 12);
  assert.equal(s.payments.find((p) => p.seat === 0).delta, 36); // 三家各付 12
});

test('rob-kong pays like discard: the robbed seat single-pays', () => {
  const s = scoreWin({ bigPatterns: ['抢杠胡'], winType: 'rob-kong', winner: 3, loser: 1 });
  assert.equal(s.payments.find((p) => p.seat === 1).delta, -6);
  assert.equal(s.payments.find((p) => p.seat === 3).delta, 6);
  assert.equal(sum(s.payments), 0);
});
