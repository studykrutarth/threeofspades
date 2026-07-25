export class Card {
  /**
   * @param {string} suit - 'S' (Spades), 'H' (Hearts), 'D' (Diamonds), 'C' (Clubs)
   * @param {string} rank - '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
   */
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.id = `${rank}${suit}`;
  }

  getPointValue() {
    if (this.id === '3S') return 30;
    
    switch (this.rank) {
      case 'A': return 20;
      case 'K': return 15;
      case 'Q': return 15;
      case 'J': return 15;
      case '10': return 5;
      default: return 0;
    }
  }

  getRankIndex() {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    return ranks.indexOf(this.rank);
  }

  equals(other) {
    if (!other) return false;
    return this.id === other.id;
  }

  toString() {
    return this.id;
  }

  // Human-facing form, e.g. "K♠" — used in player-visible messages.
  toDisplayString() {
    const symbols = { S: '♠', H: '♥', D: '♦', C: '♣' };
    return `${this.rank}${symbols[this.suit] || this.suit}`;
  }
}
