import { tileKey, tileLabel } from './tiles.js';

export function recordDecision(records, { turn, chosenDiscard, recommendation }) {
  const best = recommendation.best;
  const followedBest = best ? tileKey(chosenDiscard) === tileKey(best.discard) : false;

  return [
    ...records,
    {
      turn,
      chosenDiscard,
      chosenLabel: tileLabel(chosenDiscard),
      bestDiscard: best?.discard ?? null,
      bestLabel: best ? tileLabel(best.discard) : '',
      followedBest,
      bestScore: best?.score ?? null,
      bestExplanation: best?.explanation ?? '',
    },
  ];
}

export function summarizeReview(records) {
  return {
    totalDecisions: records.length,
    followedBestCount: records.filter((record) => record.followedBest).length,
    keyMoments: records
      .filter((record) => !record.followedBest)
      .map((record) => (
        `第${record.turn}巡：你打了${record.chosenLabel}，系统建议打${record.bestLabel}。${record.bestExplanation}`
      )),
  };
}
