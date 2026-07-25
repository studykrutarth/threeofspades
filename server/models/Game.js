import { Deck } from './Deck.js';
import { Player } from './Player.js';
import { initBiddingState, placeBid, isBiddingOver, getBidWinner } from '../engine/bidding.js';
import { validatePartnerSelection, assignPartners, notifyPartners, checkReveal, getTeamPoints } from '../engine/partners.js';
import { initTrick, playCard, isTrickComplete, determineTrickWinner } from '../engine/tricks.js';
import { resolveRound, applyScoreDeltas, getResultSummary } from '../engine/scoring.js';

export class Game {
  // A match is a single deal: the whole deck is dealt out and played to the last
  // trick, which is 13 tricks with 4 players, 10 with 5, and 8 with 6.
  constructor() {
    this.players = []; // Array of Player objects
    this.phase = 'LOBBY'; // LOBBY, DEALING, BIDDING, TRUMP_SELECTION, PARTNER_SELECTION, TRICKS, MATCH_END
    this.dealerIndex = 0;
    this.matchWinners = [];

    // Deal state
    this.biddingState = null;
    this.trump = null;
    this.partnerCardIds = [];
    this.roles = new Map(); // playerId -> role
    this.privateMessages = new Map(); // playerId -> message
    this.tricks = [];
    this.currentTrick = null;
    this.resultSummary = null;
    this.roundCardIds = [];
  }

  addPlayer(id, name, isBot = false, accountUserId = null) {
    if (this.phase !== 'LOBBY') throw new Error('Can only add players in LOBBY phase');
    if (this.players.length >= 6) throw new Error('Game is full (max 6 players)');
    if (this.players.some(p => p.id === id)) throw new Error(`Player ${id} already in game`);
    
    const player = new Player(id, name, isBot, accountUserId);
    this.players.push(player);
    return player;
  }

  removePlayer(id) {
    if (this.phase === 'LOBBY') {
      this.players = this.players.filter(p => p.id !== id);
    } else {
      // In-game disconnect: bot takes over
      const player = this.players.find(p => p.id === id);
      if (player) {
        player.isBot = true;
      }
    }
  }

  // Also used to replay: once a match ends the table can deal a fresh one.
  startMatch() {
    if (this.phase !== 'LOBBY' && this.phase !== 'MATCH_END') {
      throw new Error('Match already in progress');
    }
    if (this.players.length < 4) throw new Error('Need at least 4 players to start');

    for (const player of this.players) player.score = 0;
    this.matchWinners = [];
    this.resultSummary = null;
    this.deal();
  }

  deal() {
    this.phase = 'DEALING';

    for (const player of this.players) {
      player.resetForRound();
    }

    const deck = Deck.create();
    deck.removeForPlayers(this.players.length);
    this.roundCardIds = deck.cards.map(c => c.id);
    deck.shuffle();

    const handsMap = deck.deal(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      this.players[i].receiveCards(handsMap.get(`p${i}`));
    }
    
    this.phase = 'BIDDING';
    
    // Bidding starts with the player to the left of the dealer (clockwise)
    const startingPlayerIndex = (this.dealerIndex + 1) % this.players.length;
    this.biddingState = initBiddingState(this.players, startingPlayerIndex);
    this.trump = null;
    this.partnerCardIds = [];
    this.roles.clear();
    this.privateMessages.clear();
    this.tricks = [];
    this.currentTrick = null;
  }

  endMatch() {
    if (this.phase === 'MATCH_END') return;

    this.phase = 'MATCH_END';
    this.matchWinners = this.getMatchWinners();
    this.currentTrick = null;
  }

  getMatchWinners() {
    if (this.players.length === 0) return [];

    const highestScore = Math.max(...this.players.map(p => p.score));
    return this.players
      .filter(p => p.score === highestScore)
      .map(p => ({
        id: p.id,
        accountUserId: p.accountUserId,
        name: p.name,
        score: p.score
      }));
  }

