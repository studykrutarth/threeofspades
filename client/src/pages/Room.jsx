import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useAuth } from '../context/AuthContext';
import PlayingCard from '../components/PlayingCard';
import DeckSelector from '../components/DeckSelector';
import {
  SUIT_SYMBOLS,
  SUIT_NAMES,
  getCardPoints,
  getTrickPoints,
  getLegalCardIds,
  parseCardId,
  isRedSuit
} from '../lib/cards';

const SUIT_COLORS = { S: '#e2e8f0', H: '#ef4444', D: '#ef4444', C: '#e2e8f0' };

const PHASE_LABELS = {
  LOBBY: 'Waiting for players',
  DEALING: 'Dealing',
  BIDDING: 'Bidding',
  TRUMP_SELECTION: 'Choosing trump',
  PARTNER_SELECTION: 'Calling partners',
  TRICKS: 'Playing tricks',
  MATCH_END: 'Match complete'
};

const ROLE_STYLES = {
  bidder: { label: 'Bid Winner', color: 'var(--color-gold-400)', bg: 'rgba(212,168,67,0.15)' },
  partner: { label: 'Hidden Partner', color: 'var(--color-emerald-500)', bg: 'rgba(16,185,129,0.15)' },
  opponent: { label: 'Opponent', color: 'var(--color-ruby-400)', bg: 'rgba(239,71,111,0.15)' }
};

