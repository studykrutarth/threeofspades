import test from 'node:test';
import assert from 'node:assert';
import { initBiddingState, placeBid, isBiddingOver, getBidWinner } from '../engine/bidding.js';

test('Bidding rules', () => {
  const players = [{id:'p1'}, {id:'p2'}, {id:'p3'}, {id:'p4'}];
  let state = initBiddingState(players, 0);

  // Valid opening bid
  let res = placeBid(state, 'p1', 100);
  assert.ok(res.ok);
  state = res.newState;

  // Bid must be higher
  res = placeBid(state, 'p2', 100);
  assert.ok(!res.ok);
  assert.match(res.error, /greater/);

  // Valid higher bid
  res = placeBid(state, 'p2', 110);
  state = res.newState;

  // Pass
  res = placeBid(state, 'p3', 'pass');
  state = res.newState;

  // Max bid limit
  res = placeBid(state, 'p4', 400);
  assert.ok(!res.ok);

  // Re-entry after pass (not actually possible unless bidding goes around again, let's fast forward)
  res = placeBid(state, 'p4', 120);
  state = res.newState;

  // p1 passes
  state = placeBid(state, 'p1', 'pass').newState;
  
  // p2 passes
  state = placeBid(state, 'p2', 'pass').newState;

  // p3 who passed earlier now re-enters and bids
  res = placeBid(state, 'p3', 130);
  assert.ok(res.ok);
  state = res.newState;

  // Everyone else passes to end
  state = placeBid(state, 'p4', 'pass').newState;
  state = placeBid(state, 'p1', 'pass').newState;
  state = placeBid(state, 'p2', 'pass').newState;

  assert.ok(isBiddingOver(state));
  const winner = getBidWinner(state);
  assert.strictEqual(winner.playerId, 'p3');
  assert.strictEqual(winner.amount, 130);
});