  getMatchSnapshot() {
    return {
      trump: this.trump,
      winners: this.matchWinners,
      players: this.players.map(p => ({
        id: p.id,
        accountUserId: p.accountUserId,
        name: p.name,
        score: p.score,
        isBot: p.isBot
      })),
      result: this.resultSummary
    };
  }

  placeBid(playerId, amount) {
    if (this.phase !== 'BIDDING') throw new Error('Not in bidding phase');
    
    const result = placeBid(this.biddingState, playerId, amount);
    if (!result.ok) throw new Error(result.error);
    
    this.biddingState = result.newState;
    
    if (isBiddingOver(this.biddingState)) {
      this.phase = 'TRUMP_SELECTION';
    }
  }

  selectTrump(playerId, suit) {
    if (this.phase !== 'TRUMP_SELECTION') throw new Error('Not in trump selection phase');
    
    const winner = getBidWinner(this.biddingState);
    if (playerId !== winner.playerId) throw new Error('Only bid winner can select trump');
    
    if (!['S', 'H', 'D', 'C'].includes(suit)) throw new Error('Invalid suit');
    
    this.trump = suit;
    this.phase = 'PARTNER_SELECTION';
  }

  selectPartners(playerId, cardIds) {
    if (this.phase !== 'PARTNER_SELECTION') throw new Error('Not in partner selection phase');
    if (cardIds.length !== 2) throw new Error('Must select exactly 2 cards');
    
    const winner = getBidWinner(this.biddingState);
    if (playerId !== winner.playerId) throw new Error('Only bid winner can select partners');
    
    const player = this.players.find(p => p.id === playerId);
    
    const valid = validatePartnerSelection(player.hand, cardIds[0], cardIds[1], this.roundCardIds);
    if (!valid.ok) throw new Error(valid.error);
    
    this.partnerCardIds = cardIds;
    this.roles = assignPartners(this.players, playerId, cardIds[0], cardIds[1]);
    this.privateMessages = notifyPartners(this.players, playerId, this.partnerCardIds);
    
    this.phase = 'TRICKS';
    
    // Spec Q2: Bid winner leads first trick
    this.currentTrick = initTrick(playerId);
  }

  playCard(playerId, cardId) {
    if (this.phase !== 'TRICKS') throw new Error('Not in tricks phase');
    
    const player = this.players.find(p => p.id === playerId);
    if (!player) throw new Error('Player not found');
    
    if (this.currentTrick.cards.length === this.players.length) {
       throw new Error('Trick already complete'); // Should not happen, auto-collected
    }
    
    const expectedPlayerId = this.currentTrick.cards.length === 0 ? 
      this.currentTrick.leadPlayerId : 
      this._getNextPlayerId(this.currentTrick.cards[this.currentTrick.cards.length - 1].playerId);
      
    if (playerId !== expectedPlayerId) throw new Error(`Not ${playerId}'s turn`);
    if (!player.hasCard(cardId)) throw new Error(`Player ${playerId} does not have card ${cardId}`);

    const cardToPlay = player.hand.find(c => c.id === cardId);

    const playResult = playCard(this.currentTrick, playerId, cardToPlay, player.hand, this.trump);
    if (!playResult.ok) throw new Error(playResult.error);
    
    // Remove card from hand
    player.playCard(cardId);
    
    // Check for partner reveal
    if (checkReveal(cardId, this.partnerCardIds)) {
      player.isRevealed = true;
    }
    
    if (isTrickComplete(this.currentTrick, this.players.length)) {
      const trickResult = determineTrickWinner(this.currentTrick, this.trump);
      this.tricks.push(this.currentTrick);
      
      // The deal is spent once the last card is played, which ends the match.
      if (player.hand.length === 0) {
        this._handleScoring();
      } else {
        // Winner leads next trick
        this.currentTrick = initTrick(trickResult.winnerId);
      }
    }
  }

