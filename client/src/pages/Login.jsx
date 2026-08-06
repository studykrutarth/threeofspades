import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signInWithEmail } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmail(email, password);
      navigate('/lobby');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg animate-float-in">
      <div className="panel p-10 relative overflow-hidden">
        <div className="absolute top-4 right-5 text-3xl opacity-[0.06] font-bold select-none" style={{ color: 'var(--color-warn)' }}>♠</div>
        <div className="absolute bottom-4 left-5 text-3xl opacity-[0.06] font-bold select-none rotate-180" style={{ color: 'var(--color-bad)' }}>♥</div>

        <div className="relative z-10">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-extrabold text-white mb-2 tracking-wide" style={{ fontFamily: 'var(--font-heading)' }}>
              Welcome Back
            </h2>
            <p className="text-sm opacity-50">
              Sign in to your account to play
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg text-sm"
                 style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-bad)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="label block text-xs font-semibold uppercase tracking-wider mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                className="input-field text-lg"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="password" className="label block text-xs font-semibold uppercase tracking-wider mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                className="input-field text-lg"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-accent w-full text-lg py-4 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm opacity-60">
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="text-gold-400 hover:text-gold-300 font-semibold">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
