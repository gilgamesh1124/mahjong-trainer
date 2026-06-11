import { sortTiles } from './tiles.js';

const SUIT_BY_IDX = ['tong', 'wan', 'tiao'];
const SUIT_IDX = { tong: 0, wan: 1, tiao: 2 };

function idxToTile(index) {
  return { suit: SUIT_BY_IDX[Math.floor(index / 9)], rank: (index % 9) + 1 };
}

function isJiangIndex(index) {
  const rank = (index % 9) + 1;
  return rank === 2 || rank === 5 || rank === 8;
}

function tilesToCounts27(tiles) {
  const counts = new Array(27).fill(0);
  for (const tile of tiles) counts[SUIT_IDX[tile.suit] * 9 + (tile.rank - 1)] += 1;
  return counts;
}

// 搭子等张：对倒→同张成刻；连张→两面（边界裁剪成边张）；跳张→嵌张
export function taatsuWaits([a, b]) {
  if (a.rank === b.rank) return [{ suit: a.suit, rank: a.rank }];
  if (b.rank - a.rank === 1) {
    const waits = [];
    if (a.rank - 1 >= 1) waits.push({ suit: a.suit, rank: a.rank - 1 });
    if (b.rank + 1 <= 9) waits.push({ suit: a.suit, rank: b.rank + 1 });
    return waits;
  }
  return [{ suit: a.suit, rank: a.rank + 1 }];
}

// 与 rules.js 的 shanten 公式严格一致：8 - 2*mentsu - min(taatsu, 4-mentsu) - (有将 ? 1 : 0)
function shantenValue(setCount, taatsuCount, hasPair, meldCount) {
  const mentsu = meldCount + setCount;
  return 8 - 2 * mentsu - Math.min(taatsuCount, 4 - mentsu) - (hasPair ? 1 : 0);
}

// 回溯枚举：刻子→顺子→对塔→两面/边张→嵌张→跳过(孤张)。
// 分支顺序固定 + 严格小于才更新 best ⇒ 输出确定。
function searchGroups(counts, idx, state, best) {
  while (idx < 27 && counts[idx] === 0) idx += 1;

  if (idx === 27) {
    const value = shantenValue(state.sets.length, state.taatsu.length, state.hasPair, state.meldCount);
    if (value < best.value) {
      best.value = value;
      best.result = {
        sets: state.sets.map((s) => ({ type: s.type, tiles: [...s.tiles] })),
        taatsu: state.taatsu.map((g) => ({ tiles: [...g.tiles] })),
        floaters: [...state.floaters],
      };
    }
    return;
  }

  const rank = idx % 9;
  const tile = idxToTile(idx);

  if (counts[idx] >= 3) {
    counts[idx] -= 3;
    state.sets.push({ type: 'triplet', tiles: [tile, tile, tile] });
    searchGroups(counts, idx, state, best);
    state.sets.pop();
    counts[idx] += 3;
  }

  if (rank <= 6 && counts[idx + 1] >= 1 && counts[idx + 2] >= 1) {
    counts[idx] -= 1; counts[idx + 1] -= 1; counts[idx + 2] -= 1;
    state.sets.push({ type: 'run', tiles: [tile, idxToTile(idx + 1), idxToTile(idx + 2)] });
    searchGroups(counts, idx, state, best);
    state.sets.pop();
    counts[idx] += 1; counts[idx + 1] += 1; counts[idx + 2] += 1;
  }

  if (counts[idx] >= 2) {
    counts[idx] -= 2;
    state.taatsu.push({ tiles: [tile, tile] });
    searchGroups(counts, idx, state, best);
    state.taatsu.pop();
    counts[idx] += 2;
  }

  if (rank <= 7 && counts[idx + 1] >= 1) {
    counts[idx] -= 1; counts[idx + 1] -= 1;
    state.taatsu.push({ tiles: [tile, idxToTile(idx + 1)] });
    searchGroups(counts, idx, state, best);
    state.taatsu.pop();
    counts[idx] += 1; counts[idx + 1] += 1;
  }

  if (rank <= 6 && counts[idx + 2] >= 1) {
    counts[idx] -= 1; counts[idx + 2] -= 1;
    state.taatsu.push({ tiles: [tile, idxToTile(idx + 2)] });
    searchGroups(counts, idx, state, best);
    state.taatsu.pop();
    counts[idx] += 1; counts[idx + 2] += 1;
  }

  const c = counts[idx];
  counts[idx] = 0;
  for (let i = 0; i < c; i += 1) state.floaters.push(tile);
  searchGroups(counts, idx + 1, state, best);
  for (let i = 0; i < c; i += 1) state.floaters.pop();
  counts[idx] = c;
}

function runSearch(counts, hasPair, meldCount) {
  const best = { value: Infinity, result: null };
  searchGroups(counts, 0, { sets: [], taatsu: [], floaters: [], hasPair, meldCount }, best);
  return best;
}

// 最优手牌分解。契约：concealed 为暗手牌；shanten 与 shantenWithMelds(concealed, meldCount, opts) 一致。
export function decomposeHand(concealed, meldCount = 0, { requireJiangPair = false } = {}) {
  const counts = tilesToCounts27(concealed);
  let best = { value: Infinity, result: null };
  let bestPair = null;

  for (let i = 0; i < 27; i += 1) {
    if (counts[i] < 2) continue;
    if (requireJiangPair && !isJiangIndex(i)) continue;
    counts[i] -= 2;
    const sub = runSearch(counts, true, meldCount);
    counts[i] += 2;
    if (sub.result && sub.value < best.value) {
      best = sub;
      bestPair = [idxToTile(i), idxToTile(i)];
    }
  }

  const noPair = runSearch(counts, false, meldCount);
  if (noPair.result && noPair.value < best.value) {
    best = noPair;
    bestPair = null;
  }

  return {
    shanten: best.value,
    sets: best.result.sets,
    pair: bestPair,
    taatsu: best.result.taatsu.map((g) => ({ tiles: g.tiles, waits: taatsuWaits(g.tiles) })),
    floaters: sortTiles(best.result.floaters),
  };
}
