import assert from 'node:assert/strict';
import test from 'node:test';

import { runHand } from '../src/core/turn-engine.js';
import { tileKey } from '../src/core/tiles.js';

const t = (suit, rank) => ({ suit, rank });
const handOf = (specs) => specs.map(([s, r]) => t(s, r));
const noDelay = () => Promise.resolve();

function makeGame(overrides = {}) {
  // flags.initialNoJiang:true = no jiang pair required (preserves pre-jiang-rule test behavior)
  const players = [0, 1, 2, 3].map(() => ({ hand: [], melds: [], discards: [], flags: { initialNoJiang: true } }));
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

test('a self kong with an empty wall ends the hand in a draw (no replacement)', async () => {
  const tile = t('wan', 1);
  const game = makeGame({ currentPlayer: 0, wall: [] });
  game.players[0].hand = [tile, tile, tile, tile, ...handOf([
    ['tong', 2], ['tong', 5], ['tong', 8], ['tiao', 1], ['tiao', 4],
    ['tiao', 7], ['wan', 4], ['wan', 7], ['tong', 1], ['tong', 3],
  ])];
  const agents = [scripted({ actions: [{ type: 'concealed-kong', tile }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.equal(result.phase, 'hand-over');
  assert.equal(result.result.type, 'draw');
});

test('a discard win (点炮) ends the hand with loser and pattern', async () => {
  const claimed = t('tiao', 1);
  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 1)] });
  game.players[0].hand = [claimed, ...handOf([
    ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 7], ['tong', 8], ['tong', 9],
    ['wan', 2], ['wan', 3], ['wan', 4], ['tiao', 5], ['tiao', 6], ['tiao', 7], ['tong', 2],
  ])];
  // seat 2 听牌：万1-9 + 筒1-3 + 条1，单钓条1 成对
  game.players[2].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3], ['tiao', 1],
  ]);
  const seat0 = scripted({ actions: [{ type: 'discard', tile: claimed }] });
  const seat2 = {
    chooseAction: async () => ({ type: 'discard', tile: t('wan', 1) }),
    chooseClaim: async (g, s, options) => options.find((o) => o.type === 'win') ?? { type: 'pass' },
  };
  const agents = [seat0, passAgent, seat2, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.equal(result.phase, 'hand-over');
  assert.equal(result.result.winner, 2);
  assert.equal(result.result.winType, 'discard');
  assert.equal(result.result.loser, 0);
  assert.equal(typeof result.result.pattern, 'string');
});

test('an already-aborted signal returns immediately', async () => {
  const controller = new AbortController();
  controller.abort();
  const game = makeGame({ currentPlayer: 0 });
  const result = await runHand(game, [passAgent, passAgent, passAgent, passAgent], { delay: noDelay, signal: controller.signal });
  assert.equal(result.phase, 'awaiting-discard'); // 未推进
});

// --- requireJiangPair 贯穿 turn-engine ---
// seat 2 听牌：万1(等对) + 万2-3-4 + 万5-6-7 + 筒1-2-3 + 条1-2-3
// 万1 是 rank 1，非将牌（2/5/8），所以 requireJiangPair 时不能胡
const nonJiangTenpai = handOf([
  ['wan', 1],
  ['wan', 2], ['wan', 3], ['wan', 4],
  ['wan', 5], ['wan', 6], ['wan', 7],
  ['tong', 1], ['tong', 2], ['tong', 3],
  ['tiao', 1], ['tiao', 2], ['tiao', 3],
]);

test('turn-engine: requireJiangPair blocks win on non-jiang pair (initialNoJiang:false)', async () => {
  const discardTile = t('wan', 1);
  // seat 0 需要 14 张手牌（出掉 wan-1 后还有 13 张），随便填入其他牌
  const seat0Hand = [discardTile, ...handOf([
    ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 7], ['tong', 8], ['tong', 9],
    ['wan', 2], ['wan', 3], ['wan', 4], ['tiao', 5], ['tiao', 6], ['tiao', 7], ['tong', 2],
  ])];

  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 9)] });
  game.players[0].hand = seat0Hand;
  game.players[2].hand = [...nonJiangTenpai];
  // initialNoJiang: false => jiang 将牌要求生效
  game.players[2].flags = { initialNoJiang: false };

  const seat0 = scripted({ actions: [{ type: 'discard', tile: discardTile }] });
  // seat 2 会尝试抢胡，但应被 jiang 规则拦住
  const seat2 = {
    chooseAction: async () => ({ type: 'discard', tile: t('wan', 1) }),
    chooseClaim: async (g, s, options) => options.find((o) => o.type === 'win') ?? { type: 'pass' },
  };
  const controller = new AbortController();
  // seat 3 的 chooseAction 被调用时说明轮到座位 3 → 胡牌未发生，终止
  const seat3 = {
    chooseAction: async () => { controller.abort(); return { type: 'discard', tile: t('tong', 9) }; },
    chooseClaim: async () => ({ type: 'pass' }),
  };
  const agents = [seat0, passAgent, seat2, seat3];

  const result = await runHand(game, agents, { delay: noDelay, signal: controller.signal });

  // jiang 规则生效时，seat 2 没能胡牌，手牌继续走到下一家（座位 2 绝不是赢家）
  assert.notEqual(result.result?.winner, 2,
    'seat 2 should NOT win when requireJiangPair blocks non-jiang pair');
  // 且确实走到了下一家（座位 3）才被中止，证明认领窗口未把牌判给座位 2
  assert.equal(result.currentPlayer, 3);
});

