/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const GameContext = createContext();

export const useGame = () => useContext(GameContext);

export const GameProvider = ({ children }) => {
  const { profile } = useAuth();
  const [socket] = useState(() => io(API_URL, {
    autoConnect: false
  }));
  const pendingJoinRef = useRef(null);
  const lastJoinKeyRef = useRef('');
  const [username, setUsername] = useState('');
  const [roomId, setRoomId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleConnect = () => {
      console.log('Connected to server');

      const pendingJoin = pendingJoinRef.current;
      if (!pendingJoin) return;

      const joinKey = `${pendingJoin.roomId}:${pendingJoin.playerName}`;
      if (lastJoinKeyRef.current === joinKey) return;

      socket.emit('join_room', pendingJoin);
      lastJoinKeyRef.current = joinKey;
    };

    const handleDisconnect = () => {
      lastJoinKeyRef.current = '';
    };

    const handleGameState = (state) => {
      setGameState(state);
    };

    const handleError = (msg) => {
      setError(msg);
      // clear error after 3s
      setTimeout(() => setError(''), 3000);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('game_state', handleGameState);
    socket.on('error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('game_state', handleGameState);
      socket.off('error', handleError);
      socket.close();
    };
  }, [socket]);

  const joinRoom = (room, name) => {
    const joinPayload = {
      roomId: room,
      playerName: name,
      accountUserId: profile?.id || null
    };
    pendingJoinRef.current = joinPayload;
    setUsername(name);
    setRoomId(room);

    const joinKey = `${room}:${name}`;
    if (!socket.connected) {
      socket.connect();
      return;
    }

    if (lastJoinKeyRef.current === joinKey) return;

    socket.emit('join_room', joinPayload);
    lastJoinKeyRef.current = joinKey;
  };

  const startMatch = () => {
    socket.emit('start_match');
  };

  const nextRound = () => {
    socket.emit('next_round');
  };

  const placeBid = (amount) => {
    socket.emit('place_bid', { amount });
  };

  const selectTrump = (suit) => {
    socket.emit('select_trump', { suit });
  };

  const selectPartners = (cardIds) => {
    socket.emit('select_partners', { cardIds });
  };

  const playCard = (cardId) => {
    socket.emit('play_card', { cardId });
  };

  return (
    <GameContext.Provider value={{
      socket,
      username,
      roomId,
      gameState,
      error,
      joinRoom,
      startMatch,
      nextRound,
      placeBid,
      selectTrump,
      selectPartners,
      playCard
    }}>
      {children}
    </GameContext.Provider>
  );
};
