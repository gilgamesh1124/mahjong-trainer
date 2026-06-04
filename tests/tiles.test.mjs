import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTileSet,
  countTiles,
  removeOneTile,
  sortTiles,
  tileGlyph,
  tileKey,
  tileLabel,
} from '../src/core/tiles.js';
import { createSeededRandom, shuffle } from '../src/core/random.js';

test('createTileSet creates 108 suited tiles', () => {
  const tiles = createTileSet();

  assert.equal(tiles.length, 108);
  assert.equal(countTiles(tiles).size, 27);

  for (const count of countTiles(tiles).values()) {
    assert.equal(count, 4);
  }
});

test('shuffle preserves every tile count', () => {
  const tiles = createTileSet();
  const shuffled = shuffle(tiles, createSeededRandom(1234));

  assert.deepEqual(countTiles(shuffled), countTiles(tiles));
});

test('shuffle returns a new array and does not mutate source', () => {
  const tiles = createTileSet();
  const originalKeys = tiles.map(tileKey);

  const shuffled = shuffle(tiles, createSeededRandom(1234));

  assert.notEqual(shuffled, tiles);
  assert.deepEqual(tiles.map(tileKey), originalKeys);
});

test('tileLabel returns Chinese suit labels', () => {
  assert.equal(tileLabel({ suit: 'wan', rank: 1 }), '1万');
  assert.equal(tileLabel({ suit: 'tiao', rank: 2 }), '2条');
  assert.equal(tileLabel({ suit: 'tong', rank: 3 }), '3筒');
});

test('tileGlyph returns Unicode mahjong glyphs', () => {
  assert.equal(tileGlyph({ suit: 'wan',  rank: 1 }), '🀇');
  assert.equal(tileGlyph({ suit: 'tiao', rank: 1 }), '🀐');
  assert.equal(tileGlyph({ suit: 'tong', rank: 9 }), '🀡');
});

test('sortTiles orders by suit then rank', () => {
  const tiles = [
    { suit: 'tong', rank: 9 },
    { suit: 'wan', rank: 3 },
    { suit: 'tiao', rank: 1 },
    { suit: 'wan', rank: 1 },
    { suit: 'tong', rank: 1 },
    { suit: 'tiao', rank: 9 },
  ];

  const sorted = sortTiles(tiles);

  assert.notEqual(sorted, tiles);
  assert.deepEqual(sorted.map(tileKey), [
    'tong-1',
    'tong-9',
    'wan-1',
    'wan-3',
    'tiao-1',
    'tiao-9',
  ]);
  assert.deepEqual(tiles.map(tileKey), [
    'tong-9',
    'wan-3',
    'tiao-1',
    'wan-1',
    'tong-1',
    'tiao-9',
  ]);
});

test('removeOneTile removes one matching tile without mutating source', () => {
  const tiles = [
    { suit: 'wan', rank: 1 },
    { suit: 'wan', rank: 1 },
    { suit: 'tong', rank: 2 },
  ];

  const result = removeOneTile(tiles, { suit: 'wan', rank: 1 });

  assert.equal(result.length, tiles.length - 1);
  assert.equal(tiles.length, 3);
  assert.equal(result.filter((tile) => tileKey(tile) === 'wan-1').length, 1);
});

test('removeOneTile throws when tile missing', () => {
  const tiles = [
    { suit: 'wan', rank: 1 },
    { suit: 'tong', rank: 2 },
  ];

  assert.throws(() => removeOneTile(tiles, { suit: 'tiao', rank: 3 }), /Tile not in hand/);
});
