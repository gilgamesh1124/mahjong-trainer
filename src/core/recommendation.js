import { shantenNumber, calcUkeire } from './rules.js';
import { removeOneTile, tileKey, tileLabel } from './tiles.js';

export function recommendDiscards({ hand, visibleTiles = [] }) {
  const visibleCounts = buildVisibleCounts(visibleTiles);
  const uniqueDiscards = uniqueTiles(hand);

  const choices = uniqueDiscards
    .map((discard) => buildChoice(hand, discard, visibleCounts))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return tileKey(a.discard).localeCompare(tileKey(b.discard));
    });

  return {
    id: `recommend-${choices.map((c) => tileKey(c.discard)).join('-')}`,
    best: choices[0] ?? null,
    choices: choices.slice(0, Math.max(3, Math.min(choices.length, uniqueDiscards.length))),
  };
}

function buildChoice(hand, discard, visibleCounts) {
  const afterDiscard = removeOneTile(hand, discard);
  const shanten = shantenNumber(afterDiscard);
  const ukeire = calcUkeire(afterDiscard, visibleCounts);

  return {
    discard,
    shanten,
    ukeireCount: ukeire.totalCount,
    usefulTiles: ukeire.tiles,
    score: (8 - shanten) * 1000 + ukeire.totalCount,
    explanation: buildExplanation(discard, shanten, ukeire),
  };
}

function buildExplanation(discard, shanten, ukeire) {
  const label = tileLabel(discard);
  if (shanten < 0) return `打${label}后已和牌。`;
  if (shanten === 0) {
    return `打${label}后听牌，共 ${ukeire.totalCount} 张进张（${ukeire.tiles.length} 种）。`;
  }
  return `打${label}后还差 ${shanten} 向，共 ${ukeire.totalCount} 张进张（${ukeire.tiles.length} 种）。`;
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
