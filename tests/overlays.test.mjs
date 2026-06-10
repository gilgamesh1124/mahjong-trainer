import assert from 'node:assert/strict';
import test from 'node:test';

import { resultBanner } from '../src/ui/overlays.js';

const t = (suit, rank) => ({ suit, rank });
const names = ['玩家', '上家', '对家', '下家'];

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('resultBanner shows 流局 for a draw', () => {
  const html = resultBanner({ result: { type: 'draw' }, players: [] }, names);
  assert.ok(html.includes('流局'));
});

test('resultBanner reveals the winner hand + winning tile on a discard win', () => {
  const winner = {
    hand: [t('wan', 1), t('wan', 2), t('wan', 3)],
    melds: [{ type: 'pong', tiles: [t('tong', 5), t('tong', 5), t('tong', 5)], from: 1 }],
  };
  const game = {
    result: { type: 'win', winner: 2, loser: 0, tile: t('wan', 9), winType: 'discard', pattern: '平胡' },
    players: [{}, {}, winner, {}],
  };
  const html = resultBanner(game, names);

  assert.ok(html.includes('对家 胡牌'));
  assert.ok(html.includes('点炮'));
  assert.ok(html.includes('平胡'));
  assert.ok(html.includes('reveal-hand'));
  assert.ok(html.includes('is-winning'), 'winning tile highlighted');
  // 点炮：暗手 3 张 + 副露 3 张 + 胡牌 1 张 = 7 个 reveal-tile
  assert.equal(countOccurrences(html, 'reveal-tile'), 7);
});

test('resultBanner removes the winning tile from concealed on self-draw (no double count)', () => {
  const winner = { hand: [t('wan', 1), t('wan', 1), t('tong', 5)], melds: [] };
  const game = {
    result: { type: 'win', winner: 0, loser: null, tile: t('wan', 1), winType: 'self-draw', pattern: '自摸' },
    players: [winner, {}, {}, {}],
  };
  const html = resultBanner(game, names);

  assert.ok(html.includes('自摸'));
  assert.ok(html.includes('is-winning'));
  // 自摸：暗手移除 1 张胡牌后剩 2 张 + 单独高亮胡牌 1 张 = 3 个 reveal-tile（与手牌总数一致，无重复）
  assert.equal(countOccurrences(html, 'reveal-tile'), 3);
});

test('resultBanner renders settlement fan line and deltas when provided', () => {
  const winner = { hand: [t('wan', 1), t('wan', 2), t('wan', 3)], melds: [] };
  const game = {
    result: { type: 'win', winner: 2, loser: 0, tile: t('wan', 9), winType: 'discard', pattern: '清一色', patterns: ['清一色'] },
    players: [{}, {}, winner, {}],
  };
  const settlement = {
    category: '大胡', base: 6, multiplier: 1, total: 6,
    payments: [{ seat: 0, delta: -6 }, { seat: 1, delta: 0 }, { seat: 2, delta: 6 }, { seat: 3, delta: 0 }],
  };
  const html = resultBanner(game, names, settlement);
  assert.ok(html.includes('清一色'));
  assert.ok(html.includes('6 分'));
  assert.ok(html.includes('is-plus'));
  assert.ok(html.includes('is-minus'));
  assert.ok(html.includes('next-hand-button'));
});
