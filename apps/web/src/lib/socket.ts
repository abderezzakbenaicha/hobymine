import { io, type Socket } from 'socket.io-client';
import { getApiBase, subscribeApiBase } from './apiConfig';

let socket: Socket | null = null;
let currentToken: string | null = null;
let currentBase: string | null = null;

type SocketListener = (socket: Socket) => void;

const socketReadyListeners = new Set<SocketListener>();

/**
 * Notified whenever a socket becomes available. Route components mount
 * before the app shell creates the socket, so they use this to join their
 * rooms and to react to reconnects on any device.
 */
export function onSocketReady(listener: SocketListener): () => void {
  socketReadyListeners.add(listener);
  if (socket) listener(socket);
  return () => {
    socketReadyListeners.delete(listener);
  };
}

function announceSocket(next: Socket): void {
  for (const listener of socketReadyListeners) listener(next);
}

export function connectSocket(token: string): Socket {
  const base = getApiBase();

  if (socket && currentToken === token && currentBase === base) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  currentToken = token;
  currentBase = base;
  socket = io(base || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 700,
    reconnectionDelayMax: 4000,
  });
  announceSocket(socket);
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }
  socket = null;
  currentToken = null;
  currentBase = null;
}

// When the server address changes (server settings screen), move the live
// socket to the new host instead of waiting for the next app launch.
subscribeApiBase(() => {
  const token = currentToken;
  if (!socket || !token) return;
  connectSocket(token);
});
