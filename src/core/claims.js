import { canPong, canKongFromDiscard, canChiSequences, canWinOnTile } from './melds.js';

const PRIORITY = { win: 3, kong: 2, pong: 2, chi: 1 };

// 逆时针（下家方向）从 from 到 to 的步数：每步 (s+3)%4
function ccwDistance(from, to) {
  let distance = 0;
  let seat = from;
  while (seat !== to && distance <= 4) {
    seat = (seat + 3) % 4;
    distance += 1;
  }
  return distance;
}

export function claimOptionsFor(seat, player, tile, discarderSeat, { requireJiangPair = false } = {}) {
  const options = [];
  if (canWinOnTile(player.hand, player.melds, tile, { requireJiangPair })) options.push({ type: 'win' });
  if (canKongFromDiscard(player.hand, tile)) options.push({ type: 'kong' });
  if (canPong(player.hand, tile)) options.push({ type: 'pong' });
  if (seat === (discarderSeat + 3) % 4) {
    for (const seq of canChiSequences(player.hand, tile)) {
      options.push({ type: 'chi', tiles: seq });
    }
  }
  return options;
}

export function resolveClaims(intents, discarderSeat) {
  const active = intents.filter((i) => i.claim && i.claim.type !== 'pass');
  let best = null;
  for (const intent of active) {
    if (!best) { best = intent; continue; }
    const p = PRIORITY[intent.claim.type];
    const bp = PRIORITY[best.claim.type];
    if (p > bp) best = intent;
    else if (p === bp
      && ccwDistance(discarderSeat, intent.seat) < ccwDistance(discarderSeat, best.seat)) {
      best = intent;
    }
  }
  return best;
}
