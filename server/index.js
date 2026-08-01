import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Game } from './models/Game.js';
import { signup, login, getProfile, updateProfile, getMatchHistory, authMiddleware } from './auth.js';
import { checkDatabaseConnection, prisma } from './db.js';
import { chooseBid, chooseTrump, choosePartnerCards, chooseCard } from './engine/bot.js';

// How long a bot pauses before acting, so its moves are followable.
const BOT_TURN_DELAY_MS = 700;
// How long an empty room is kept alive, so a reload does not destroy the table.
const EMPTY_ROOM_GRACE_MS = 60_000;

// Browser origins allowed to call the API. In production the client is served
// from this same server, so cross-origin requests are not needed at all and the
// list is empty unless CORS_ORIGINS is set (comma separated). In development
// the Vite dev server is on a different port, so it has to be allowed through.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}

const corsOptions = {
  origin(origin, callback) {
    // Never error here. Rejecting by throwing turns a CORS decision into a 500,
    // which also takes out same-origin requests — browsers send an Origin
    // header on those too, so the server's own JS bundle starts failing.
    // Returning false just omits the CORS headers: cross-origin callers get
    // blocked by the browser, same-origin ones are unaffected because CORS
    // does not apply to them.
    callback(null, !origin || allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PATCH']
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

function logServerEnvironment() {
  const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];

  for (const key of requiredEnv) {
    const value = process.env[key];

    if (!value) {
      console.warn(`[env] ${key} is missing from the server environment.`);
      continue;
    }

    const placeholder = /your-|example|placeholder|\[.+\]/i.test(value);
    if (placeholder) {
      console.warn(`[env] ${key} appears to contain a placeholder value.`);
      continue;
    }

    console.log(`[env] ${key} is set (${value.length} chars, value hidden).`);
  }
}

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: corsOptions });

// Auth routes (own email/password auth; server issues + verifies JWTs)
app.post('/auth/signup', signup);
app.post('/auth/login', login);
app.get('/auth/profile', authMiddleware, getProfile);
app.patch('/auth/profile', authMiddleware, updateProfile);
app.get('/auth/matches', authMiddleware, getMatchHistory);

// Serve the built client, when there is one. Registered after the API routes so
// it can never shadow them, and skipped entirely in development where Vite
// serves the client itself on another port.
const clientDist = path.resolve(fileURLToPath(new URL('../client/dist', import.meta.url)));
const clientIndex = path.join(clientDist, 'index.html');
const hasClientBuild = fs.existsSync(clientIndex);

if (hasClientBuild) {
  app.use(express.static(clientDist));

  // The client routes on paths like /room/ABCD, which mean nothing to Express,
  // so those fall through to index.html and let the router take over.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/auth/') || req.path.startsWith('/socket.io/')) return next();

    // A dot in the final segment means a file was asked for — a bundle, an
    // image, a favicon. Those must 404 rather than get handed index.html,
    // which the browser would try to parse as JS and report as a baffling
    // "Unexpected token '<'".
    if (path.extname(req.path)) return next();

    res.sendFile(clientIndex);
  });
}

