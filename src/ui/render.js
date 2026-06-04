import { tileKey, tileLabel } from '../core/tiles.js';
import { tileFaceSvg } from './tile-face.js';

const app = document.querySelector('#app');

const PLAYER_NAMES = ['玩家', '上家', '对家', '下家'];
const SEAT_CLASS_BY_PLAYER = {
  1: 'left',
  2: 'top',
  3: 'right',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function tileButton(tile, index, { recommended = false, drawn = false } = {}) {
  const label = escapeHtml(tileLabel(tile));
  const classes = ['tile'];
  if (recommended) classes.push('is-recommended');
  if (drawn) classes.push('is-drawn');

  return `
    <button class="${classes.join(' ')}" type="button" data-discard-index="${index}" aria-label="打出${label}">
      ${tileFaceSvg(tile)}
    </button>
  `;
}

function tileBacks(count) {
  return Array.from(
    { length: count },
    () => '<span class="tile-back" aria-hidden="true"></span>',
  ).join('');
}

function miniTiles(tiles) {
  if (tiles.length === 0) {
    return '<span class="discard-empty">无</span>';
  }

  const lastIndex = tiles.length - 1;

  return tiles.map((tile, index) => {
    const classes = index === lastIndex ? 'mini-tile is-last' : 'mini-tile';
    return `<span class="${classes}" aria-label="${escapeHtml(tileLabel(tile))}">${tileFaceSvg(tile)}</span>`;
  }).join('');
}

function opponentSeat(player, playerIndex) {
  const seatClass = SEAT_CLASS_BY_PLAYER[playerIndex];
  const playerName = escapeHtml(PLAYER_NAMES[playerIndex]);

  return `
    <div class="seat ${seatClass}" aria-label="${playerName}">
      <div class="seat-name">${playerName}</div>
      <div class="opponent-tiles">${tileBacks(player.hand.length)}</div>
    </div>
  `;
}

function discardGrid(game) {
  return game.players.map((player, index) => {
    const playerName = escapeHtml(PLAYER_NAMES[index]);

    return `
      <div class="discard-row">
        <div class="discard-name">${playerName}</div>
        <div class="discard-tiles">${miniTiles(player.discards)}</div>
      </div>
    `;
  }).join('');
}

function choiceMeta(choice) {
  if (choice.shanten < 0) return '和牌';
  const progress = choice.shanten === 0 ? '听牌' : `${choice.shanten} 向`;
  return `${progress} · ${choice.ukeireCount} 张`;
}

function choicesList(recommendation) {
  const choices = recommendation?.choices?.slice(0, 3) ?? [];

  if (choices.length === 0) {
    return '<li>暂无备选</li>';
  }

  return choices.map((choice, index) => `
    <li>
      <span class="choice-rank">${index + 1}</span>
      <span class="choice-tile">${tileFaceSvg(choice.discard)}</span>
      <strong class="choice-meta">${escapeHtml(choiceMeta(choice))}</strong>
    </li>
  `).join('');
}

function reviewBlock(reviewSummary) {
  if (!reviewSummary || reviewSummary.totalDecisions === 0) {
    return '<p class="review-empty">本局还没有决策记录。</p>';
  }

  const moments = reviewSummary.keyMoments?.slice(0, 3) ?? [];
  const momentItems = moments.length > 0
    ? moments.map((moment) => `<li>${escapeHtml(moment)}</li>`).join('')
    : '<li>目前没有明显偏离推荐的选择。</li>';

  return `
    <p>已记录 ${escapeHtml(reviewSummary.totalDecisions)} 次决策，跟随推荐 ${escapeHtml(reviewSummary.followedBestCount)} 次。</p>
    <ul class="review-moments">
      ${momentItems}
    </ul>
  `;
}

function findRecommendedIndex(hand, recommendation) {
  const best = recommendation?.best ?? null;
  if (!best) return -1;
  const targetKey = tileKey(best.discard);
  return hand.findIndex((tile) => tileKey(tile) === targetKey);
}

function findDrawnIndex(game) {
  const draw = [...game.history]
    .reverse()
    .find((entry) => entry.type === 'draw' && entry.playerIndex === 0);
  if (!draw) return -1;
  return game.players[0].hand.findIndex((tile) => tileKey(tile) === draw.tileKey);
}

export function renderApp({ game, recommendation, reviewSummary }) {
  const best = recommendation?.best ?? null;
  const bestDiscardFace = best ? tileFaceSvg(best.discard) : '<span class="best-empty">暂无</span>';
  const explanation = best?.explanation ?? '等待可分析的手牌。';

  const hand = game.players[0].hand;
  const recommendedIndex = findRecommendedIndex(hand, recommendation);
  const drawnIndex = findDrawnIndex(game);

  app.innerHTML = `
    <section class="table" aria-label="长沙麻将训练桌">
      ${opponentSeat(game.players[2], 2)}
      ${opponentSeat(game.players[1], 1)}
      ${opponentSeat(game.players[3], 3)}

      <div class="center-area">
        <div class="wall-status">牌墙剩余 <strong>${escapeHtml(game.wall.length)}</strong></div>
        <div class="discard-grid" aria-label="四家弃牌">
          ${discardGrid(game)}
        </div>
      </div>

      <div class="player-hand" aria-label="玩家手牌">
        ${hand.map((tile, index) => tileButton(tile, index, {
          recommended: index === recommendedIndex,
          drawn: index === drawnIndex,
        })).join('')}
      </div>
    </section>

    <aside class="advice-panel" aria-label="盘中提醒">
      <h1>盘中提醒</h1>
      <div class="best-discard">
        <span>推荐打</span>
        <div class="best-discard-face">${bestDiscardFace}</div>
      </div>
      <p class="advice-explanation">${escapeHtml(explanation)}</p>
      <h2>备选前三</h2>
      <ol class="choice-list">
        ${choicesList(recommendation)}
      </ol>
      <h2>复盘</h2>
      <div class="review-summary">
        ${reviewBlock(reviewSummary)}
      </div>
      <button class="new-hand-button" type="button">新开一局</button>
    </aside>
  `;
}
