export function calculateRoundPoints(tricks) {
  let totalPoints = 0;
  for (const trick of tricks) {
    for (const card of trick.cards) {
      totalPoints += card.getPointValue();
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

export function getRoundSummary(round, bidWinnerId, bidAmount, pointsCollected, roles, deltas) {
  return {
    round,
    bidWinnerId,
    bidAmount,
    pointsCollected,
    isSuccess: pointsCollected >= bidAmount,
    roles: Array.from(roles.entries()).map(([id, role]) => ({ id, role })),
    deltas: Array.from(deltas.entries()).map(([id, delta]) => ({ id, delta }))
  };
}
