import { createInitialGame, discardTile, drawTile } from './core/game-state.js';
import { recommendDiscards } from './core/recommendation.js';
import { recordDecision, summarizeReview } from './core/review.js';
import { renderApp } from './ui/render.js';

const app = document.querySelector('#app');

let game = createInitialGame();
let reviewRecords = [];
let currentRecommendation = recommendCurrentHand();

function visibleTiles() {
  return game.players.flatMap((player) => player.discards);
}

function recommendCurrentHand() {
  return recommendDiscards({
    hand: game.players[0].hand,
    visibleTiles: visibleTiles(),
  });
}

function render() {
  renderApp({
    game,
    recommendation: currentRecommendation,
    reviewSummary: summarizeReview(reviewRecords),
  });
}

function drawIfPossible(playerIndex) {
  if (game.wall.length === 0) {
    return false;
  }

  game = drawTile(game, playerIndex);
  return true;
}

function discardFirstTile(playerIndex) {
  const [tile] = game.players[playerIndex].hand;

  if (!tile) {
    return;
  }

  game = discardTile(game, playerIndex, tile);
}

function playComputerTurns() {
  for (const playerIndex of [1, 2, 3]) {
    if (!drawIfPossible(playerIndex)) {
      return;
    }

    discardFirstTile(playerIndex);
  }
}

function handlePlayerDiscard(discardIndex) {
  const chosenDiscard = game.players[0].hand[discardIndex];

  if (!chosenDiscard) {
    return;
  }

  reviewRecords = recordDecision(reviewRecords, {
    turn: reviewRecords.length + 1,
    chosenDiscard,
    recommendation: currentRecommendation,
  });

  game = discardTile(game, 0, chosenDiscard, {
    recommendationId: currentRecommendation.id,
  });

  playComputerTurns();
  drawIfPossible(0);

  currentRecommendation = recommendCurrentHand();
  render();
}

function startNewHand() {
  game = createInitialGame();
  reviewRecords = [];
  currentRecommendation = recommendCurrentHand();
  render();
}

app.addEventListener('click', (event) => {
  const tileButton = event.target.closest('.tile[data-discard-index]');

  if (tileButton) {
    handlePlayerDiscard(Number(tileButton.dataset.discardIndex));
    return;
  }

  if (event.target.closest('.new-hand-button')) {
    startNewHand();
  }
});

render();
