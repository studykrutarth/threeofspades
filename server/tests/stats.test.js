import test from 'node:test';
import assert from 'node:assert';
import { summarizeMatchForUser } from '../stats.js';

// Mirrors what Game.getMatchSnapshot() produces and Match.playersData stores.
function makeMatch({ players, winners, result, trump = 'S' }) {
  return {
    id: 'match-1',
    date: new Date('2026-01-01T00:00:00Z'),
    playersData: { trump, players, winners, result }
  };
}

test('summarizes a win for the bid winner', () => {
  const match = makeMatch({
    players: [
      { id: 'sess-1', accountUserId: 'user-a', name: 'Alice', score: 200 },
      { id: 'sess-2', accountUserId: 'user-b', name: 'Bob', score: 0 }
    ],
    winners: [{ id: 'sess-1', accountUserId: 'user-a', name: 'Alice', score: 200 }],
    result: {
      bidAmount: 100,
      isSuccess: true,
      roles: [{ id: 'sess-1', role: 'bidder' }, { id: 'sess-2', role: 'opponent' }]
    }
  });

  const summary = summarizeMatchForUser(match, 'user-a');

  assert.strictEqual(summary.isWinner, true);
  assert.strictEqual(summary.myScore, 200);
  assert.strictEqual(summary.myRole, 'bidder');
  assert.strictEqual(summary.bidAmount, 100);
  assert.strictEqual(summary.bidSuccess, true);
  assert.strictEqual(summary.trump, 'S');
});

test('summarizes a loss for an opponent by their own session id, not the bidder\'s', () => {
  const match = makeMatch({
    players: [
      { id: 'sess-1', accountUserId: 'user-a', name: 'Alice', score: 200 },
      { id: 'sess-2', accountUserId: 'user-b', name: 'Bob', score: 0 }
    ],
    winners: [{ id: 'sess-1', accountUserId: 'user-a', name: 'Alice', score: 200 }],
    result: {
      bidAmount: 100,
      isSuccess: true,
      roles: [{ id: 'sess-1', role: 'bidder' }, { id: 'sess-2', role: 'opponent' }]
    }
  });

  const summary = summarizeMatchForUser(match, 'user-b');

  assert.strictEqual(summary.isWinner, false);
  assert.strictEqual(summary.myScore, 0);
  assert.strictEqual(summary.myRole, 'opponent');
});

test('a user who was not in the match gets nulls back, not a crash', () => {
  const match = makeMatch({
    players: [{ id: 'sess-1', accountUserId: 'user-a', name: 'Alice', score: 200 }],
    winners: [{ id: 'sess-1', accountUserId: 'user-a', name: 'Alice', score: 200 }],
    result: { bidAmount: 100, isSuccess: true, roles: [{ id: 'sess-1', role: 'bidder' }] }
  });

  const summary = summarizeMatchForUser(match, 'stranger');

  assert.strictEqual(summary.myScore, null);
  assert.strictEqual(summary.myRole, null);
  assert.strictEqual(summary.isWinner, false);
});

test('a match with no playersData at all does not throw', () => {
  const match = { id: 'match-2', date: new Date(), playersData: null };

  const summary = summarizeMatchForUser(match, 'user-a');

  assert.strictEqual(summary.myScore, null);
  assert.strictEqual(summary.myRole, null);
  assert.strictEqual(summary.isWinner, false);
  assert.strictEqual(summary.playerCount, 0);
});
