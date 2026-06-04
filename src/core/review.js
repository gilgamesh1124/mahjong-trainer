import { tileLabel, tileKey } from './tiles.js';

const ACTION_LABELS = {
  hu: '胡',
  gang: '杠',
  peng: '碰',
  chi: '吃',
  pass: '过',
};

export function recordDecision(records, { turn, chosenDiscard, recommendation }) {
  const best = recommendation?.best ?? null;
  const followedBest = best
    ? tileKey(chosenDiscard) === tileKey(best.discard)
    : true;

  const chosenChoice = recommendation?.choices?.find(
    (choice) => tileKey(choice.discard) === tileKey(chosenDiscard),
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

export function recordOperationDecision(records, {
  turn,
  chosenAction,
  chosenTiles = [],
  advice,
}) {
  const best = advice?.best ?? null;
  const chosenChoice = advice?.choices?.find(
    (choice) => choice.action === chosenAction && sameTiles(choice.tiles ?? [], chosenTiles),
  ) ?? advice?.choices?.find((choice) => choice.action === chosenAction) ?? null;
  const followedBest = best
    ? chosenAction === best.action && sameTiles(best.tiles ?? [], chosenTiles)
    : true;

  return [
    ...records,
    {
      turn,
      chosenAction,
      chosenTiles,
      chosenShanten: chosenChoice?.shanten ?? null,
      chosenUkeire: chosenChoice?.ukeireCount ?? null,
      bestAction: best?.action ?? null,
      bestTiles: best?.tiles ?? [],
      bestShanten: best?.shanten ?? null,
      bestUkeire: best?.ukeireCount ?? null,
      followedBest,
      adviceId: advice?.id ?? null,
      explanation: best?.explanation ?? null,
    },
  ];
}

export function summarizeReview(records) {
  if (records.length === 0) {
    return { totalDecisions: 0, followedBestCount: 0, keyMoments: [] };
  }

  const followedBestCount = records.filter((record) => record.followedBest).length;

  const keyMoments = records
    .filter((record) => {
      if (record.followedBest) return false;
      const shantenWorse = record.chosenShanten != null && record.bestShanten != null
        && record.chosenShanten > record.bestShanten;
      const ukeireDropped = record.chosenUkeire != null && record.bestUkeire != null
        && record.bestUkeire > 0 && record.chosenUkeire < record.bestUkeire * 0.6;
      return shantenWorse || ukeireDropped;
    })
    .slice(0, 5)
    .map((record) => {
      const chosen = tileLabel(record.chosenDiscard);
      if (
        record.chosenShanten != null
        && record.bestShanten != null
        && record.chosenShanten > record.bestShanten
      ) {
        return `第 ${record.turn} 回合：打 ${chosen} 后向听数增加（差 ${record.chosenShanten - record.bestShanten} 向）。${record.explanation ?? ''}`;
      }
      return `第 ${record.turn} 回合：打 ${chosen} 后进张减少（${record.chosenUkeire} 张 vs 推荐 ${record.bestUkeire} 张）。${record.explanation ?? ''}`;
    });

  return { totalDecisions: records.length, followedBestCount, keyMoments };
}

export function summarizeOperationReview(records) {
  if (records.length === 0) {
    return { totalDecisions: 0, followedBestCount: 0, keyMoments: [] };
  }

  const followedBestCount = records.filter((record) => record.followedBest).length;
  const keyMoments = records
    .filter((record) => !record.followedBest)
    .slice(0, 5)
    .map((record) => {
      const chosen = actionText(record.chosenAction, record.chosenTiles);
      const best = actionText(record.bestAction, record.bestTiles);
      return `第 ${record.turn} 次操作：你选择 ${chosen}，建议 ${best}。${record.explanation ?? ''}`;
    });

  return { totalDecisions: records.length, followedBestCount, keyMoments };
}

function sameTiles(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  const aKeys = a.map(tileKey).sort();
  const bKeys = b.map(tileKey).sort();

  return aKeys.every((key, index) => key === bKeys[index]);
}

function actionText(action, tiles = []) {
  if (!action) {
    return '暂无';
  }

  const label = ACTION_LABELS[action] ?? action;
  const tileText = tiles.length > 0
    ? tiles.map(tileLabel).join('')
    : '';

  return `${label}${tileText}`;
}
