export function initBiddingState(players, startingPlayerIndex) {
  return {
    players: players.map(p => p.id),
    currentTurnIndex: startingPlayerIndex,
    highestBid: 0,
    highestBidderId: null,
    passedPlayers: new Set(),
    passesSinceLastBid: 0,
    isOver: false,
  };
}

export function placeBid(state, playerId, amount) {
  if (state.isOver) {
    return { ok: false, error: 'Bidding phase is already over' };
  }

  const currentPlayerId = state.players[state.currentTurnIndex];
  if (playerId !== currentPlayerId) {
    return { ok: false, error: `Not ${playerId}'s turn to bid` };
  }

  if (amount !== 'pass') {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 310) {
      return { ok: false, error: 'Invalid bid amount' };
    }
    if (amount <= state.highestBid && state.highestBid !== 0) {
      // highestBid == 0 means no one has bid yet, any bid is valid. Wait, what if someone bids 0? Bids must be > highestBid if highestBid > 0, or > 0 if highestBid == 0. Actually, rule: Any bid must be greater than the current highest bid. 
      // If highestBid is 0, any bid > 0 is fine.
      return { ok: false, error: 'Bid must be strictly greater than current highest bid' };
    }
    if (amount === 0 && state.highestBid > 0) {
        return { ok: false, error: 'Bid must be strictly greater than current highest bid' };
    }
  }

  const newState = {
    ...state,
    passedPlayers: new Set(state.passedPlayers)
  };

  if (amount === 'pass') {
    newState.passedPlayers.add(playerId);
    newState.passesSinceLastBid++;
  } else {
    newState.highestBid = amount;
    newState.highestBidderId = playerId;
    newState.passesSinceLastBid = 0;
    newState.passedPlayers.delete(playerId); // Player re-entered
  }

  newState.currentTurnIndex = (newState.currentTurnIndex + 1) % newState.players.length;

  // Check if bidding is over. Bidding ends when a full rotation happens with no new bids.
  // Exception: If everyone passes on the very first round, what happens? Spec doesn't say. Let's assume highestBid=0 means no winner, but usually the last player must bid or game re-deals. For now, if passes == players.length, bidding ends.
  const targetPasses = newState.highestBid === 0 ? newState.players.length : newState.players.length - 1;
  if (newState.passesSinceLastBid >= targetPasses) {
    newState.isOver = true;
  }

  return { ok: true, newState };
}

export function passBid(state, playerId) {
  return placeBid(state, playerId, 'pass');
}

export function isBiddingOver(state) {
  return state.isOver;
}

export function getBidWinner(state) {
  return {
    playerId: state.highestBidderId,
    amount: state.highestBid
  };
}
