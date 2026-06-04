import { tileGlyph, tileLabel } from '../core/tiles.js';

const app = document.querySelector('#app');

const PLAYER_NAMES = ['玩家', '上家', '对家', '下家'];
const ACTION_LABELS = {
  hu: '胡',
  gang: '杠',
  peng: '碰',
  chi: '吃',
  pass: '过',
};
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

function tileButton(tile, index, canDiscard) {
  const glyph = tileGlyph(tile);
  const label = escapeHtml(tileLabel(tile));
  const disabled = canDiscard ? '' : ' disabled';

  return `
    <button class="tile" type="button" data-discard-index="${index}" aria-label="打出${label}"${disabled}>
      ${glyph}
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

  return tiles.map((tile) => (
    `<span class="mini-tile" aria-label="${escapeHtml(tileLabel(tile))}">${tileGlyph(tile)}</span>`
  )).join('');
}

function meldsBlock(player) {
  if (!player.melds || player.melds.length === 0) {
    return '';
  }

  return `
    <div class="melds">
      ${player.melds.map((meld) => `
        <span class="meld">
          <b>${escapeHtml(ACTION_LABELS[meld.type] ?? meld.type)}</b>
          ${miniTiles(meld.tiles)}
        </span>
      `).join('')}
    </div>
  `;
}

function opponentSeat(player, playerIndex) {
  const seatClass = SEAT_CLASS_BY_PLAYER[playerIndex];
  const playerName = escapeHtml(PLAYER_NAMES[playerIndex]);

  return `
    <div class="seat ${seatClass}" aria-label="${playerName}">
      <div class="seat-name">${playerName}</div>
      <div class="opponent-tiles">${tileBacks(player.hand.length)}</div>
      ${meldsBlock(player)}
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

function choicesList(recommendation) {
  const choices = recommendation?.choices?.slice(0, 3) ?? [];

  if (choices.length === 0) {
    return '<li>当前手牌暂不分析</li>';
  }

  return choices.map((choice, index) => `
    <li>
      <span>${index + 1}. ${tileGlyph(choice.discard)}</span>
      <strong>${escapeHtml(choice.score)}</strong>
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

function resultText(result) {
  if (!result) {
    return '';
  }

  if (result.type === 'draw') {
    return '牌墙摸完，本局流局。';
  }

  const winner = PLAYER_NAMES[result.winnerIndex] ?? `玩家${result.winnerIndex}`;

  if (result.type === 'zimo') {
    return `${winner} 自摸胡牌。`;
  }

  const fromPlayer = PLAYER_NAMES[result.fromPlayerIndex] ?? `玩家${result.fromPlayerIndex}`;
  return `${winner} 胡 ${fromPlayer} 打出的牌。`;
}

function statusText(game) {
  if (game.phase === 'ended') {
    return resultText(game.result);
  }

  if (game.phase === 'awaiting-claim') {
    const tile = game.pendingAction?.tile ? tileGlyph(game.pendingAction.tile) : '';
    return `等待响应 ${tile}`;
  }

  if (game.currentPlayer === 0 && game.phase === 'awaiting-discard') {
    return '轮到你出牌';
  }

  return `轮到${PLAYER_NAMES[game.currentPlayer]}行动`;
}

function playerResponse(game) {
  return game.pendingAction?.responses.find((response) => response.playerIndex === 0) ?? null;
}

function operationPanel(game, selfWinAvailable) {
  const response = playerResponse(game);
  const buttons = [];

  if (selfWinAvailable) {
    buttons.push('<button class="action-button primary" type="button" data-action="self-hu">自摸胡</button>');
  }

  if (response?.actions.includes('hu')) {
    buttons.push('<button class="action-button primary" type="button" data-action="hu">胡</button>');
  }

  if (response?.actions.includes('gang')) {
    buttons.push('<button class="action-button" type="button" data-action="gang">杠</button>');
  }

  if (response?.actions.includes('peng')) {
    buttons.push('<button class="action-button" type="button" data-action="peng">碰</button>');
  }

  if (response?.actions.includes('chi')) {
    response.chiOptions.forEach((option, index) => {
      buttons.push(`
        <button class="action-button" type="button" data-action="chi" data-chi-index="${index}">
          吃 ${miniTiles(option)}
        </button>
      `);
    });
  }

  if (response) {
    buttons.push('<button class="action-button muted" type="button" data-action="pass">过</button>');
  }

  if (buttons.length === 0) {
    return '';
  }

  return `
    <section class="operation-panel" aria-label="可操作">
      <h2>可操作</h2>
      <div class="operation-buttons">
        ${buttons.join('')}
      </div>
    </section>
  `;
}

export function renderApp({ game, recommendation, reviewSummary, selfWinAvailable = false }) {
  const best = recommendation?.best ?? null;
  const bestDiscardLabel = best ? tileGlyph(best.discard) : '暂无';
  const explanation = best?.explanation ?? '当前不是标准摸牌后的 14 张手牌，先完成吃碰杠胡或出牌操作。';
  const canDiscard = game.phase === 'awaiting-discard' && game.currentPlayer === 0;

  app.innerHTML = `
    <section class="table" aria-label="长沙麻将训练桌">
      ${opponentSeat(game.players[2], 2)}
      ${opponentSeat(game.players[1], 1)}
      ${opponentSeat(game.players[3], 3)}

      <div class="center-area">
        <div class="wall-status">牌墙剩余 <strong>${escapeHtml(game.wall.length)}</strong></div>
        <div class="round-status">${escapeHtml(statusText(game))}</div>
        <div class="discard-grid" aria-label="四家弃牌">
          ${discardGrid(game)}
        </div>
      </div>

      <div class="player-hand" aria-label="玩家手牌">
        ${game.players[0].hand.map((tile, index) => tileButton(tile, index, canDiscard)).join('')}
      </div>
      ${meldsBlock(game.players[0])}
    </section>

    <aside class="advice-panel" aria-label="盘中提醒">
      <h1>盘中提醒</h1>
      ${operationPanel(game, selfWinAvailable)}
      <div class="best-discard">
        <span>推荐打</span>
        <strong>${bestDiscardLabel}</strong>
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
