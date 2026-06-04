import { calcUkeire, shantenNumber } from './rules.js';
import { removeOneTile, tileKey } from './tiles.js';

export function chooseComputerDiscard({
  hand,
  visibleTiles = [],
  openMeldCount = 0,
  requireJiangPair = false,
}) {
  const visibleCounts = buildVisibleCounts(visibleTiles);
  const choices = uniqueTiles(hand)
    .map((discard) => buildDiscardChoice({
      hand,
      discard,
      visibleCounts,
      openMeldCount,
      requireJiangPair,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return tileKey(a.discard).localeCompare(tileKey(b.discard));
    });

  return {
    discard: choices[0]?.discard ?? null,
    best: choices[0] ?? null,
    choices,
  };
}

function buildDiscardChoice({
  hand,
  discard,
  visibleCounts,
  openMeldCount,
  requireJiangPair,
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
    score: scoreHand(shanten, ukeire.totalCount),
  };
}

function scoreHand(shanten, ukeireCount) {
  return (8 - shanten) * 1000 + ukeireCount;
}

function buildVisibleCounts(tiles) {
  const counts = new Map();

  for (const tile of tiles) {
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
