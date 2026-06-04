import { countTiles, removeOneTile, tileKey } from './tiles.js';

const SUITED_TILES = ['wan', 'tiao', 'tong'].flatMap((suit) =>
  Array.from({ length: 9 }, (_, index) => ({ suit, rank: index + 1 })),
);

export function isWinningHand(hand, options = {}) {
  return isWinningHandWithOptions(hand, options);
}

export function isJiangTile(tile) {
  return tile.rank === 2 || tile.rank === 5 || tile.rank === 8;
}

export function hasJiangTile(tiles) {
  return tiles.some(isJiangTile);
}

function isWinningHandWithOptions(hand, { requireJiangPair = false } = {}) {
  if (hand.length !== 14) {
    return false;
  }

  const counts = countTiles(hand);

  for (const [key, count] of counts) {
    if (count < 2) {
      continue;
    }

    if (requireJiangPair && !isJiangTile(parseTileKey(key))) {
      continue;
    }

    const remainingCounts = new Map(counts);
    remainingCounts.set(key, count - 2);

    if (canFormSets(remainingCounts)) {
      return true;
    }
  }

  return false;
}

export function isTenpai(hand, options = {}) {
  if (hand.length !== 13) {
    return false;
  }

  return getWinningTiles(hand, [], options).length > 0;
}

export function getWinningTiles(hand, visibleTiles = [], options = {}) {
  if (hand.length !== 13) {
    return [];
  }

  const handCounts = countTiles(hand);
  const visibleCounts = countTiles(visibleTiles);
  const winningTiles = [];

  for (const tile of SUITED_TILES) {
    const key = tileKey(tile);
    const remaining = 4 - (visibleCounts.get(key) ?? 0) - (handCounts.get(key) ?? 0);

    if (remaining > 0 && isWinningHandWithOptions([...hand, tile], options)) {
      winningTiles.push({ tile, remaining });
    }
  }

  return winningTiles;
}

export function getUsefulTilesAfterDiscard(hand, discard, visibleTiles = [], options = {}) {
  const handAfterDiscard = removeOneTile(hand, discard);

  return getWinningTiles(handAfterDiscard, visibleTiles, options);
}

function parseTileKey(key) {
  const [suit, rank] = key.split('-');
  return { suit, rank: Number(rank) };
}

function canFormSets(counts) {
  const nextTile = findFirstTileWithCount(counts);

  if (!nextTile) {
    return true;
  }

  if (removeTriplet(counts, nextTile)) {
    if (canFormSets(counts)) {
      restoreTriplet(counts, nextTile);
      return true;
    }
    restoreTriplet(counts, nextTile);
  }

  if (removeSequence(counts, nextTile)) {
    if (canFormSets(counts)) {
      restoreSequence(counts, nextTile);
      return true;
    }
    restoreSequence(counts, nextTile);
  }

  return false;
}

function findFirstTileWithCount(counts) {
  for (const tile of SUITED_TILES) {
    if ((counts.get(tileKey(tile)) ?? 0) > 0) {
      return tile;
    }
  }

  return null;
}

function removeTriplet(counts, tile) {
  const key = tileKey(tile);

  if ((counts.get(key) ?? 0) < 3) {
    return false;
  }

  counts.set(key, counts.get(key) - 3);
  return true;
}

function restoreTriplet(counts, tile) {
  const key = tileKey(tile);
  counts.set(key, (counts.get(key) ?? 0) + 3);
}

function removeSequence(counts, tile) {
  if (tile.rank > 7) {
    return false;
  }

  const keys = [0, 1, 2].map((offset) => tileKey({ suit: tile.suit, rank: tile.rank + offset }));

  if (keys.some((key) => (counts.get(key) ?? 0) < 1)) {
    return false;
  }

  for (const key of keys) {
    counts.set(key, counts.get(key) - 1);
  }

  return true;
}

