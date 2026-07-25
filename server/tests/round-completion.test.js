import test from 'node:test';
import assert from 'node:assert';
import { Game } from '../models/Game.js';
import { calculateRoundPoints } from '../engine/scoring.js';

// Drives a game from a fresh deal all the way through the final trick.
function playFullRound(game, bid = 100) {
  const startIndex = (game.dealerIndex + 1) % game.players.length;
  const opener = game.players[startIndex].id;

  game.placeBid(opener, bid);
  for (let i = 1; i < game.players.length; i++) {
    game.placeBid(game.players[(startIndex + i) % game.players.length].id, 'pass');
  }

  const bidderId = game.biddingState.highestBidderId;
  game.selectTrump(bidderId, 'S');

  const bidder = game.players.find(p => p.id === bidderId);
  const held = new Set(bidder.hand.map(c => c.id));
  const callable = game.players
    .filter(p => p.id !== bidderId)
    .flatMap(p => p.hand.map(c => c.id))
    .filter(id => !held.has(id));
  game.selectPartners(bidderId, callable.slice(0, 2));

  let guard = 0;
  while (game.phase === 'TRICKS' && guard++ < 200) {
    const trick = game.currentTrick;
    const nextId = trick.cards.length === 0
      ? trick.leadPlayerId
      : game.players[
          (game.players.findIndex(p => p.id === trick.cards.at(-1).playerId) + 1) % game.players.length
        ].id;

    const player = game.players.find(p => p.id === nextId);
    const followers = player.hand.filter(c => c.suit === trick.leadSuit);
    const legal = trick.cards.length > 0 && followers.length > 0 ? followers : player.hand;
    game.playCard(nextId, legal[0].id);
  }

  return bidderId;
}

// Points still sitting in players' hands — non-zero when a match ends early.
function pointsInHands(game) {
  return game.players.reduce(
    (sum, p) => sum + p.hand.reduce((s, c) => s + c.getPointValue(), 0),
    0
  );
}

test('a full deal plays to completion and ends the match', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();

  const bidderId = playFullRound(game, 100);

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.ok(game.matchWinners.length >= 1);

  const summary = game.resultSummary;
  assert.ok(summary);
  assert.strictEqual(summary.bidWinnerId, bidderId);
  assert.strictEqual(summary.bidAmount, 100);

  // Every point in the deck is either won or still held, however the match ended.
  assert.strictEqual(calculateRoundPoints(game.tricks) + pointsInHands(game), 310);

  if (summary.endedEarly) {
    // Stopped the moment the visible haul covered the bid.
    assert.ok(game.tricks.length < game.totalTricks);
    assert.ok(summary.confirmedPoints >= summary.bidAmount);
    assert.strictEqual(summary.isSuccess, true);
  } else {
    assert.strictEqual(game.tricks.length, 13);
    assert.strictEqual(game.players.every(p => p.hand.length === 0), true);
    assert.strictEqual(calculateRoundPoints(game.tricks), 310);
  }

  // Payouts follow section 15: bidder 2x / partner 1x on success, -1x / +1x on failure.
  const deltaFor = id => summary.deltas.find(d => d.id === id).delta;
  const roleFor = id => summary.roles.find(r => r.id === id).role;

  for (const player of game.players) {
    const role = roleFor(player.id);
    const delta = deltaFor(player.id);
    if (summary.isSuccess) {
      if (role === 'bidder') assert.strictEqual(delta, 200);
      if (role === 'partner') assert.strictEqual(delta, 100);
      if (role === 'opponent') assert.strictEqual(delta, 0);
    } else {
      if (role === 'bidder') assert.strictEqual(delta, -100);
      if (role === 'partner') assert.strictEqual(delta, 0);
      if (role === 'opponent') assert.strictEqual(delta, 100);
    }
  }
});

test('a 6 player deal plays out with 2s removed', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();
  assert.strictEqual(game.totalTricks, 8); // 48 cards / 6 players

  playFullRound(game, 80);

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.ok(game.tricks.length <= 8);
  // The four 2s are worth 0, so all 310 points are still in the deal.
  assert.strictEqual(calculateRoundPoints(game.tricks) + pointsInHands(game), 310);
});

test('the match stops as soon as the visible haul covers the bid', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();

  // A bid of 5 is covered by the first point card the bid team shows.
  playFullRound(game, 5);

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.strictEqual(game.resultSummary.endedEarly, true);
  assert.strictEqual(game.resultSummary.isSuccess, true);
  assert.ok(game.resultSummary.confirmedPoints >= 5);

  // Stopped short, so cards are still in hand.
  assert.ok(game.tricks.length < game.totalTricks);
  assert.ok(game.players.some(p => p.hand.length > 0));
});

test('a hidden partner alone does not end the match early', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();
  game.phase = 'TRICKS';
  game.biddingState = { ...game.biddingState, highestBid: 20, highestBidderId: 'p1' };
  game.roles = new Map([
    ['p1', 'bidder'],
    ['p2', 'partner'],
    ['p3', 'opponent'],
    ['p4', 'opponent']
  ]);

  const ace = game.players[1].hand[0];
  game.tricks = [{ winnerId: 'p2', cards: [{ playerId: 'p2', card: { getPointValue: () => 20 } }] }];

  // Worth exactly the bid, but nobody knows p2 is on the bid team yet.
  game.players[1].isRevealed = false;
  assert.strictEqual(game.getPointBreakdown().confirmedPoints, 0);
  assert.strictEqual(game.isBidSettled(), false);

  game.players[1].isRevealed = true;
  assert.strictEqual(game.getPointBreakdown().confirmedPoints, 20);
  assert.strictEqual(game.isBidSettled(), true);
  assert.ok(ace);
});

test('a finished match can be replayed with scores reset', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();
  const firstDealer = game.dealerIndex;
  playFullRound(game, 100);

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.ok(game.players.some(p => p.score !== 0));

  game.startMatch();

  assert.strictEqual(game.phase, 'BIDDING');
  assert.strictEqual(game.players.every(p => p.score === 0), true);
  assert.strictEqual(game.players.every(p => p.hand.length === 13), true);
  assert.strictEqual(game.resultSummary, null);
  // The deal passes along so a different player opens the bidding.
  assert.notStrictEqual(game.dealerIndex, firstDealer);
});
