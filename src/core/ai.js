import { shantenWithMelds, calcUkeire } from './rules.js';
import { canSelfDrawWin } from './melds.js';
import { tileKey, removeOneTile } from './tiles.js';

const DANGER_BY_RANK = { 1: 0.2, 2: 0.3, 3: 0.4, 4: 0.6, 5: 0.6, 6: 0.6, 7: 0.4, 8: 0.3, 9: 0.2 };
const DANGER_WEIGHT = 80; // 与 (8-shanten)*1000 + ukeire 同量纲下的安全度权重

// 0..1：对单个对手而言，现物=0；否则按中张程度，并随该对手是否有副露略放大
function dangerVsOpponent(tile, opponent) {
  const isGenbutsu = opponent.discards.some((d) => tileKey(d) === tileKey(tile));
  if (isGenbutsu) return 0;
  const base = DANGER_BY_RANK[tile.rank] ?? 0.4;
  const threat = opponent.melds.length > 0 ? 1.2 : 1;
  return Math.min(1, base * threat);
}

export function tileDanger(tile, game, mySeat) {
  let worst = 0;
  for (let seat = 0; seat < game.players.length; seat += 1) {
    if (seat === mySeat) continue;
    worst = Math.max(worst, dangerVsOpponent(tile, game.players[seat]));
  }
  return worst;
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const out = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) { seen.add(key); out.push(tile); }
  }
  return out;
}

function visibleCounts(game) {
  const counts = new Map();
  for (const player of game.players) {
    for (const tile of player.discards) counts.set(tileKey(tile), (counts.get(tileKey(tile)) ?? 0) + 1);
    for (const meld of player.melds) for (const tile of meld.tiles) counts.set(tileKey(tile), (counts.get(tileKey(tile)) ?? 0) + 1);
  }
  return counts;
}

export function decideDiscard(game, seat) {
  const player = game.players[seat];
  const meldCount = player.melds.length;
  const seen = visibleCounts(game);

  let bestTile = player.hand[0];
  let bestScore = -Infinity;

  for (const discard of uniqueTiles(player.hand)) {
    const after = removeOneTile(player.hand, discard);
    const shanten = shantenWithMelds(after, meldCount);
    const ukeire = calcUkeire(after, seen, meldCount);
    const danger = tileDanger(discard, game, seat);
    const score = (8 - shanten) * 1000 + ukeire.totalCount - DANGER_WEIGHT * danger;
    if (score > bestScore) { bestScore = score; bestTile = discard; }
  }
  return bestTile;
}

export function decideClaim(game, seat, options) {
  const win = options.find((o) => o.type === 'win');
  if (win) return win;

  const player = game.players[seat];
  const meldCount = player.melds.length;
  const current = shantenWithMelds(player.hand, meldCount);

  // 评估非胡认领：碰/杠移出对应牌+多一副；吃移出两张顺子搭子+多一副。
  // 仅当能降向听，或已接近听牌(<=1)且不升向听时才认领。
  for (const option of options) {
    let after = player.hand;
    let removed = true;
    try {
      if (option.type === 'pong' || option.type === 'kong') {
        // 杠会摸补牌，补回 1 张，故有效手牌规模与碰相同：均按移出 2 张评估，
        // 既避免对错误规模手牌算向听，也把杠视作"至少不差于碰"。
        after = removeOneTile(removeOneTile(after, lastTile(game)), lastTile(game));
      } else if (option.type === 'chi') {
        for (const tile of option.tiles) after = removeOneTile(after, tile);
      } else {
        removed = false; // 未知认领类型：不评估
      }
    } catch { removed = false; }
    if (!removed) continue;

    const next = shantenWithMelds(after, meldCount + 1);
    // 只有当认领后向听 <=2（接近听牌），或者认领不升向听且原本已接近(<=1)时才认领
    if ((next < current && next <= 2) || (next === current && current <= 1)) return option;
  }
  return { type: 'pass' };
}

function lastTile(game) {
  return game.lastDiscard.tile;
}

export function decideAction(game, seat) {
  const player = game.players[seat];
  if (canSelfDrawWin(player.hand, player.melds)) {
    return { type: 'self-win' };
  }
  // 简化：AI 不主动暗杠/补杠（机制保留给玩家）
  return { type: 'discard', tile: decideDiscard(game, seat) };
}