  _handleScoring() {
    const winner = getBidWinner(this.biddingState);
    const pointsCollected = getTeamPoints(this.players, this.roles, this.tricks);
    const deltas = resolveRound(winner.amount, pointsCollected, this.players, this.roles);
    applyScoreDeltas(this.players, deltas);

    this.resultSummary = getResultSummary(winner.playerId, winner.amount, pointsCollected, this.roles, deltas);

    // Move the deal on so a replay starts the bidding with a different player.
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    this.endMatch();
  }

  _getNextPlayerId(currentPlayerId) {
    const idx = this.players.findIndex(p => p.id === currentPlayerId);
    return this.players[(idx + 1) % this.players.length].id;
  }

  // Whoever the game is currently waiting on, so clients can show a turn indicator.
  getCurrentTurnPlayerId() {
    switch (this.phase) {
      case 'BIDDING':
        return this.biddingState?.players[this.biddingState.currentTurnIndex] ?? null;
      case 'TRUMP_SELECTION':
      case 'PARTNER_SELECTION':
        return this.biddingState?.highestBidderId ?? null;
      case 'TRICKS': {
        if (!this.currentTrick) return null;
        if (this.currentTrick.cards.length === 0) return this.currentTrick.leadPlayerId;
        return this._getNextPlayerId(this.currentTrick.cards[this.currentTrick.cards.length - 1].playerId);
      }
      default:
        return null;
    }
  }

  // Point cards captured so far, keyed by the player who won the trick. Public
  // information — anyone can count what has been taken off the table.
  _getPointsTakenByPlayer() {
    const totals = {};
    for (const player of this.players) totals[player.id] = 0;

    for (const trick of this.tricks) {
      if (totals[trick.winnerId] === undefined) continue;
      for (const entry of trick.cards) {
        totals[trick.winnerId] += entry.card.getPointValue();
      }
    }

    return totals;
  }

  // Sets do not survive JSON serialization, so hand back a plain array.
  _serializeBiddingState() {
    if (!this.biddingState) return null;
    return {
      ...this.biddingState,
      passedPlayers: Array.from(this.biddingState.passedPlayers)
    };
  }

  getPublicState() {
    const pointsTaken = this._getPointsTakenByPlayer();
    const lastTrick = this.tricks[this.tricks.length - 1] || null;

    return {
      phase: this.phase,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        accountUserId: p.accountUserId,
        score: p.score,
        handSize: p.hand.length,
        isRevealed: p.isRevealed,
        isBot: p.isBot,
        pointsTaken: pointsTaken[p.id] ?? 0
      })),
      bidding: this._serializeBiddingState(),
      bidWinnerId: this.biddingState?.highestBidderId ?? null,
      bidAmount: this.biddingState?.highestBid ?? 0,
      trump: this.trump,
      roundCardIds: this.roundCardIds,
      // The called cards are public; only who holds them stays hidden.
      partnerCardIds: this.partnerCardIds,
      currentTurnPlayerId: this.getCurrentTurnPlayerId(),
      currentTrick: this.currentTrick,
      tricks: this.tricks,
      lastTrick,
      trickNumber: Math.min(this.tricks.length + (this.phase === 'TRICKS' ? 1 : 0), this.totalTricks),
      totalTricks: this.totalTricks,
      resultSummary: this.resultSummary,
      matchWinners: this.matchWinners,
      canReplay: this.phase === 'MATCH_END' && this.players.length >= 4
    };
  }

  // Tricks in a deal: 13 with 4 players, 10 with 5, 8 with 6.
  get totalTricks() {
    if (this.players.length === 0) return 0;
    return this.roundCardIds.length / this.players.length;
  }

  getPrivateState(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return {
      ...this.getPublicState(),
      playerId,
      hand: player ? player.hand : [],
      privateMessage: this.privateMessages.get(playerId) || null,
      // A player always knows their own allegiance, even while others don't.
      myRole: this.roles.get(playerId) || null
    };
  }
}
