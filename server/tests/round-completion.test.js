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

test('a full deal plays to completion and ends the match', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();

  const bidderId = playFullRound(game, 100);

  // The last card of the deal ends the match outright — there is no second deal.
  assert.strictEqual(game.phase, 'MATCH_END');
  assert.strictEqual(game.tricks.length, 13);
  assert.strictEqual(game.players.every(p => p.hand.length === 0), true);
  assert.ok(game.matchWinners.length >= 1);

  // Every point card in the deck is accounted for across the played tricks.
  assert.strictEqual(calculateRoundPoints(game.tricks), 310);

  const summary = game.resultSummary;
  assert.ok(summary);
  assert.strictEqual(summary.bidWinnerId, bidderId);
  assert.strictEqual(summary.bidAmount, 100);

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

test('a 6 player deal plays to completion with 2s removed', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();

  playFullRound(game, 80);

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.strictEqual(game.tricks.length, 8); // 48 cards / 6 players
  // The four 2s are worth 0, so the deal still holds every point in the deck.
  assert.strictEqual(calculateRoundPoints(game.tricks), 310);
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
