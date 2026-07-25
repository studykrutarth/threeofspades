export function initTrick(leadPlayerId) {
  return {
    leadPlayerId,
    leadSuit: null,
    cards: [], // Array of { playerId, card }
    winnerId: null,
    isComplete: false
  };
}

export function playCard(trickState, playerId, card, playerHand, trump) {
  if (trickState.isComplete) {
    return { ok: false, error: 'Trick is already complete' };
  }

  if (trickState.cards.length === 0) {
    // First card played establishes the lead suit
    trickState.leadSuit = card.suit;
  } else {
    // Check follow-suit rule
    const hasLeadSuit = playerHand.some(c => c.suit === trickState.leadSuit);
    if (hasLeadSuit && card.suit !== trickState.leadSuit) {
      return { ok: false, error: `Must follow suit (${trickState.leadSuit}) if possible` };
    }
  }

  trickState.cards.push({ playerId, card });
  return { ok: true, newState: trickState };
}

export function isTrickComplete(trickState, numPlayers) {
  return trickState.cards.length === numPlayers;
}

export function determineTrickWinner(trickState, trump) {
  if (trickState.cards.length === 0) return null;

  let winningPlay = trickState.cards[0];
  let isTrumpWinning = winningPlay.card.suit === trump;

  for (let i = 1; i < trickState.cards.length; i++) {
    const play = trickState.cards[i];
    const card = play.card;
    const isTrump = card.suit === trump;

    if (isTrump && !isTrumpWinning) {
      winningPlay = play;
      isTrumpWinning = true;
    } else if (isTrump && isTrumpWinning) {
      if (card.getRankIndex() > winningPlay.card.getRankIndex()) {
        winningPlay = play;
      }
    } else if (!isTrump && !isTrumpWinning) {
      if (card.suit === trickState.leadSuit && card.getRankIndex() > winningPlay.card.getRankIndex()) {
        winningPlay = play;
      }
    }
  }

  trickState.winnerId = winningPlay.playerId;
  trickState.isComplete = true;

  return {
    winnerId: winningPlay.playerId,
    winningCard: winningPlay.card
  };
}

export function collectTrick(trickState) {
  return {
    winnerId: trickState.winnerId,
    cards: trickState.cards.map(p => p.card)
  };
}
