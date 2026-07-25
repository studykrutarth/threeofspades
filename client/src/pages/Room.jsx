import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';
import DeckSelector from '../components/DeckSelector';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLORS = { S: '#e2e8f0', H: '#ef4444', D: '#ef4444', C: '#e2e8f0' };

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { gameState, joinRoom, startMatch, nextRound, placeBid, selectTrump, selectPartners, playCard } = useGame();
  const { profile, loading } = useAuth();
  const [bidAmount, setBidAmount] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!profile?.username) {
      navigate('/');
      return;
    }
    joinRoom(id, profile.username);
    // joinRoom is intentionally omitted; this effect should only run when the room changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, profile, loading]);

  // ─── Loading ───
  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full animate-spin-slow"
             style={{ border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--color-gold-500)' }} />
        <p className="text-sm opacity-40">Connecting to room…</p>
      </div>
    );
  }

  const myHand = gameState.hand || [];
  const phase = gameState.phase;
  const myPlayer = gameState.players.find(p => p.id === gameState.playerId);
  const myIndex = myPlayer ? gameState.players.indexOf(myPlayer) : -1;
  const lastRoundSummary = gameState.lastRoundSummary;
  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);
  const matchWinners = gameState.matchWinners || [];
  const getPlayerName = (playerId) => gameState.players.find(p => p.id === playerId)?.name || 'Unknown';
  
  // Position players around the table
  const getPlayerPosition = (idx) => {
    const total = gameState.players.length;
    const angle = (idx * 360 / total - 90) * (Math.PI / 180);
    const radius = 200;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y };
  };

  // ─── Room Header ───
  const renderRoomHeader = () => (
    <div className="text-center mb-4">
      <div className="inline-block">
        <div className="flex items-center justify-center gap-3 px-4 py-2 rounded-lg mb-2"
             style={{ background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)' }}>
          <span className="text-xs font-semibold uppercase tracking-widest opacity-60">Room</span>
          <span className="text-xl font-bold tracking-widest" style={{ color: 'var(--color-gold-400)' }}>{id}</span>
          {gameState.trump && (
            <span className="text-lg ml-3" style={{ color: SUIT_COLORS[gameState.trump] }}>Trump: {SUIT_SYMBOLS[gameState.trump]}</span>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Bidding Panel (bottom modal) ───
  const renderBiddingPanel = () => {
    if (phase !== 'BIDDING') return null;
    const bs = gameState.bidding;

    return (
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 glass-panel p-5 min-w-80 animate-float-in">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Bidding Phase</h3>
          <div className="text-right">
            <span className="text-xs uppercase tracking-wider opacity-40">Current</span>
            <span className="text-xl font-extrabold ml-2" style={{ color: bs?.highestBid > 0 ? 'var(--color-gold-400)' : 'rgba(255,255,255,0.2)' }}>
              {bs?.highestBid || '—'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end mb-3">
          <input 
            type="number"
            value={bidAmount}
            onChange={e => setBidAmount(e.target.value)}
            placeholder="Enter bid"
            className="input-field text-sm flex-grow"
            min="1"
            max="310"
            step="5"
          />
          <button
            onClick={() => {
              const parsed = parseInt(bidAmount, 10);
              if (!Number.isFinite(parsed)) return;
              placeBid(parsed);
              setBidAmount('');
            }}
            disabled={!Number.isFinite(parseInt(bidAmount, 10))}
            className="btn-gold px-4 py-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Bid
          </button>
          <button onClick={() => placeBid('pass')} className="btn-ghost px-4 py-2 text-sm">
            Pass
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {[50, 100, 150, 200, 250, 310].map(val => (
            <button key={val} onClick={() => { placeBid(val); setBidAmount(''); }}
                    disabled={bs?.highestBid >= val}
                    className="px-2 py-1 rounded text-xs font-semibold transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {val}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ─── Trump Selection (center modal) ───
  const renderTrumpPanel = () => {
    if (phase !== 'TRUMP_SELECTION') return null;
    const suits = [
      { id: 'S', symbol: '♠', name: 'Spades', color: '#e2e8f0', bg: 'rgba(226,232,240,0.1)' },
      { id: 'H', symbol: '♥', name: 'Hearts', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      { id: 'D', symbol: '♦', name: 'Diamonds', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
      { id: 'C', symbol: '♣', name: 'Clubs', color: '#e2e8f0', bg: 'rgba(226,232,240,0.1)' },
    ];

    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="glass-panel p-6 min-w-96 animate-float-in pointer-events-auto">
          <h3 className="text-lg font-bold text-white mb-4" style={{ fontFamily: 'var(--font-heading)' }}>Choose Trump Suit</h3>
          <div className="grid grid-cols-4 gap-2">
            {suits.map(suit => (
              <button key={suit.id}
                      onClick={() => selectTrump(suit.id)}
                      className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all duration-200 hover:scale-105"
                      style={{ background: suit.bg, border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-3xl" style={{ color: suit.color }}>{suit.symbol}</span>
                <span className="text-[0.65rem] font-semibold opacity-60">{suit.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ─── Partner Selection ───
  const renderPartnerPanel = () => {
    if (phase !== 'PARTNER_SELECTION') return null;
    const myCardIds = myHand.map(c => c.id);
    return (
      <DeckSelector
        onSelect={selectPartners}
        excludeCards={myCardIds}
        allowedCardIds={gameState.roundCardIds || null}
        maxSelect={2}
      />
    );
  };

  const renderScoringPanel = () => {
    if (phase !== 'SCORING' || !lastRoundSummary) return null;

    const bidderName = getPlayerName(lastRoundSummary.bidWinnerId);
    const nextLabel = gameState.isFinalScoring ? 'Finish Match' : 'Next Round';

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-30 p-4">
        <div className="glass-panel p-6 w-full max-w-2xl animate-float-in">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-40 font-semibold">Round {lastRoundSummary.round} Complete</p>
              <h3 className="text-2xl font-extrabold text-white mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
                {lastRoundSummary.isSuccess ? 'Bid Team Made It' : 'Bid Team Fell Short'}
              </h3>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-widest opacity-40 font-semibold">Bid</p>
              <p className="text-3xl font-extrabold" style={{ color: 'var(--color-gold-400)' }}>{lastRoundSummary.bidAmount}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
            <div className="glass-panel-light p-4">
              <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Bidder</p>
              <p className="font-bold text-white">{bidderName}</p>
            </div>
            <div className="glass-panel-light p-4">
              <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Points Taken</p>
              <p className="font-bold text-white">{lastRoundSummary.pointsCollected}</p>
            </div>
            <div className="glass-panel-light p-4">
              <p className="text-xs uppercase tracking-wider opacity-40 mb-1">Match Round</p>
              <p className="font-bold text-white">{gameState.round}/{gameState.maxRounds}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {lastRoundSummary.deltas.map(({ id: playerId, delta }) => {
              const player = gameState.players.find(p => p.id === playerId);
              const role = lastRoundSummary.roles.find(r => r.id === playerId)?.role || 'opponent';
              return (
                <div key={playerId} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 bg-black/10">
                  <div>
                    <p className="font-semibold text-white">{player?.name || playerId}</p>
                    <p className="text-xs uppercase tracking-wider opacity-40">{role}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold" style={{ color: delta >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                      {delta >= 0 ? '+' : ''}{delta}
                    </p>
                    <p className="text-xs opacity-40">Total {player?.score ?? 0}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={nextRound} className="btn-gold w-full py-3">
            {nextLabel}
          </button>
        </div>
      </div>
    );
  };

  const renderMatchEndPanel = () => {
    if (phase !== 'MATCH_END') return null;

    const winnerText = matchWinners.map(winner => winner.name).join(', ');

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-30 p-4">
        <div className="glass-panel p-6 w-full max-w-2xl text-center animate-float-in">
          <p className="text-xs uppercase tracking-widest opacity-40 font-semibold">Match Complete</p>
          <h3 className="text-3xl font-extrabold text-white mt-2 mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            {winnerText || 'Final Scores'}
          </h3>
          {matchWinners.length > 0 && (
            <p className="text-sm opacity-50 mb-6">
              Winner{matchWinners.length > 1 ? 's' : ''} with {matchWinners[0].score} points
            </p>
          )}

          <div className="overflow-hidden rounded-lg mb-6 text-left" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            {sortedPlayers.map((player, idx) => (
              <div key={player.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 bg-black/10">
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: idx === 0 ? 'var(--color-gold-500)' : 'rgba(255,255,255,0.08)', color: idx === 0 ? 'var(--color-felt-900)' : 'white' }}>
                    {idx + 1}
                  </span>
                  <span className="font-semibold text-white">{player.name}</span>
                </div>
                <span className="font-extrabold" style={{ color: player.score >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                  {player.score >= 0 ? '+' : ''}{player.score}
                </span>
              </div>
            ))}
          </div>

          <button onClick={() => navigate('/lobby')} className="btn-primary w-full py-3">
            Back to Lobby
          </button>
        </div>
      </div>
    );
  };

  // ─── Main Table Layout ───
  return (
    <div className="w-full h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--color-felt-900)' }}>
      {renderRoomHeader()}

      {/* Main Table Container */}
      <div className="flex-1 flex items-center justify-center relative">
        
        {/* Outer table border */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[90%] h-[90%] rounded-[50%] border-8" style={{ borderColor: 'var(--color-gold-500)', background: '#1a5f3f' }}>
            {/* Inner felt */}
            <div className="w-full h-full rounded-[50%] flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, #2d8659 0%, #1a5f3f 100%)' }}>
              
              {/* Deck area - top */}
              <div className="absolute top-12 flex flex-col items-center gap-2">
                <div className="flex gap-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="w-16 h-24 rounded border-2 border-white/20" 
                         style={{ background: 'rgba(255,255,255,0.05)', transform: `rotate(${(i-2)*3}deg)` }} />
                  ))}
                </div>
                <span className="text-xs opacity-40 uppercase tracking-widest">Deck</span>
              </div>

              {/* Trick area - center */}
              <div className="flex flex-col items-center gap-3">
                {gameState.currentTrick?.cards?.length > 0 ? (
                  <div className="flex gap-4 justify-center flex-wrap w-48">
                    {gameState.currentTrick.cards.map((play, idx) => (
                      <div key={idx} className="flex flex-col items-center gap-2">
                        <PlayingCard card={play.card} size="md" isPlayable={false} />
                        <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded opacity-70"
                              style={{ background: 'rgba(0,0,0,0.3)' }}>
                          {gameState.players.find(p => p.id === play.playerId)?.name}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : phase === 'TRICKS' || phase === 'SCORING' ? (
                  <div className="text-center opacity-20">
                    <div className="text-4xl mb-2">♠ ♥ ♦ ♣</div>
                  </div>
                ) : null}
              </div>

              {/* Players positioned around table */}
              {gameState.players.map((player, idx) => {
                const pos = getPlayerPosition(idx);
                const isYou = idx === myIndex;
                return (
                  <div
                    key={player.id}
                    className="absolute w-24 text-center transition-all"
                    style={{
                      transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                      left: '50%',
                      top: '50%'
                    }}
                  >
                    <div className={`rounded-lg p-2 transition-all ${isYou ? 'ring-2 ring-gold-500' : ''}`}
                         style={{ background: 'rgba(0,0,0,0.4)', borderColor: isYou ? 'var(--color-gold-500)' : 'rgba(255,255,255,0.1)', border: '1px solid' }}>
                      <div className="w-12 h-12 rounded-full mx-auto mb-1 flex items-center justify-center text-xs font-bold text-white"
                           style={{ background: `linear-gradient(135deg, hsl(${(idx * 60) + 340}, 70%, 45%), hsl(${(idx * 60) + 360}, 60%, 35%))` }}>
                        {player.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <p className="text-[0.6rem] font-semibold opacity-80 truncate">{player.name}</p>
                      <p className="text-xs font-bold" style={{ color: player.score >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                        {player.score >= 0 ? '+' : ''}{player.score}
                      </p>
                      <p className="text-[0.5rem] opacity-40">{player.handSize} cards</p>
                      {player.isRevealed && (
                        <p className="text-[0.5rem] font-bold" style={{ color: 'var(--color-gold-400)' }}>Partner ★</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modals */}
        {renderBiddingPanel()}
        {renderTrumpPanel()}
        {renderPartnerPanel()}
        {renderScoringPanel()}
        {renderMatchEndPanel()}

        {/* Lobby message */}
        {phase === 'LOBBY' && (
          <div className="glass-panel p-8 text-center max-w-sm animate-float-in relative z-10">
            <div className="text-5xl mb-4 opacity-10">♠ ♥ ♦ ♣</div>
            <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              Waiting for Players
            </h3>
            <p className="text-sm opacity-40 mb-4">
              Share the room code <span className="font-bold tracking-wider" style={{ color: 'var(--color-gold-400)' }}>{id}</span> with your friends.
            </p>
            <div className="text-sm mb-4">
              <span className="opacity-60">{gameState.players.length}/6 Players</span>
            </div>
            {gameState.players.length >= 4 && (
              <button onClick={startMatch} className="btn-primary w-full py-3">
                Start Match
              </button>
            )}
          </div>
        )}
      </div>

      {/* Player Hand - bottom */}
      {(phase === 'TRICKS' || phase === 'BIDDING' || phase === 'TRUMP_SELECTION' || phase === 'PARTNER_SELECTION') && (
        <div className="relative z-20 bg-black/30 backdrop-blur-sm border-t border-white/10 p-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-center gap-2 overflow-x-auto pb-3">
              {phase === 'PARTNER_SELECTION' && myHand.length === 0 ? (
                <div className="text-sm opacity-40">Waiting for bid winner to select partners...</div>
              ) : (
                myHand.map((card) => (
                  <div
                    key={card.id}
                    onClick={() => {
                      if (phase === 'TRICKS') playCard(card.id);
                    }}
                    className="transition-transform duration-300 cursor-pointer hover:scale-110"
                  >
                    <PlayingCard card={card} size="md" isPlayable={phase === 'TRICKS'} />
                  </div>
                ))
              )}
            </div>
            {myHand.length > 0 && phase === 'TRICKS' && (
              <div className="text-center text-xs opacity-40">Click a card to play</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
