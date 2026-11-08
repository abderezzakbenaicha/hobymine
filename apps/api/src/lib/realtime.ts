import type { Server } from 'socket.io';

let io: Server | null = null;

export function setIo(server: Server): void {
  io = server;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToMatch(matchId: string, event: string, payload: unknown): void {
  io?.to(`match:${matchId}`).emit(event, payload);
}

/**
 * Delivers a chat message to every socket of both members exactly once. The
 * recipient is also targeted through their own room because a freshly connected
 * socket may not have joined the match room yet, which used to drop the alert.
 */
export function emitMessageToMatch(
  matchId: string,
  recipientId: string,
  payload: unknown,
): void {
  if (!io) return;
  io.to(`match:${matchId}`)
    .except(`user:${recipientId}`)
    .emit('message:new', payload);
  io.to(`user:${recipientId}`).emit('message:new', payload);
}

export function joinUsersToMatch(userIds: string[], matchId: string): void {
  if (!io) return;
  for (const userId of userIds) {
    io.in(`user:${userId}`).socketsJoin(`match:${matchId}`);
  }
}
