export function calculateRoundPoints(tricks) {
  let totalPoints = 0;
  for (const trick of tricks) {
    for (const entry of trick.cards) {
      // Trick entries are { playerId, card }; tolerate a bare Card as well.
      totalPoints += (entry?.card ?? entry).getPointValue();
    }
  }
  return totalPoints;
}

export function resolveRound(bid, pointsCollected, players, roles) {
  const isSuccess = pointsCollected >= bid;
  const deltas = new Map();

  for (const player of players) {
    const role = roles.get(player.id);
    let delta = 0;

    if (isSuccess) {
      if (role === 'bidder') {
        delta = 2 * bid;
      } else if (role === 'partner') {
        delta = 1 * bid;
      } else if (role === 'opponent') {
        delta = 0;
      }
    } else {
      // Failure
      if (role === 'bidder') {
        delta = -1 * bid;
      } else if (role === 'partner') {
        delta = 0;
      } else if (role === 'opponent') {
        delta = 1 * bid;
      }
    }

    deltas.set(player.id, delta);
  }

  return deltas;
}

export function applyScoreDeltas(players, deltas) {
  for (const player of players) {
    const delta = deltas.get(player.id);
    if (delta !== undefined) {
      player.addToScore(delta);
    }
  }
  return players;
}

export function getResultSummary(bidWinnerId, bidAmount, breakdown, roles, deltas, meta = {}) {
  const { endedEarly = false, tricksPlayed = 0, totalTricks = 0 } = meta;

  return {
    bidWinnerId,
    bidAmount,
    pointsCollected: breakdown.teamPoints,
    // Split out so the recap can show what was public during play versus what
    // was sitting with a partner nobody had identified yet.
    bidderPoints: breakdown.bidderPoints,
    revealedPartnerPoints: breakdown.revealedPartnerPoints,
    hiddenPartnerPoints: breakdown.hiddenPartnerPoints,
    opponentPoints: breakdown.opponentPoints,
    confirmedPoints: breakdown.confirmedPoints,
    isSuccess: breakdown.teamPoints >= bidAmount,
    endedEarly,
    tricksPlayed,
    totalTricks,
    roles: Array.from(roles.entries()).map(([id, role]) => ({ id, role })),
    deltas: Array.from(deltas.entries()).map(([id, delta]) => ({ id, delta }))
  };
}
