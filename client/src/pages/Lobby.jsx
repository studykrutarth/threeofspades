import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Lobby() {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();
  const { profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !profile) {
      navigate('/');
    }
  }, [profile, loading, navigate]);

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
                {(profile.gamesPlayed > 0) && (
                  <p className="text-xs opacity-40">{profile.gamesWon}W / {profile.gamesPlayed} played</p>
                )}
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
        </div>
      </div>
    </div>
  );
}
