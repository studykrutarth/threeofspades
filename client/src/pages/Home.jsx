import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'];

export default function Home() {
  const navigate = useNavigate();
  const { session, loading, profile, continueAsGuest } = useAuth();
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestError, setGuestError] = useState('');

  useEffect(() => {
    if (!loading && (session || profile)) {
      navigate('/lobby');
    }
  }, [session, profile, loading, navigate]);

  const handleGuestSubmit = (e) => {
    e.preventDefault();
    const trimmed = guestName.trim();
    if (trimmed.length < 3) {
      setGuestError('Enter a name with at least 3 characters');
      return;
    }
    continueAsGuest(trimmed);
    navigate('/lobby');
  };

  if (loading) {
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
        <div className="absolute top-4 right-5 text-3xl opacity-[0.06] font-bold select-none" style={{ color: 'var(--color-gold-500)' }}>♠</div>
        <div className="absolute bottom-4 left-5 text-3xl opacity-[0.06] font-bold select-none rotate-180" style={{ color: 'var(--color-ruby-500)' }}>♥</div>

        <div className="absolute inset-0 animate-shimmer pointer-events-none" />

        <div className="relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-4"
                 style={{ background: 'rgba(212,168,67,0.12)', color: 'var(--color-gold-400)', border: '1px solid rgba(212,168,67,0.2)' }}>
              {SUIT_SYMBOLS.map((s, i) => <span key={i} className="text-sm">{s}</span>)}
            </div>
            <h2 className="text-4xl font-extrabold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              Welcome to the Table
            </h2>
            <p className="text-sm opacity-50 max-w-xs mx-auto">
              A multiplayer trick-taking game of hidden alliances and strategic bidding.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="btn-gold w-full text-lg py-4"
            >
              Sign In
            </button>

            <button
              onClick={() => navigate('/signup')}
              className="w-full text-lg py-4 font-semibold rounded-lg transition-all"
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--color-gold-400)',
                border: '1px solid rgba(212,168,67,0.3)'
              }}
            >
              Create Account
            </button>
          </div>

          <div className="relative flex items-center py-4">
            <div className="flex-grow h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
            <span className="flex-shrink-0 mx-4 text-xs font-semibold uppercase tracking-widest opacity-25">or</span>
            <div className="flex-grow h-px" style={{ background: 'rgba(255,255,255,0.08)' }}></div>
          </div>

          {showGuestForm ? (
            <form onSubmit={handleGuestSubmit} className="space-y-3">
              <input
                type="text"
                className="input-field text-lg"
                placeholder="Enter a display name"
                value={guestName}
                onChange={(e) => { setGuestName(e.target.value); setGuestError(''); }}
                maxLength={20}
                autoFocus
              />
              {guestError && <p className="text-xs text-center" style={{ color: 'var(--color-ruby-400)' }}>{guestError}</p>}
              <button type="submit" className="btn-primary w-full text-lg py-4">
                Continue as Guest
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowGuestForm(true)}
              className="w-full text-sm py-3 font-semibold rounded-lg transition-all opacity-60 hover:opacity-90"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.15)' }}
            >
              Play as Guest (no account needed)
            </button>
          )}

          <div className="mt-8 flex items-center justify-center gap-6 text-xs opacity-30">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path strokeLinecap="round" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              4–6 Players
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 6v6l4 2"/></svg>
              10 Rounds
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
