import { countTiles } from './tiles.js';

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

export function identifyPattern(concealed, melds, winningTile, ctx = {}) {
  const allTiles = [...concealed, ...melds.flatMap((meld) => meld.tiles)];

  if (ctx.robKong) return '抢杠胡';
  if (ctx.afterKong && ctx.selfDraw) return '杠上花';
  if (isFlush(allTiles)) return '清一色';
  if (isAllTriplets(concealed, melds)) return '碰碰胡';
  if (ctx.selfDraw) return '自摸';
  return '平胡';
}
