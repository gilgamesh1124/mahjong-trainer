import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getUsefulTilesAfterDiscard,
  isTenpai,
  isWinningHand,
  isJiangTile,
  hasJiangTile,
  shantenNumber,
  calcUkeire,
  isWinningTiles,
  shantenWithMelds,
} from '../src/core/rules.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

test('isWinningHand detects four sets and one pair', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
  ]);

  assert.equal(isWinningHand(hand), true);
});

test('isWinningHand rejects incomplete hand', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
    ['wan', 7],
    ['wan', 8],
  ]);

  assert.equal(isWinningHand(hand), false);
});

test('isTenpai detects a 13-tile hand one tile away from winning', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 7],
    ['wan', 8],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
  ]);

  assert.equal(isTenpai(hand), true);
});

test('getUsefulTilesAfterDiscard adjusts for visible discards', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 7],
    ['wan', 8],
    ['tiao', 2],
    ['tiao', 2],
    ['tiao', 2],
    ['tong', 1],
    ['tong', 4],
    ['tong', 5],
    ['tong', 6],
    ['tong', 9],
    ['tong', 9],
  ]);
  const discard = tile('tong', 1);
  const visibleTiles = tiles([
    ['wan', 9],
    ['wan', 9],
    ['wan', 6],
    ['wan', 6],
    ['wan', 6],
    ['wan', 6],
  ]);

  const usefulTiles = getUsefulTilesAfterDiscard(hand, discard, visibleTiles);

  assert.deepEqual(usefulTiles, [{ tile: tile('wan', 9), remaining: 2 }]);
});

test('shantenNumber returns -1 for a winning hand', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
    ['tiao', 1],
  ]);
  assert.equal(shantenNumber(hand), -1);
});

test('shantenNumber returns 0 for a tenpai hand', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
  ]);
  assert.equal(shantenNumber(hand), 0);
});

test('shantenNumber returns 1 for a hand one step from tenpai', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tiao', 1],
    ['tiao', 1],
    ['tong', 5],
    ['tong', 9],
  ]);
  assert.equal(shantenNumber(hand), 1);
});

test('calcUkeire returns tiles and count for a tenpai hand', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['wan', 7],
    ['wan', 8],
    ['wan', 9],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
  ]);
  const visible = new Map();
  const result = calcUkeire(hand, visible);
  assert.ok(result.tiles.some(u => u.tile.suit === 'tiao' && u.tile.rank === 1));
  assert.ok(result.totalCount > 0);
});

test('isWinningTiles accepts a complete hand with one exposed meld', () => {
  // 1 个副露（meldCount=1）→ 需要 concealed 形成 3 套 + 1 对 = 11 张
  const concealed = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tong', 9], ['tong', 9],
  ]);
  assert.equal(isWinningTiles(concealed, 1), true);
});

test('isWinningTiles rejects wrong tile count for meld count', () => {
  const concealed = tiles([['wan', 1], ['wan', 2], ['wan', 3]]);
  assert.equal(isWinningTiles(concealed, 1), false);
});

test('shantenWithMelds returns -1 for a complete hand with one meld', () => {
  // meldCount=1 → 11 张暗手牌（3 套 + 1 对）即和牌，向听 -1
  const concealed = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tong', 9], ['tong', 9],
  ]);
  assert.equal(shantenWithMelds(concealed, 1), -1);
});

test('shantenWithMelds throws on out-of-range meldCount', () => {
  assert.throws(() => shantenWithMelds([], 5), /meldCount out of range/);
});

// --- jiang-pair (2/5/8) tests ---

test('isJiangTile identifies ranks 2, 5, 8 as jiang tiles', () => {
  assert.equal(isJiangTile(tile('wan', 2)), true);
  assert.equal(isJiangTile(tile('tong', 5)), true);
  assert.equal(isJiangTile(tile('tiao', 8)), true);
  assert.equal(isJiangTile(tile('wan', 1)), false);
  assert.equal(isJiangTile(tile('wan', 3)), false);
  assert.equal(isJiangTile(tile('wan', 9)), false);
});

