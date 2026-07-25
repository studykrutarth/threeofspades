import { Card } from './Card.js';

export class Deck {
  constructor() {
    this.cards = [];
  }

  static create() {
    const deck = new Deck();
    const suits = ['S', 'H', 'D', 'C'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

    for (const suit of suits) {
      for (const rank of ranks) {
        deck.cards.push(new Card(suit, rank));
      }
    }
    return deck;
  }

  removeForPlayers(numPlayers) {
    if (numPlayers === 4) {
      // No removal
      return;
    }

    if (numPlayers === 6) {
      // Remove all 2s
      this.cards = this.cards.filter(c => c.rank !== '2');
      return;
    }

    if (numPlayers === 5) {
      // Remove 2 random 2s, preferring not to remove 2S if possible
      const twos = this.cards.filter(c => c.rank === '2');
      // Sort so 2S is at the end
      twos.sort((a, b) => (a.suit === 'S' ? 1 : -1));
      
      // We need to remove 2 non-2S twos
      const toRemove = [];
      const nonSpadeTwos = twos.filter(c => c.suit !== 'S');
      
      // Shuffle nonSpadeTwos and pick 2
      for (let i = nonSpadeTwos.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nonSpadeTwos[i], nonSpadeTwos[j]] = [nonSpadeTwos[j], nonSpadeTwos[i]];
      }
      
      if (nonSpadeTwos.length >= 2) {
        toRemove.push(nonSpadeTwos[0], nonSpadeTwos[1]);
      } else {
        // Fallback just in case
        toRemove.push(twos[0], twos[1]);
      }

      this.cards = this.cards.filter(c => !toRemove.includes(c));
      return;
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(numPlayers) {
    const hands = new Map();
    for (let i = 0; i < numPlayers; i++) {
      hands.set(`p${i}`, []); // temporary keys, usually we pass player IDs
    }

    let currentPlayer = 0;
    for (const card of this.cards) {
      hands.get(`p${currentPlayer}`).push(card);
      currentPlayer = (currentPlayer + 1) % numPlayers;
    }

    return hands;
  }
}
