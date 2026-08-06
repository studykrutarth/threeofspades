import test from 'node:test';
import assert from 'node:assert';
import { Card } from '../models/Card.js';
import { Game } from '../models/Game.js';
import {
  chooseBid, chooseTrump, choosePartnerCards, chooseCard,
  pointsForCardId, estimateHandValue, estimateTeamValue, mustOpenBidding
} from '../engine/bot.js';
import { DEFAULT_PARAMS } from '../engine/botParams.js';

// A trick in progress, as chooseCard expects to receive it.
const trick = (...plays) => ({
  cards: plays.map(([playerId, suit, rank]) => ({ playerId, card: new Card(suit, rank) }))
});

// Every assertion below pins DEFAULT_PARAMS explicitly. The live bots read
// whatever evolve.js last wrote to bot-params.json, so a suite that leaned on
// the ambient weights would start failing the moment anyone trained — the
// tests describe the decision rules, not the current tuning.
const P = DEFAULT_PARAMS;

test('a bot with no hand to look at falls back to the opening bid', () => {
  // The scheduler's safety path: no context, so no judgement, just a legal move.
  assert.strictEqual(chooseBid(0, { params: P }), P.openingBid);
  // Once there is a bid it stays out of the auction.
  assert.strictEqual(chooseBid(P.openingBid, { params: P }), 'pass');
  assert.strictEqual(chooseBid(300, { params: P }), 'pass');
});

test('the last seat that could keep the deal alive is the one that must open', () => {
  const state = (highestBid, passesSinceLastBid) => ({
    highestBid, passesSinceLastBid, players: ['a', 'b', 'c', 'd']
  });

  assert.strictEqual(mustOpenBidding(state(0, 0)), false, 'first to act is free to pass');
  assert.strictEqual(mustOpenBidding(state(0, 2)), false);
  assert.strictEqual(mustOpenBidding(state(0, 3)), true, 'everyone else has passed');
  // Once a bid exists, passing costs nothing — the deal is safe.
  assert.strictEqual(mustOpenBidding(state(200, 3)), false);
  assert.strictEqual(mustOpenBidding(null), false);
});

test('bot names its longest suit as trump', () => {
  const hand = [
    new Card('H', 'A'), new Card('H', 'K'), new Card('H', '4'),
    new Card('S', '9'),
    new Card('C', '2')
  ];

  assert.strictEqual(chooseTrump(hand), 'H');
});

test('bot calls the most valuable cards it does not hold', () => {
  const hand = [new Card('S', 'A'), new Card('H', '4')];
  const roundCardIds = ['AS', '4H', 'AH', '3S', '7D', 'KC'];

  const called = choosePartnerCards(hand, roundCardIds);

  // 3S is worth 30 and AH 20, and neither is in hand.
  assert.deepStrictEqual(called, ['3S', 'AH']);
  assert.strictEqual(called.includes('AS'), false, 'must not call a card it holds');
});

test('bot follows suit and gives away as little as possible', () => {
  const hand = [
    new Card('H', 'A'),  // 20 points, must not be thrown away
    new Card('H', '6'),  // 0 points, the right choice
    new Card('S', '2')   // cheaper still, but off suit
  ];

  const played = chooseCard(hand, 'H');

  assert.strictEqual(played.id, '6H');
});

test('bot plays off suit only when void, and leads its cheapest card', () => {
  const void_ = [new Card('S', 'K'), new Card('C', '5')];
  assert.strictEqual(chooseCard(void_, 'H').id, '5C', 'void in lead suit, so play cheapest');

  const leading = [new Card('S', 'A'), new Card('D', '9'), new Card('S', '3')];
  assert.strictEqual(chooseCard(leading, null).id, '9D', 'leading, so play a zero-point card');
});

test('point lookup from a bare card id matches the scoring table', () => {
  assert.strictEqual(pointsForCardId('3S'), 30);
  assert.strictEqual(pointsForCardId('AH'), 20);
  assert.strictEqual(pointsForCardId('KD'), 15);
  assert.strictEqual(pointsForCardId('10C'), 5);
  assert.strictEqual(pointsForCardId('3H'), 0, 'only the 3 of spades scores');
  assert.strictEqual(pointsForCardId('2S'), 0);
});

