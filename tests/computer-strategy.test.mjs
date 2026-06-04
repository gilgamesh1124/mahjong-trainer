import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseComputerDiscard } from '../src/core/computer-strategy.js';
import { tileKey } from '../src/core/tiles.js';

function tile(suit, rank) {
  return { suit, rank };
}

function tiles(specs) {
  return specs.map(([suit, rank]) => tile(suit, rank));
}

test('chooseComputerDiscard chooses a discard that improves shanten', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['wan', 4],
    ['wan', 5],
    ['wan', 6],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
    ['tiao', 2],
    ['tiao', 3],
    ['wan', 9],
    ['tiao', 9],
  ]);

  const result = chooseComputerDiscard({ hand });

  assert.equal(tileKey(result.discard), 'tiao-9');
  assert.equal(result.best.shanten, 0);
  assert.ok(result.choices.length > 1);
});

test('chooseComputerDiscard accounts for visible tiles reducing ukeire', () => {
  const hand = tiles([
    ['tong', 7],
    ['wan', 1],
    ['wan', 5],
    ['tiao', 2],
    ['tong', 2],
    ['wan', 1],
    ['tiao', 3],
    ['wan', 7],
    ['tong', 1],
    ['wan', 9],
    ['tong', 7],
    ['wan', 3],
    ['wan', 7],
    ['tiao', 5],
  ]);
  const visibleTiles = tiles([
    ['tiao', 1],
    ['tiao', 1],
    ['tiao', 1],
    ['tiao', 1],
  ]);

  const resultWithoutVisible = chooseComputerDiscard({ hand });
  const result = chooseComputerDiscard({ hand, visibleTiles });

  assert.equal(tileKey(resultWithoutVisible.discard), 'tiao-5');
  assert.equal(tileKey(result.discard), 'tiao-2');
  assert.ok(result.choices.some((choice) => (
    tileKey(choice.discard) === 'tiao-5' && choice.ukeireCount < 34
  )));
});

test('chooseComputerDiscard does not mutate the hand and does not require the wall', () => {
  const hand = tiles([
    ['wan', 1],
    ['wan', 2],
    ['wan', 3],
    ['tong', 1],
    ['tong', 2],
    ['tong', 3],
    ['tiao', 1],
    ['tiao', 2],
    ['tiao', 3],
    ['wan', 8],
    ['wan', 8],
    ['tong', 7],
    ['tiao', 8],
    ['tiao', 9],
  ]);
  const before = hand.map(tileKey);

  const result = chooseComputerDiscard({ hand });

  assert.deepEqual(hand.map(tileKey), before);
  assert.ok(result.discard);
  assert.equal('wall' in result, false);
});
