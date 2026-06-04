const app = document.querySelector('#app');

const PLAYER_NAMES = ['玩家', '上家', '对家', '下家'];
const SEAT_CLASS_BY_PLAYER = {
  1: 'left',
  2: 'top',
  3: 'right',
};
const SUIT_LABELS = {
  wan: '万',
  tiao: '条',
  tong: '筒',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function tileLabel(tile) {
  if (!tile) {
    return '--';
  }

  return `${tile.rank}${SUIT_LABELS[tile.suit] ?? tile.suit}`;
}

function tileButton(tile, index) {
  const label = escapeHtml(tileLabel(tile));

  return `
    <button class="tile" type="button" data-discard-index="${index}" aria-label="打出${label}">
      ${label}
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
    `<span class="mini-tile">${escapeHtml(tileLabel(tile))}</span>`
  )).join('');
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

function choicesList(recommendation) {
  const choices = recommendation?.choices?.slice(0, 3) ?? [];

  if (choices.length === 0) {
    return '<li>暂无备选</li>';
  }

  return choices.map((choice, index) => `
    <li>
      <span>${index + 1}. ${escapeHtml(tileLabel(choice.discard))}</span>
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

export function renderApp({ game, recommendation, reviewSummary }) {
  const best = recommendation?.best ?? null;
  const bestDiscardLabel = best ? tileLabel(best.discard) : '暂无';
  const explanation = best?.explanation ?? '等待可分析的手牌。';

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
        ${game.players[0].hand.map(tileButton).join('')}
      </div>
    </section>

    <aside class="advice-panel" aria-label="盘中提醒">
      <h1>盘中提醒</h1>
      <div class="best-discard">
        <span>推荐打</span>
        <strong>${escapeHtml(bestDiscardLabel)}</strong>
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