test('hasJiangTile detects whether a tile list contains a 2/5/8 tile', () => {
  assert.equal(hasJiangTile(tiles([['wan', 1], ['tong', 3], ['tiao', 7]])), false);
  assert.equal(hasJiangTile(tiles([['wan', 1], ['tong', 5], ['tiao', 7]])), true);
  assert.equal(hasJiangTile(tiles([['wan', 2], ['tong', 4], ['tiao', 9]])), true);
  assert.equal(hasJiangTile(tiles([['wan', 4], ['tong', 8], ['tiao', 6]])), true);
});

test('isWinningTiles rejects non-jiang pair when requireJiangPair is true', () => {
  // hand: 123-wan 456-wan 123-tong 123-tiao + pair wan-9 (non-jiang)
  const concealed = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 2], ['tiao', 3],
    ['wan', 9], ['wan', 9],
  ]);
  assert.equal(isWinningTiles(concealed, 0, { requireJiangPair: true }), false);
  assert.equal(isWinningTiles(concealed, 0, { requireJiangPair: false }), true);
  assert.equal(isWinningTiles(concealed, 0), true); // default unchanged
});

test('isWinningTiles accepts jiang pair (2/5/8) when requireJiangPair is true', () => {
  // hand: 123-wan 789-wan 123-tong 123-tiao + pair wan-5 (jiang rank 5)
  const concealed = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 2], ['tiao', 3],
    ['wan', 5], ['wan', 5],
  ]);
  assert.equal(isWinningTiles(concealed, 0, { requireJiangPair: true }), true);
});

test('shantenWithMelds with requireJiangPair still computes shanten via the no-pair path', () => {
  // A 13-tile hand that is tenpai (shanten=0) waiting on wan-9 (non-jiang pair).
  // Under requireJiangPair, the jiang-pair path is skipped, but the no-pair
  // path still finds shanten=0 (four mentsu with one leftover tile).
  // This mirrors origin/main's behavior: requireJiangPair only gates the PAIR
  // extraction branch — the no-pair-extracted path is unchanged.
  const hand = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 2], ['tiao', 3],
    ['wan', 9],
  ]);
  const defaultShanten = shantenWithMelds(hand, 0);
  const jiangShanten = shantenWithMelds(hand, 0, { requireJiangPair: true });
  assert.equal(defaultShanten, 0);  // baseline tenpai
  assert.ok(jiangShanten >= defaultShanten, `jiang-shanten (${jiangShanten}) must be >= default-shanten (${defaultShanten})`);
});

test('shantenWithMelds with requireJiangPair is -1 for complete hand with jiang pair', () => {
  // 14-tile complete hand: 123-wan 789-wan 123-tong 123-tiao + pair wan-5 (jiang)
  const hand = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 2], ['tiao', 3],
    ['wan', 5], ['wan', 5],
  ]);
  assert.equal(shantenWithMelds(hand, 0, { requireJiangPair: true }), -1);
});

test('calcUkeire passes requireJiangPair option through to shanten calculation', () => {
  // 13-tile tenpai hand waiting on wan-9 (non-jiang pair)
  const hand = tiles([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 4], ['wan', 5], ['wan', 6],
    ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 2], ['tiao', 3],
    ['wan', 9],
  ]);
  const relaxed = calcUkeire(hand, new Map(), 0);
  const strict = calcUkeire(hand, new Map(), 0, { requireJiangPair: true });

  // relaxed finds wan-9 as useful
  assert.ok(relaxed.tiles.some(u => u.tile.suit === 'wan' && u.tile.rank === 9));
  // strict: wan-9 pair is not jiang, so no useful tiles at this shanten level
  assert.equal(strict.totalCount, 0);
});
