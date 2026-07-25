import test from 'node:test';
import assert from 'node:assert';
import { Card } from '../models/Card.js';
import { initTrick, playCard, determineTrickWinner } from '../engine/tricks.js';

test('Trick playing rules', () => {
  let trick = initTrick('p1');
  const handP2 = [new Card('S', 'K'), new Card('H', '2')];

  // First card establishes lead suit
  let res = playCard(trick, 'p1', new Card('S', 'A'), [], 'H');
  trick = res.newState;
  assert.strictEqual(trick.leadSuit, 'S');

  // Must follow suit
  res = playCard(trick, 'p2', new Card('H', '2'), handP2, 'H');
  assert.ok(!res.ok);

  // Valid follow suit
  res = playCard(trick, 'p2', new Card('S', 'K'), handP2, 'H');
  assert.ok(res.ok);
  trick = res.newState;
});

test('Determine trick winner - No Trump', () => {
  let trick = initTrick('p1');
  playCard(trick, 'p1', new Card('S', '9'), [], 'H');
  playCard(trick, 'p2', new Card('S', 'K'), [], 'H');
  playCard(trick, 'p3', new Card('S', 'A'), [], 'H');
  playCard(trick, 'p4', new Card('D', 'A'), [], 'H'); // off-suit

  const { winnerId } = determineTrickWinner(trick, 'H');
  assert.strictEqual(winnerId, 'p3'); // Highest of lead suit
});

test('Determine trick winner - With Trump', () => {
  let trick = initTrick('p1');
  playCard(trick, 'p1', new Card('S', 'A'), [], 'H');
  playCard(trick, 'p2', new Card('S', 'K'), [], 'H');
  playCard(trick, 'p3', new Card('H', '2'), [], 'H'); // lowest trump
  playCard(trick, 'p4', new Card('H', '3'), [], 'H'); // higher trump

  const { winnerId } = determineTrickWinner(trick, 'H');
  assert.strictEqual(winnerId, 'p4');
});
