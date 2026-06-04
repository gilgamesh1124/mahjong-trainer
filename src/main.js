import {
  claimDiscard,
  createInitialGame,
  declareSelfWin,
  discardTile,
  drawTile,
  passClaim,
} from './core/game-state.js';
import { recommendDiscards } from './core/recommendation.js';
import { recordDecision, summarizeReview } from './core/review.js';
import { isWinningHand } from './core/rules.js';
import { renderApp } from './ui/render.js';

const app = document.querySelector('#app');

let game = createInitialGame();
let reviewRecords = [];
let currentRecommendation = recommendCurrentHand();

function visibleTiles() {
  return game.players.flatMap((player) => [
    ...player.discards,
    ...player.melds.flatMap((meld) => meld.tiles),
  ]);
}

function recommendCurrentHand() {
  if (
    game.phase === 'ended'
    || game.currentPlayer !== 0
    || game.phase !== 'awaiting-discard'
    || game.players[0].hand.length % 3 !== 2
  ) {
    return null;
  }

  return recommendDiscards({
    hand: game.players[0].hand,
    visibleTiles: visibleTiles(),
  });
}

function refreshRecommendation() {
  currentRecommendation = recommendCurrentHand();
}

function canPlayerSelfWin() {
  return (
    game.phase === 'awaiting-discard'
    && game.currentPlayer === 0
    && isWinningHand(game.players[0].hand)
  );
}

function render() {
  renderApp({
    game,
    recommendation: currentRecommendation,
    reviewSummary: summarizeReview(reviewRecords),
    selfWinAvailable: canPlayerSelfWin(),
  });
}

function drawIfPossible(playerIndex) {
  if (game.wall.length === 0) {
    game = {
      ...game,
      phase: 'ended',
      result: {
        type: 'draw',
        winnerIndex: null,
        fromPlayerIndex: null,
        tileKey: null,
      },
    };
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

function chooseComputerAction(response) {
  for (const action of ['hu', 'gang', 'peng', 'chi']) {
    if (response.actions.includes(action)) {
      return {
        action,
        tiles: action === 'chi' ? response.chiOptions[0] : [],
      };
    }
  }

  return null;
}

function resolveComputerClaims() {
  let guard = 0;

  while (game.phase === 'awaiting-claim' && guard < 100) {
    guard += 1;

    const [response] = game.pendingAction.responses;

    if (!response || response.playerIndex === 0) {
      return;
    }

    const choice = chooseComputerAction(response);

    if (!choice) {
      game = passClaim(game, response.playerIndex);
      continue;
    }

    game = claimDiscard(game, response.playerIndex, choice.action, choice.tiles);

    if (game.phase === 'ended') {
      return;
    }

    if (choice.action === 'gang') {
      drawIfPossible(response.playerIndex);

      if (game.phase === 'ended') {
        return;
      }
    }

    discardFirstTile(response.playerIndex);
  }
}

function continueUntilPlayerDecision() {
  let guard = 0;

  while (game.phase !== 'ended' && guard < 200) {
    guard += 1;

    if (game.phase === 'awaiting-claim') {
      resolveComputerClaims();

      if (
        game.phase === 'awaiting-claim'
        && game.pendingAction.responses[0]?.playerIndex === 0
      ) {
        break;
      }

      continue;
    }

    if (game.phase === 'awaiting-discard') {
      if (game.currentPlayer === 0) {
        break;
      }

      discardFirstTile(game.currentPlayer);
      continue;
    }

    if (game.phase === 'awaiting-draw') {
      const playerIndex = game.currentPlayer;

      if (!drawIfPossible(playerIndex)) {
        break;
      }

      if (isWinningHand(game.players[playerIndex].hand)) {
        if (playerIndex === 0) {
          break;
        }

        game = declareSelfWin(game, playerIndex);
        break;
      }

      continue;
    }

    break;
  }

  refreshRecommendation();
}

function handleClaim(action, chiIndex = 0) {
  const response = game.pendingAction?.responses.find(
    (candidate) => candidate.playerIndex === 0,
  );

  if (!response || !response.actions.includes(action)) {
    return;
  }

  const tiles = action === 'chi' ? response.chiOptions[chiIndex] : [];

  game = claimDiscard(game, 0, action, tiles);

  if (action === 'gang' && game.phase !== 'ended') {
    drawIfPossible(0);
  }

  refreshRecommendation();
  render();
}

function handlePass() {
  game = passClaim(game, 0);
  continueUntilPlayerDecision();
  render();
}

function handleSelfWin() {
  if (!canPlayerSelfWin()) {
    return;
  }

  game = declareSelfWin(game, 0);
  refreshRecommendation();
  render();
}

function handlePlayerDiscard(discardIndex) {
  if (game.phase !== 'awaiting-discard' || game.currentPlayer !== 0) {
    return;
  }

  const chosenDiscard = game.players[0].hand[discardIndex];

  if (!chosenDiscard) {
    return;
  }

  if (currentRecommendation) {
    reviewRecords = recordDecision(reviewRecords, {
      turn: reviewRecords.length + 1,
      chosenDiscard,
      recommendation: currentRecommendation,
    });
  }

  game = discardTile(game, 0, chosenDiscard, {
    recommendationId: currentRecommendation?.id,
  });

  continueUntilPlayerDecision();
  render();
}

function startNewHand() {
  game = createInitialGame();
  reviewRecords = [];
  refreshRecommendation();
  render();
}

app.addEventListener('click', (event) => {
  const tileButton = event.target.closest('.tile[data-discard-index]');

  if (tileButton) {
    handlePlayerDiscard(Number(tileButton.dataset.discardIndex));
    return;
  }

  const actionButton = event.target.closest('[data-action]');

  if (actionButton) {
    const action = actionButton.dataset.action;

    if (action === 'pass') {
      handlePass();
      return;
    }

    if (action === 'self-hu') {
      handleSelfWin();
      return;
    }

    handleClaim(action, Number(actionButton.dataset.chiIndex ?? 0));
    return;
  }

  if (event.target.closest('.new-hand-button')) {
    startNewHand();
  }
});

render();
