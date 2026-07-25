/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { fetchProfile, login, signup } from '../lib/api';

const TOKEN_STORAGE_KEY = 'threeofspades_token';
const GUEST_STORAGE_KEY = 'threeofspades_guest';

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  // Guests have no token, so their identity is restored straight from storage.
  const [profile, setProfile] = useState(() => {
    if (localStorage.getItem(TOKEN_STORAGE_KEY)) return null;
    try {
      const stored = localStorage.getItem(GUEST_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (accessToken) => {
    try {
      const data = await fetchProfile(accessToken);
      setProfile(data);
      return data;
    } catch (error) {
      console.error('Failed to load profile:', error);
      setProfile(null);
      setToken(null);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      return null;
    }
  }, []);

  useEffect(() => {
    if (token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage on mount, not a render loop
      loadProfile(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // Only run once on mount to hydrate from a stored token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistToken = (newToken) => {
    setToken(newToken);
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    // Signing in supersedes any guest identity.
    localStorage.removeItem(GUEST_STORAGE_KEY);
  };

  const signInWithEmail = async (email, password) => {
    const data = await login(email, password);
    persistToken(data.token);
    setProfile(data.profile);
    return data;
  };

  const signUpWithEmail = async (email, password, username) => {
    const data = await signup(email, password, username);
    persistToken(data.token);
    setProfile(data.profile);
    return data;
  };

  const continueAsGuest = (username) => {
    const guestProfile = {
      id: null,
      email: null,
      username: username.trim(),
      gamesPlayed: 0,
      gamesWon: 0,
      highestScore: 0,
      isGuest: true
    };
    setProfile(guestProfile);
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(guestProfile));
  };

  const signOut = async () => {
    setToken(null);
    setProfile(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(GUEST_STORAGE_KEY);
  };

  const refreshProfile = async () => {
    if (!token) return null;
    return loadProfile(token);
  };

  return (
    <AuthContext.Provider value={{
      session: token,
      profile,
      loading,
      signInWithEmail,
      signUpWithEmail,
      continueAsGuest,
      signOut,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}
