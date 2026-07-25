import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

  return (
    <div className="min-h-screen flex flex-col relative" style={{ background: 'var(--color-felt-900)' }}>
      {/* Background decorative orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-[0.07]"
             style={{ background: 'radial-gradient(circle, var(--color-ruby-500), transparent 70%)' }} />
        <div className="absolute top-1/2 -right-32 w-80 h-80 rounded-full opacity-[0.05]"
             style={{ background: 'radial-gradient(circle, var(--color-gold-500), transparent 70%)' }} />
        <div className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full opacity-[0.04]"
             style={{ background: 'radial-gradient(circle, var(--color-emerald-500), transparent 70%)' }} />
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed top-6 left-1/2 z-[100] animate-toast-in"
             style={{ transform: 'translateX(-50%)' }}>
          <div className="flex items-center gap-3 px-6 py-3 rounded-xl shadow-2xl"
               style={{ background: 'linear-gradient(135deg, var(--color-ruby-600), var(--color-ruby-500))', border: '1px solid rgba(255,255,255,0.15)' }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.5"/><path d="M10 6v5M10 13.5v.5" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span className="text-white font-medium text-sm">{error}</span>
          </div>
        </div>
      )}
      
      {/* Header */}
      <header className="relative z-10 px-6 py-4 flex justify-between items-center"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold"
               style={{ background: 'linear-gradient(135deg, var(--color-ruby-500), var(--color-gold-500))' }}>
            ♠
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
            <span style={{ color: 'var(--color-gold-400)' }}>Hidden</span>{' '}
            <span className="text-white">Partner</span>
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

      {/* Main content */}
      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative z-10">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/room/:id" element={<Room />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 text-xs opacity-30"
              style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        Three of Spades © 2026
      </footer>
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
