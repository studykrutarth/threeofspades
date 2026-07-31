import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchMatchHistory } from '../lib/api';

const ROLE_LABELS = { bidder: 'Bid Winner', partner: 'Partner', opponent: 'Opponent' };

export default function Lobby() {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();
  const { profile, session, loading, signOut } = useAuth();

  const [matches, setMatches] = useState(null);
  const [matchesError, setMatchesError] = useState('');

  useEffect(() => {
    if (!loading && !profile) {
      navigate('/');
    }
  }, [profile, loading, navigate]);

  // Match history needs a real account — guests have no token to fetch with.
  useEffect(() => {
    if (!session || profile?.isGuest) return;

    let cancelled = false;
    fetchMatchHistory(session)
      .then(data => { if (!cancelled) setMatches(data); })
      .catch(err => { if (!cancelled) setMatchesError(err.message); });

    return () => { cancelled = true; };
  }, [session, profile?.isGuest]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId.trim()}`);
    }
  };

  const handleCreate = () => {
    const newRoomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    navigate(`/room/${newRoomId}`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  if (loading || !profile) {
    return (
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full animate-spin-slow"
             style={{ border: '3px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--color-gold-500)' }} />
        <p className="text-sm opacity-40">Loading…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg animate-float-in">
      <div className="glass-panel p-10 relative overflow-hidden">
        <div className="absolute inset-0 animate-shimmer pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                   style={{ background: 'linear-gradient(135deg, var(--color-ruby-500), var(--color-gold-500))' }}>
                {profile.username?.charAt(0)?.toUpperCase()}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider opacity-40 font-semibold">Playing as</p>
                <p className="font-bold text-white">{profile.username}</p>
                {profile.isGuest && <p className="text-xs opacity-40">Guest — stats aren&apos;t saved</p>}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-xs opacity-50 hover:opacity-80 transition-opacity px-3 py-1 rounded"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Sign out
            </button>
          </div>

          {!profile.isGuest && (
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[
                { label: 'Played', value: profile.gamesPlayed },
                { label: 'Won', value: profile.gamesWon },
                {
                  label: 'Win Rate',
                  value: profile.gamesPlayed > 0
                    ? `${Math.round((profile.gamesWon / profile.gamesPlayed) * 100)}%`
                    : '—'
                },
                { label: 'Best Score', value: profile.highestScore }
              ].map(stat => (
                <div key={stat.label} className="glass-panel-light p-2 text-center">
                  <p className="text-[0.6rem] uppercase tracking-wider opacity-40 leading-tight">{stat.label}</p>
                  <p className="text-lg font-extrabold text-white leading-tight">{stat.value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mb-6">
            <button onClick={handleCreate} className="btn-primary w-full text-lg py-4 flex items-center justify-center gap-3">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" d="M12 5v14M5 12h14"/></svg>
              Create New Room
            </button>
          </div>

          <div className="relative flex items-center py-4">
            <div className="flex-grow h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
            <span className="flex-shrink-0 mx-4 text-xs font-semibold uppercase tracking-widest opacity-25">
              or join
            </span>
            <div className="flex-grow h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="room-code" className="block text-xs font-semibold uppercase tracking-wider mb-2 opacity-50">
                Room Code
              </label>
              <input
                type="text"
                id="room-code"
                className="input-field text-center text-2xl tracking-[0.3em] font-bold uppercase"
                placeholder="ABCD"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                required
                maxLength={4}
              />
            </div>
            <button type="submit" className="btn-gold w-full py-3">
              Join Room
            </button>
          </form>

          {!profile.isGuest && (
            <div className="mt-8 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold uppercase tracking-widest opacity-40 mb-3">Recent Matches</p>

              {matchesError && (
                <p className="text-xs" style={{ color: 'var(--color-ruby-400)' }}>{matchesError}</p>
              )}

              {!matchesError && matches === null && (
                <p className="text-xs opacity-30">Loading…</p>
              )}

              {!matchesError && matches?.length === 0 && (
                <p className="text-xs opacity-30">No matches yet — play a full deal to see it here.</p>
              )}

              {matches?.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {matches.map(match => (
                    <div key={match.id}
                         className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                         style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {ROLE_LABELS[match.myRole] || 'Spectator'}
                          {match.bidAmount != null && (
                            <span className="opacity-40"> · bid {match.bidAmount}</span>
                          )}
                        </p>
                        <p className="text-[0.65rem] opacity-40">
                          {new Date(match.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold" style={{ color: match.isWinner ? 'var(--color-emerald-500)' : 'var(--color-ruby-400)' }}>
                          {match.isWinner ? 'Won' : 'Lost'}
                        </p>
                        {match.myScore != null && (
                          <p className="text-[0.65rem] opacity-40">{match.myScore} pts</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
