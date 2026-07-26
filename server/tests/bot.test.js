import test from 'node:test';
import assert from 'node:assert';
import { Card } from '../models/Card.js';
import { Game } from '../models/Game.js';
import { chooseBid, chooseTrump, choosePartnerCards, chooseCard, pointsForCardId } from '../engine/bot.js';

test('bot opens the bidding so a contract always exists', () => {
  // Nobody has bid: someone must, or bidding ends with no winner.
  assert.strictEqual(chooseBid(0), 50);
  // Once there is a bid it stays out of the auction.
  assert.strictEqual(chooseBid(50), 'pass');
  assert.strictEqual(chooseBid(300), 'pass');
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
