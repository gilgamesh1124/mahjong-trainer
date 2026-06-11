import assert from 'node:assert/strict';
import test from 'node:test';

import { decomposeHand, taatsuWaits } from '../src/core/decompose.js';
import { shantenWithMelds } from '../src/core/rules.js';

const t = (suit, rank) => ({ suit, rank });
const hand = (specs) => specs.map(([s, r]) => t(s, r));

function tileCount(d) {
  return d.sets.length * 3 + (d.pair ? 2 : 0) + d.taatsu.length * 2 + d.floaters.length;
}

test('taatsuWaits: 对倒/两面/边张/嵌张', () => {
  assert.deepEqual(taatsuWaits([t('wan', 5), t('wan', 5)]), [t('wan', 5)]);
  assert.deepEqual(taatsuWaits([t('wan', 4), t('wan', 5)]), [t('wan', 3), t('wan', 6)]);
  assert.deepEqual(taatsuWaits([t('wan', 1), t('wan', 2)]), [t('wan', 3)]);
  assert.deepEqual(taatsuWaits([t('wan', 8), t('wan', 9)]), [t('wan', 7)]);
  assert.deepEqual(taatsuWaits([t('wan', 4), t('wan', 6)]), [t('wan', 5)]);
});

test('complete winning hand decomposes to 4 sets + pair', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['wan', 7], ['wan', 8], ['wan', 9],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tiao', 2], ['tiao', 2], ['tiao', 2],
    ['tong', 9], ['tong', 9],
  ]);
  const d = decomposeHand(concealed);
  assert.equal(d.shanten, -1);
  assert.equal(d.sets.length, 4);
  assert.deepEqual(d.pair, [t('tong', 9), t('tong', 9)]);
  assert.equal(d.taatsu.length, 0);
  assert.equal(d.floaters.length, 0);
  assert.equal(tileCount(d), 14);
});

test('tenpai hand: 3 sets + pair + one ryanmen taatsu with waits', () => {
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 9], ['tong', 9],
    ['wan', 4], ['wan', 5],
  ]);
  const d = decomposeHand(concealed);
  assert.equal(d.shanten, 0);
  assert.equal(d.sets.length, 3);
  assert.deepEqual(d.pair, [t('tong', 9), t('tong', 9)]);
  assert.equal(d.taatsu.length, 1);
  assert.deepEqual(d.taatsu[0].waits, [t('wan', 3), t('wan', 6)]);
  assert.equal(tileCount(d), 13);
});

test('floaters are identified and sorted', () => {
  // 123万 + 456筒 + 99筒 + 孤张 1条 9万 —— 远张孤立（1 副副露 → 10 张暗手）
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tong', 9], ['tong', 9],
    ['tiao', 1], ['wan', 9],
  ]);
  const d = decomposeHand(concealed, 1);
  assert.equal(tileCount(d), 10);
  assert.ok(d.floaters.length >= 1, 'isolated tiles should be floaters');
});

test('requireJiangPair restricts the pair to 2/5/8', () => {
  // 唯一对子是 9筒（非将）：将牌门槛下 pair 必须为 null
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tong', 4], ['tong', 5], ['tong', 6],
    ['tiao', 7], ['tiao', 8], ['tiao', 9],
    ['tong', 9], ['tong', 9],
    ['wan', 4], ['wan', 5],
  ]);
  const strict = decomposeHand(concealed, 0, { requireJiangPair: true });
  assert.equal(strict.pair, null);
  assert.equal(strict.shanten, shantenWithMelds(concealed, 0, { requireJiangPair: true }));
});

test('invariant: decomposition shanten matches shantenWithMelds on assorted hands', () => {
  const hands = [
    { concealed: hand([['wan', 1], ['wan', 1], ['wan', 2], ['tong', 5], ['tong', 5], ['tong', 7], ['tiao', 3], ['tiao', 4], ['tiao', 9], ['wan', 6], ['wan', 7], ['tong', 2], ['tiao', 1]]), melds: 0 },
    { concealed: hand([['wan', 2], ['wan', 2], ['wan', 5], ['wan', 8], ['tong', 2], ['tong', 5], ['tong', 8], ['tiao', 2], ['tiao', 5], ['tiao', 8], ['wan', 3], ['wan', 4], ['tong', 3]]), melds: 0 },
    { concealed: hand([['tong', 1], ['tong', 2], ['tong', 3], ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 7], ['tong', 8], ['tong', 9], ['wan', 5], ['wan', 5], ['tiao', 2], ['tiao', 3]]), melds: 0 },
    { concealed: hand([['wan', 1], ['wan', 4], ['wan', 7], ['tong', 1], ['tong', 4], ['tong', 7], ['tiao', 1], ['tiao', 4], ['tiao', 7], ['wan', 9], ['tong', 9], ['tiao', 9], ['wan', 2]]), melds: 0 },
    { concealed: hand([['wan', 3], ['wan', 4], ['wan', 5], ['tong', 6], ['tong', 7], ['tiao', 2], ['tiao', 2], ['wan', 8], ['wan', 8], ['tong', 1]]), melds: 1 },
    { concealed: hand([['tiao', 5], ['tiao', 6], ['tiao', 7], ['wan', 2], ['wan', 2], ['tong', 4], ['tong', 5]]), melds: 2 },
  ];
  for (const [i, { concealed, melds }] of hands.entries()) {
    for (const requireJiangPair of [false, true]) {
      const d = decomposeHand(concealed, melds, { requireJiangPair });
      assert.equal(
        d.shanten,
        shantenWithMelds(concealed, melds, { requireJiangPair }),
        `hand #${i} requireJiangPair=${requireJiangPair}`,
      );
      assert.equal(tileCount(d), concealed.length, `hand #${i} tile coverage`);
    }
  }
});

test('requireJiangPair picks a jiang pair when one exists', () => {
  // 22万(将) + 123万... 不行会与22万纠缠——改用 55筒 作将，结构清晰
  const concealed = hand([
    ['wan', 1], ['wan', 2], ['wan', 3],
    ['tiao', 4], ['tiao', 5], ['tiao', 6],
    ['tong', 7], ['tong', 8], ['tong', 9],
    ['tong', 5], ['tong', 5],
    ['wan', 7], ['wan', 8],
  ]);
  const d = decomposeHand(concealed, 0, { requireJiangPair: true });
  assert.deepEqual(d.pair, [t('tong', 5), t('tong', 5)]);
  assert.equal(d.shanten, 0);
});
