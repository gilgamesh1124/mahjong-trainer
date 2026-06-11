import assert from 'node:assert/strict';
import test from 'node:test';

// render.js 在模块顶层抓取 document，必须先布桩再动态导入。
// node --test 每个文件独立进程，全局桩不会泄漏到其他测试文件。
let lastHtml = '';
const appEl = {
  set innerHTML(value) { lastHtml = value; },
  get innerHTML() { return lastHtml; },
  set className(value) {},
  get className() { return ''; },
  addEventListener() {},
};
globalThis.document = { querySelector: (sel) => (sel === '#app' ? appEl : null) };

const { renderApp } = await import('../src/ui/render.js');
const { recommendDiscards } = await import('../src/core/recommendation.js');

// 3面子 + 99筒将 + 4万/7万孤张 + 9万：best 听牌（打1万 234万+79嵌张），前三含 1 向备选（带 outlook）
const HAND = [
  { suit: 'wan', rank: 1 }, { suit: 'wan', rank: 2 }, { suit: 'wan', rank: 3 },
  { suit: 'tong', rank: 4 }, { suit: 'tong', rank: 5 }, { suit: 'tong', rank: 6 },
  { suit: 'tiao', rank: 7 }, { suit: 'tiao', rank: 8 }, { suit: 'tiao', rank: 9 },
  { suit: 'tong', rank: 9 }, { suit: 'tong', rank: 9 },
  { suit: 'wan', rank: 4 }, { suit: 'wan', rank: 7 },
  { suit: 'wan', rank: 9 },
];

function makeGame() {
  return {
    players: [
      { hand: HAND, melds: [], discards: [], flags: { initialNoJiang: false } },
      { hand: [], melds: [], discards: [], flags: {} },
      { hand: [], melds: [], discards: [], flags: {} },
      { hand: [], melds: [], discards: [], flags: {} },
    ],
    wall: [],
    currentPlayer: 0,
    phase: 'awaiting-discard',
    lastDiscard: null,
    lastDraw: null,
    result: null,
    history: [],
  };
}

const baseProps = (recommendation, expandedChoiceIndex = null) => ({
  game: makeGame(),
  recommendation,
  reviewSummary: { totalDecisions: 0 },
  operationReviewSummary: { totalDecisions: 0 },
  interaction: {},
  adviceCollapsed: false,
  match: { scores: [0, 0, 0, 0], handIndex: 0, dealerSeat: 0 },
  settlement: null,
  expandedChoiceIndex,
});

test('renderApp shows the best-choice process block with structure on the discard turn', () => {
  const recommendation = recommendDiscards({ hand: HAND });
  renderApp(baseProps(recommendation));

  assert.ok(lastHtml.includes('process-block'), 'process block rendered');
  assert.ok(lastHtml.includes('proc-structure'), 'structure row rendered');
  assert.ok(lastHtml.includes('data-choice-expand'), 'choices are expandable');
  // best 为听牌：wait-block 显示听张，过程块不带进张行
  assert.ok(lastHtml.includes('wait-block'), 'tenpai best keeps wait-block');
});

test('expanding a 1-shanten choice renders draws and outlook rows', () => {
  const recommendation = recommendDiscards({ hand: HAND });
  const displayed = recommendation.choices.slice(0, 3);
  const idx = displayed.findIndex((c) => c.shanten === 1 && c.outlook?.length > 0);
  assert.ok(idx >= 0, 'fixture must have a 1-shanten top-3 choice with outlook');

  renderApp(baseProps(recommendation, idx));

  assert.ok(lastHtml.includes('is-expanded'), 'choice expanded');
  assert.ok(lastHtml.includes('收起'), 'expand button flips to 收起');
  assert.ok(lastHtml.includes('proc-draws'), 'draws row rendered for 1-shanten');
  assert.ok(lastHtml.includes('proc-outlooks'), 'outlook rows rendered');
  assert.ok(lastHtml.includes('proc-arrow'), 'outlook arrow rendered');
});
