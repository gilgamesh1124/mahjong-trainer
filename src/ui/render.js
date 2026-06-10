import { tileKey, tileLabel } from '../core/tiles.js';
import { tileFaceSvg } from './tile-face.js';
import { claimControls, selfActionControls, meldsStrip, resultBanner, actionFlash, operationReviewBlock } from './overlays.js';

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

function opponentSeat(player, playerIndex, activeSeat) {
  const seatClass = SEAT_CLASS_BY_PLAYER[playerIndex];
  const playerName = escapeHtml(PLAYER_NAMES[playerIndex]);
  const active = playerIndex === activeSeat ? ' is-active' : '';
  return `
    <div class="seat ${seatClass}${active}" aria-label="${playerName}">
      <div class="seat-name">${playerName}</div>
      <div class="opponent-tiles">${tileBacks(player.hand.length)}</div>
      ${meldsStrip(player.melds)}
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

// 听牌提醒：当推荐打法达到听牌(shanten 0)时，列出能胡的牌（即听哪些张）
function waitBlock(recommendation, isPlayerDiscardTurn) {
  const best = recommendation?.best ?? null;
  if (!isPlayerDiscardTurn || !best || best.shanten !== 0) return '';
  const tiles = best.usefulTiles ?? [];
  if (tiles.length === 0) return '';

  const total = tiles.reduce((sum, u) => sum + u.remaining, 0);
  const faces = tiles.map((u) => `
    <span class="wait-tile" aria-label="${escapeHtml(tileLabel(u.tile))}（剩 ${escapeHtml(u.remaining)} 张）">
      ${tileFaceSvg(u.tile)}<em>${escapeHtml(u.remaining)}</em>
    </span>`).join('');

  return `
    <div class="wait-block">
      <span class="wait-label">打 ${escapeHtml(tileLabel(best.discard))} 后听</span>
      <div class="wait-tiles">${faces}</div>
      <span class="wait-total">共 ${escapeHtml(total)} 张</span>
    </div>
  `;
}

function findRecommendedIndex(hand, recommendation) {
  const best = recommendation?.best ?? null;
  if (!best) return -1;
  const targetKey = tileKey(best.discard);
  return hand.findIndex((tile) => tileKey(tile) === targetKey);
}

function findDrawnIndex(game) {
  const draw = game.lastDraw;
  if (!draw || draw.seat !== 0) return -1;
  return game.players[0].hand.findIndex((tile) => tileKey(tile) === tileKey(draw.tile));
}

// 第 N 局：终局时显示刚结束的一局（settle 已使 handIndex 指向下一局）
function scoreboard(match, phase) {
  if (!match) return '';
  const handNo = phase === 'hand-over' ? match.handIndex : match.handIndex + 1;
  const cells = PLAYER_NAMES.map((name, seat) => `
    <span class="score-cell${seat === match.dealerSeat ? ' is-dealer' : ''}">
      <b>${escapeHtml(name)}</b>${seat === match.dealerSeat ? '<i class="dealer-badge">庄</i>' : ''}
      <em>${escapeHtml(match.scores[seat])}</em>
    </span>`).join('');
  return `<div class="scoreboard"><span class="hand-no">第 ${escapeHtml(handNo)} 局</span>${cells}</div>`;
}

export function renderApp({ game, recommendation, reviewSummary, operationReviewSummary, interaction = {}, adviceCollapsed = false, match, settlement }) {
  const best = recommendation?.best ?? null;
  const bestDiscardFace = best ? tileFaceSvg(best.discard) : '<span class="best-empty">暂无</span>';
  const explanation = best?.explanation ?? '等待可分析的手牌。';

  const hand = game.players[0].hand;
  const isPlayerDiscardTurn = game.phase === 'awaiting-discard' && game.currentPlayer === 0;
  const recommendedIndex = isPlayerDiscardTurn ? findRecommendedIndex(hand, recommendation) : -1;
  const drawnIndex = findDrawnIndex(game);
  const activeSeat = game.phase === 'hand-over' ? -1 : game.currentPlayer;

  const handDisabled = isPlayerDiscardTurn ? '' : ' is-disabled';

  const initialNoJiang = game.players[0].flags?.initialNoJiang;
  const noJiangPrompt = (initialNoJiang && game.phase !== 'hand-over')
    ? '<div class="no-jiang-prompt">起手无将路线：本局不强制 2/5/8 作将</div>'
    : '';

  app.className = adviceCollapsed ? 'app-shell advice-collapsed' : 'app-shell';

  app.innerHTML = `
    <section class="table" aria-label="长沙麻将训练桌">
      ${actionFlash(game)}
      ${opponentSeat(game.players[2], 2, activeSeat)}
      ${opponentSeat(game.players[1], 1, activeSeat)}
      ${opponentSeat(game.players[3], 3, activeSeat)}

      <div class="center-area">
        ${scoreboard(match, game.phase)}
        <div class="wall-status">牌墙剩余 <strong>${escapeHtml(game.wall.length)}</strong></div>
        <div class="discard-grid" aria-label="四家弃牌">
          ${discardGrid(game)}
        </div>
      </div>

      <div class="player-zone${activeSeat === 0 ? ' is-active' : ''}">
        ${meldsStrip(game.players[0].melds)}
        ${selfActionControls(interaction.selfActions)}
        ${claimControls(interaction.claimOptions, interaction.operationAdvice)}
        <div class="player-hand${handDisabled}" aria-label="玩家手牌">
          ${hand.map((tile, index) => tileButton(tile, index, {
            recommended: index === recommendedIndex,
            drawn: index === drawnIndex,
          })).join('')}
        </div>
      </div>
    </section>

    <aside class="advice-panel${adviceCollapsed ? ' is-collapsed' : ''}" aria-label="盘中提醒">
      <button class="advice-collapse-toggle" type="button" aria-label="${adviceCollapsed ? '展开盘中提醒' : '收起盘中提醒'}">${adviceCollapsed ? '‹ 提醒' : '收起 ›'}</button>
      <div class="advice-body">
        <h1>盘中提醒</h1>
        ${noJiangPrompt}
        <div class="best-discard">
          <span>推荐打</span>
          <div class="best-discard-face">${bestDiscardFace}</div>
        </div>
        <p class="advice-explanation">${escapeHtml(isPlayerDiscardTurn ? explanation : statusText(game))}</p>
        ${waitBlock(recommendation, isPlayerDiscardTurn)}
        <h2>备选前三</h2>
        <ol class="choice-list">${choicesList(recommendation)}</ol>
        <h2>出牌复盘</h2>
        <div class="review-summary">${reviewBlock(reviewSummary)}</div>
        <h2>吃碰杠胡复盘</h2>
        <div class="review-summary">${operationReviewBlock(operationReviewSummary)}</div>
        <button class="next-hand-button" type="button">下一局</button>
        <button class="reset-match-button" type="button">重新开桌</button>
      </div>
    </aside>

    ${resultBanner(game, PLAYER_NAMES, settlement)}
  `;
}

function statusText(game) {
  if (game.phase === 'hand-over') return '本局结束。';
  return `轮到 ${PLAYER_NAMES[game.currentPlayer]}…`;
}