test('a table where everyone passes redeals instead of deadlocking', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();

  const start = (game.dealerIndex + 1) % 4;
  const firstHand = game.players[0].hand.map(c => c.id).join(',');

  for (let i = 0; i < 4; i++) {
    game.placeBid(game.players[(start + i) % 4].id, 'pass');
  }

  // Still biddable rather than stranded in trump selection with no bid winner.
  assert.strictEqual(game.phase, 'BIDDING');
  assert.strictEqual(game.biddingState.highestBid, 0);
  assert.strictEqual(game.players.every(p => p.hand.length === 13), true);
  assert.notStrictEqual(game.players[0].hand.map(c => c.id).join(','), firstHand, 'should be a fresh deal');
});

test('a reconnecting player reclaims their seat, hand and score', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.startMatch();

  game.players[1].score = 120;
  const handBefore = game.players[1].hand.map(c => c.id);

  // Dropping mid-match hands the seat to a bot rather than removing it.
  game.removePlayer('p2');
  assert.strictEqual(game.players.length, 4);
  assert.strictEqual(game.players[1].isBot, true);

  assert.strictEqual(game.hasPlayer('p2'), true);
  assert.strictEqual(game.reconnectPlayer('p2', 'P2'), true);

  assert.strictEqual(game.players[1].isBot, false);
  assert.strictEqual(game.players[1].score, 120);
  assert.deepStrictEqual(game.players[1].hand.map(c => c.id), handBefore);
  assert.strictEqual(game.players.length, 4, 'must not create a duplicate seat');
});

test('reconnecting an unknown player reports failure', () => {
  const game = new Game();
  ['p1', 'p2', 'p3', 'p4'].forEach(id => game.addPlayer(id, id.toUpperCase()));

  assert.strictEqual(game.hasPlayer('nobody'), false);
  assert.strictEqual(game.reconnectPlayer('nobody'), false);
});

// ─── Seating bots on purpose ───

test('a lone player can fill the table with bots and deal', () => {
  const game = new Game();
  game.addPlayer('human', 'Solo');
  for (let i = 0; i < 3; i++) game.addBot();

  assert.strictEqual(game.players.length, 4);
  assert.strictEqual(game.players.filter(p => p.isBot).length, 3);
  assert.strictEqual(new Set(game.players.map(p => p.name)).size, 4, 'bot names must be distinct');
  assert.strictEqual(new Set(game.players.map(p => p.id)).size, 4, 'bot ids must be distinct');
  assert.strictEqual(game.players.every(p => p.accountUserId === null || p.id === 'human'), true);

  game.startMatch();
  assert.strictEqual(game.phase, 'BIDDING');
  assert.strictEqual(game.players.every(p => p.hand.length === 13), true, 'bots are dealt like anyone else');
});

