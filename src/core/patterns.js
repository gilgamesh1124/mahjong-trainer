import { countTiles } from './tiles.js';
import { isJiangTile } from './rules.js';

function isFlush(tiles) {
  return tiles.length > 0 && tiles.every((tile) => tile.suit === tiles[0].suit);
}

// 假定 concealed 已是一个合法胡牌的牌组；判断其是否可全部拆成刻子+一对（无顺子）
function isAllTriplets(concealed, melds) {
  if (melds.some((meld) => meld.type === 'chi')) return false;
  let pairLike = 0;
  for (const count of countTiles(concealed).values()) {
    const r = count % 3;
    if (r === 2) pairLike += 1;
    else if (r !== 0) return false;
  }
  return pairLike === 1;
}

// 返回全部命中的大胡名（可空）。ctx = { selfDraw?, afterKong?, robKong?, haidi? }
// 契约：concealed 须已包含胡牌张（winningTile 仅作签名对齐保留，不参与判定）。
export function identifyPatterns(concealed, melds, winningTile, ctx = {}) {
  const allTiles = [...concealed, ...melds.flatMap((meld) => meld.tiles)];
  const patterns = [];
  if (ctx.robKong) patterns.push('抢杠胡');
  if (ctx.afterKong && ctx.selfDraw) patterns.push('杠上花');
  if (ctx.haidi && ctx.selfDraw) patterns.push('海底捞月');
  if (isFlush(allTiles)) patterns.push('清一色');
  if (allTiles.length > 0 && allTiles.every((tile) => isJiangTile(tile))) patterns.push('将将胡');
  if (isAllTriplets(concealed, melds)) patterns.push('碰碰胡');
  return patterns;
}

export function identifyPattern(concealed, melds, winningTile, ctx = {}) {
  const allTiles = [...concealed, ...melds.flatMap((meld) => meld.tiles)];

  if (ctx.robKong) return '抢杠胡';
  if (ctx.afterKong && ctx.selfDraw) return '杠上花';
  if (isFlush(allTiles)) return '清一色';
  if (isAllTriplets(concealed, melds)) return '碰碰胡';
  if (ctx.selfDraw) return '自摸';
  return '平胡';
}
