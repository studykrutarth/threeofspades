import test from 'node:test';
import assert from 'node:assert';
import { Deck } from '../models/Deck.js';

test('Full deck creation', () => {
  const deck = Deck.create();
  assert.strictEqual(deck.cards.length, 52);
});

test('Deck removal rules (4 players)', () => {
  const deck = Deck.create();
  deck.removeForPlayers(4);
  assert.strictEqual(deck.cards.length, 52);
});

test('Deck removal rules (6 players)', () => {
  const deck = Deck.create();
  deck.removeForPlayers(6);
  assert.strictEqual(deck.cards.length, 48);
  assert.ok(!deck.cards.some(c => c.rank === '2'));
});

test('Deck removal rules (5 players)', () => {
  const deck = Deck.create();
  deck.removeForPlayers(5);
  assert.strictEqual(deck.cards.length, 50);
  // Should ideally not remove 2S
  const has2S = deck.cards.some(c => c.id === '2S');
  assert.ok(has2S);
  const num2s = deck.cards.filter(c => c.rank === '2').length;
  assert.strictEqual(num2s, 2);
});

test('Deck deal distributes evenly', () => {
  const deck = Deck.create();
  const hands = deck.deal(4);
  assert.strictEqual(hands.size, 4);
  for (const hand of hands.values()) {
    assert.strictEqual(hand.length, 13);
  }
});
