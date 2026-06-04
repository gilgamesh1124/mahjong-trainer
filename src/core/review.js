import { tileLabel } from './tiles.js';

export function recordDecision(records, { turn, chosenDiscard, recommendation }) {
  const best = recommendation?.best ?? null;
  const followedBest = best
    ? chosenDiscard.suit === best.discard.suit && chosenDiscard.rank === best.discard.rank
    : true;

  const chosenChoice = recommendation?.choices?.find(
    (c) => c.discard.suit === chosenDiscard.suit && c.discard.rank === chosenDiscard.rank,
  ) ?? null;

  return [
    ...records,
    {
      turn,
      chosenDiscard,
      chosenShanten: chosenChoice?.shanten ?? null,
      chosenUkeire: chosenChoice?.ukeireCount ?? null,
      bestShanten: best?.shanten ?? null,
      bestUkeire: best?.ukeireCount ?? null,
      followedBest,
      recommendationId: recommendation?.id ?? null,
      explanation: best?.explanation ?? null,
    },
  ];
}

export function summarizeReview(records) {
  if (records.length === 0) {
    return { totalDecisions: 0, followedBestCount: 0, keyMoments: [] };
  }

  const followedBestCount = records.filter((r) => r.followedBest).length;

  const keyMoments = records
    .filter((r) => {
      if (r.followedBest) return false;
      const shantenWorse = r.chosenShanten != null && r.bestShanten != null
        && r.chosenShanten > r.bestShanten;
      const ukeireDropped = r.chosenUkeire != null && r.bestUkeire != null
        && r.bestUkeire > 0 && r.chosenUkeire < r.bestUkeire * 0.6;
      return shantenWorse || ukeireDropped;
    })
    .slice(0, 5)
    .map((r) => {
      const chosen = tileLabel(r.chosenDiscard);
      if (r.chosenShanten != null && r.bestShanten != null && r.chosenShanten > r.bestShanten) {
        return `第${r.turn}回合：打${chosen}后向听数增加（差${r.chosenShanten - r.bestShanten}向），${r.explanation ?? ''}`;
      }
      return `第${r.turn}回合：打${chosen}后进张减少（${r.chosenUkeire} 张 vs 推荐 ${r.bestUkeire} 张），${r.explanation ?? ''}`;
    });

  return { totalDecisions: records.length, followedBestCount, keyMoments };
}
