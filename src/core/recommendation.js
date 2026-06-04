import { shantenNumber, calcUkeire } from './rules.js';
import { removeOneTile, tileKey, tileLabel } from './tiles.js';

export function recommendDiscards({
  hand,
  visibleTiles = [],
  openMeldCount = 0,
  requireJiangPair = false,
}) {
  const visibleCounts = buildVisibleCounts(visibleTiles);
  const uniqueDiscards = uniqueTiles(hand);
  const ruleNote = requireJiangPair
    ? '普通胡按 2/5/8 作将计算'
    : '起手无将路线暂不强制 2/5/8 作将';

  const choices = uniqueDiscards
    .map((discard) => buildChoice({
      hand,
      discard,
      visibleCounts,
      openMeldCount,
      requireJiangPair,
      ruleNote,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return tileKey(a.discard).localeCompare(tileKey(b.discard));
    });

  return {
    id: `recommend-${choices.map((c) => tileKey(c.discard)).join('-')}`,
    best: choices[0] ?? null,
    choices: choices.slice(0, Math.max(3, Math.min(choices.length, uniqueDiscards.length))),
    ruleNote,
  };
}

function buildChoice({
  hand,
  discard,
  visibleCounts,
  openMeldCount,
  requireJiangPair,
  ruleNote,
}) {
  const afterDiscard = removeOneTile(hand, discard);
  const options = { requireJiangPair };
  const shanten = shantenNumber(afterDiscard, openMeldCount, options);
  const ukeire = calcUkeire(afterDiscard, visibleCounts, openMeldCount, options);

  return {
    discard,
    shanten,
    ukeireCount: ukeire.totalCount,
    usefulTiles: ukeire.tiles,
    score: (8 - shanten) * 1000 + ukeire.totalCount,
    explanation: buildExplanation(discard, shanten, ukeire, ruleNote),
  };
}

function buildExplanation(discard, shanten, ukeire, ruleNote) {
  const label = tileLabel(discard);
  const visibleText = '已经按其他家已出牌和明牌扣减可进张数量';

  if (shanten < 0) {
    return `打 ${label} 后已经胡牌。${ruleNote}，${visibleText}。`;
  }

  if (shanten === 0) {
    return `打 ${label} 后听牌，共 ${ukeire.totalCount} 张进张（${ukeire.tiles.length} 种）。${ruleNote}，${visibleText}。`;
  }

  return `打 ${label} 后还差 ${shanten} 向听，共 ${ukeire.totalCount} 张进张（${ukeire.tiles.length} 种）。${ruleNote}，${visibleText}。`;
}

function buildVisibleCounts(visibleTiles) {
  const counts = new Map();
  for (const tile of visibleTiles) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const unique = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tile);
    }
  }
  return unique;
}
