import { scoreWin } from './scoring.js';

export function createMatch() {
  return { scores: [0, 0, 0, 0], handIndex: 0, dealerSeat: 0 };
}

// 局终结算：胡者做庄，流局连庄；返回新 match（不可变）与 settlement（流局为 null）
export function settleHand(match, game) {
  const result = game.result;
  if (!result || result.type !== 'win') {
    return {
      match: { ...match, scores: [...match.scores], handIndex: match.handIndex + 1 },
      settlement: null,
    };
  }

  const settlement = scoreWin({
    bigPatterns: result.patterns ?? [],
    winType: result.winType,
    winner: result.winner,
    loser: result.loser,
  });
  const scores = match.scores.map((score, seat) => (
    score + (settlement.payments.find((p) => p.seat === seat)?.delta ?? 0)
  ));

  return {
    match: { scores, handIndex: match.handIndex + 1, dealerSeat: result.winner },
    settlement,
  };
}
