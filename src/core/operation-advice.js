import { shantenWithMelds, calcUkeire } from './rules.js';
import { removeOneTile, sortTiles, tileKey, tileLabel } from './tiles.js';

// 认领类型 → 中文标签
const TYPE_LABELS = {
  win: '胡',
  kong: '杠',
  pong: '碰',
  chi: '吃',
  pass: '过',
};

// 副露暴露惩罚
const EXPOSURE_PENALTY = {
  chi: 35,
  pong: 35,
  kong: 10,
};

/**
 * 推荐认领操作（纯函数）
 *
 * @param {object} params
 * @param {object} params.player         - 认领玩家 { hand, melds, ... }
 * @param {Array}  params.options        - claimOptionsFor 返回的选项数组
 *                                         [{ type:'win'|'kong'|'pong'|'chi', tiles? }]
 *                                         chi 的 tiles = 手牌中的 2 张配合牌（不含弃牌）
 * @param {object} params.discardedTile  - 被认领的弃牌
 * @param {Array}  [params.visibleTiles] - 可见牌（用于 ukeire 计算），null 时按空计算
 * @param {boolean} [params.requireJiangPair=false]
 * @returns {{ id, best, choices, ruleNote }}
 */
export function recommendOperation({
  player,
  options,
  discardedTile,
  visibleTiles = null,
  requireJiangPair = false,
}) {
  const visibleCounts = buildVisibleCounts(visibleTiles ?? []);
  const openMeldCount = player.melds.length;
  const ruleNote = requireJiangPair
    ? '普通胡按 2/5/8 作将计算'
    : '起手无将路线暂不强制 2/5/8 作将';

  const choices = [];

  for (const option of options) {
    switch (option.type) {
      case 'win':
        choices.push(buildWinChoice({ discardedTile, ruleNote }));
        break;

      case 'kong':
        choices.push(buildClaimChoice({
          type: 'kong',
          hand: player.hand,
          openMeldCount,
          discardedTile,
          visibleCounts,
          requireJiangPair,
          ruleNote,
          handTiles: [],   // kong: remove 3 copies of discardedTile
        }));
        break;

      case 'pong':
        choices.push(buildClaimChoice({
          type: 'pong',
          hand: player.hand,
          openMeldCount,
          discardedTile,
          visibleCounts,
          requireJiangPair,
          ruleNote,
          handTiles: [],   // pong: remove 2 copies of discardedTile
        }));
        break;

      case 'chi':
        // option.tiles = the 2 hand tiles (not including discardedTile)
        choices.push(buildClaimChoice({
          type: 'chi',
          hand: player.hand,
          openMeldCount,
          discardedTile,
          visibleCounts,
          requireJiangPair,
          ruleNote,
          handTiles: option.tiles ?? [],
        }));
        break;

      default:
        break;
    }
  }

  // 始终包含 pass 选项
  choices.push(buildPassChoice({
    hand: player.hand,
    openMeldCount,
    visibleCounts,
    discardedTile,
    requireJiangPair,
    ruleNote,
  }));

  // 按分数降序排列，分数相同时按类型字母序稳定排列
  choices.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return typeSortKey(a).localeCompare(typeSortKey(b));
  });

  const id = `operation-${tileKey(discardedTile)}-${choices.map(typeSortKey).join('-')}`;

  return {
    id,
    best: choices[0] ?? null,
    choices,
    ruleNote,
  };
}

// ── Win choice ────────────────────────────────────────────────────────────────

function buildWinChoice({ discardedTile, ruleNote }) {
  return {
    type: 'win',
    tiles: [discardedTile],
    score: 20000,
    shanten: -1,
    ukeireCount: 0,
    discardAfterClaim: null,
    explanation: `能胡就直接胡，这是确定收益。${ruleNote}。`,
  };
}

// ── Claim choices (pong / kong / chi) ────────────────────────────────────────