test('bots can be unseated before the deal but not once it is under way', () => {
  const game = new Game();
  ['p1', 'p2', 'p3'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  const bot = game.addBot();

  game.removeBot(bot.id);
  assert.strictEqual(game.players.length, 3);

  const second = game.addBot();
  game.startMatch();

  assert.throws(() => game.removeBot(second.id), /LOBBY/, 'cannot empty a seat holding a live hand');
  assert.throws(() => game.addBot(), /LOBBY/, 'cannot deal into a match already dealt');
});

test('only bot seats can be unseated', () => {
  const game = new Game();
  ['p1', 'p2', 'p3'].forEach(id => game.addPlayer(id, id.toUpperCase()));
  game.addBot();

  assert.throws(() => game.removeBot('p1'), /bot/i);
  assert.throws(() => game.removeBot('nobody'), /No such seat/);
});

test('a full table refuses a seventh bot', () => {
  const game = new Game();
  game.addPlayer('human', 'Solo');
  for (let i = 0; i < 5; i++) game.addBot();

  assert.strictEqual(game.players.length, 6);
  assert.throws(() => game.addBot(), /full/);
});

// ─── Playing to win, given table context ───

// Six hearts headed by four honours, plus a side ace.
const STRONG_HAND = [
  new Card('H', 'A'), new Card('H', 'K'), new Card('H', 'Q'),
  new Card('H', 'J'), new Card('H', '10'), new Card('H', '4'),
  new Card('S', 'A'), new Card('C', '7'), new Card('D', '3')
];
// Nothing anywhere.
const WEAK_HAND = [
  new Card('H', '5'), new Card('H', '4'), new Card('S', '6'),
  new Card('D', '8'), new Card('C', '2')
];

test('a hand is sized up as its own cards plus what partners should bring', () => {
  assert.strictEqual(estimateHandValue(STRONG_HAND, P), 155);
  assert.strictEqual(estimateHandValue(WEAK_HAND, P), 20);

  // The bid is settled against the whole team's haul, so the ceiling has to
  // include the partners the called cards will pull in.
  assert.strictEqual(estimateTeamValue(STRONG_HAND, P), 155 + P.partnerShare);
  assert.strictEqual(estimateTeamValue(WEAK_HAND, P), 20 + P.partnerShare);
});

test('only a hand that can cover the opening bid opens the auction', () => {
  // 230 of expected team points against a floor of 200 — worth taking on.
  assert.strictEqual(chooseBid(0, { hand: STRONG_HAND, params: P }), P.openingBid);
  // 95 against 200 — not close, so it stays out and lets someone else try.
  assert.strictEqual(chooseBid(0, { hand: WEAK_HAND, params: P }), 'pass');
});

test('the seat that would otherwise redeal opens regardless of its hand', () => {
  // Passing here ends bidding with no winner and throws the deal away, so even
  // a hopeless hand takes the contract rather than loop the table.
  assert.strictEqual(chooseBid(0, { hand: WEAK_HAND, params: P, mustOpen: true }), P.openingBid);
});

test('bids come out as whole numbers even from evolved weights', () => {
  // evolve.js searches continuous values, so params routinely look like this.
  const evolved = { ...P, openingBid: 200.81, bidStep: 19.4, partnerShare: 120 };

  const opening = chooseBid(0, { hand: STRONG_HAND, params: evolved });
  assert.strictEqual(Number.isInteger(opening), true, `opening bid ${opening} must be whole`);
  assert.strictEqual(opening, 201);

  const raise = chooseBid(opening, { hand: STRONG_HAND, params: evolved });
  assert.strictEqual(Number.isInteger(raise), true, `raise ${raise} must be whole`);
  assert.strictEqual(raise > opening, true, 'a raise must still clear the bid it answers');
  assert.strictEqual(raise, 220);
});

test('a bot raises while its ceiling holds, then drops out', () => {
  const ceiling = estimateTeamValue(STRONG_HAND, P); // 230

  assert.strictEqual(chooseBid(P.openingBid, { hand: STRONG_HAND, params: P }), P.openingBid + P.bidStep);
  assert.strictEqual(chooseBid(ceiling - P.bidStep, { hand: STRONG_HAND, params: P }), ceiling);
  assert.strictEqual(chooseBid(ceiling, { hand: STRONG_HAND, params: P }), 'pass', 'stops at its ceiling, not at the table limit');

  assert.strictEqual(chooseBid(P.openingBid, { hand: WEAK_HAND, params: P }), 'pass');
  assert.strictEqual(chooseBid(300, { hand: STRONG_HAND, params: P }), 'pass');
});

test('bot takes a trick that has points in it, with its cheapest winner', () => {
  const hand = [new Card('H', 'A'), new Card('H', 'J'), new Card('H', '9'), new Card('H', '4')];
  const context = {
    myId: 'me', myRole: 'opponent', bidderId: 'east', revealedIds: [],
    trump: 'S', seatCount: 4, params: P,
    trick: trick(['east', 'H', 'K'], ['south', 'H', '2'])
  };

  // The king is 15 points on the table. The 9 does not beat it and the jack is
  // itself worth 15, so the ace is the cheapest card that actually wins.
  assert.strictEqual(chooseCard(hand, 'H', context).id, 'AH');
});

test('bot ducks a trick a teammate has already won', () => {
  const hand = [new Card('H', 'A'), new Card('H', '4')];
  const context = {
    myId: 'me', myRole: 'partner', bidderId: 'east', revealedIds: [],
    trump: 'S', seatCount: 4, params: P,
    // The bidder is winning, and this seat is their partner.
    trick: trick(['east', 'H', 'K'], ['south', 'H', '2'])
  };

  assert.strictEqual(chooseCard(hand, 'H', context).id, '4H', 'must not overtake its own side');
});

test('bot loads points onto a teammate only when nobody can take them back', () => {
  const hand = [new Card('D', 'A'), new Card('D', '4')];
  const base = {
    myId: 'me', myRole: 'partner', bidderId: 'east', revealedIds: [],
    trump: 'S', seatCount: 4, params: P
  };

  const lastToPlay = { ...base, trick: trick(['east', 'D', 'K'], ['south', 'D', '2'], ['west', 'D', '5']) };
  assert.strictEqual(chooseCard(hand, 'D', lastToPlay).id, 'AD', 'last seat, so the ace is safe to add');

  const notLast = { ...base, trick: trick(['east', 'D', 'K']) };
  assert.strictEqual(chooseCard(hand, 'D', notLast).id, '4D', 'someone can still overtake, so hold it back');
});

test('bot holds its trumps back rather than ruffing an empty trick', () => {
  const hand = [new Card('S', '8'), new Card('C', '2'), new Card('C', '3')];
  const context = {
    myId: 'me', myRole: 'opponent', bidderId: 'east', revealedIds: [],
    trump: 'S', seatCount: 4, params: P,
    // Void in hearts, and there is nothing on the table worth a trump.
    trick: trick(['east', 'H', '7'], ['south', 'H', '9'])
  };

  assert.strictEqual(chooseCard(hand, 'H', context).id, '2C');

  const worthTaking = { ...context, trick: trick(['east', 'H', 'A'], ['south', 'H', '9']) };
  assert.strictEqual(chooseCard(hand, 'H', worthTaking).id, '8S', 'twenty points is worth the trump');
});

test('bot leads an ace rather than dribbling out its lowest card', () => {
  const hand = [new Card('D', 'A'), new Card('D', '7'), new Card('D', '3'), new Card('C', '2')];
  const context = { myId: 'me', myRole: 'bidder', bidderId: 'me', revealedIds: [], trump: 'S', seatCount: 4, params: P, trick: trick() };

  assert.strictEqual(chooseCard(hand, null, context).id, 'AD');
});

test('a solo table of one player and three bots plays a deal to the end', () => {
  const game = new Game();
  game.addPlayer('human', 'Solo');
  for (let i = 0; i < 3; i++) game.addBot();
  game.startMatch();

  // Every seat is driven by the engine, including the human's, so the run
  // proves the decisions are always legal rather than proving anything about
  // how well they play.
  const context = (player) => ({
    myId: player.id,
    myRole: game.roles.get(player.id) || null,
    bidderId: game.biddingState?.highestBidderId ?? null,
    revealedIds: game.players.filter(p => p.isRevealed).map(p => p.id),
    trump: game.trump,
    trick: game.currentTrick,
    seatCount: game.players.length
  });

  // Generous ceiling: 13 tricks of 4 cards, plus bidding, plus any redeals.
  for (let step = 0; step < 400 && game.phase !== 'MATCH_END'; step++) {
    const turnId = game.getCurrentTurnPlayerId();
    assert.notStrictEqual(turnId, null, `no seat on turn during ${game.phase}`);

    const player = game.players.find(p => p.id === turnId);

    switch (game.phase) {
      case 'BIDDING':
        game.placeBid(turnId, chooseBid(game.biddingState.highestBid, {
          hand: player.hand,
          mustOpen: mustOpenBidding(game.biddingState)
        }));
        break;
      case 'TRUMP_SELECTION':
        game.selectTrump(turnId, chooseTrump(player.hand));
        break;
      case 'PARTNER_SELECTION':
        game.selectPartners(turnId, choosePartnerCards(player.hand, game.roundCardIds));
        break;
      case 'TRICKS':
        game.playCard(turnId, chooseCard(player.hand, game.currentTrick?.leadSuit, context(player)).id);
        break;
      default:
        assert.fail(`unexpected phase ${game.phase}`);
    }
  }

  assert.strictEqual(game.phase, 'MATCH_END');
  assert.strictEqual(game.resultSummary !== null, true);
  assert.strictEqual(game.matchWinners.length >= 1, true);
});
