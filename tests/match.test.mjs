import assert from 'node:assert/strict';
import test from 'node:test';

import { createMatch, settleHand } from '../src/core/match.js';

const winGame = (over = {}) => ({
  result: { type: 'win', winner: 2, loser: 0, winType: 'discard', patterns: [], ...over },
});

test('createMatch starts zeroed with dealer 0', () => {
  assert.deepEqual(createMatch(), { scores: [0, 0, 0, 0], handIndex: 0, dealerSeat: 0 });
});

test('settleHand applies payments and makes the winner dealer', () => {
  const { match, settlement } = settleHand(createMatch(), winGame());
  assert.equal(settlement.total, 1);
  assert.deepEqual(match.scores, [-1, 0, 1, 0]);
  assert.equal(match.dealerSeat, 2);
  assert.equal(match.handIndex, 1);
});

test('settleHand stacks scores across hands (big self-draw)', () => {
  const first = settleHand(createMatch(), winGame());
  const second = settleHand(first.match, winGame({
    winner: 1, loser: null, winType: 'self-draw', patterns: ['清一色'],
  }));
  assert.deepEqual(second.match.scores, [-7, 18, -5, -6]); // -1-6, 0+18, 1-6, 0-6
  assert.equal(second.match.dealerSeat, 1);
  assert.equal(second.match.handIndex, 2);
});

test('settleHand on a draw keeps scores and dealer (连庄), null settlement', () => {
  const start = { scores: [3, -1, -1, -1], handIndex: 4, dealerSeat: 2 };
  const { match, settlement } = settleHand(start, { result: { type: 'draw' } });
  assert.equal(settlement, null);
  assert.deepEqual(match.scores, [3, -1, -1, -1]);
  assert.equal(match.dealerSeat, 2);
  assert.equal(match.handIndex, 5);
  assert.deepEqual(start.scores, [3, -1, -1, -1]); // 不可变
});