function restoreSequence(counts, tile) {
  for (let offset = 0; offset < 3; offset += 1) {
    const key = tileKey({ suit: tile.suit, rank: tile.rank + offset });
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}

// --- Shanten / Ukeire ---

const SUIT_IDX = { tong: 0, wan: 1, tiao: 2 };

function tilesToCounts27(tiles) {
  const counts = new Array(27).fill(0);
  for (const tile of tiles) {
    counts[SUIT_IDX[tile.suit] * 9 + (tile.rank - 1)]++;
  }
  return counts;
}

function shantenMelds(counts, idx, mentsu, taatsu) {
  while (idx < 27 && counts[idx] === 0) idx++;

  if (idx === 27) {
    return 8 - 2 * mentsu - Math.min(taatsu, 4 - mentsu);
  }

  const rank = idx % 9;
  let best = 8 - 2 * mentsu - Math.min(taatsu, 4 - mentsu);

  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    best = Math.min(best, shantenMelds(counts, idx, mentsu + 1, taatsu));
    counts[idx] += 3;
  }

  if (rank <= 6 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
    counts[idx]--; counts[idx + 1]--; counts[idx + 2]--;
    best = Math.min(best, shantenMelds(counts, idx, mentsu + 1, taatsu));
    counts[idx]++; counts[idx + 1]++; counts[idx + 2]++;
  }

  if (counts[idx] >= 2) {
    counts[idx] -= 2;
    best = Math.min(best, shantenMelds(counts, idx, mentsu, taatsu + 1));
    counts[idx] += 2;
  }

  if (rank <= 7 && counts[idx + 1] >= 1) {
    counts[idx]--; counts[idx + 1]--;
    best = Math.min(best, shantenMelds(counts, idx, mentsu, taatsu + 1));
    counts[idx]++; counts[idx + 1]++;
  }

  if (rank <= 6 && counts[idx + 2] >= 1) {
    counts[idx]--; counts[idx + 2]--;
    best = Math.min(best, shantenMelds(counts, idx, mentsu, taatsu + 1));
    counts[idx]++; counts[idx + 2]++;
  }

  const c = counts[idx];
  counts[idx] = 0;
  best = Math.min(best, shantenMelds(counts, idx + 1, mentsu, taatsu));
  counts[idx] = c;

  return best;
}

export function shantenNumber(hand, openMeldCount = 0, { requireJiangPair = false } = {}) {
  const counts = tilesToCounts27(hand);
  let best = 8;

  for (let i = 0; i < 27; i++) {
    if (counts[i] >= 2) {
      if (requireJiangPair && !isJiangIndex(i)) {
        continue;
      }

      counts[i] -= 2;
      best = Math.min(best, shantenMelds(counts, 0, openMeldCount, 0) - 1);
      counts[i] += 2;
    }
  }

  best = Math.min(best, shantenMelds(counts, 0, openMeldCount, 0));
  return best;
}

export function calcUkeire(hand13, visibleCounts, openMeldCount = 0, options = {}) {
  const currentShanten = shantenNumber(hand13, openMeldCount, options);
  const useful = [];
  let totalCount = 0;

  for (const suit of Object.keys(SUIT_IDX)) {
    for (let rank = 1; rank <= 9; rank++) {
      const tile = { suit, rank };
      const key = `${suit}-${rank}`;
      const seenCount = visibleCounts.get(key) ?? 0;
      const inHand = hand13.filter(t => `${t.suit}-${t.rank}` === key).length;
      const remaining = 4 - seenCount - inHand;

      if (remaining <= 0) continue;

      if (shantenNumber([...hand13, tile], openMeldCount, options) < currentShanten) {
        useful.push({ tile, remaining });
        totalCount += remaining;
      }
    }
  }

  return { tiles: useful, totalCount };
}

function isJiangIndex(index) {
  const rank = (index % 9) + 1;
  return rank === 2 || rank === 5 || rank === 8;
}
