export class Player {
  constructor(id, name, isBot = false, accountUserId = null) {
    this.id = id;
    this.name = name;
    this.accountUserId = accountUserId;
    this.hand = [];
    this.score = 0;
    this.isBot = isBot;
    this.isRevealed = false;
    this.role = null; // 'bidder', 'partner', 'opponent', or null
  }

  addToScore(delta) {
    this.score += delta;
  }

  hasCard(cardId) {
    return this.hand.some(c => c.id === cardId);
  }

  playCard(cardId) {
    const index = this.hand.findIndex(c => c.id === cardId);
    if (index === -1) {
      throw new Error(`Player ${this.id} does not have card ${cardId}`);
    }
    const card = this.hand[index];
    this.hand.splice(index, 1);
    return card;
  }

  receiveCards(cards) {
    this.hand.push(...cards);
    // Sort hand for convenience (by suit, then rank)
    this.hand.sort((a, b) => {
      if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
      return a.getRankIndex() - b.getRankIndex();
    });
  }

  resetForRound() {
    this.hand = [];
    this.isRevealed = false;
    this.role = null;
  }
}
