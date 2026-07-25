import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Game } from './models/Game.js';
import { signup, login, getProfile, updateProfile, authMiddleware } from './auth.js';
import { checkDatabaseConnection, prisma } from './db.js';

const app = express();
app.use(cors());
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
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Auth routes (own email/password auth; server issues + verifies JWTs)
app.post('/auth/signup', signup);
app.post('/auth/login', login);
app.get('/auth/profile', authMiddleware, getProfile);
app.patch('/auth/profile', authMiddleware, updateProfile);

// Rooms state: roomId -> { game: Game, clients: Set of socket.id, matchSaved: boolean }
const rooms = new Map();
// Socket mappings: socket.id -> { roomId, playerId, playerName, accountUserId }
const clientMap = new Map();

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Join a room
  socket.on('join_room', ({ roomId, playerName, accountUserId }) => {
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
    room.clients.add(socket.id);
    
    const playerId = socket.id; // use socket id as player id for now
    clientMap.set(socket.id, { roomId, playerId, playerName, accountUserId: accountUserId || null });

    try {
      room.game.addPlayer(playerId, playerName, false, accountUserId || null);
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
          rooms.delete(client.roomId);
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

    await Promise.all(snapshot.players
      .filter(player => player.accountUserId)
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
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  logServerEnvironment();
  checkDatabaseConnection();
});
