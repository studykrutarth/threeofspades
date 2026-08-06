import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GameProvider, useGame } from './context/GameContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Lobby from './pages/Lobby';
import Room from './pages/Room';

function AppContent() {
  const { error } = useGame();
  const { profile, signOut } = useAuth();
  const location = useLocation();
  // The game table manages its own full-bleed layout; everything else is a centered card.
  const isTableRoute = location.pathname.startsWith('/room/');

  return (
    <div className="h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* A single flat wash. The warm lamp-pool and heavy vignette that used to
          live here were part of the casino-table look we moved away from. */}
      <div className="fixed inset-0 pointer-events-none z-0"
           style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 0%, #1d2537 0%, var(--color-bg) 72%)' }} />

      {/* Error toast */}
      {error && (
        <div className="fixed top-6 left-1/2 z-[100] animate-toast-in"
             style={{ transform: 'translateX(-50%)' }}>
          <div className="flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg"
               style={{ background: 'var(--color-bad)' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.5"/><path d="M10 6v5M10 13.5v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span className="text-white font-medium text-sm">{error}</span>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="relative z-10 px-5 py-3 flex justify-between items-center shrink-0"
              style={{ borderBottom: '1px solid var(--color-hairline)' }}>
        <div className="flex items-center gap-2.5">
          {/* Flat card-shaped mark — the object the game is made of, drawn as a
              simple tile rather than an embossed prop. */}
          <div className="w-7 h-9 rounded-md flex items-center justify-center text-base shrink-0"
               style={{ background: '#ffffff', color: 'var(--color-card-black)' }}>
            ♠
          </div>
          <h1 className="text-lg font-extrabold">
            <span style={{ color: 'var(--color-ink)' }}>Three of </span>
            <span style={{ color: 'var(--color-accent)' }}>Spades</span>
          </h1>
        </div>
        {profile && (
          <div className="flex items-center gap-3">
            <span className="text-sm opacity-60 hidden sm:inline">{profile.username}</span>
            <button
              onClick={() => signOut()}
              className="text-xs opacity-50 hover:opacity-80 px-3 py-1 rounded"
              style={{ border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Main content.
          Centering lives on the inner wrapper, not on a scrolling flex parent:
          `items-center` on the scroll container pushes overflow above the scroll
          origin, where it can never be reached — on a short viewport that made
          the top of the signup form unreachable. `min-h-full` centres a short
          page but lets a tall one grow downward and scroll normally. */}
      <main className={`flex-grow relative z-10 min-h-0 ${isTableRoute ? 'flex' : 'overflow-y-auto'}`}>
        <div className={isTableRoute ? 'flex-1 min-h-0 flex' : 'min-h-full flex items-center justify-center p-4 md:p-8'}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/room/:id" element={<Room />} />
          </Routes>
        </div>
      </main>

      {/* Footer — hidden at the table so the game gets the full height */}
      {!isTableRoute && (
        <footer className="relative z-10 text-center py-4 text-xs opacity-30 shrink-0"
                style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          Three of Spades © 2026
        </footer>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <Router>
          <AppContent />
        </Router>
      </GameProvider>
    </AuthProvider>
  );
}

export default App;
