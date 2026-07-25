import test from 'node:test';
import assert from 'node:assert';
import { Player } from '../models/Player.js';
import { Card } from '../models/Card.js';
import { assignPartners, validatePartnerSelection, notifyPartners, checkReveal, getTeamPointBreakdown, getTeamPoints } from '../engine/partners.js';

// A trick worth a known number of points, credited to `winnerId`.
function trickWon(winnerId, cards) {
  return { winnerId, cards: cards.map(card => ({ playerId: winnerId, card })) };
}

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

test('point breakdown keeps hidden partner points out of the confirmed total', () => {
  const bidder = new Player('p1', 'P1');
  const shown = new Player('p2', 'P2');
  const hidden = new Player('p3', 'P3');
  const foe = new Player('p4', 'P4');

  shown.isRevealed = true;   // played a called card
  hidden.isRevealed = false; // still holding theirs

  const roles = new Map([
    ['p1', 'bidder'],
    ['p2', 'partner'],
    ['p3', 'partner'],
    ['p4', 'opponent']
  ]);

  const tricks = [
    trickWon('p1', [new Card('S', 'A')]),               // bidder: 20
    trickWon('p2', [new Card('H', 'K')]),               // revealed partner: 15
    trickWon('p3', [new Card('S', '3'), new Card('D', '10')]), // hidden partner: 35
    trickWon('p4', [new Card('C', 'Q')])                // opponent: 15
  ];

  const breakdown = getTeamPointBreakdown([bidder, shown, hidden, foe], roles, tricks);

  assert.strictEqual(breakdown.bidderPoints, 20);
  assert.strictEqual(breakdown.revealedPartnerPoints, 15);
  assert.strictEqual(breakdown.hiddenPartnerPoints, 35);
  assert.strictEqual(breakdown.opponentPoints, 15);

  // What the table can see versus what actually settles the bid.
  assert.strictEqual(breakdown.confirmedPoints, 35);
  assert.strictEqual(breakdown.teamPoints, 70);

  // Scoring still uses the full team total, hidden partner included.
  assert.strictEqual(getTeamPoints([bidder, shown, hidden, foe], roles, tricks), 70);
});

test('revealing a partner moves their earlier tricks into the confirmed total', () => {
  const bidder = new Player('p1', 'P1');
  const partner = new Player('p2', 'P2');
  const foe = new Player('p3', 'P3');
  const foe2 = new Player('p4', 'P4');

  const roles = new Map([
    ['p1', 'bidder'],
    ['p2', 'partner'],
    ['p3', 'opponent'],
    ['p4', 'opponent']
  ]);
  const players = [bidder, partner, foe, foe2];
  const tricks = [trickWon('p2', [new Card('S', 'A')])];

  assert.strictEqual(getTeamPointBreakdown(players, roles, tricks).confirmedPoints, 0);

  partner.isRevealed = true;

  // The trick was won before the reveal but counts publicly once they are known.
  assert.strictEqual(getTeamPointBreakdown(players, roles, tricks).confirmedPoints, 20);
});