function buildClaimChoice({
  type,
  hand,
  openMeldCount,
  discardedTile,
  visibleCounts,
  requireJiangPair,
  ruleNote,
  handTiles,   // for chi: the 2 hand tiles; for pong/kong: []
}) {
  const opts = { requireJiangPair };

  // 计算移除手牌中需要的牌
  // - chi: handTiles = 2 张配合牌（手牌中），discard 不在手牌里
  // - pong: 从手牌中移除 2 张 discardedTile
  // - kong: 从手牌中移除 3 张 discardedTile
  let tilesToRemoveFromHand;
  if (type === 'chi') {
    tilesToRemoveFromHand = handTiles;
  } else if (type === 'kong') {
    tilesToRemoveFromHand = repeatedTiles(discardedTile, 3);
  } else {
    // pong
    tilesToRemoveFromHand = repeatedTiles(discardedTile, 2);
  }

  const concealedAfterClaim = sortTiles(removeTiles(hand, tilesToRemoveFromHand));
  const openAfterClaim = openMeldCount + 1;

  const bestDiscard = bestDiscardAfterClaim(concealedAfterClaim, visibleCounts, openAfterClaim, opts);
  const shanten = bestDiscard?.shanten
    ?? shantenWithMelds(concealedAfterClaim, openAfterClaim, opts);
  const ukeireCount = bestDiscard?.ukeireCount
    ?? calcUkeire(concealedAfterClaim, visibleCounts, openAfterClaim, opts).totalCount;
  const score = scoreHand(shanten, ukeireCount) - (EXPOSURE_PENALTY[type] ?? 0);

  // 组合副露展示牌：chi = 2 手牌 + discard；pong = 3 张；kong = 4 张
  let meldTiles;
  if (type === 'chi') {
    meldTiles = sortTiles([...handTiles, discardedTile]);
  } else if (type === 'kong') {
    meldTiles = repeatedTiles(discardedTile, 4);
  } else {
    meldTiles = repeatedTiles(discardedTile, 3);
  }

  return {
    type,
    tiles: meldTiles,
    score,
    shanten,
    ukeireCount,
    discardAfterClaim: bestDiscard?.discard ?? null,
    explanation: buildClaimExplanation({
      type,
      discardedTile,
      shanten,
      ukeireCount,
      discardAfterClaim: bestDiscard?.discard ?? null,
      ruleNote,
    }),
  };
}

// ── Pass choice ───────────────────────────────────────────────────────────────

function buildPassChoice({
  hand,
  openMeldCount,
  visibleCounts,
  discardedTile,
  requireJiangPair,
  ruleNote,
}) {
  const opts = { requireJiangPair };
  const shanten = shantenWithMelds(hand, openMeldCount, opts);
  const ukeire = calcUkeire(hand, visibleCounts, openMeldCount, opts);

  return {
    type: 'pass',
    tiles: [discardedTile],
    score: scoreHand(shanten, ukeire.totalCount) + 20,
    shanten,
    ukeireCount: ukeire.totalCount,
    discardAfterClaim: null,
    explanation: `建议过时，是保留当前手牌结构：现在${formatShanten(shanten)}，共 ${ukeire.totalCount} 张进张。${ruleNote}。`,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bestDiscardAfterClaim(hand, visibleCounts, openMeldCount, opts) {
  const unique = uniqueTiles(hand);
  let best = null;

  for (const discard of unique) {
    let afterDiscard;
    try {
      afterDiscard = removeOneTile(hand, discard);
    } catch {
      continue;
    }
    const shanten = shantenWithMelds(afterDiscard, openMeldCount, opts);
    const ukeire = calcUkeire(afterDiscard, visibleCounts, openMeldCount, opts);
    const score = scoreHand(shanten, ukeire.totalCount);

    if (
      !best
      || score > best.score
      || (score === best.score && tileKey(discard).localeCompare(tileKey(best.discard)) < 0)
    ) {
      best = { discard, score, shanten, ukeireCount: ukeire.totalCount };
    }
  }

  return best;
}

function buildClaimExplanation({
  type,
  discardedTile,
  shanten,
  ukeireCount,
  discardAfterClaim,
  ruleNote,
}) {
  const label = TYPE_LABELS[type];
  const discardText = discardAfterClaim ? `，之后倾向打 ${tileLabel(discardAfterClaim)}` : '';
  const kongText = type === 'kong' ? '杠后会补摸一张，实际结果仍取决于随机牌墙；' : '';

  return `${label}${tileLabel(discardedTile)}后${discardText}，${kongText}${formatShanten(shanten)}，估计 ${ukeireCount} 张进张。${ruleNote}。`;
}

function formatShanten(shanten) {
  if (shanten < 0) return '已经胡牌';
  if (shanten === 0) return '已经听牌';
  return `还差 ${shanten} 向听`;
}

function scoreHand(shanten, ukeireCount) {
  return (8 - shanten) * 1000 + ukeireCount;
}

function repeatedTiles(tile, count) {
  return Array.from({ length: count }, () => tile);
}

function removeTiles(hand, tilesToRemove) {
  return tilesToRemove.reduce(
    (remaining, tile) => removeOneTile(remaining, tile),
    hand,
  );
}

function buildVisibleCounts(tiles) {
  const counts = new Map();
  for (const t of tiles) {
    const key = tileKey(t);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function uniqueTiles(tiles) {
  const seen = new Set();
  const unique = [];
  for (const t of tiles) {
    const key = tileKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(t);
    }
  }
  return unique;
}

function typeSortKey(choice) {
  return `${choice.type}-${choice.tiles?.map(tileKey).join('.') ?? ''}`;
}
