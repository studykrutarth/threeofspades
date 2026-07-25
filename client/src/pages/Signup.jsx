import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signUpWithEmail } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError('Username can only contain letters, numbers, and underscores');
      return;
    }

    setLoading(true);

    try {
      await signUpWithEmail(email, password, username.trim());
      navigate('/lobby');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg animate-float-in">
      <div className="glass-panel p-10 relative overflow-hidden">
        <div className="absolute top-4 right-5 text-3xl opacity-[0.06] font-bold select-none" style={{ color: 'var(--color-gold-500)' }}>♠</div>
        <div className="absolute bottom-4 left-5 text-3xl opacity-[0.06] font-bold select-none rotate-180" style={{ color: 'var(--color-ruby-500)' }}>♥</div>

        <div className="absolute inset-0 animate-shimmer pointer-events-none" />

        <div className="relative z-10">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-extrabold text-white mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
              Join the Table
            </h2>
            <p className="text-sm opacity-50">
              Create an account to start playing
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 rounded-lg text-sm"
                 style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--color-ruby-400)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider mb-2 opacity-50">
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
              <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider mb-2 opacity-50">
                Username
              </label>
              <input
                type="text"
                id="username"
                className="input-field text-lg"
                placeholder="CardShark"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                maxLength={20}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider mb-2 opacity-50">
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

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider mb-2 opacity-50">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                className="input-field text-lg"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-gold w-full text-lg py-4 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm opacity-60">
              Already have an account?{' '}
              <Link to="/login" className="text-gold-400 hover:text-gold-300 font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
