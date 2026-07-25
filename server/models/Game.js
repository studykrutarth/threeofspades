import { Deck } from './Deck.js';
import { Player } from './Player.js';
import { initBiddingState, placeBid, isBiddingOver, getBidWinner } from '../engine/bidding.js';
import { validatePartnerSelection, assignPartners, notifyPartners, checkReveal, getTeamPoints } from '../engine/partners.js';
import { initTrick, playCard, isTrickComplete, determineTrickWinner } from '../engine/tricks.js';
import { resolveRound, applyScoreDeltas, getRoundSummary } from '../engine/scoring.js';

export class Game {
  constructor() {
    this.players = []; // Array of Player objects
    this.maxRounds = 10;
    this.round = 0;
    this.phase = 'LOBBY'; // LOBBY, DEALING, BIDDING, TRUMP_SELECTION, PARTNER_SELECTION, TRICKS, SCORING, MATCH_END
    this.dealerIndex = 0;
    this.matchWinners = [];
    
    // Round state
    this.biddingState = null;
    this.trump = null;
    this.partnerCardIds = [];
    this.roles = new Map(); // playerId -> role
    this.privateMessages = new Map(); // playerId -> message
    this.tricks = [];
    this.currentTrick = null;
    this.scoresHistory = [];
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

  startMatch() {
    if (this.phase !== 'LOBBY') throw new Error('Match already started');
    if (this.players.length < 4) throw new Error('Need at least 4 players to start');
    
    this.round = 0;
    this.scoresHistory = [];
    this.matchWinners = [];
    this.startRound();
  }

  startRound() {
    if (this.round >= this.maxRounds) {
      this.endMatch();
      return;
    }

    if (this.phase !== 'LOBBY' && this.phase !== 'SCORING') {
      throw new Error('Can only start a round from lobby or scoring');
    }

    this.round++;
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

  nextRound() {
    if (this.phase !== 'SCORING') {
      throw new Error('Can only advance after scoring');
    }

    if (this.round >= this.maxRounds) {
      this.endMatch();
      return;
    }

    this.startRound();
  }

  endMatch() {
    if (this.phase === 'MATCH_END') return;
    
    this.phase = 'MATCH_END';
    this.matchWinners = this.getMatchWinners();
    this.currentTrick = null;
    this.trump = null;
    this.partnerCardIds = [];
    this.roles.clear();
    this.privateMessages.clear();
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
      round: this.round,
      maxRounds: this.maxRounds,
      winners: this.matchWinners,
      players: this.players.map(p => ({
        id: p.id,
        accountUserId: p.accountUserId,
        name: p.name,
        score: p.score,
        isBot: p.isBot
      })),
      scoresHistory: this.scoresHistory
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
      
      // Check if all cards are played
      if (player.hand.length === 0) {
        this.phase = 'SCORING';
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
    
    const summary = getRoundSummary(this.round, winner.playerId, winner.amount, pointsCollected, this.roles, deltas);
    this.scoresHistory.push(summary);
    
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
  }

  _getNextPlayerId(currentPlayerId) {
    const idx = this.players.findIndex(p => p.id === currentPlayerId);
    return this.players[(idx + 1) % this.players.length].id;
  }

  getPublicState() {
    return {
      round: this.round,
      maxRounds: this.maxRounds,
      phase: this.phase,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        accountUserId: p.accountUserId,
        score: p.score,
        handSize: p.hand.length,
        isRevealed: p.isRevealed
      })),
      bidding: this.biddingState,
      trump: this.trump,
      roundCardIds: this.roundCardIds,
      currentTrick: this.currentTrick,
      tricks: this.tricks,
      lastRoundSummary: this.scoresHistory[this.scoresHistory.length - 1] || null,
      scoresHistory: this.scoresHistory,
      matchWinners: this.matchWinners,
      canAdvanceRound: this.phase === 'SCORING',
      isFinalScoring: this.phase === 'SCORING' && this.round >= this.maxRounds
    };
  }

  getPrivateState(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return {
      ...this.getPublicState(),
      playerId,
      hand: player ? player.hand : [],
      privateMessage: this.privateMessages.get(playerId) || null
    };
  }
}
