import { calcUkeire, shantenNumber } from './rules.js';
import { removeOneTile, sortTiles, tileKey, tileLabel } from './tiles.js';

const ACTION_LABELS = {
  hu: '胡',
  gang: '杠',
  peng: '碰',
  chi: '吃',
  pass: '过',
};

const EXPOSURE_PENALTY = {
  chi: 35,
  peng: 35,
  gang: 10,
};

export function recommendOperation({ game, playerIndex, visibleTiles = null }) {
  const response = game.pendingAction?.responses.find(
    (candidate) => candidate.playerIndex === playerIndex,
  );

  if (!response) {
    return null;
  }

  const player = game.players[playerIndex];
  const discardedTile = game.pendingAction.tile;
  const visibleCounts = buildVisibleCounts(visibleTiles ?? visibleTilesFromGame(game));
  const openMeldCount = player.melds.length;
  const choices = [];

  if (response.actions.includes('hu')) {
    choices.push({
      action: 'hu',
      tiles: [discardedTile],
      score: 20000,
      shanten: -1,
      ukeireCount: 0,
      explanation: `能胡就直接胡，这是确定收益，优先级高于吃碰杠。`,
    });
  }

  if (response.actions.includes('gang')) {
    choices.push(buildClaimChoice({
      action: 'gang',
      hand: player.hand,
      openMeldCount,
      discardedTile,
      visibleCounts,
    }));
  }

  if (response.actions.includes('peng')) {
    choices.push(buildClaimChoice({
      action: 'peng',
      hand: player.hand,
      openMeldCount,
      discardedTile,
      visibleCounts,
    }));
  }

  if (response.actions.includes('chi')) {
    for (const option of response.chiOptions) {
      choices.push(buildClaimChoice({
        action: 'chi',
        hand: player.hand,
        openMeldCount,
        discardedTile,
        visibleCounts,
        tiles: option,
      }));
    }
  }

  choices.push(buildPassChoice({
    hand: player.hand,
    openMeldCount,
    visibleCounts,
    discardedTile,
  }));

  choices.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return actionSortKey(a).localeCompare(actionSortKey(b));
  });

  return {
    id: `operation-${game.pendingAction.tileKey}-${choices.map(actionSortKey).join('-')}`,
    best: choices[0] ?? null,
    choices,
  };
}

function buildClaimChoice({
  action,
  hand,
  openMeldCount,
  discardedTile,
  visibleCounts,
  tiles = [],
}) {
  const tilesToRemove = tiles.length > 0
    ? tiles.filter((tile) => tileKey(tile) !== tileKey(discardedTile))
    : repeatedTiles(discardedTile, action === 'gang' ? 3 : 2);
  const concealedAfterClaim = sortTiles(removeTiles(hand, tilesToRemove));
  const openAfterClaim = openMeldCount + 1;
  const bestDiscard = bestDiscardAfterClaim(concealedAfterClaim, visibleCounts, openAfterClaim);
  const shanten = bestDiscard?.shanten ?? shantenNumber(concealedAfterClaim, openAfterClaim);
  const ukeireCount = bestDiscard?.ukeireCount ?? calcUkeire(
    concealedAfterClaim,
    visibleCounts,
    openAfterClaim,
  ).totalCount;
  const score = scoreHand(shanten, ukeireCount) - (EXPOSURE_PENALTY[action] ?? 0);

  return {
    action,
    tiles: tiles.length > 0 ? tiles : repeatedTiles(discardedTile, action === 'gang' ? 4 : 3),
    discardAfterClaim: bestDiscard?.discard ?? null,
    score,
    shanten,
    ukeireCount,
    explanation: buildClaimExplanation({
      action,
      discardedTile,
      shanten,
      ukeireCount,
      discardAfterClaim: bestDiscard?.discard ?? null,
    }),
  };
}

function buildPassChoice({ hand, openMeldCount, visibleCounts, discardedTile }) {
  const shanten = shantenNumber(hand, openMeldCount);
  const ukeire = calcUkeire(hand, visibleCounts, openMeldCount);

  return {
    action: 'pass',
    tiles: [discardedTile],
    score: scoreHand(shanten, ukeire.totalCount) + 20,
    shanten,
    ukeireCount: ukeire.totalCount,
    explanation: `建议过时，是保留当前手牌结构：现在 ${formatShanten(shanten)}，共有 ${ukeire.totalCount} 张进张。`,
  };
}

function bestDiscardAfterClaim(hand, visibleCounts, openMeldCount) {
  const uniqueDiscards = uniqueTiles(hand);
  let best = null;

  for (const discard of uniqueDiscards) {
    const afterDiscard = removeOneTile(hand, discard);
    const shanten = shantenNumber(afterDiscard, openMeldCount);
    const ukeire = calcUkeire(afterDiscard, visibleCounts, openMeldCount);
    const score = scoreHand(shanten, ukeire.totalCount);

    if (
      !best
      || score > best.score
      || (score === best.score && tileKey(discard).localeCompare(tileKey(best.discard)) < 0)
    ) {
      best = {
        discard,
        score,
        shanten,
        ukeireCount: ukeire.totalCount,
      };
    }
  }

  return best;
}

function buildClaimExplanation({
  action,
  discardedTile,
  shanten,
  ukeireCount,
  discardAfterClaim,
}) {
  const label = ACTION_LABELS[action];
  const discardText = discardAfterClaim ? `，之后倾向打 ${tileLabel(discardAfterClaim)}` : '';
  const gangText = action === 'gang' ? '杠后会补摸一张，实际结果仍取决于牌墙随机顺序；' : '';

  return `${label}${tileLabel(discardedTile)}后${discardText}，${gangText}${formatShanten(shanten)}，估计 ${ukeireCount} 张进张。`;
}

function formatShanten(shanten) {
  if (shanten < 0) return '已经和牌';
  if (shanten === 0) return '已经听牌';
  return `还差 ${shanten} 向`;
}

function scoreHand(shanten, ukeireCount) {
  return (8 - shanten) * 1000 + ukeireCount;
}

function repeatedTiles(tile, count) {
  return Array.from({ length: count }, () => tile);
}

function removeTiles(hand, tilesToRemove) {
  return tilesToRemove.reduce(
    (remainingHand, tile) => removeOneTile(remainingHand, tile),
    hand,
  );
}

function buildVisibleCounts(tiles) {
  const counts = new Map();

  for (const tile of tiles) {
    const key = tileKey(tile);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function visibleTilesFromGame(game) {
  return game.players.flatMap((player) => [
    ...player.discards,
    ...player.melds.flatMap((meld) => meld.tiles),
  ]);
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

function actionSortKey(choice) {
  return `${choice.action}-${choice.tiles?.map(tileKey).join('.') ?? ''}`;
}
