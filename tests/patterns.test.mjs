import assert from 'node:assert/strict';
import test from 'node:test';

import { identifyPattern } from '../src/core/patterns.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

test('rob-kong context wins naming priority', () => {
  assert.equal(identifyPattern(hand([['wan', 1]]), [], t('wan', 1), { robKong: true }), '抢杠胡');
});

test('after-kong self draw is 杠上花', () => {
  assert.equal(identifyPattern(hand([['wan', 1]]), [], t('wan', 1), { afterKong: true, selfDraw: true }), '杠上花');
});

test('all one suit is 清一色', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5],
    ['wan', 6], ['wan', 7], ['wan', 8], ['wan', 9], ['wan', 9],
    ['wan', 9], ['wan', 1], ['wan', 1], ['wan', 1],
  ]);
  assert.equal(identifyPattern(concealed, [], t('wan', 1), {}), '清一色');
});

test('all triplets is 碰碰胡', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 1], ['wan', 1],
    ['tong', 5], ['tong', 5], ['tong', 5],
    ['tiao', 9], ['tiao', 9], ['tiao', 9],
    ['tiao', 3], ['tiao', 3], ['tiao', 3],
    ['wan', 4], ['wan', 4],
  ]);
  assert.equal(identifyPattern(concealed, [], t('wan', 1), {}), '碰碰胡');
});

test('plain self draw is 自摸; plain discard win is 平胡', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 5], ['tong', 5],
  ]);
  assert.equal(identifyPattern(concealed, [], t('wan', 1), { selfDraw: true }), '自摸');
  assert.equal(identifyPattern(concealed, [], t('wan', 1), {}), '平胡');
});