export default function Room() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { gameState, joinRoom, startMatch, placeBid, selectTrump, selectPartners, playCard } = useGame();
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

  const {
    phase,
    players,
    hand: myHand = [],
    playerId,
    currentTurnPlayerId,
    currentTrick,
    lastTrick,
    trump,
    bidding,
    bidWinnerId,
    bidAmount: highestBid,
    confirmedTeamPoints = 0,
    partnerCardIds = [],
    privateMessage,
    myRole,
    resultSummary,
    matchWinners = [],
    trickNumber,
    totalTricks,
    canReplay
  } = gameState;

  const myPlayer = players.find(p => p.id === playerId);
  const myIndex = myPlayer ? players.indexOf(myPlayer) : -1;
  const isMyTurn = currentTurnPlayerId === playerId;
  const nameOf = (pid) => players.find(p => p.id === pid)?.name || 'Unknown';
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  // Every card that has hit the table this round, so called cards can be marked as spent.
  const playedCardIds = new Set();
  for (const trick of gameState.tricks || []) {
    for (const entry of trick.cards) playedCardIds.add(entry.card.id);
  }
  for (const entry of currentTrick?.cards || []) playedCardIds.add(entry.card.id);

  const leadSuit = currentTrick?.leadSuit || null;
  const legalCardIds = new Set(
    phase === 'TRICKS' ? getLegalCardIds(myHand, leadSuit) : myHand.map(c => c.id)
  );

  const passedPlayers = bidding?.passedPlayers || [];
  const minimumBid = (highestBid || 0) + 1;

  // Opponents in clockwise turn order starting after you; your own seat is the
  // hand bar below, which keeps the middle of the felt clear for the trick.
  const opponents = myIndex >= 0
    ? players.slice(myIndex + 1).concat(players.slice(0, myIndex))
    : players;

  // Spread them across the top arc: first to act on the left, last on the right.
  // Radii stay clear of the felt edges so a seat's card fan is never clipped.
  const seatPosition = (i) => {
    const count = opponents.length;
    const degrees = count === 1 ? 270 : 180 + (i * 180) / (count - 1);
    const angle = degrees * (Math.PI / 180);
    return {
      x: Math.cos(angle) * 38,
      y: Math.sin(angle) * 22,
      // Turn each hand to face its own seat — 90° on the left, 180° straight
      // across, 270° on the right, with 5 and 6 players landing in between.
      rotation: degrees - 90
    };
  };

  // Every fan is the same shape and simply rotates, so seats stay identical in
  // size. The exact card count is spelled out underneath each seat.
  const FANNED_BACKS = 5;

  // ─── Header ───
  const renderHeader = () => (
    <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 shrink-0">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
           style={{ background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)' }}>
        <span className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-50">Room</span>
        <span className="text-base font-bold tracking-widest" style={{ color: 'var(--color-gold-400)' }}>{id}</span>
      </div>

      <div className="px-3 py-1.5 rounded-lg glass-panel-light">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-gold-300)' }}>
          {PHASE_LABELS[phase] || phase}
        </span>
      </div>

      {trump && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
             style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-50">Trump</span>
          <span className="text-lg leading-none" style={{ color: SUIT_COLORS[trump] }}>{SUIT_SYMBOLS[trump]}</span>
          <span className="text-xs font-semibold opacity-70">{SUIT_NAMES[trump]}</span>
        </div>
      )}

      {phase === 'TRICKS' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-panel-light">
          <span className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-50">Trick</span>
          <span className="text-base font-bold text-white">{trickNumber}/{totalTricks}</span>
        </div>
      )}

      {bidWinnerId && phase !== 'BIDDING' && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
             style={{ background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.2)' }}>
          <span className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-50">Contract</span>
          <span className="text-xs font-bold" style={{ color: 'var(--color-gold-400)' }}>
            {nameOf(bidWinnerId)} · {highestBid}
          </span>
        </div>
      )}

      {phase === 'TRICKS' && bidWinnerId && (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
             style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <span className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-50">Bid team</span>
          <span className="text-base font-bold" style={{ color: 'var(--color-emerald-500)' }}>
            {confirmedTeamPoints}
          </span>
          <span className="text-xs opacity-40">/ {highestBid}</span>
        </div>
      )}

      {/* Called cards live in the sidebar on wide screens; keep them visible here otherwise */}
      {partnerCardIds.length > 0 && (
        <div className="lg:hidden flex items-center gap-2 px-3 py-1.5 rounded-lg glass-panel-light">
          <span className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-50">Called</span>
          {partnerCardIds.map(cardId => {
            const card = parseCardId(cardId);
            const isPlayed = playedCardIds.has(cardId);
            return (
              <span key={cardId} className="text-xs font-bold"
                    style={{ color: SUIT_COLORS[card.suit], opacity: isPlayed ? 0.45 : 1 }}>
                {card.rank}{SUIT_SYMBOLS[card.suit]}{isPlayed ? ' ✓' : ''}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Turn banner ───
  const renderTurnBanner = () => {
    if (!currentTurnPlayerId || phase === 'LOBBY' || phase === 'MATCH_END') return null;

    const actionWord = {
      BIDDING: 'to bid',
      TRUMP_SELECTION: 'to choose trump',
      PARTNER_SELECTION: 'to call partners',
      TRICKS: 'to play'
    }[phase] || '';

    return (
      <div className="flex justify-center px-4 pb-2 shrink-0">
        <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${isMyTurn ? 'animate-pulse-glow' : ''}`}
             style={{
               background: isMyTurn ? 'linear-gradient(135deg, var(--color-gold-500), #c4952e)' : 'rgba(255,255,255,0.06)',
               color: isMyTurn ? 'var(--color-felt-900)' : '#94a3b8',
               border: isMyTurn ? 'none' : '1px solid rgba(255,255,255,0.1)'
             }}>
          <span className="w-2 h-2 rounded-full"
                style={{ background: isMyTurn ? 'var(--color-felt-900)' : 'var(--color-gold-400)' }} />
          {isMyTurn ? `Your turn ${actionWord}` : `${nameOf(currentTurnPlayerId)}'s turn ${actionWord}…`}
        </div>
      </div>
    );
  };

  // ─── Private partner notice ───
  const renderPrivateNotice = () => {
    if (!privateMessage && !myRole) return null;
    const role = ROLE_STYLES[myRole];

    return (
      <div className="flex justify-center px-4 pb-2 shrink-0">
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg max-w-2xl"
             style={{ background: role?.bg || 'rgba(255,255,255,0.05)', border: `1px solid ${role?.color || 'rgba(255,255,255,0.1)'}33` }}>
          {role && (
            <span className="text-[0.6rem] font-extrabold uppercase tracking-widest px-2 py-1 rounded shrink-0"
                  style={{ background: role.color, color: 'var(--color-felt-900)' }}>
              You are {role.label}
            </span>
          )}
          {privateMessage && (
            <span className="text-xs" style={{ color: role?.color || '#e2e8f0' }}>
              {privateMessage.message}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ─── Sidebar: called cards, standings, last trick ───
  const renderSidebar = () => {
    if (phase === 'LOBBY') return null;

    return (
      <aside className="hidden lg:block w-64 shrink-0 space-y-3 overflow-y-auto px-3 pb-3">
        {/* Called partner cards */}
        {partnerCardIds.length > 0 && (
          <div className="glass-panel p-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-40 mb-2">Called Cards</p>
            <div className="flex gap-2">
              {partnerCardIds.map(cardId => {
                const card = parseCardId(cardId);
                const isPlayed = playedCardIds.has(cardId);
                return (
                  <div key={cardId} className="flex flex-col items-center gap-1">
                    <PlayingCard card={card} size="xs" isPlayable={false} dimmed={isPlayed} />
                    <span className="text-[0.5rem] uppercase tracking-wide font-semibold"
                          style={{ color: isPlayed ? 'var(--color-emerald-500)' : 'rgba(255,255,255,0.35)' }}>
                      {isPlayed ? 'Revealed' : 'Hidden'}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="text-[0.6rem] opacity-35 mt-2 leading-snug">
              Whoever holds these plays with the bid winner.
            </p>
          </div>
        )}

        {/* How close the bid team is, counting only what the table can see */}
        {phase === 'TRICKS' && bidWinnerId && (
          <div className="glass-panel p-3">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-40">Bid Progress</p>
              <p className="text-sm font-bold">
                <span style={{ color: 'var(--color-emerald-500)' }}>{confirmedTeamPoints}</span>
                <span className="opacity-40"> / {highestBid}</span>
              </p>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-300"
                   style={{
                     width: `${Math.min(100, highestBid ? (confirmedTeamPoints / highestBid) * 100 : 0)}%`,
                     background: 'linear-gradient(90deg, var(--color-emerald-600), var(--color-emerald-500))'
                   }} />
            </div>
            <p className="text-[0.6rem] opacity-35 mt-2 leading-snug">
              Counts the bid winner and revealed partners only. A hidden partner&apos;s
              points stay off this tally until they play a called card. The match
              ends the moment this reaches {highestBid}.
            </p>
          </div>
        )}

        {/* Standings + points taken this round */}
        <div className="glass-panel p-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-40 mb-2">
            Standings {phase === 'TRICKS' && <span className="opacity-60">· pts this round</span>}
          </p>
          <div className="space-y-1">
            {sortedPlayers.map(player => (
              <div key={player.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded"
                   style={{ background: player.id === playerId ? 'rgba(212,168,67,0.1)' : 'transparent' }}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold truncate"
                        style={{ color: player.id === playerId ? 'var(--color-gold-300)' : '#e2e8f0' }}>
                    {player.name}
                  </span>
                  {player.id === bidWinnerId && <span className="text-[0.6rem]" title="Bid winner">👑</span>}
                  {player.isRevealed && <span className="text-[0.6rem]" style={{ color: 'var(--color-emerald-500)' }}>★</span>}
                  {player.isBot && <span className="text-[0.5rem] opacity-40 uppercase">bot</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {phase === 'TRICKS' && player.pointsTaken > 0 && (
                    <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--color-emerald-500)' }}>
                      +{player.pointsTaken}
                    </span>
                  )}
                  <span className="text-xs font-bold"
                        style={{ color: player.score >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                    {player.score >= 0 ? '+' : ''}{player.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Last completed trick */}
        {lastTrick && phase === 'TRICKS' && (
          <div className="glass-panel p-3">
            <p className="text-[0.6rem] font-semibold uppercase tracking-widest opacity-40 mb-2">Last Trick</p>
            <div className="flex gap-1 flex-wrap mb-2">
              {lastTrick.cards.map((entry, i) => (
                <PlayingCard key={i} card={entry.card} size="xs" isPlayable={false}
                             highlight={entry.playerId === lastTrick.winnerId} />
              ))}
            </div>
            <p className="text-[0.65rem]">
              <span className="font-bold" style={{ color: 'var(--color-emerald-500)' }}>{nameOf(lastTrick.winnerId)}</span>
              <span className="opacity-50"> took it · </span>
              <span className="font-bold" style={{ color: 'var(--color-gold-400)' }}>{getTrickPoints(lastTrick.cards)} pts</span>
            </p>
          </div>
        )}
      </aside>
    );
  };

  // ─── Bidding panel ───
  const renderBiddingPanel = () => {
    if (phase !== 'BIDDING') return null;

    return (
      <div className="glass-panel p-4 w-full max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <span className="text-[0.6rem] uppercase tracking-widest opacity-40 font-semibold">Highest Bid</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-extrabold"
                    style={{ color: highestBid > 0 ? 'var(--color-gold-400)' : 'rgba(255,255,255,0.2)' }}>
                {highestBid > 0 ? highestBid : '—'}
              </span>
              {bidWinnerId && (
                <span className="text-xs opacity-60">by {nameOf(bidWinnerId)}</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[0.6rem] uppercase tracking-widest opacity-40 font-semibold">Min next bid</span>
            <p className="text-lg font-bold text-white">{minimumBid}</p>
          </div>
        </div>

        {passedPlayers.length > 0 && (
          <p className="text-[0.65rem] opacity-45 mb-3">
            Passed: {passedPlayers.map(nameOf).join(', ')}
            <span className="opacity-70"> (may re-enter with a higher bid)</span>
          </p>
        )}

        <fieldset disabled={!isMyTurn} className={isMyTurn ? '' : 'opacity-40 pointer-events-none'}>
          <div className="flex flex-wrap gap-2 items-end mb-3">
            <input
              type="number"
              value={bidAmount}
              onChange={e => setBidAmount(e.target.value)}
              placeholder={`${minimumBid} or more`}
              className="input-field text-sm flex-grow"
              min={minimumBid}
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
              disabled={!Number.isFinite(parseInt(bidAmount, 10)) || parseInt(bidAmount, 10) < minimumBid}
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
                      disabled={val < minimumBid}
                      className="px-2 py-1 rounded text-xs font-semibold transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {val}
              </button>
            ))}
          </div>
        </fieldset>

        <p className="text-[0.6rem] opacity-35 mt-3 leading-snug">
          310 points are in play. Win at least your bid with your hidden partners to score {highestBid > 0 ? highestBid * 2 : '2×'} — miss it and you lose your bid.
        </p>
      </div>
    );
  };

  // ─── Trump selection ───
  const renderTrumpPanel = () => {
    if (phase !== 'TRUMP_SELECTION') return null;

    if (playerId !== bidWinnerId) {
      return (
        <div className="glass-panel p-5 text-center max-w-md mx-auto">
          <p className="text-sm opacity-60">
            <span className="font-bold" style={{ color: 'var(--color-gold-400)' }}>{nameOf(bidWinnerId)}</span> won the bid at{' '}
            <span className="font-bold" style={{ color: 'var(--color-gold-400)' }}>{highestBid}</span> and is choosing trump…
          </p>
        </div>
      );
    }

    return (
      <div className="glass-panel p-5 max-w-md mx-auto">
        <h3 className="text-base font-bold text-white mb-1" style={{ fontFamily: 'var(--font-heading)' }}>Choose Trump Suit</h3>
        <p className="text-xs opacity-40 mb-4">You won the bid at {highestBid}. Trump beats every other suit.</p>
        <div className="grid grid-cols-4 gap-2">
          {['S', 'H', 'D', 'C'].map(suit => {
            const inHand = myHand.filter(c => c.suit === suit).length;
            return (
              <button key={suit}
                      onClick={() => selectTrump(suit)}
                      className="flex flex-col items-center gap-1 p-3 rounded-lg transition-all duration-200 hover:scale-105"
                      style={{ background: isRedSuit(suit) ? 'rgba(239,68,68,0.1)' : 'rgba(226,232,240,0.1)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-3xl" style={{ color: SUIT_COLORS[suit] }}>{SUIT_SYMBOLS[suit]}</span>
                <span className="text-[0.65rem] font-semibold opacity-60">{SUIT_NAMES[suit]}</span>
                <span className="text-[0.6rem] font-bold" style={{ color: 'var(--color-gold-400)' }}>{inHand} in hand</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // ─── Partner selection ───
  const renderPartnerPanel = () => {
    if (phase !== 'PARTNER_SELECTION') return null;

    if (playerId !== bidWinnerId) {
      return (
        <div className="glass-panel p-5 text-center max-w-md mx-auto">
          <p className="text-sm opacity-60">
            <span className="font-bold" style={{ color: 'var(--color-gold-400)' }}>{nameOf(bidWinnerId)}</span> is calling two partner cards…
          </p>
          <p className="text-xs opacity-35 mt-2">If you hold one, you&apos;ll be told privately.</p>
        </div>
      );
    }

    return (
      <DeckSelector
        onSelect={selectPartners}
        excludeCards={myHand.map(c => c.id)}
        allowedCardIds={gameState.roundCardIds || null}
        maxSelect={2}
      />
    );
  };

  // ─── Match result: the deal is spent, so this is both the bid outcome and the final table ───
  const renderMatchEndPanel = () => {
    if (phase !== 'MATCH_END') return null;

    const diff = resultSummary ? resultSummary.pointsCollected - resultSummary.bidAmount : 0;
    const winnerText = matchWinners.map(w => w.name).join(', ');

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-30 p-4">
        <div className="glass-panel p-6 w-full max-w-2xl animate-float-in max-h-full overflow-y-auto">
          {resultSummary ? (
            <>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-widest opacity-40 font-semibold">
                    {resultSummary.endedEarly
                      ? `Called after ${resultSummary.tricksPlayed} of ${resultSummary.totalTricks} tricks`
                      : 'All cards played'}
                  </p>
                  <h3 className="text-2xl font-extrabold text-white mt-1" style={{ fontFamily: 'var(--font-heading)' }}>
                    {resultSummary.isSuccess ? 'Bid Team Made It' : 'Bid Team Fell Short'}
                  </h3>
                  <p className="text-xs opacity-50 mt-1">
                    {nameOf(resultSummary.bidWinnerId)} needed {resultSummary.bidAmount}, took {resultSummary.pointsCollected}
                    <span style={{ color: diff >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                      {' '}({diff >= 0 ? '+' : ''}{diff})
                    </span>
                    <span className="opacity-60"> of 310</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs uppercase tracking-widest opacity-40 font-semibold">Bid</p>
                  <p className="text-3xl font-extrabold" style={{ color: 'var(--color-gold-400)' }}>{resultSummary.bidAmount}</p>
                </div>
              </div>

              {resultSummary.endedEarly && (
                <p className="text-xs mb-4 px-3 py-2 rounded-lg leading-snug"
                   style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#86efac' }}>
                  The bid winner and revealed partners had already taken {resultSummary.confirmedPoints} points,
                  so the result was settled with cards still in hand.
                </p>
              )}

              {/* Where the bid team's points came from */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {[
                  { label: 'Bid winner', value: resultSummary.bidderPoints, color: 'var(--color-gold-400)' },
                  { label: 'Revealed partners', value: resultSummary.revealedPartnerPoints, color: 'var(--color-emerald-500)' },
                  { label: 'Hidden partners', value: resultSummary.hiddenPartnerPoints, color: '#c084fc' },
                  { label: 'Opponents', value: resultSummary.opponentPoints, color: 'var(--color-ruby-400)' }
                ].map(cell => (
                  <div key={cell.label} className="glass-panel-light p-2 text-center">
                    <p className="text-[0.55rem] uppercase tracking-wider opacity-40 leading-tight">{cell.label}</p>
                    <p className="text-lg font-extrabold" style={{ color: cell.color }}>{cell.value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-lg mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                {sortedPlayers.map((player, idx) => {
                  const delta = resultSummary.deltas.find(d => d.id === player.id)?.delta ?? 0;
                  const role = resultSummary.roles.find(r => r.id === player.id)?.role || 'opponent';
                  const roleStyle = ROLE_STYLES[role];
                  const isWinner = matchWinners.some(w => w.id === player.id);
                  return (
                    <div key={player.id} className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 bg-black/10">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                              style={{ background: isWinner ? 'var(--color-gold-500)' : 'rgba(255,255,255,0.08)', color: isWinner ? 'var(--color-felt-900)' : 'white' }}>
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">
                            {player.name}
                            {player.id === playerId && <span className="text-xs opacity-50"> (you)</span>}
                          </p>
                          <p className="text-[0.65rem] uppercase tracking-wider font-semibold" style={{ color: roleStyle?.color }}>
                            {roleStyle?.label || role} · {player.pointsTaken} pts taken
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold" style={{ color: delta > 0 ? 'var(--color-emerald-500)' : delta < 0 ? 'var(--color-ruby-400)' : 'rgba(255,255,255,0.3)' }}>
                          {delta > 0 ? '+' : ''}{delta}
                        </p>
                        <p className="text-xs opacity-40">Final {player.score}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-center text-sm mb-4">
                <span className="opacity-50">Winner{matchWinners.length > 1 ? 's' : ''}: </span>
                <span className="font-bold" style={{ color: 'var(--color-gold-400)' }}>{winnerText}</span>
              </p>
            </>
          ) : (
            <p className="text-center text-sm opacity-50 mb-5">The match ended before a deal was played.</p>
          )}

          <div className="flex gap-3">
            <button onClick={() => navigate('/lobby')} className="btn-ghost flex-1 py-3">Back to Lobby</button>
            {canReplay && (
              <button onClick={startMatch} className="btn-gold flex-1 py-3">Play Again</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ─── Table ───
  const renderTable = () => (
    <div className="flex-1 min-h-0 flex flex-col w-full max-w-[78rem] mx-auto m-3 rounded-[2rem] overflow-hidden"
         style={{ background: 'radial-gradient(ellipse at center, #2d8659 0%, #1a5f3f 75%)', border: '6px solid var(--color-gold-500)' }}>

      {/* Seats + trick live up top; the hand occupies the felt below them */}
      <div className="relative flex-1 min-h-[13rem]">

      {/* Trick sits in the lower half — the top arc belongs to the opponent seats */}
      <div className="absolute inset-x-0 bottom-0 top-[38%] flex flex-col items-center justify-center gap-2 pointer-events-none px-4 pb-3">
        {currentTrick?.cards?.length > 0 ? (
          <>
            {leadSuit && (
              <span className="text-[0.6rem] uppercase tracking-widest font-semibold px-2 py-0.5 rounded"
                    style={{ background: 'rgba(0,0,0,0.35)', color: SUIT_COLORS[leadSuit] }}>
                Lead {SUIT_SYMBOLS[leadSuit]}
              </span>
            )}
            <div className="flex gap-3 justify-center flex-wrap max-w-md">
              {currentTrick.cards.map((play, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <PlayingCard card={play.card} size="sm" isPlayable={false} />
                  <span className="text-[0.6rem] font-semibold px-2 py-0.5 rounded"
                        style={{ background: 'rgba(0,0,0,0.4)', color: play.playerId === playerId ? 'var(--color-gold-300)' : '#e2e8f0' }}>
                    {nameOf(play.playerId)}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.35)', color: 'var(--color-gold-400)' }}>
              {getTrickPoints(currentTrick.cards)} pts on the table
            </span>
          </>
        ) : phase === 'TRICKS' ? (
          <div className="text-center opacity-25">
            <div className="text-3xl mb-1">♠ ♥ ♦ ♣</div>
            <p className="text-[0.65rem] uppercase tracking-widest">
              {isMyTurn ? 'Lead a card' : `${nameOf(currentTurnPlayerId)} leads`}
            </p>
          </div>
        ) : null}
      </div>

      {/* Opponent seats around the top arc */}
      {opponents.map((player, i) => {
        const pos = seatPosition(i);
        const isActive = player.id === currentTurnPlayerId;
        const hue = (players.findIndex(p => p.id === player.id) * 67) + 340;
        return (
          <div key={player.id}
               className="absolute text-center"
               style={{
                 left: `calc(50% + ${pos.x}%)`,
                 top: `calc(50% + ${pos.y}%)`,
                 transform: 'translate(-50%, -50%)'
               }}>
            <div className={`rounded-lg px-1.5 py-1 transition-all ${isActive ? 'animate-pulse-glow' : ''}`}
                 style={{
                   background: 'rgba(0,0,0,0.55)',
                   border: `2px solid ${isActive ? 'var(--color-gold-500)' : 'rgba(255,255,255,0.1)'}`
                 }}>
              {/* Identity on one line so the seat stays short enough to fit the felt */}
              <div className="flex items-center justify-center gap-1.5 px-0.5">
                <div className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[0.6rem] font-bold text-white"
                     style={{ background: `linear-gradient(135deg, hsl(${hue}, 70%, 45%), hsl(${hue + 20}, 60%, 35%))` }}>
                  {player.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="text-left leading-tight min-w-0">
                  <p className="text-[0.6rem] font-semibold truncate max-w-[5.5rem]">{player.name}</p>
                  <p className="text-[0.55rem] leading-tight">
                    <span style={{ color: player.score >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                      {player.score >= 0 ? '+' : ''}{player.score}
                    </span>
                    <span className="opacity-40"> · {player.handSize} cards</span>
                  </p>
                </div>
                {player.id === bidWinnerId && <span className="text-[0.6rem] shrink-0">👑</span>}
                {player.isRevealed && (
                  <span className="text-[0.6rem] font-bold shrink-0" style={{ color: 'var(--color-emerald-500)' }}>★</span>
                )}
              </div>

              {/* Their hand, face down — big enough for the back art to read.
                  Square box so the fan keeps one footprint whatever angle it sits at. */}
              {player.handSize > 0 && (
                <div className="relative w-36 h-36 mx-auto" title={`${player.handSize} cards`}>
                  <div className="absolute top-1/2 left-1/2 flex"
                       style={{ transform: `translate(-50%, -50%) rotate(${pos.rotation}deg)` }}>
                    {Array.from({ length: Math.min(player.handSize, FANNED_BACKS) }).map((_, idx) => (
                      <div key={idx} className="shrink-0"
                           style={idx === 0 ? undefined : { marginLeft: '-1.5rem' }}>
                        <PlayingCard size="xs" isPlayable={false} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-center gap-1.5 leading-tight min-h-[0.85rem]">
                {phase === 'TRICKS' && player.pointsTaken > 0 && (
                  <span className="text-[0.55rem] font-bold" style={{ color: 'var(--color-gold-400)' }}>
                    {player.pointsTaken} pts
                  </span>
                )}
                {phase === 'BIDDING' && passedPlayers.includes(player.id) && (
                  <span className="text-[0.5rem] font-bold opacity-40">PASSED</span>
                )}
              </div>
            </div>
          </div>
        );
      })}

        {/* Bidding / trump / partner panels float over the seats and trick */}
        {(phase === 'BIDDING' || phase === 'TRUMP_SELECTION' || phase === 'PARTNER_SELECTION') && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-3 overflow-y-auto pointer-events-none">
            <div className="w-full max-w-xl pointer-events-auto my-auto">
              {renderBiddingPanel()}
              {renderTrumpPanel()}
              {renderPartnerPanel()}
            </div>
          </div>
        )}
      </div>

      {renderHand()}
    </div>
  );

  // ─── Hand ───
  const renderHand = () => {
    const showHand = ['BIDDING', 'TRUMP_SELECTION', 'PARTNER_SELECTION', 'TRICKS'].includes(phase);
    if (!showHand) return null;

    const handPoints = myHand.reduce((sum, c) => sum + getCardPoints(c), 0);

    return (
      <div className="relative z-10 shrink-0 px-4 pt-2 pb-3"
           style={{ background: 'rgba(0,0,0,0.42)', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-2 text-[0.6rem] uppercase tracking-widest flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold" style={{ color: 'var(--color-gold-300)' }}>
                {myPlayer?.name || 'You'}
              </span>
              {myRole && (
                <span className="px-1.5 py-0.5 rounded font-bold"
                      style={{ background: ROLE_STYLES[myRole].bg, color: ROLE_STYLES[myRole].color }}>
                  {ROLE_STYLES[myRole].label}
                </span>
              )}
              <span style={{ color: (myPlayer?.score ?? 0) >= 0 ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                {(myPlayer?.score ?? 0) >= 0 ? '+' : ''}{myPlayer?.score ?? 0}
              </span>
              {phase === 'TRICKS' && (myPlayer?.pointsTaken ?? 0) > 0 && (
                <span className="font-bold" style={{ color: 'var(--color-gold-400)' }}>
                  {myPlayer.pointsTaken} pts taken
                </span>
              )}
              <span className="opacity-40 font-semibold">
                · {myHand.length} cards · {handPoints} pts in hand
              </span>
            </div>
            {phase === 'TRICKS' && leadSuit && (
              <span className="font-semibold" style={{ color: SUIT_COLORS[leadSuit] }}>
                Must follow {SUIT_SYMBOLS[leadSuit]} if you can
              </span>
            )}
          </div>

          <div className="flex items-end justify-center overflow-x-auto pb-2 pt-3 px-6">
            {myHand.length === 0 ? (
              <p className="text-sm opacity-40 py-6">Waiting for the next deal…</p>
            ) : (
              myHand.map((card, i) => {
                const isLegal = legalCardIds.has(card.id);
                const playable = phase === 'TRICKS' && isMyTurn && isLegal;
                return (
                  <div
                    key={card.id}
                    className="hand-card shrink-0 relative"
                    // Overlap so only each card's index corner shows, the way a
                    // real hand fans. Later cards sit on top of earlier ones.
                    style={{ marginLeft: i === 0 ? 0 : '-2.5rem', zIndex: i }}
                  >
                    <PlayingCard
                      card={card}
                      size="md"
                      isPlayable={playable}
                      dimmed={phase === 'TRICKS' && !isLegal}
                      onClick={playable ? () => playCard(card.id) : undefined}
                    />
                  </div>
                );
              })
            )}
          </div>

          {phase === 'TRICKS' && (
            <p className="text-center text-[0.65rem] opacity-40">
              {isMyTurn ? 'Click a card to play it' : `Waiting for ${nameOf(currentTurnPlayerId)}…`}
            </p>
          )}
        </div>
      </div>
    );
  };

  // ─── Lobby ───
  const renderLobby = () => {
    if (phase !== 'LOBBY') return null;
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="glass-panel p-8 text-center max-w-sm animate-float-in">
          <div className="text-4xl mb-4 opacity-20">♠ ♥ ♦ ♣</div>
          <h3 className="text-xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Waiting for Players
          </h3>
          <p className="text-sm opacity-40 mb-4">
            Share the room code <span className="font-bold tracking-wider" style={{ color: 'var(--color-gold-400)' }}>{id}</span> with your friends.
          </p>

          <div className="space-y-1 mb-5">
            {players.map(p => (
              <div key={p.id} className="flex items-center justify-center gap-2 text-sm">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-emerald-500)' }} />
                <span className={p.id === playerId ? 'font-bold' : 'opacity-70'} style={{ color: p.id === playerId ? 'var(--color-gold-300)' : undefined }}>
                  {p.name}{p.id === playerId && ' (you)'}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs opacity-50 mb-4">{players.length}/6 players · need at least 4</p>

          {players.length >= 4 ? (
            <button onClick={startMatch} className="btn-primary w-full py-3">Start Match</button>
          ) : (
            <p className="text-xs opacity-30">Waiting for {4 - players.length} more…</p>
          )}
        </div>
      </div>
    );
  };

  // ─── Layout ───
  return (
    <div className="w-full h-full flex flex-col relative overflow-hidden" style={{ background: 'var(--color-felt-900)' }}>
      {renderHeader()}
      {renderTurnBanner()}
      {renderPrivateNotice()}

      {phase === 'LOBBY' ? renderLobby() : (
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {renderTable()}
          </div>
          {renderSidebar()}
        </div>
      )}

      {renderMatchEndPanel()}
    </div>
  );
}
