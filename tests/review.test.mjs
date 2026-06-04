import assert from 'node:assert/strict';
import test from 'node:test';

import { recordDecision, summarizeReview } from '../src/core/review.js';

function tile(suit, rank) {
  return { suit, rank };
}

test('recordDecision stores recommendation snapshot', () => {
  const records = [];
  const result = recordDecision(records, {
    turn: 1,
    chosenDiscard: tile('tong', 1),
    recommendation: {
      best: {
        discard: tile('wan', 9),
        score: 32,
        explanation: '建议打9万。',
      },
      choices: [],
    },
  });

  assert.equal(result.length, 1);
  assert.notEqual(result, records);
  assert.deepEqual(records, []);
  assert.equal(result[0].followedBest, false);
  assert.equal(result[0].bestExplanation, '建议打9万。');
});

test('recordDecision does not mutate original records', () => {
  const records = [];
  const next = recordDecision(records, {
    turn: 1,
    chosenDiscard: tile('tong', 1),
    recommendation: {
      best: {
        discard: tile('wan', 9),
        score: 32,
        explanation: '建议打9万。',
      },
      choices: [],
    },
  });

  assert.equal(records.length, 0);
  assert.equal(next.length, 1);
});

test('summarizeReview highlights ignored recommendations', () => {
  const summary = summarizeReview([
    {
      turn: 1,
      chosenLabel: '1筒',
      bestLabel: '9万',
      followedBest: false,
      bestExplanation: '建议打9万。',
    },
  ]);

  assert.equal(summary.totalDecisions, 1);
  assert.equal(summary.followedBestCount, 0);
  assert.equal(summary.keyMoments.length, 1);
  assert.equal(summary.keyMoments[0].includes('第1巡'), true);
  assert.equal(summary.keyMoments[0].includes('你打了1筒'), true);
  assert.equal(summary.keyMoments[0].includes('系统建议打9万'), true);
});
