import { shantenWithMelds, calcUkeire, isJiangTile } from './rules.js';
import { removeOneTile, tileKey, tileLabel, countTiles } from './tiles.js';
import { decomposeHand } from './decompose.js';

// 中张越危险（放炮风险）：4-6 最高，幺九最低。已被看到的张会按比例降低危险。
const RANK_DANGER = { 1: 0.25, 2: 0.45, 3: 0.7, 4: 1, 5: 1, 6: 1, 7: 0.7, 8: 0.45, 9: 0.25 };
const DANGER_WEIGHT = 30;

export function recommendDiscards({
  hand, visibleTiles = [], openMeldCount = 0, requireJiangPair = false, melds = [],
}) {
  const visibleCounts = buildVisibleCounts(visibleTiles);
  const uniqueDiscards = uniqueTiles(hand);

  const choices = uniqueDiscards
    .map((discard) => buildChoice(hand, discard, visibleCounts, openMeldCount, requireJiangPair, melds))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return tileKey(a.discard).localeCompare(tileKey(b.discard));
    });

  const topChoices = choices.slice(0, Math.max(3, Math.min(choices.length, uniqueDiscards.length)));

  for (const choice of topChoices.slice(0, 3)) {
    if (choice.shanten === 1) {
      choice.outlook = buildOutlook(
        removeOneTile(hand, choice.discard), choice.usefulTiles,
        visibleCounts, openMeldCount, requireJiangPair,
      );
    }
  }

  return {
    id: `recommend-${choices.map((c) => tileKey(c.discard)).join('-')}`,
    best: topChoices[0] ?? null,
    choices: topChoices,
  };
}

function buildChoice(hand, discard, visibleCounts, openMeldCount, requireJiangPair, melds) {
  const afterDiscard = removeOneTile(hand, discard);
  const shanten = shantenWithMelds(afterDiscard, openMeldCount, { requireJiangPair });
  const ukeire = calcUkeire(afterDiscard, visibleCounts, openMeldCount, { requireJiangPair });
  const decomposition = decomposeHand(afterDiscard, openMeldCount, { requireJiangPair });
  const value = patternValue(afterDiscard, melds, requireJiangPair);
  const danger = discardDanger(discard, visibleCounts);

  // 受益期望（启发式）：向听为主导；进张(活张) + 牌型价值 - 放炮风险 作同向听内的倾向加权。
  // 量级上 patternValue/danger 远小于 1000，绝不会跨越向听层级。
  const score = (8 - shanten) * 1000 + ukeire.totalCount + value - Math.round(danger * DANGER_WEIGHT);

  return {
    discard,
    shanten,
    ukeireCount: ukeire.totalCount,
    usefulTiles: ukeire.tiles,
    decomposition,
    patternValue: value,
    danger,
    score,
    explanation: buildExplanation(discard, shanten, ukeire, value, danger, decomposition),
  };
}

// 牌型价值（0..~50）：越接近高分牌型给分越高，结合"胡牌方式"做倾向加权。
function patternValue(concealed, melds, requireJiangPair) {
  const meldTiles = melds.flatMap((m) => m.tiles);
  const all = [...concealed, ...meldTiles];
  if (all.length === 0) return 0;
  let value = 0;

  // 清一色倾向：单一花色占比超过一半才加分（纯一色约 +30）
  const bySuit = { tong: 0, wan: 0, tiao: 0 };
  for (const t of all) bySuit[t.suit] += 1;
  const purity = Math.max(bySuit.tong, bySuit.wan, bySuit.tiao) / all.length;
  value += Math.round(Math.max(0, purity - 0.5) * 60);

  // 碰碰胡倾向：暗手中成对/成刻占比 + 已碰/杠副露数
  const counts = countTiles(concealed);
  let paired = 0;
  for (const c of counts.values()) if (c >= 2) paired += c;
  value += Math.round((paired / Math.max(concealed.length, 1)) * 12);
  value += melds.filter((m) => m.type !== 'chi').length * 3;

  // 将对：需要将牌时，留有 2/5/8 对子更接近合法胡
  if (requireJiangPair) {
    for (const [key, count] of counts) {
      if (count >= 2 && isJiangTile(parseTile(key))) { value += 8; break; }
    }
  }
  return value;
}

// 放炮风险（0..~1）：中张更险；该张已被看到越多越安全（对手手里/听口剩得越少）
function discardDanger(discard, visibleCounts) {
  const seen = visibleCounts.get(tileKey(discard)) ?? 0;
  const base = RANK_DANGER[discard.rank] ?? 0.5;
  return base * Math.max(0, 1 - seen * 0.34);
}

function parseTile(key) {
  const dash = key.lastIndexOf('-');
  return { suit: key.slice(0, dash), rank: Number(key.slice(dash + 1)) };
}

// 1 向展望：对每个进张，进张后枚举弃张取「听牌且听张数最大」者，列出听张明细
function buildOutlook(hand13, usefulTiles, visibleCounts, openMeldCount, requireJiangPair) {
  return usefulTiles.map(({ tile, remaining }) => {
    const hand14 = [...hand13, tile];
    let best = null;
    for (const discard of uniqueTiles(hand14)) {
      const after = removeOneTile(hand14, discard);
      if (shantenWithMelds(after, openMeldCount, { requireJiangPair }) !== 0) continue;
      const ukeire = calcUkeire(after, visibleCounts, openMeldCount, { requireJiangPair });
      if (!best || ukeire.totalCount > best.waitTotal) {
        best = { waits: ukeire.tiles, waitTotal: ukeire.totalCount };
      }
    }
    return { tile, remaining, waits: best?.waits ?? [], waitTotal: best?.waitTotal ?? 0 };
  });
}

function buildExplanation(discard, shanten, ukeire, value, danger, decomposition) {
  const label = tileLabel(discard);
  const tags = [];
  if (value >= 18) tags.push('牌型价值高');
  if (danger >= 0.7) tags.push('注意放炮');
  else if (danger <= 0.2) tags.push('较安全');
  const tagText = tags.length ? `（${tags.join('、')}）` : '';

  if (shanten < 0) return `打${label}后已和牌。`;
  if (shanten === 0) {
    const waits = ukeire.tiles.slice(0, 4).map((u) => tileLabel(u.tile)).join('/');
    const more = ukeire.tiles.length > 4 ? '等' : '';
    return `打${label}后听牌：听 ${waits}${more}，共 ${ukeire.totalCount} 张${tagText}。`;
  }
  if (shanten === 1) {
    const sets = decomposition.sets.length;
    const pairText = decomposition.pair ? `、${tileLabel(decomposition.pair[0])}对作将` : '';
    const draws = ukeire.tiles.slice(0, 4).map((u) => tileLabel(u.tile)).join('/');
    const more = ukeire.tiles.length > 4 ? '等' : '';
    return `打${label}后差 1 向：已成 ${sets} 副面子${pairText}，进 ${draws}${more}即听牌${tagText}。`;
  }
  return `打${label}后还差 ${shanten} 向，共 ${ukeire.totalCount} 张进张（${ukeire.tiles.length} 种）${tagText}。`;
}

function buildVisibleCounts(visibleTiles) {
  const counts = new Map();
  for (const tile of visibleTiles) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const unique = [];
  for (const tile of tiles) {
    const key = tileKey(tile);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(tile);
    }
  }
  return unique;
}
