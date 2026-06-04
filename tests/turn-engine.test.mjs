import assert from 'node:assert/strict';
import test from 'node:test';

import { runHand } from '../src/core/turn-engine.js';
import { tileKey } from '../src/core/tiles.js';

const t = (suit, rank) => ({ suit, rank });
const handOf = (specs) => specs.map(([s, r]) => t(s, r));
const noDelay = () => Promise.resolve();

function makeGame(overrides = {}) {
  const players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [] }));
  return { players, wall: [], currentPlayer: 0, phase: 'awaiting-discard', lastDiscard: null, lastDraw: null, result: null, history: [], ...overrides };
}

// 脚本 agent：按数组依次返回动作/认领；用尽则默认 pass / 由测试提前中止
function scripted({ actions = [], claims = [] } = {}) {
  let ai = 0; let ci = 0;
  return {
    chooseAction: async () => actions[ai++],
    chooseClaim: async () => claims[ci++] ?? { type: 'pass' },
  };
}
const passAgent = { chooseAction: async () => ({ type: 'discard' }), chooseClaim: async () => ({ type: 'pass' }) };

test('self-draw win ends the hand with a pattern', async () => {
  const game = makeGame({
    currentPlayer: 0,
    lastDraw: { seat: 0, tile: t('tiao', 1), afterKong: false },
  });
  game.players[0].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  const agents = [scripted({ actions: [{ type: 'self-win' }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.equal(result.phase, 'hand-over');
  assert.equal(result.result.winner, 0);
  assert.equal(result.result.winType, 'self-draw');
  assert.equal(typeof result.result.pattern, 'string');
});

test('no claim passes the turn to the 下家 who then draws', async () => {
  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 7)] });
  const discardTile = t('tiao', 9);
  game.players[0].hand = [discardTile, ...handOf([
    ['wan', 1], ['wan', 4], ['wan', 7], ['tong', 2], ['tong', 5], ['tong', 8],
    ['tiao', 1], ['tiao', 4], ['tiao', 7], ['wan', 2], ['wan', 5], ['wan', 8], ['tong', 1],
  ])];
  // 其他三家空手 → 无人能认领
  const controller = new AbortController();
  const captured = [];
  const seat3 = {
    chooseAction: async () => { controller.abort(); return { type: 'discard', tile: game.wall[0] }; },
    chooseClaim: async () => ({ type: 'pass' }),
  };
  const agents = [scripted({ actions: [{ type: 'discard', tile: discardTile }] }), passAgent, passAgent, seat3];

  const result = await runHand(game, agents, { delay: noDelay, signal: controller.signal, onUpdate: (g) => captured.push(g) });

  // 中止前最后状态：座位 3 已摸牌、轮到 3、awaiting-discard
  assert.equal(result.currentPlayer, 3);
  assert.equal(result.phase, 'awaiting-discard');
  assert.equal(result.history.at(-1).type, 'draw');
  assert.equal(result.history.at(-1).playerIndex, 3);
});

test('a pong claim redirects the turn to the claimer and melds the tile', async () => {
  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 1)] });
  const claimed = t('wan', 5);
  game.players[0].hand = [claimed, ...handOf([
    ['wan', 1], ['wan', 4], ['wan', 7], ['tong', 2], ['tong', 5], ['tong', 8],
    ['tiao', 1], ['tiao', 4], ['tiao', 7], ['wan', 2], ['wan', 8], ['tong', 1], ['tong', 3],
  ])];
  game.players[2].hand = handOf([['wan', 5], ['wan', 5], ['tong', 9]]);

  const controller = new AbortController();
  const seat2 = {
    chooseAction: async () => { controller.abort(); return { type: 'discard', tile: t('tong', 9) }; },
    chooseClaim: async (g, s, options) => options.find((o) => o.type === 'pong') ?? { type: 'pass' },
  };
  const agents = [scripted({ actions: [{ type: 'discard', tile: claimed }] }), passAgent, seat2, passAgent];

  const result = await runHand(game, agents, { delay: noDelay, signal: controller.signal });

  assert.equal(result.currentPlayer, 2);
  assert.equal(result.players[2].melds[0].type, 'pong');
  assert.ok(!result.players[0].discards.some((d) => tileKey(d) === tileKey(claimed)));
});

test('an already-aborted signal returns immediately', async () => {
  const controller = new AbortController();
  controller.abort();
  const game = makeGame({ currentPlayer: 0 });
  const result = await runHand(game, [passAgent, passAgent, passAgent, passAgent], { delay: noDelay, signal: controller.signal });
  assert.equal(result.phase, 'awaiting-discard'); // 未推进
});
