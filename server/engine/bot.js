// Decisions for a seat no human is driving — a bot the table seated on purpose,
// or a player who dropped mid-match.
//
// Every decision takes an optional table context. Given one, the bot plays to
// win: it bids to its hand, takes tricks that have points in them, and holds
// back trumps and aces it does not need to spend. Given none, it falls back to
// the old conservative behaviour — always legal, never donating points — which
// index.js keeps as a safety net so a bad contextual move can never stall a
// table that has no human left to unstick it.
//
// A bot only ever reasons from what a human in the same seat can see: its own
// hand and role, who won the bid, which cards were called, and who has already
// shown one. A partner who has not revealed still looks like an opponent.

import { BOT_PARAMS } from './botParams.js';

const SUITS = ['S', 'H', 'D', 'C'];
const MAX_BID = 310;

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

// Cheapest first: give away as few points as possible, and among equals throw
// the lowest card. Used both for what to discard and for the least wasteful way
// to win a trick.
const cheapestFirst = (a, b) => {
  const points = a.getPointValue() - b.getPointValue();
  if (points !== 0) return points;
  return a.getRankIndex() - b.getRankIndex();
};

// Follow suit when holding it, otherwise anything goes.
function legalCards(hand, leadSuit) {
  const followers = hand.filter(card => card.suit === leadSuit);
  return leadSuit && followers.length > 0 ? followers : hand;
}

// ─── Bidding ───

// Roughly what this hand can be expected to bring home. Trump cards win their
// own trick and drag in whatever the losers throw, aces hold up on their own,
// and kings come good about half the time. Deliberately crude — it only has to
// sort weak hands from strong ones, and a bot that overbids just loses.
export function estimateHandValue(hand, params = BOT_PARAMS) {
  const trump = chooseTrump(hand);
  let value = 0;

  for (const card of hand) {
    const points = card.getPointValue();

    if (card.suit === trump) {
      value += points + params.trumpBonus;
    } else if (card.rank === 'A') {
      value += points + params.aceBonus;
    } else if (card.rank === 'K') {
      value += points * params.kingFactor;
    }
  }

  return Math.round(value);
}

// What the bid is actually settled against is the whole bid team's haul, not
// one hand's. The two called cards drag in partners the bidder cannot see yet,
// so a bot's ceiling is its own hand plus a flat allowance for whatever they
// bring. Crude, but it is the one number that decides how boldly the table
// bids, and evolve.js can tune it against real results.
export function estimateTeamValue(hand, params = BOT_PARAMS) {
  return estimateHandValue(hand, params) + params.partnerShare;
}

// True when this seat is the last that can keep the deal alive: nobody has bid
// and everyone else has already passed. One more pass ends bidding with no
// winner, which throws the hands away and redeals.
export function mustOpenBidding(biddingState) {
  if (!biddingState || biddingState.highestBid > 0) return false;
  return biddingState.passesSinceLastBid >= biddingState.players.length - 1;
}

// A bot opens only when it thinks its side can cover the opening bid, and
// raises only while it still thinks so. The one exception is the seat that
// would otherwise redeal the hand by passing — it opens regardless, so a
// contract always exists and a table of bots can never loop.
export function chooseBid(highestBid, { hand = null, params = BOT_PARAMS, mustOpen = false } = {}) {
  if (!hand) return highestBid > 0 ? 'pass' : params.openingBid;

  const ceiling = Math.min(estimateTeamValue(hand, params), MAX_BID);

  // Evolved weights are continuous, but a bid is a number a human reads off the
  // table, so it is rounded to a whole one. Raising can survive that safely
  // because bidStep is never smaller than 5 — rounding moves a raise by at most
  // half a point, so it can never fall back to the bid it has to clear.
  if (highestBid === 0) {
    if (ceiling >= params.openingBid || mustOpen) return Math.round(params.openingBid);
    return 'pass';
  }

  const raise = Math.round(highestBid + params.bidStep);
  return raise <= ceiling ? raise : 'pass';
}

// ─── Trump ───

// Longest suit, because trump length is what actually wins tricks. Ties break on
// raw card strength so a suit headed by the ace beats a ragged one of the same
// length.
export function chooseTrump(hand) {
  let best = SUITS[0];
  let bestLength = -1;
  let bestStrength = -1;

  for (const suit of SUITS) {
    const cards = hand.filter(card => card.suit === suit);
    const strength = cards.reduce((sum, card) => sum + card.getRankIndex(), 0);

    if (cards.length > bestLength || (cards.length === bestLength && strength > bestStrength)) {
      best = suit;
      bestLength = cards.length;
      bestStrength = strength;
    }
  }

  return best;
}

