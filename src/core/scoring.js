const BIG_BASE = 6;
const SMALL_BASE = 1;
const SEATS = [0, 1, 2, 3];

// 经典长沙：小胡 1 分；大胡 6 × 2^(n-1)。点炮/抢杠放炮者单付；自摸三家各付。
export function scoreWin({ bigPatterns = [], winType, winner, loser = null }) {
  const isBig = bigPatterns.length > 0;
  const multiplier = isBig ? 2 ** (bigPatterns.length - 1) : 1;
  const base = isBig ? BIG_BASE : SMALL_BASE;
  const total = base * multiplier;

  const payments = SEATS.map((seat) => {
    if (winType === 'self-draw') {
      return { seat, delta: seat === winner ? total * 3 : -total };
    }
    if (seat === winner) return { seat, delta: total };
    return { seat, delta: seat === loser ? -total : 0 };
  });

  return { category: isBig ? '大胡' : '小胡', base, multiplier, total, payments };
}
