import { getUsefulTilesAfterDiscard } from './rules.js';
import { countTiles, createTileSet, removeOneTile, tileKey, tileLabel } from './tiles.js';

export function recommendDiscards({ hand, visibleTiles = [] }) {
  const visibleCounts = countTiles(visibleTiles);
  const uniqueDiscards = uniqueTiles(hand);
  const choices = uniqueDiscards
    .map((discard) => buildChoice(hand, discard, visibleCounts, visibleTiles))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return tileKey(a.discard).localeCompare(tileKey(b.discard));
    });

  return {
    id: `recommend-${choices.map((choice) => tileKey(choice.discard)).join('-')}`,
    best: choices[0] ?? null,
    choices: choices.slice(0, Math.max(3, Math.min(choices.length, uniqueDiscards.length))),
  };
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const unique = [];

  for (const tile of tiles) {
    const key = tileKey(tile);

    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ suit: tile.suit, rank: tile.rank });
    }
  }

  return unique;
}

function buildChoice(hand, discard, visibleCounts, visibleTiles) {
  const usefulTiles = getUsefulTilesForDiscard(hand, discard, visibleTiles);
  const remainingUsefulCount = usefulTiles.reduce((total, item) => total + item.remaining, 0);
  const flexibility = estimateFlexibility(hand, discard);
  const dangerPenalty = visibleCounts.has(tileKey(discard)) ? 0 : 1;
  const score = remainingUsefulCount * 10 + usefulTiles.length * 4 + flexibility - dangerPenalty;

  return {
    discard,
    score,
    usefulTiles,
    remainingUsefulCount,
    explanation: explainChoice(discard, usefulTiles, remainingUsefulCount, flexibility, dangerPenalty),
  };
}

function getUsefulTilesForDiscard(hand, discard, visibleTiles) {
  const winningTiles = getUsefulTilesAfterDiscard(hand, discard, visibleTiles);

  if (winningTiles.length > 0) {
    return winningTiles;
  }

  const afterDiscard = removeOneTile(hand, discard);
  const basePotential = estimateHandPotential(afterDiscard);
  const visibleCounts = countTiles(visibleTiles);
  const handCounts = countTiles(afterDiscard);

  return uniqueTiles(createTileSet())
    .map((tile) => {
      const key = tileKey(tile);
      const remaining = 4 - (visibleCounts.get(key) ?? 0) - (handCounts.get(key) ?? 0);
      return { tile, remaining };
    })
    .filter((item) => item.remaining > 0)
    .filter((item) => estimateHandPotential([...afterDiscard, item.tile]) > basePotential)
    .sort((a, b) => {
      if (b.remaining !== a.remaining) {
        return b.remaining - a.remaining;
      }

      return tileKey(a.tile).localeCompare(tileKey(b.tile));
    });
}

function estimateFlexibility(hand, discard) {
  const afterDiscardCounts = countTiles(hand.filter((tile, index) => {
    if (tileKey(tile) !== tileKey(discard)) {
      return true;
    }

    return hand.findIndex((item) => tileKey(item) === tileKey(discard)) !== index;
  }));
  let flexibility = 0;

  for (const offset of [-2, -1, 1, 2]) {
    const rank = discard.rank + offset;

    if (rank < 1 || rank > 9) {
      continue;
    }

    const neighborCount = afterDiscardCounts.get(tileKey({ suit: discard.suit, rank })) ?? 0;

    if (neighborCount > 0) {
      flexibility += Math.abs(offset) === 1 ? 2 : 1;
    }
  }

  return flexibility;
}

function explainChoice(discard, usefulTiles, remainingUsefulCount, flexibility, dangerPenalty) {
  const usefulText = usefulTiles.length > 0
    ? usefulTiles.map((item) => `${tileLabel(item.tile)}(${item.remaining})`).join('、')
    : '暂无明显改良张';
  const riskText = dangerPenalty > 0 ? '风险提示：场上未见同名牌，保守扣分。' : '风险提示：场上已见同名牌，风险较低。';

  return `推荐打${tileLabel(discard)}，有效进张/改良张：${usefulText}；剩余张数${remainingUsefulCount}；牌型灵活度${flexibility}；${riskText}`;
}

function estimateHandPotential(hand) {
  const counts = countTiles(hand);
  let score = 0;

  for (const [key, count] of counts.entries()) {
    if (count >= 3) {
      score += 6;
    } else if (count === 2) {
      score += 3;
    }

    const [suit, rankText] = key.split('-');
    const rank = Number(rankText);
    const adjacent = counts.get(`${suit}-${rank + 1}`) ?? 0;
    const gapped = counts.get(`${suit}-${rank + 2}`) ?? 0;

    if (rank <= 8 && adjacent > 0) {
      score += Math.min(count, adjacent) * 2;
    }

    if (rank <= 7 && gapped > 0) {
      score += Math.min(count, gapped);
    }

    if (rank <= 7) {
      const next = counts.get(`${suit}-${rank + 1}`) ?? 0;
      const nextNext = counts.get(`${suit}-${rank + 2}`) ?? 0;

      if (next > 0 && nextNext > 0) {
        score += Math.min(count, next, nextNext) * 4;
      }
    }
  }

  return score;
}
