import { createInitialGame } from './core/game-state.js';
import { runHand } from './core/turn-engine.js';
import { recommendDiscards } from './core/recommendation.js';
import { decideAction, decideClaim } from './core/ai.js';
import { canSelfDrawWin, canConcealedKongs, canAddedKongs } from './core/melds.js';
import { recordDecision, summarizeReview } from './core/review.js';
import { renderApp } from './ui/render.js';

const app = document.querySelector('#app');

let game = null;
let reviewRecords = [];
let controller = null;
let pending = null;           // { kind:'action'|'claim', resolve, ... }
let currentRecommendation = null;

const DELAY_MS = 1000;
const delay = () => new Promise((r) => setTimeout(r, DELAY_MS));

function visibleTiles() {
  return game.players.flatMap((player) => player.discards);
}

function recommendCurrentHand() {
  // 已知限制：玩家面板的打牌推荐目前不考虑玩家自己的副露（碰/吃/杠后手牌<13张，
  // 向听/进张按 0 副露估算，可能偏差）。副露感知的建议属于后续范围，见设计文档。
  return recommendDiscards({ hand: game.players[0].hand, visibleTiles: visibleTiles() });
}

function render() {
  const interaction = {};
  if (pending?.kind === 'claim') interaction.claimOptions = pending.options;
  if (pending?.kind === 'action') interaction.selfActions = pending.selfActions;
  renderApp({ game, recommendation: currentRecommendation, reviewSummary: summarizeReview(reviewRecords), interaction });
}

function onUpdate(next) {
  game = next;
  if (game.phase === 'awaiting-discard' && game.currentPlayer === 0) {
    currentRecommendation = recommendCurrentHand();
  }
  render();
}

// 人类 agent
const humanAgent = {
  chooseAction: (g) => new Promise((resolve) => {
    const player = g.players[0];
    const selfActions = [];
    if (canSelfDrawWin(player.hand, player.melds)) selfActions.push({ type: 'self-win' });
    for (const tile of canConcealedKongs(player.hand)) selfActions.push({ type: 'concealed-kong', tile });
    for (const tile of canAddedKongs(player.hand, player.melds)) selfActions.push({ type: 'added-kong', tile });
    pending = { kind: 'action', resolve, selfActions };
    render();
  }),
  chooseClaim: (g, seat, options) => new Promise((resolve) => {
    pending = { kind: 'claim', resolve, options };
    render();
  }),
};

// 电脑 agent
function computerAgent() {
  return {
    chooseAction: async (g, seat) => { const action = decideAction(g, seat); await delay(); return action; },
    chooseClaim: async (g, seat, options) => { const intent = decideClaim(g, seat, options); await delay(); return intent; },
  };
}

const agents = [humanAgent, computerAgent(), computerAgent(), computerAgent()];

function resolvePending(value) {
  const p = pending;
  pending = null;
  p.resolve(value);
}

function startNewHand() {
  if (controller) controller.abort();
  controller = new AbortController();
  game = createInitialGame();
  reviewRecords = [];
  pending = null;
  currentRecommendation = recommendCurrentHand();
  render();
  runHand(game, agents, { delay, onUpdate, signal: controller.signal }).catch(() => {});
}

app.addEventListener('click', (event) => {
  if (event.target.closest('.new-hand-button')) { startNewHand(); return; }

  // 玩家出牌（仅当引擎在等玩家动作时）
  const tileButton = event.target.closest('.player-hand:not(.is-disabled) .tile[data-discard-index]');
  if (tileButton && pending?.kind === 'action') {
    const index = Number(tileButton.dataset.discardIndex);
    const tile = game.players[0].hand[index];
    reviewRecords = recordDecision(reviewRecords, { turn: reviewRecords.length + 1, chosenDiscard: tile, recommendation: currentRecommendation });
    resolvePending({ type: 'discard', tile });
    return;
  }

  const selfActionEl = event.target.closest('[data-self-action-index]');
  if (selfActionEl && pending?.kind === 'action') {
    resolvePending(pending.selfActions[Number(selfActionEl.dataset.selfActionIndex)]);
    return;
  }

  const claimEl = event.target.closest('[data-claim-index]');
  if (claimEl && pending?.kind === 'claim') {
    resolvePending(pending.options[Number(claimEl.dataset.claimIndex)]);
    return;
  }
  if (event.target.closest('[data-claim-pass]') && pending?.kind === 'claim') {
    resolvePending({ type: 'pass' });
  }
});

startNewHand();
