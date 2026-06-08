import { tileLabel, tileKey } from './tiles.js';

// 认领类型用本引擎的词汇（与 claims.js / operation-advice.js 一致）
const ACTION_LABELS = {
  win: '胡',
  kong: '杠',
  pong: '碰',
  chi: '吃',
  pass: '过',
};

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
      // Flag when ukeire fell below 60% of optimal — a meaningful loss of drawing outs
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

export function recordOperationDecision(records, {
  turn,
  chosenAction,
  chosenTiles = [],
  advice,
}) {
  // chosenAction 为本引擎的认领类型（win/kong/pong/chi/pass），与 advice.choices[].type 对齐
  const best = advice?.best ?? null;
  const chosenChoice = advice?.choices?.find(
    (choice) => choice.type === chosenAction && sameTiles(choice.tiles ?? [], chosenTiles),
  ) ?? advice?.choices?.find((choice) => choice.type === chosenAction) ?? null;
  const followedBest = best
    ? chosenAction === best.type && sameTiles(best.tiles ?? [], chosenTiles)
    : true;

  return [
    ...records,
    {
      turn,
      chosenAction,
      chosenTiles,
      chosenShanten: chosenChoice?.shanten ?? null,
      chosenUkeire: chosenChoice?.ukeireCount ?? null,
      bestAction: best?.type ?? null,
      bestTiles: best?.tiles ?? [],
      bestShanten: best?.shanten ?? null,
      bestUkeire: best?.ukeireCount ?? null,
      followedBest,
      adviceId: advice?.id ?? null,
      explanation: best?.explanation ?? null,
    },
  ];
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