// Rooms state: roomId -> { game: Game, clients: Set of socket.id, matchSaved: boolean }
const rooms = new Map();
// Socket mappings: socket.id -> { roomId, playerId, playerName, accountUserId }
const clientMap = new Map();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join a room
  socket.on('join_room', ({ roomId, playerName, accountUserId, playerKey }) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        game: new Game(),
        clients: new Set(),
        matchSaved: false,
        savedMatchId: null
      });
    }

    const room = rooms.get(roomId);
    if (room.reapTimer) {
      clearTimeout(room.reapTimer);
      room.reapTimer = null;
    }
    room.clients.add(socket.id);

    // The seat is identified by a key the browser keeps, not by the socket, so
    // reloading the page returns you to the same hand instead of a new seat.
    const playerId = playerKey || socket.id;
    clientMap.set(socket.id, { roomId, playerId, playerName, accountUserId: accountUserId || null });

    try {
      if (room.game.hasPlayer(playerId)) {
        room.game.reconnectPlayer(playerId, playerName);
      } else {
        room.game.addPlayer(playerId, playerName, false, accountUserId || null);
      }
      broadcastState(roomId);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Start match
  socket.on('start_match', () => {
    const client = clientMap.get(socket.id);
    if (!client) return;
    const room = rooms.get(client.roomId);
    if (!room) return;

    try {
      room.matchSaved = false;
      room.savedMatchId = null;
      room.game.startMatch();
      broadcastState(client.roomId);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Actions
  socket.on('place_bid', ({ amount }) => {
    const client = clientMap.get(socket.id);
    if (!client) return;
    const room = rooms.get(client.roomId);
    try {
      room.game.placeBid(client.playerId, amount);
      broadcastState(client.roomId);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('select_trump', ({ suit }) => {
    const client = clientMap.get(socket.id);
    if (!client) return;
    const room = rooms.get(client.roomId);
    try {
      room.game.selectTrump(client.playerId, suit);
      broadcastState(client.roomId);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('select_partners', ({ cardIds }) => {
    const client = clientMap.get(socket.id);
    if (!client) return;
    const room = rooms.get(client.roomId);
    try {
      room.game.selectPartners(client.playerId, cardIds);
      broadcastState(client.roomId);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  socket.on('play_card', async ({ cardId }) => {
    const client = clientMap.get(socket.id);
    if (!client) return;
    const room = rooms.get(client.roomId);
    try {
      room.game.playCard(client.playerId, cardId);
      // The last card of the deal ends the match, so persist it here.
      await saveMatchIfEnded(room);
      broadcastState(client.roomId);
    } catch (err) {
      socket.emit('error', err.message);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const client = clientMap.get(socket.id);
    if (client) {
      const room = rooms.get(client.roomId);
      if (room) {
        room.clients.delete(socket.id);
        try {
          room.game.removePlayer(client.playerId);
          broadcastState(client.roomId);
        } catch (err) {
          console.error(err.message);
        }
        if (room.clients.size === 0) {
          // Hold the table briefly rather than destroying it, so the last
          // player to drop can reload and come back to their hand.
          room.reapTimer = setTimeout(() => {
            const current = rooms.get(client.roomId);
            if (current && current.clients.size === 0) {
              if (current.botTimer) clearTimeout(current.botTimer);
              rooms.delete(client.roomId);
            }
          }, EMPTY_ROOM_GRACE_MS);
        }
      }
      clientMap.delete(socket.id);
    }
  });
});

async function saveMatchIfEnded(room) {
  if (room.matchSaved || room.game.phase !== 'MATCH_END') return;

  const snapshot = room.game.getMatchSnapshot();
  const topWinner = snapshot.winners.length === 1 ? snapshot.winners[0] : null;

  if (!prisma) {
    console.warn('Match ended but Prisma is unavailable; skipping match save');
    return;
  }

  try {
    let persistedWinnerId = null;
    if (topWinner?.accountUserId) {
      const winnerProfile = await prisma.profile.findUnique({
        where: { id: topWinner.accountUserId },
        select: { id: true }
      });
      persistedWinnerId = winnerProfile?.id || null;
    }

    const match = await prisma.match.create({
      data: {
        winnerId: persistedWinnerId,
        winnerScore: snapshot.winners[0]?.score ?? null,
        playersData: snapshot
      }
    });

    room.matchSaved = true;
    room.savedMatchId = match.id;

    // One account counts once per match however many seats it ends up in.
    // Without this, an account sitting at two seats has its gamesPlayed
    // incremented twice for a single game.
    const statsByAccount = new Map();
    for (const player of snapshot.players) {
      if (!player.accountUserId) continue;
      const best = statsByAccount.get(player.accountUserId);
      if (!best || player.score > best.score) statsByAccount.set(player.accountUserId, player);
    }

    await Promise.all([...statsByAccount.values()]
      .map(async (player) => {
        const isWinner = snapshot.winners.some(winner => winner.accountUserId === player.accountUserId);

        try {
          const profile = await prisma.profile.findUnique({
            where: { id: player.accountUserId },
            select: { highestScore: true }
          });

          if (!profile) return;

          await prisma.profile.update({
            where: { id: player.accountUserId },
            data: {
              gamesPlayed: { increment: 1 },
              gamesWon: isWinner ? { increment: 1 } : undefined,
              highestScore: Math.max(profile.highestScore, player.score)
            }
          });
        } catch (error) {
          console.warn(`Failed to update stats for user ${player.accountUserId}:`, error.message);
        }
      }));
  } catch (error) {
    console.error('Failed to save match:', error);
  }
}

// Applies whatever the seat on turn should do. Throws if the move is illegal,
// which the caller treats as a reason to stop rather than retry.
function takeBotTurn(game, playerId) {
  const player = game.players.find(p => p.id === playerId);
  if (!player) return;

  switch (game.phase) {
    case 'BIDDING':
      game.placeBid(playerId, chooseBid(game.biddingState.highestBid));
      break;
    case 'TRUMP_SELECTION':
      game.selectTrump(playerId, chooseTrump(player.hand));
      break;
    case 'PARTNER_SELECTION':
      game.selectPartners(playerId, choosePartnerCards(player.hand, game.roundCardIds));
      break;
    case 'TRICKS': {
      const card = chooseCard(player.hand, game.currentTrick?.leadSuit);
      if (card) game.playCard(playerId, card.id);
      break;
    }
    default:
      break;
  }
}

// If the seat on turn belongs to a bot, act after a beat and then broadcast,
// which schedules the next one. The chain stops as soon as a human is up.
function scheduleBotTurn(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.botTimer) return;

  const turnId = room.game.getCurrentTurnPlayerId();
  if (!turnId) return;

  const player = room.game.players.find(p => p.id === turnId);
  if (!player?.isBot) return;

  room.botTimer = setTimeout(async () => {
    room.botTimer = null;

    const current = rooms.get(roomId);
    if (!current) return;

    try {
      takeBotTurn(current.game, turnId);
    } catch (err) {
      // Stop the chain instead of spinning on a move that will never succeed.
      console.warn(`Bot turn failed for ${turnId}:`, err.message);
      return;
    }

    await saveMatchIfEnded(current);
    broadcastState(roomId);
  }, BOT_TURN_DELAY_MS);
}

function broadcastState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Send private state to each client
  for (const clientId of room.clients) {
    const client = clientMap.get(clientId);
    if (client) {
      const privateState = room.game.getPrivateState(client.playerId);
      io.to(clientId).emit('game_state', privateState);
    }
  }

  scheduleBotTurn(roomId);
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(hasClientBuild
    ? `[static] Serving the client build from ${clientDist}`
    : '[static] No client build found; API and websockets only.');
  logServerEnvironment();
  checkDatabaseConnection();
});
