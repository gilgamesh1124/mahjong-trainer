import assert from 'node:assert/strict';
import test from 'node:test';

import { claimOptionsFor } from '../src/core/claims.js';
import { recommendOperation } from '../src/core/operation-advice.js';
import { recordOperationDecision, summarizeOperationReview } from '../src/core/review.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

// 端到端串联：claimOptionsFor → recommendOperation → recordOperationDecision → summarizeOperationReview。
// 这条链曾有两个集成 bug：①review 用 action 词汇 vs advice 用 type；②碰/杠 的 followedBest 因
// tiles 长度不一致而误判。本测试覆盖真实数据流，确保两者都不复现。

const claimablePlayer = () => ({
  hand: hand([
    ['wan', 5], ['wan', 5], ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6], ['tiao', 7], ['tiao', 8],
    ['tiao', 9], ['tong', 1], ['tong', 1],
  ]),
  melds: [],
  discards: [],
});

test('real claim options feed operation advice with engine type vocabulary', () => {
  const player = claimablePlayer();
  const discardedTile = t('wan', 5);
  const options = claimOptionsFor(0, player, discardedTile, 1, { requireJiangPair: false });

  assert.ok(options.some((o) => o.type === 'pong'), 'should offer pong on a held pair');

  const advice = recommendOperation({
    player, options, discardedTile, visibleTiles: [], requireJiangPair: false,
  });

  assert.ok(advice.best, 'advice has a best choice');
  assert.ok(['win', 'kong', 'pong', 'chi', 'pass'].includes(advice.best.type),
    'best uses engine claim vocabulary');
  // every advice choice carries an engine type (never the legacy hu/gang/peng)
  for (const choice of advice.choices) {
    assert.ok(['win', 'kong', 'pong', 'chi', 'pass'].includes(choice.type));
  }
});

test('recording the best claim resolves the matching choice (type-keyed) and counts as followed', () => {
  const player = claimablePlayer();
  const discardedTile = t('wan', 5);
  const options = claimOptionsFor(0, player, discardedTile, 1, { requireJiangPair: false });
  const advice = recommendOperation({ player, options, discardedTile, visibleTiles: [], requireJiangPair: false });

  // main.js records non-chi claims with chosenTiles = [discardedTile]
  const chosenTiles = advice.best.type === 'chi' ? advice.best.tiles : [discardedTile];
  const records = recordOperationDecision([], {
    turn: 1,
    chosenAction: advice.best.type,
    chosenTiles,
    advice,
  });

  assert.equal(records[0].followedBest, true, 'following the best advice counts as followed');
  assert.equal(records[0].chosenShanten, advice.best.shanten,
    'chosenChoice resolved by type (not null)');
  assert.notEqual(records[0].chosenShanten, null);
});

test('following a pong recommendation is not penalized by tiles-length mismatch', () => {
  // craft so pong is genuinely the best (a near-ready hand where the triplet completes it)
  const player = {
    hand: hand([
      ['wan', 5], ['wan', 5], ['wan', 1], ['wan', 2], ['wan', 3],
      ['tong', 4], ['tong', 5], ['tong', 6], ['tiao', 7], ['tiao', 8],
      ['tiao', 9], ['tong', 2], ['tong', 2],
    ]),
    melds: [],
    discards: [],
  };
  const discardedTile = t('wan', 5);
  const options = claimOptionsFor(0, player, discardedTile, 1, { requireJiangPair: false });
  const advice = recommendOperation({ player, options, discardedTile, visibleTiles: [], requireJiangPair: false });

  const pongChoice = advice.choices.find((c) => c.type === 'pong');
  assert.ok(pongChoice, 'pong is among the choices');

  // main.js records pong with chosenTiles = [discardedTile] (single), while the advice choice
  // stores the full meld; followedBest must still be true when pong IS the best.
  const records = recordOperationDecision([], {
    turn: 1,
    chosenAction: 'pong',
    chosenTiles: [discardedTile],
    advice,
  });

  assert.equal(records[0].chosenShanten, pongChoice.shanten, 'pong choice resolved by type');
  if (advice.best.type === 'pong') {
    assert.equal(records[0].followedBest, true,
      'pong follow must not be broken by tiles-length mismatch');
  }

  const summary = summarizeOperationReview(records);
  assert.equal(summary.totalDecisions, 1);
});
