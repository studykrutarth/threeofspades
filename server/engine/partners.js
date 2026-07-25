export function validatePartnerSelection(bidderHand, cardId1, cardId2, roundCardIds = null) {
  if (cardId1 === cardId2) {
    return { ok: false, error: 'Cannot select the same card twice' };
  }

  if (bidderHand.some(c => c.id === cardId1 || c.id === cardId2)) {
    return { ok: false, error: 'Bid winner cannot select cards they currently hold' };
  }

  if (roundCardIds && (!roundCardIds.includes(cardId1) || !roundCardIds.includes(cardId2))) {
    return { ok: false, error: 'Selected card is not in play this round' };
  }

  return { ok: true };
}

export function assignPartners(players, bidderId, cardId1, cardId2) {
  const roles = new Map();
  
  for (const player of players) {
    if (player.id === bidderId) {
      roles.set(player.id, 'bidder');
    } else {
      const hasCard1 = player.hasCard(cardId1);
      const hasCard2 = player.hasCard(cardId2);
      
      if (hasCard1 || hasCard2) {
        roles.set(player.id, 'partner');
      } else {
        roles.set(player.id, 'opponent');
      }
    }
  }

  return roles;
}

export function notifyPartners(players, bidderId, partnerCardIds) {
  const notifications = new Map();
  
  for (const player of players) {
    if (player.id === bidderId) continue;
    
    const heldPartnerCards = player.hand.filter(c => partnerCardIds.includes(c.id));
    if (heldPartnerCards.length > 0) {
      notifications.set(player.id, {
        message: `You are a partner — you hold ${heldPartnerCards.map(c => c.toDisplayString()).join(' and ')}.`
      });
    }
  }
  
  return notifications;
}

export function checkReveal(playedCardId, partnerCardIds) {
  return partnerCardIds.includes(playedCardId);
}

// Trick entries are { playerId, card } so we know who played what; accept a bare
// Card too so the helper works with either shape.
function toCard(entry) {
  return entry?.card ?? entry;
}

function trickValue(trick) {
  let points = 0;
  for (const entry of trick.cards) points += toCard(entry).getPointValue();
  return points;
}

// Splits the bid team's haul by what the table can actually see. A partner's
// tricks only become public knowledge once they play a called card and are
// revealed, so points sitting with a still-hidden partner are tracked apart.
export function getTeamPointBreakdown(players, roles, tricks) {
  const isRevealed = new Map(players.map(p => [p.id, p.isRevealed]));

  let bidderPoints = 0;
  let revealedPartnerPoints = 0;
  let hiddenPartnerPoints = 0;
  let opponentPoints = 0;

  for (const trick of tricks) {
    const role = roles.get(trick.winnerId);
    const points = trickValue(trick);

    if (role === 'bidder') {
      bidderPoints += points;
    } else if (role === 'partner') {
      if (isRevealed.get(trick.winnerId)) revealedPartnerPoints += points;
      else hiddenPartnerPoints += points;
    } else {
      opponentPoints += points;
    }
  }

  return {
    bidderPoints,
    revealedPartnerPoints,
    hiddenPartnerPoints,
    opponentPoints,
    // What every player can work out from the table alone.
    confirmedPoints: bidderPoints + revealedPartnerPoints,
    // The real total the bid is settled against.
    teamPoints: bidderPoints + revealedPartnerPoints + hiddenPartnerPoints
  };
}

export function getTeamPoints(players, roles, tricks) {
  return getTeamPointBreakdown(players, roles, tricks).teamPoints;
}
