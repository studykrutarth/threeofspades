import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from './db.js';

const JWT_EXPIRES_IN = '7d';
const USERNAME_RE = /^[a-zA-Z0-9_]+$/;

function sanitizeProfile(profile) {
  return {
    id: profile.id,
    email: profile.email,
    username: profile.username,
    gamesPlayed: profile.gamesPlayed,
    gamesWon: profile.gamesWon,
    highestScore: profile.highestScore,
    createdAt: profile.createdAt
  };
}

function issueToken(profile) {
  return jwt.sign({ sub: profile.id, email: profile.email }, process.env.JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
}

export async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.sub;
    req.email = decoded.email;

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token', details: err.message });
  }
}

export async function signup(req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { email, password, username } = req.body;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const trimmedUsername = (username || '').trim();
    if (trimmedUsername.length < 3 || trimmedUsername.length > 20) {
      return res.status(400).json({ error: 'Username must be 3–20 characters' });
    }
    if (!USERNAME_RE.test(trimmedUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await prisma.profile.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username: trimmedUsername }] }
    });

    if (existing) {
      const field = existing.email === normalizedEmail ? 'Email' : 'Username';
      return res.status(409).json({ error: `${field} already in use` });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const profile = await prisma.profile.create({
      data: { email: normalizedEmail, username: trimmedUsername, passwordHash }
    });

    const token = issueToken(profile);
    res.status(201).json({ token, profile: sanitizeProfile(profile) });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
}

export async function login(req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const profile = await prisma.profile.findUnique({
      where: { email: email.trim().toLowerCase() }
    });

    if (!profile || !profile.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const matches = await bcrypt.compare(password, profile.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = issueToken(profile);
    res.json({ token, profile: sanitizeProfile(profile) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Failed to sign in' });
  }
}

export async function getProfile(req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: req.userId }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(sanitizeProfile(profile));
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

export async function updateProfile(req, res) {
  try {
    if (!prisma) {
      return res.status(503).json({ error: 'Database service unavailable' });
    }

    const { username } = req.body;

    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'Username is required' });
    }

    const trimmed = username.trim();

    if (trimmed.length < 3 || trimmed.length > 20) {
      return res.status(400).json({ error: 'Username must be 3–20 characters' });
    }

    if (!USERNAME_RE.test(trimmed)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    const existing = await prisma.profile.findFirst({
      where: {
        username: trimmed,
        NOT: { id: req.userId }
      }
    });

    if (existing) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const profile = await prisma.profile.update({
      where: { id: req.userId },
      data: { username: trimmed }
    });

    res.json(sanitizeProfile(profile));
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}
