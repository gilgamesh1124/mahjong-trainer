import assert from 'node:assert/strict';
import test from 'node:test';

import {
  recordDecision,
  recordOperationDecision,
  summarizeOperationReview,
  summarizeReview,
} from '../src/core/review.js';

function makeRecommendation({ bestSuit, bestRank, shanten = 1, ukeireCount = 8 } = {}) {
  const best = {
    discard: { suit: bestSuit, rank: bestRank },
    shanten,
    ukeireCount,
    explanation: `打${bestRank}${bestSuit}后还差${shanten}向。`,
  };
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
  const bestRec = makeRecommendation({ bestSuit: 'wan', bestRank: 1, shanten: 1, ukeireCount: 8 });
  const worseChoice = {
    discard: { suit: 'tiao', rank: 9 },
    shanten: 2,
    ukeireCount: 3,
    explanation: '差 2 向',
  };
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

test('recordOperationDecision stores operation advice snapshot', () => {
  const advice = {
    id: 'operation-test',
    best: { action: 'pass', shanten: 0, ukeireCount: 8, explanation: '建议过。' },
    choices: [
      { action: 'pass', shanten: 0, ukeireCount: 8, explanation: '建议过。' },
      { action: 'peng', shanten: 1, ukeireCount: 4, explanation: '碰后变差。' },
    ],
  };

  const records = recordOperationDecision([], {
    turn: 1,
    chosenAction: 'peng',
    chosenTiles: [{ suit: 'wan', rank: 9 }],
    advice,
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].chosenAction, 'peng');
  assert.equal(records[0].bestAction, 'pass');
  assert.equal(records[0].followedBest, false);
  assert.equal(records[0].chosenShanten, 1);
  assert.equal(records[0].bestUkeire, 8);
});

test('summarizeOperationReview highlights choices that differ from operation advice', () => {
  const advice = {
    id: 'operation-test',
    best: { action: 'pass', shanten: 0, ukeireCount: 8, explanation: '建议过，保留听牌。' },
    choices: [
      { action: 'pass', shanten: 0, ukeireCount: 8, explanation: '建议过，保留听牌。' },
      { action: 'peng', shanten: 1, ukeireCount: 4, explanation: '碰后进张少。' },
    ],
  };
  const records = recordOperationDecision([], {
    turn: 1,
    chosenAction: 'peng',
    chosenTiles: [{ suit: 'wan', rank: 9 }],
    advice,
  });

  const summary = summarizeOperationReview(records);

  assert.equal(summary.totalDecisions, 1);
  assert.equal(summary.followedBestCount, 0);
  assert.equal(summary.keyMoments.length, 1);
  assert.ok(summary.keyMoments[0].includes('建议过'));
});
