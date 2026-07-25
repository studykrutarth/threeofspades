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
        message: `You are a partner! You hold ${heldPartnerCards.map(c => c.toString()).join(' and ')}.`
      });
    }
  }
  
  return notifications;
}

export function checkReveal(playedCardId, partnerCardIds) {
  return partnerCardIds.includes(playedCardId);
}

export function getTeamPoints(players, roles, tricks) {
  let teamPoints = 0;
  
  for (const trick of tricks) {
    const winnerRole = roles.get(trick.winnerId);
    if (winnerRole === 'bidder' || winnerRole === 'partner') {
      for (const card of trick.cards) {
        teamPoints += card.getPointValue();
      }
    }
  }
  
  return teamPoints;
}
