export const SUITS = ['tong', 'wan', 'tiao'];

export const SUIT_LABELS = {
  wan: '万',
  tiao: '条',
  tong: '筒',
};

const SUIT_ORDER = new Map(SUITS.map((suit, index) => [suit, index]));

export function createTileSet() {
  const tiles = [];

  for (const suit of SUITS) {
    for (let rank = 1; rank <= 9; rank += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        tiles.push({ suit, rank });
      }
    }
  }

  return tiles;
}

export function tileKey(tile) {
  return `${tile.suit}-${tile.rank}`;
}

export function tileLabel(tile) {
  return `${tile.rank}${SUIT_LABELS[tile.suit] ?? tile.suit}`;
}

export function sortTiles(tiles) {
  return [...tiles].sort((a, b) => {
    const suitCompare = SUIT_ORDER.get(a.suit) - SUIT_ORDER.get(b.suit);
    if (suitCompare !== 0) {
      return suitCompare;
    }

    return a.rank - b.rank;
  });
}

export function countTiles(tiles) {
  const counts = new Map();

  for (const tile of tiles) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

export function removeOneTile(tiles, tileToRemove) {
  const keyToRemove = tileKey(tileToRemove);
  const index = tiles.findIndex((tile) => tileKey(tile) === keyToRemove);

  if (index === -1) {
    throw new Error(`Tile not in hand: ${keyToRemove}`);
  }

  return [...tiles.slice(0, index), ...tiles.slice(index + 1)];
}
