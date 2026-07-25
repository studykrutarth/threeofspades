import test from 'node:test';
import assert from 'node:assert';
import { Player } from '../models/Player.js';
import { Card } from '../models/Card.js';
import { assignPartners, validatePartnerSelection, notifyPartners, checkReveal } from '../engine/partners.js';

test('Partner selection validation', () => {
  const p1 = new Player('p1', 'P1');
  p1.hand = [new Card('S', 'A'), new Card('H', 'K')];

  // Cannot select cards in own hand
  let res = validatePartnerSelection(p1.hand, 'AS', 'AD');
  assert.ok(!res.ok);

  // Cannot select same card twice
  res = validatePartnerSelection(p1.hand, 'AD', 'AD');
  assert.ok(!res.ok);

  // Valid
  res = validatePartnerSelection(p1.hand, 'AH', 'AD');
  assert.ok(res.ok);
});

test('Partner assignment', () => {
  const p1 = new Player('p1', 'P1');
  const p2 = new Player('p2', 'P2');
  const p3 = new Player('p3', 'P3');
  const p4 = new Player('p4', 'P4');

  p2.hand = [new Card('H', 'A')];
  p3.hand = [new Card('D', 'A')];
  p4.hand = [new Card('C', 'A')];

  const roles = assignPartners([p1, p2, p3, p4], 'p1', 'AH', 'AD');

  assert.strictEqual(roles.get('p1'), 'bidder');
  assert.strictEqual(roles.get('p2'), 'partner');
  assert.strictEqual(roles.get('p3'), 'partner');
  assert.strictEqual(roles.get('p4'), 'opponent');
});

test('Hidden info notification', () => {
  const p1 = new Player('p1', 'P1');
  const p2 = new Player('p2', 'P2');
  
  p2.hand = [new Card('H', 'A')];
  
  const notifications = notifyPartners([p1, p2], 'p1', ['AH', 'AD']);
  
  assert.ok(!notifications.has('p1'));
  assert.ok(notifications.has('p2'));
  assert.match(notifications.get('p2').message, /A♥/);
});

test('Partner reveal check', () => {
  assert.ok(checkReveal('AH', ['AH', 'AD']));
  assert.ok(!checkReveal('AC', ['AH', 'AD']));
});
