// Decisions for a seat nobody is driving — a player who dropped, or one who ran
// out of time. The aim is to keep a match moving without playing well enough to
// distort it: never donate points, never bid aggressively.

const SUITS = ['S', 'H', 'D', 'C'];

// Same table as Card.getPointValue, but usable from a bare card id like "10H".
export function pointsForCardId(cardId) {
  const rank = cardId.slice(0, -1);
  const suit = cardId.slice(-1);
  if (rank === '3' && suit === 'S') return 30;
  if (rank === 'A') return 20;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 15;
  if (rank === '10') return 5;
  return 0;
}

// Opens at a floor bid when nobody has bid yet, otherwise passes. Bidding ends
// with no winner if everyone passes, which would leave nobody able to pick
// trump, so a bot always makes sure a contract exists.
export function chooseBid(highestBid, { openingBid = 50 } = {}) {
  if (highestBid > 0) return 'pass';
  return openingBid;
}

// Whichever suit the bot is longest in, so it holds some control of the trumps.
export function chooseTrump(hand) {
  let best = SUITS[0];
  let bestCount = -1;

  for (const suit of SUITS) {
    const count = hand.filter(card => card.suit === suit).length;
    if (count > bestCount) {
      best = suit;
      bestCount = count;
    }
  }

  return best;
}

// Calls the two most valuable cards it does not hold, which is what a human
// would reach for: the aces pull in whoever is holding the points.
export function choosePartnerCards(hand, roundCardIds) {
  const held = new Set(hand.map(card => card.id));
  const candidates = roundCardIds
    .filter(id => !held.has(id))
    .sort((a, b) => pointsForCardId(b) - pointsForCardId(a));

  return candidates.slice(0, 2);
}

// Follow suit when required, then play the cheapest card available — lowest
// point value first so the bot never hands the other team a windfall.
export function chooseCard(hand, leadSuit) {
  const followers = hand.filter(card => card.suit === leadSuit);
  const legal = leadSuit && followers.length > 0 ? followers : hand;

  return [...legal].sort((a, b) => {
    const points = a.getPointValue() - b.getPointValue();
    if (points !== 0) return points;
    return a.getRankIndex() - b.getRankIndex();
  })[0];
}
