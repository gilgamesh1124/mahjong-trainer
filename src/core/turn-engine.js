import { sortTiles } from './tiles.js';
import { applyDiscard, applyPong, applyChi, applyKong, applyWin, markDraw, drawTile } from './game-state.js';
import { claimOptionsFor, resolveClaims } from './claims.js';
import { canWinOnTile } from './melds.js';
import { identifyPattern } from './patterns.js';

const NEXT = (seat) => (seat + 3) % 4;

function winningConcealed(player, extraTile) {
  return sortTiles(extraTile ? [...player.hand, extraTile] : [...player.hand]);
}

// 补杠被抢：返回可胡的最近座位，否则 null
function findRobKong(game, kongSeat, tile) {
  let found = null;
  for (let step = 1; step <= 3; step += 1) {
    const seat = (kongSeat + 3 * step) % 4;
    if (canWinOnTile(game.players[seat].hand, game.players[seat].melds, tile)) { found = seat; break; }
  }
  return found;
}

export async function runHand(game, agents, { delay = () => Promise.resolve(), onUpdate = () => {}, signal } = {}) {
  const aborted = () => signal?.aborted;

  onUpdate(game);

  while (game.phase !== 'hand-over') {
    if (aborted()) return game;
    const seat = game.currentPlayer;

    const action = await agents[seat].chooseAction(game, seat);
    if (aborted()) return game;

    if (action.type === 'self-win') {
      const tile = game.lastDraw?.tile ?? action.tile;
      const pattern = identifyPattern(winningConcealed(game.players[seat]), game.players[seat].melds, tile, { selfDraw: true, afterKong: !!game.lastDraw?.afterKong });
      game = applyWin(game, seat, { winType: 'self-draw', tile, loser: null, afterKong: !!game.lastDraw?.afterKong, pattern });
      onUpdate(game);
      continue;
    }

    if (action.type === 'concealed-kong' || action.type === 'added-kong') {
      if (action.type === 'added-kong') {
        const robber = findRobKong(game, seat, action.tile);
        if (robber !== null) {
          const pattern = identifyPattern(winningConcealed(game.players[robber], action.tile), game.players[robber].melds, action.tile, { robKong: true });
          game = applyWin(game, robber, { winType: 'rob-kong', tile: action.tile, loser: seat, afterKong: false, pattern });
          onUpdate(game);
          continue;
        }
      }
      if (game.wall.length === 0) {
        // 牌墙已空，杠无补牌可摸 → 流局
        game = markDraw(game);
        onUpdate(game);
        continue;
      }
      game = applyKong(game, seat, action.tile, null, action.type);
      onUpdate(game);
      await delay();
      continue; // 杠后回到同座位出牌（或杠上花）
    }

    // 普通出牌
    game = applyDiscard(game, seat, action.tile);
    onUpdate(game);
    await delay();
    if (aborted()) return game;

    // 认领窗口
    const intents = [];
    for (let step = 1; step <= 3; step += 1) {
      const other = (seat + 3 * step) % 4;
      const options = claimOptionsFor(other, game.players[other], game.lastDiscard.tile, seat);
      if (options.length === 0) continue;
      const intent = await agents[other].chooseClaim(game, other, options);
      if (aborted()) return game;
      intents.push({ seat: other, claim: intent });
    }

    const winner = resolveClaims(intents, seat);
    if (aborted()) return game;

    if (!winner) {
      const next = NEXT(seat);
      if (game.wall.length === 0) { game = markDraw(game); onUpdate(game); continue; }
      game = drawTile(game, next);
      onUpdate(game);
      await delay();
      continue;
    }

    const claimedTile = game.lastDiscard.tile;
    if (winner.claim.type === 'win') {
      const pattern = identifyPattern(winningConcealed(game.players[winner.seat], claimedTile), game.players[winner.seat].melds, claimedTile, {});
      game = applyWin(game, winner.seat, { winType: 'discard', tile: claimedTile, loser: seat, afterKong: false, pattern });
    } else if (winner.claim.type === 'pong') {
      game = applyPong(game, winner.seat, claimedTile, seat);
    } else if (winner.claim.type === 'kong') {
      if (game.wall.length === 0) {
        game = markDraw(game); // 牌墙已空，杠无补牌可摸 → 流局
      } else {
        game = applyKong(game, winner.seat, claimedTile, seat, 'kong');
      }
    } else if (winner.claim.type === 'chi') {
      game = applyChi(game, winner.seat, winner.claim.tiles, claimedTile, seat);
    }
    onUpdate(game);
    await delay();
  }

  onUpdate(game);
  return game;
}