test('turn-engine: no-jiang-flag allows win on non-jiang pair (initialNoJiang:true)', async () => {
  const discardTile = t('wan', 1);
  const seat0Hand = [discardTile, ...handOf([
    ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 7], ['tong', 8], ['tong', 9],
    ['wan', 2], ['wan', 3], ['wan', 4], ['tiao', 5], ['tiao', 6], ['tiao', 7], ['tong', 2],
  ])];

  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 9)] });
  game.players[0].hand = seat0Hand;
  game.players[2].hand = [...nonJiangTenpai];
  // initialNoJiang: true => 无将牌要求，可以非将对胡牌
  game.players[2].flags = { initialNoJiang: true };

  const seat0 = scripted({ actions: [{ type: 'discard', tile: discardTile }] });
  const seat2 = {
    chooseAction: async () => ({ type: 'discard', tile: t('wan', 1) }),
    chooseClaim: async (g, s, options) => options.find((o) => o.type === 'win') ?? { type: 'pass' },
  };
  const agents = [seat0, passAgent, seat2, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.equal(result.phase, 'hand-over');
  assert.equal(result.result?.type, 'win');
  assert.equal(result.result?.winner, 2);
});

test('haidi self-draw win reports 海底捞月 in result.patterns and pattern name', async () => {
  const game = makeGame({
    currentPlayer: 0,
    wall: [],
    lastDraw: { seat: 0, tile: t('tiao', 1), afterKong: false },
  });
  game.players[0].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  const agents = [scripted({ actions: [{ type: 'self-win' }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.ok(Array.isArray(result.result.patterns));
  assert.ok(result.result.patterns.includes('海底捞月'));
  assert.ok(result.result.pattern.includes('海底捞月'));
});

test('non-haidi self-draw does not report 海底捞月 (patterns empty, pattern 自摸)', async () => {
  const game = makeGame({
    currentPlayer: 0,
    wall: [t('tong', 9)],
    lastDraw: { seat: 0, tile: t('tiao', 1), afterKong: false },
  });
  game.players[0].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3],
    ['tiao', 1], ['tiao', 1],
  ]);
  const agents = [scripted({ actions: [{ type: 'self-win' }] }), passAgent, passAgent, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.deepEqual(result.result.patterns, []);
  assert.equal(result.result.pattern, '自摸');
});

test('discard win carries patterns array (empty for a plain hand)', async () => {
  const claimed = t('tiao', 1);
  const game = makeGame({ currentPlayer: 0, wall: [t('tong', 1)] });
  game.players[0].hand = [claimed, ...handOf([
    ['tong', 4], ['tong', 5], ['tong', 6], ['tong', 7], ['tong', 8], ['tong', 9],
    ['wan', 2], ['wan', 3], ['wan', 4], ['tiao', 5], ['tiao', 6], ['tiao', 7], ['tong', 2],
  ])];
  game.players[2].hand = handOf([
    ['wan', 1], ['wan', 2], ['wan', 3], ['wan', 4], ['wan', 5], ['wan', 6],
    ['wan', 7], ['wan', 8], ['wan', 9], ['tong', 1], ['tong', 2], ['tong', 3], ['tiao', 1],
  ]);
  const seat0 = scripted({ actions: [{ type: 'discard', tile: claimed }] });
  const seat2 = {
    chooseAction: async () => ({ type: 'discard', tile: t('wan', 1) }),
    chooseClaim: async (g, s, options) => options.find((o) => o.type === 'win') ?? { type: 'pass' },
  };
  const agents = [seat0, passAgent, seat2, passAgent];

  const result = await runHand(game, agents, { delay: noDelay });

  assert.equal(result.result.winner, 2);
  assert.deepEqual(result.result.patterns, []);
});
