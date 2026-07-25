import test from 'node:test';
import assert from 'node:assert';
import { Player } from '../models/Player.js';
import { resolveRound } from '../engine/scoring.js';

test('Scoring - Success (2 partners)', () => {
  const p1 = new Player('p1', 'P1');
  const p2 = new Player('p2', 'P2');
  const p3 = new Player('p3', 'P3');
  const p4 = new Player('p4', 'P4');

  const roles = new Map([
    ['p1', 'bidder'],
    ['p2', 'partner'],
    ['p3', 'partner'],
    ['p4', 'opponent']
  ]);

  const deltas = resolveRound(100, 110, [p1, p2, p3, p4], roles);

  assert.strictEqual(deltas.get('p1'), 200); // +2 * bid
  assert.strictEqual(deltas.get('p2'), 100); // +1 * bid
  assert.strictEqual(deltas.get('p3'), 100);
  assert.strictEqual(deltas.get('p4'), 0);
});

test('Scoring - Failure', () => {
  const p1 = new Player('p1', 'P1');
  const p2 = new Player('p2', 'P2');
  const p3 = new Player('p3', 'P3');
  const p4 = new Player('p4', 'P4');

  const roles = new Map([
    ['p1', 'bidder'],
    ['p2', 'partner'],
    ['p3', 'opponent'],
    ['p4', 'opponent']
  ]);

  const deltas = resolveRound(100, 90, [p1, p2, p3, p4], roles);

  assert.strictEqual(deltas.get('p1'), -100); // -1 * bid
  assert.strictEqual(deltas.get('p2'), 0);
  assert.strictEqual(deltas.get('p3'), 100); // +1 * bid
  assert.strictEqual(deltas.get('p4'), 100);
});
