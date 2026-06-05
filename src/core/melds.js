import { countTiles, tileKey } from './tiles.js';
import { isWinningTiles } from './rules.js';

function countOf(tiles, tile) {
  const key = tileKey(tile);
  return tiles.filter((candidate) => tileKey(candidate) === key).length;
}

function keyToTile(key) {
  const dash = key.lastIndexOf('-');
  return { suit: key.slice(0, dash), rank: Number(key.slice(dash + 1)) };
}

export function canPong(hand, tile) {
  return countOf(hand, tile) >= 2;
}

export function canKongFromDiscard(hand, tile) {
  return countOf(hand, tile) >= 3;
}

export function canConcealedKongs(hand) {
  const result = [];
  for (const [key, count] of countTiles(hand)) {
    if (count >= 4) result.push(keyToTile(key));
  }
  return result;
}

export function canAddedKongs(hand, melds) {
  const result = [];
  for (const meld of melds) {
    if (meld.type === 'pong' && countOf(hand, meld.tiles[0]) >= 1) {
      result.push(meld.tiles[0]);
    }
  }
  return result;
}

export function canChiSequences(hand, tile) {
  const { suit, rank } = tile;
  const has = (r) => r >= 1 && r <= 9 && countOf(hand, { suit, rank: r }) >= 1;
  const seqs = [];
  if (has(rank - 2) && has(rank - 1)) seqs.push([{ suit, rank: rank - 2 }, { suit, rank: rank - 1 }]);
  if (has(rank - 1) && has(rank + 1)) seqs.push([{ suit, rank: rank - 1 }, { suit, rank: rank + 1 }]);
  if (has(rank + 1) && has(rank + 2)) seqs.push([{ suit, rank: rank + 1 }, { suit, rank: rank + 2 }]);
  return seqs;
}

export function canWinOnTile(hand, melds, tile, { requireJiangPair = false } = {}) {
  return isWinningTiles([...hand, tile], melds.length, { requireJiangPair });
}

export function canSelfDrawWin(hand, melds, { requireJiangPair = false } = {}) {
  return isWinningTiles(hand, melds.length, { requireJiangPair });
}