// ─── Partners ───

// Calls the two most valuable cards it does not hold, which is what a human
// would reach for: the aces pull in whoever is holding the points.
export function choosePartnerCards(hand, roundCardIds) {
  const held = new Set(hand.map(card => card.id));
  const candidates = roundCardIds
    .filter(id => !held.has(id))
    .sort((a, b) => pointsForCardId(b) - pointsForCardId(a));

  return candidates.slice(0, 2);
}

// ─── Card play ───

// Mirrors determineTrickWinner: trump beats anything off-trump, and with no
// trump in the trick only the lead suit can win. `best` is always a lead-suit
// or trump card, because it is whatever is currently winning.
function beats(card, best, leadSuit, trump) {
  const cardIsTrump = trump && card.suit === trump;
  const bestIsTrump = trump && best.suit === trump;

  if (cardIsTrump !== bestIsTrump) return cardIsTrump;
  if (cardIsTrump) return card.getRankIndex() > best.getRankIndex();
  if (card.suit !== leadSuit) return false;

  return best.suit === leadSuit ? card.getRankIndex() > best.getRankIndex() : true;
}

// What this seat can legitimately work out about who is on its side. The bid
// winner is public and so are the called cards, so a partner knows the bidder
// and everyone can see who has shown a called card. An opponent has to assume
// every seat that is neither the bidder nor revealed is with them — which is
// exactly the bet a human opponent makes, and exactly what a hidden partner is
// there to punish.
function isTeammate(playerId, { myId, myRole, bidderId, revealedIds = [] }) {
  if (playerId === myId) return true;
  if (myRole === 'bidder') return revealedIds.includes(playerId);
  if (myRole === 'partner') return playerId === bidderId || revealedIds.includes(playerId);

  return playerId !== bidderId && !revealedIds.includes(playerId);
}

// Leading. An ace both wins the trick and banks its own 20, so lead one when
// there is one — preferring a long suit, where it is less likely to be ruffed.
// Failing that, a long trump holding is worth spending to strip everyone else's
// trumps. Otherwise lead something that costs nothing to lose.
function chooseLead(hand, { trump = null, params = BOT_PARAMS }) {
  const aces = hand.filter(card => card.rank === 'A');
  if (aces.length > 0) {
    const lengthOf = suit => hand.filter(card => card.suit === suit).length;
    return [...aces].sort((a, b) => lengthOf(b.suit) - lengthOf(a.suit))[0];
  }

  const trumps = hand.filter(card => trump && card.suit === trump);
  if (trumps.length >= params.longTrumpLead) {
    return [...trumps].sort((a, b) => b.getRankIndex() - a.getRankIndex())[0];
  }

  const offTrump = hand.filter(card => card.suit !== trump);
  return [...(offTrump.length > 0 ? offTrump : hand)].sort(cheapestFirst)[0];
}

// Without a context, follow suit when required and play the cheapest card
// available — never winning anything, but never handing over a windfall either.
// With one, play to actually take the points.
export function chooseCard(hand, leadSuit, context = null) {
  const legal = legalCards(hand, leadSuit);
  const byCost = [...legal].sort(cheapestFirst);
  const cheapest = byCost[0];

  if (!context) return cheapest;

  const { trump = null, trick = null, seatCount = 4, params = BOT_PARAMS } = context;
  const played = trick?.cards ?? [];

  if (played.length === 0) return chooseLead(hand, context);

  let bestPlay = played[0];
  for (const play of played.slice(1)) {
    if (beats(play.card, bestPlay.card, leadSuit, trump)) bestPlay = play;
  }

  const pointsOnTable = played.reduce((sum, play) => sum + play.card.getPointValue(), 0);
  const isLast = played.length === seatCount - 1;

  if (isTeammate(bestPlay.playerId, context)) {
    // Loading points onto a trick a teammate has already won is only safe once
    // there is nobody left to take it off them.
    return isLast ? byCost[byCost.length - 1] : cheapest;
  }

  const winners = legal.filter(card => beats(card, bestPlay.card, leadSuit, trump));
  if (winners.length === 0) return cheapest;

  // The least valuable card that still takes it, so the points come home
  // without an ace going out the door on the way.
  const cheapestWinner = [...winners].sort(cheapestFirst)[0];

  // Ruffing a trick with nothing worthwhile in it spends a trump for nothing.
  // Hold it back for one that clears the bar.
  const wouldRuff = trump && cheapestWinner.suit === trump && leadSuit !== trump;
  if (pointsOnTable < params.ruffMinPoints && wouldRuff) return cheapest;

  return cheapestWinner;
}
