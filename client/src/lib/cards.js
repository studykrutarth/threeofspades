export const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
export const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Mirrors Card.getPointValue() on the server (rules section 4).
export function getCardPoints(card) {
  if (!card) return 0;
  if (card.rank === '3' && card.suit === 'S') return 30;
  switch (card.rank) {
    case 'A': return 20;
    case 'K':
    case 'Q':
    case 'J': return 15;
    case '10': return 5;
    default: return 0;
  }
}

export function isRedSuit(suit) {
  return suit === 'H' || suit === 'D';
}

// Card ids look like "AH", "10S", "3S" — the suit is always the last character.
export function parseCardId(cardId) {
  if (!cardId) return null;
  return { id: cardId, rank: cardId.slice(0, -1), suit: cardId.slice(-1) };
}

// Total point value sitting in a trick's played cards.
export function getTrickPoints(cards = []) {
  return cards.reduce((sum, entry) => sum + getCardPoints(entry.card ?? entry), 0);
}

// Which cards in hand may legally be played into the current trick.
export function getLegalCardIds(hand = [], leadSuit) {
  if (!leadSuit) return hand.map(c => c.id);
  const followers = hand.filter(c => c.suit === leadSuit);
  return (followers.length > 0 ? followers : hand).map(c => c.id);
}
