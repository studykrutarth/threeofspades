import test from 'node:test';
import assert from 'node:assert';
import { Card } from '../models/Card.js';

test('Card point values', () => {
  assert.strictEqual(new Card('S', '3').getPointValue(), 30);
  assert.strictEqual(new Card('H', 'A').getPointValue(), 20);
  assert.strictEqual(new Card('D', 'K').getPointValue(), 15);
  assert.strictEqual(new Card('C', 'Q').getPointValue(), 15);
  assert.strictEqual(new Card('S', 'J').getPointValue(), 15);
  assert.strictEqual(new Card('H', '10').getPointValue(), 5);
  assert.strictEqual(new Card('D', '9').getPointValue(), 0);
  assert.strictEqual(new Card('C', '2').getPointValue(), 0);
});

test('Card rank index', () => {
  const c2 = new Card('S', '2');
  const cA = new Card('S', 'A');
  const cK = new Card('S', 'K');
  assert.ok(cA.getRankIndex() > cK.getRankIndex());
  assert.strictEqual(c2.getRankIndex(), 0);
});

test('Card equality', () => {
  const c1 = new Card('S', '3');
  const c2 = new Card('S', '3');
  const c3 = new Card('H', '3');
  assert.ok(c1.equals(c2));
  assert.ok(!c1.equals(c3));
});
