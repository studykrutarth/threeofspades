import { API_URL } from './apiUrl';

export async function signup(email, password, username) {
  const response = await fetch(`${API_URL}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, username })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create account');
  }

  return data;
}

export async function login(email, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to sign in');
  }

  return data;
}

export async function fetchProfile(accessToken) {
  const response = await fetch(`${API_URL}/auth/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load profile');
  }

  return data;
}

export async function fetchMatchHistory(accessToken) {
  const response = await fetch(`${API_URL}/auth/matches`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load match history');
  }

  return data;
}

export async function updateProfileUsername(accessToken, username) {
  const response = await fetch(`${API_URL}/auth/profile`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to update profile');
  }

  return data;
}
