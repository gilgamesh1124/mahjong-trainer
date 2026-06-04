import assert from 'node:assert/strict';
import test from 'node:test';

import { recordDecision, summarizeReview } from '../src/core/review.js';

function makeRecommendation({ bestSuit, bestRank, shanten = 1, ukeireCount = 8 } = {}) {
  const best = { discard: { suit: bestSuit, rank: bestRank }, shanten, ukeireCount, explanation: `打${bestRank}${bestSuit}后还差${shanten}向。` };
  return { id: 'recommend-test', best, choices: [best] };
}

test('recordDecision stores recommendation snapshot', () => {
  const recommendation = makeRecommendation({ bestSuit: 'wan', bestRank: 1 });
  const records = recordDecision([], {
    turn: 1,
    chosenDiscard: { suit: 'wan', rank: 1 },
    recommendation,
  });

  assert.equal(records.length, 1);
  assert.deepEqual(records[0].chosenDiscard, { suit: 'wan', rank: 1 });
  assert.equal(records[0].followedBest, true);
  assert.equal(records[0].recommendationId, 'recommend-test');
  assert.equal(records[0].bestShanten, 1);
  assert.equal(records[0].bestUkeire, 8);
});

test('recordDecision does not mutate original records', () => {
  const original = [];
  const recommendation = makeRecommendation({ bestSuit: 'wan', bestRank: 1 });
  recordDecision(original, {
    turn: 1,
    chosenDiscard: { suit: 'wan', rank: 1 },
    recommendation,
  });
  assert.equal(original.length, 0);
});

test('summarizeReview highlights decisions where shanten got worse', () => {
  // Best was shanten=1, player chose shanten=2 (worse)
  const bestRec = makeRecommendation({ bestSuit: 'wan', bestRank: 1, shanten: 1, ukeireCount: 8 });
  const worseChoice = { discard: { suit: 'tiao', rank: 9 }, shanten: 2, ukeireCount: 3, explanation: '差2向' };
  const recommendation = {
    id: 'recommend-test',
    best: bestRec.best,
    choices: [bestRec.best, worseChoice],
  };

  const records = recordDecision([], {
    turn: 1,
    chosenDiscard: { suit: 'tiao', rank: 9 },
    recommendation,
  });

  const summary = summarizeReview(records);
  assert.equal(summary.totalDecisions, 1);
  assert.equal(summary.followedBestCount, 0);
  assert.equal(summary.keyMoments.length, 1);
  assert.ok(summary.keyMoments[0].includes('向听数增加'));
});
