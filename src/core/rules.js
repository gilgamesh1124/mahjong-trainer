import { countTiles, removeOneTile, tileKey } from './tiles.js';

const SUITED_TILES = ['wan', 'tiao', 'tong'].flatMap((suit) =>
  Array.from({ length: 9 }, (_, index) => ({ suit, rank: index + 1 })),
);

export function isWinningHand(hand) {
  if (hand.length !== 14) {
    return false;
  }

  const counts = countTiles(hand);

  for (const [key, count] of counts) {
    if (count < 2) {
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

export function isTenpai(hand) {
  if (hand.length !== 13) {
    return false;
  }

  return getWinningTiles(hand).length > 0;
}

export function getWinningTiles(hand, visibleTiles = []) {
  if (hand.length !== 13) {
    return [];
  }

  const handCounts = countTiles(hand);
  const visibleCounts = countTiles(visibleTiles);
  const winningTiles = [];

  for (const tile of SUITED_TILES) {
    const key = tileKey(tile);
    const remaining = 4 - (visibleCounts.get(key) ?? 0) - (handCounts.get(key) ?? 0);

    if (remaining > 0 && isWinningHand([...hand, tile])) {
      winningTiles.push({ tile, remaining });
    }
  }

  return winningTiles;
}

export function getUsefulTilesAfterDiscard(hand, discard, visibleTiles = []) {
  const handAfterDiscard = removeOneTile(hand, discard);

  return getWinningTiles(handAfterDiscard, visibleTiles);
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
