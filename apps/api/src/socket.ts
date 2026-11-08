import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { isAllowedOrigin } from './config.js';
import { sql } from './db/index.js';
import { verifyToken } from './lib/auth.js';
import { getCallAllowance, recordCallSeconds, recordCallStarted } from './lib/calls.js';
import { recordCallLog } from './lib/callLog.js';
import { getMatchForUser } from './lib/matches.js';
import { emitToUser } from './lib/realtime.js';
import { toChatMessage } from './lib/serialize.js';
import { findUser } from './lib/users.js';
import { getVideoAllowance, recordVideoSeconds } from './lib/video.js';
import type { MessageRow } from './types.js';

interface SocketData {
  userId: string;
  matchIds: Set<string>;
}

interface ActiveCall {
  callId: string;
  callerId: string;
  calleeId?: string;
  startedAt: number;
  acceptedAt?: number;
  /** True for a camera call, false for a voice call. */
  video: boolean;
  /** Server-side cutoff for the free video trial. */
  videoTimer?: ReturnType<typeof setTimeout>;
  /** Frees the match if nobody answers, so a ring cannot lock it out. */
  ringTimer?: ReturnType<typeof setTimeout>;
  /** Guards against billing the same call twice. */
  videoRecorded?: boolean;
}

/**
 * One live 1-on-1 call per match. The registry stops both sides from ringing
 * each other at the same time and lets us clean up when a call ends.
 */
const activeCalls = new Map<string, ActiveCall>();

/** Calls that were never ended (crash, closed tab) are released after this. */
const CALL_TTL_MS = 2 * 60_000;

/**
 * How long the server lets a call ring before it releases the match. It sits
 * just above the clients' own ring timeout so the UI reports the miss first and
 * the server only cleans up what the client failed to report.
 */
const RING_EXPIRY_MS = 50_000;

/** Collapses repeated capture attempts into one alert per person and kind. */
const captureAlertAt = new Map<string, number>();
const CAPTURE_ALERT_INTERVAL_MS = 4_000;

interface CaptureAttemptPayload {
  matchId?: string;
  kind?: string;
  context?: string;
}

interface CallPayload {
  matchId?: string;
  callId?: string;
  /** Video call when true; voice call otherwise. */
  video?: boolean;
}

/** Minimal WebRTC payload shapes relayed between the two call participants. */
interface CallDescription {
  type?: string;
  sdp?: string;
}

interface CallCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

function clearVideoTimer(call: ActiveCall): void {
  if (call.videoTimer) {
    clearTimeout(call.videoTimer);
    call.videoTimer = undefined;
  }
}

function clearRingTimer(call: ActiveCall): void {
  if (call.ringTimer) {
    clearTimeout(call.ringTimer);
    call.ringTimer = undefined;
  }
}

/**
 * Adds the connected time of a video call to both participants' lifetime
 * trial counters. Plus members simply ignore the counter.
 */
function recordVideoUsage(call: ActiveCall, seconds: number): void {
  if (!call.video || !call.acceptedAt || call.videoRecorded) return;
  call.videoRecorded = true;
  const elapsed = Math.max(0, Math.round((Date.now() - call.acceptedAt) / 1000));
  // Never trust a client-supplied duration that is longer than the call itself.
  const billable = Math.max(0, Math.min(Math.round(seconds), elapsed + 2));
  if (billable <= 0) return;
  void recordVideoSeconds(call.callerId, billable).catch(() => undefined);
  if (call.calleeId) {
    void recordVideoSeconds(call.calleeId, billable).catch(() => undefined);
  }
}

export function attachSocket(server: HttpServer): Server {
  const io = new Server(server, {
    cors: {
      // Allow the same LAN and Capacitor origins as the HTTP API so phones on
      // the local network can keep their realtime connection open.
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) callback(null, true);
        else callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    },
    maxHttpBufferSize: 1_000_000,
    pingTimeout: 25_000,
  });

  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      if (!token) throw new Error('Missing token');
      const userId = verifyToken(token);
      const data = socket.data as SocketData;
      data.userId = userId;
      data.matchIds = new Set<string>();
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const data = socket.data as SocketData;
    const userId = data.userId;

    socket.join(`user:${userId}`);

    void (async () => {
      try {
        const result = await sql<{ id: string }>(
          'SELECT id FROM matches WHERE user_a = $1 OR user_b = $1',
          [userId],
        );
        for (const row of result.rows) {
          data.matchIds.add(row.id);
          socket.join(`match:${row.id}`);
        }
      } catch (error) {
        console.error('[hobymine] socket room hydration failed', error);
      }
    })();

    socket.on('match:join', async (payload: { matchId?: string } | null) => {
      const matchId = typeof payload?.matchId === 'string' ? payload.matchId : '';
      if (!matchId) return;
      if (data.matchIds.has(matchId)) {
        socket.join(`match:${matchId}`);
        return;
      }
      const membership = await getMatchForUser(matchId, userId).catch(() => null);
      if (membership) {
        data.matchIds.add(matchId);
        socket.join(`match:${matchId}`);
      }
    });

    socket.on('typing:start', (payload: { matchId?: string } | null) => {
      const matchId = typeof payload?.matchId === 'string' ? payload.matchId : '';
      if (!matchId || !data.matchIds.has(matchId)) return;
      socket.to(`match:${matchId}`).emit('typing:start', { matchId, userId });
    });

    socket.on('typing:stop', (payload: { matchId?: string } | null) => {
      const matchId = typeof payload?.matchId === 'string' ? payload.matchId : '';
      if (!matchId || !data.matchIds.has(matchId)) return;
      socket.to(`match:${matchId}`).emit('typing:stop', { matchId, userId });
    });

    socket.on('presence:ping', () => {
      void sql('UPDATE users SET last_active_at = NOW() WHERE id = $1', [userId]).catch(
        () => undefined,
      );
    });

    /**
     * A screenshot or screen-recording attempt that the device blocked.
     *
     * Chat attempts become a persisted system message, so the other person
     * sees them inline and after a reload. Video attempts are ephemeral: the
     * peer is already in the call and gets an in-call banner instead.
     */
    socket.on('security:capture-attempt', async (payload: CaptureAttemptPayload | null) => {
      const matchId = typeof payload?.matchId === 'string' ? payload.matchId : '';
      const kind =
        payload?.kind === 'screenshot' || payload?.kind === 'screen-recording'
          ? payload.kind
          : null;
      const context =
        payload?.context === 'chat' || payload?.context === 'video' ? payload.context : null;
      if (!matchId || !kind || !context) return;

      const membership = await getMatchForUser(matchId, userId).catch(() => null);
      if (!membership) return;

      // A video alert is only meaningful while that exact video call is live.
      if (context === 'video') {
        const call = activeCalls.get(matchId);
        const participant = Boolean(
          call && (call.callerId === userId || call.calleeId === userId),
        );
        if (!call || !call.video || !call.acceptedAt || !participant) return;
      }

      const throttleKey = `${userId}:${matchId}:${context}:${kind}`;
      const now = Date.now();
      if (now - (captureAlertAt.get(throttleKey) ?? 0) < CAPTURE_ALERT_INTERVAL_MS) return;
      captureAlertAt.set(throttleKey, now);
      if (captureAlertAt.size > 1000) {
        for (const [key, at] of captureAlertAt) {
          if (now - at > CAPTURE_ALERT_INTERVAL_MS * 5) captureAlertAt.delete(key);
        }
      }

      const actor = await findUser(userId).catch(() => null);
      const fromName = actor?.name.split(/\s+/)[0] || 'The other person';
      const alert = {
        matchId,
        kind,
        context,
        fromUserId: userId,
        fromName,
        at: new Date(now).toISOString(),
      };

      if (context === 'video') {
        emitToUser(membership.other.id, 'security:capture-attempt', alert);
        return;
      }

      // Send the live alert first: the recipient should hear about a blocked
      // capture even if persisting the inline system message fails below.
      emitToUser(membership.other.id, 'security:capture-attempt', alert);

      const row: MessageRow = {
        id: randomUUID(),
        match_id: matchId,
        sender_id: userId,
        kind: 'system',
        body: kind === 'screenshot' ? 'Screenshot blocked' : 'Screen recording blocked',
        media_url: null,
        file_name: null,
        file_size: null,
        duration: null,
        read_at: null,
        created_at: new Date(now).toISOString(),
      };

      try {
        await sql(
          `INSERT INTO messages
            (id, match_id, sender_id, kind, body, media_url, file_name, file_size, duration, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            row.id,
            row.match_id,
            row.sender_id,
            row.kind,
            row.body,
            row.media_url,
            row.file_name,
            row.file_size,
            row.duration,
            row.created_at,
          ],
        );
      } catch (error) {
        console.error('[hobymine] capture alert insert failed', error);
        return;
      }

      // The persisted system message keeps the notice inline and after a
      // reload. The live security event above already made the recipient's
      // phone buzz immediately. The sender saw the "blocked" toast locally.
      emitToUser(membership.other.id, 'message:new', toChatMessage(row));
    });

    // ---------- 1-on-1 voice and video calls ----------
    const readCall = (payload: CallPayload | null): { matchId: string; callId: string } | null => {
      const matchId = typeof payload?.matchId === 'string' ? payload.matchId : '';
      const callId = typeof payload?.callId === 'string' ? payload.callId : '';
      if (!matchId || !callId) return null;
      return { matchId, callId };
    };

    /**
     * Applies the free 1-minute video trial on the server. Both participants
     * are checked, the call is cut at the shortest remaining trial, and the
     * spend is recorded for both so the limit cannot be dodged by hanging up
     * from the client.
     */
    const scheduleVideoLimit = async (call: ActiveCall, matchId: string): Promise<void> => {
      const [caller, callee] = await Promise.all([
        findUser(call.callerId).catch(() => null),
        call.calleeId ? findUser(call.calleeId).catch(() => null) : Promise.resolve(null),
      ]);
      const allowances = await Promise.all(
        [caller, callee]
          .filter((person): person is NonNullable<typeof person> => Boolean(person))
          .map((person) => getVideoAllowance(person)),
      );

      // Unlimited when both people are Plus members.
      const remaining = allowances.reduce(
        (lowest, allowance) =>
          allowance.plan === 'plus' ? lowest : Math.min(lowest, allowance.remainingSeconds),
        Number.POSITIVE_INFINITY,
      );

      const stop = (): void => {
        const live = activeCalls.get(matchId);
        if (!live || live.callId !== call.callId) return;
        clearVideoTimer(live);
        activeCalls.delete(matchId);
        const seconds = live.acceptedAt
          ? Math.max(1, Math.round((Date.now() - live.acceptedAt) / 1000))
          : 0;
        recordVideoUsage(live, seconds);
        // The trial cut ends the call for both people, so leave the same call
        // history card that a normal hang-up would create.
        void recordCallLog({
          matchId,
          callerId: live.callerId,
          callId: live.callId,
          seconds: live.acceptedAt ? seconds : null,
          type: 'video',
        }).catch(() => undefined);
        io.to(`match:${matchId}`).emit('call:video-limit', {
          matchId,
          callId: live.callId,
          secondsLimit: 0,
        });
        io.to(`match:${matchId}`).emit('call:ended', {
          matchId,
          callId: live.callId,
          fromUserId: userId,
          connected: true,
          limitReached: true,
        });
      };

      if (!Number.isFinite(remaining)) return;
      if (remaining <= 0) {
        stop();
        return;
      }

      clearVideoTimer(call);
      call.videoTimer = setTimeout(stop, remaining * 1000);
    };

    socket.on('call:invite', async (payload: CallPayload | null) => {
      const call = readCall(payload);
      if (!call) return;
      const video = payload?.video === true;
      if (!data.matchIds.has(call.matchId)) {
        socket.emit('call:error', { matchId: call.matchId, reason: 'not_allowed' });
        return;
      }
      const membership = await getMatchForUser(call.matchId, userId).catch(() => null);
      if (!membership || membership.other.is_bot) {
        socket.emit('call:error', { matchId: call.matchId, reason: 'not_allowed' });
        return;
      }
      // Free members have a daily budget. Receiving a call is always allowed.
      const caller = await findUser(userId).catch(() => null);
      if (caller) {
        const allowance = await getCallAllowance(caller);
        if (!allowance.canCall) {
          socket.emit('call:error', {
            matchId: call.matchId,
            reason: 'limit',
            allowance,
          });
          return;
        }
      }

      let calleeVideoSeconds: number | null = null;
      if (video) {
        const callerAllowance = caller ? await getVideoAllowance(caller) : null;
        if (callerAllowance && !callerAllowance.canVideo) {
          socket.emit('call:error', {
            matchId: call.matchId,
            reason: 'video_limit',
            videoAllowance: callerAllowance,
          });
          return;
        }
        // Do not ring for a video call the other person cannot join either.
        const calleeAllowance = await getVideoAllowance(membership.other);
        if (!calleeAllowance.canVideo) {
          socket.emit('call:error', {
            matchId: call.matchId,
            reason: 'video_limit',
            recipient: true,
            videoAllowance: callerAllowance,
          });
          return;
        }
        calleeVideoSeconds =
          calleeAllowance.plan === 'plus' ? null : calleeAllowance.remainingSeconds;
      }

      const existing = activeCalls.get(call.matchId);
      if (
        existing &&
        existing.callId !== call.callId &&
        Date.now() - existing.startedAt < CALL_TTL_MS
      ) {
        socket.emit('call:error', { matchId: call.matchId, reason: 'busy' });
        return;
      }
      activeCalls.set(call.matchId, {
        callId: call.callId,
        callerId: userId,
        // Recorded up front so every later signal can be routed straight to the
        // other person instead of depending on the match room being joined.
        calleeId: membership.other.id,
        startedAt: Date.now(),
        video,
      });
      const live = activeCalls.get(call.matchId);
      if (live) {
        // Nobody answered: free the match so the next attempt is not blocked.
        live.ringTimer = setTimeout(() => {
          const current = activeCalls.get(call.matchId);
          if (!current || current.callId !== call.callId || current.acceptedAt) return;
          clearRingTimer(current);
          clearVideoTimer(current);
          activeCalls.delete(call.matchId);
          const missed = {
            matchId: call.matchId,
            callId: call.callId,
            fromUserId: userId,
            connected: false,
          };
          emitToUser(userId, 'call:ended', missed);
          emitToUser(membership.other.id, 'call:ended', missed);
        }, RING_EXPIRY_MS);
      }
      // Ring the callee's own room. It is joined synchronously on connect, so
      // the call never depends on the async match-room hydration.
      emitToUser(membership.other.id, 'call:incoming', {
        matchId: call.matchId,
        callId: call.callId,
        fromUserId: userId,
        video,
        videoSecondsLeft: calleeVideoSeconds,
      });
    });

    socket.on('call:accept', async (payload: CallPayload | null) => {
      const call = readCall(payload);
      if (!call) return;
      const active = activeCalls.get(call.matchId);
      // Accepting is valid for a participant of the call even when the room
      // bookkeeping is stale: a silent return here used to leave the caller
      // ringing forever with no way to recover.
      const isParticipant =
        active?.callId === call.callId &&
        (active.callerId === userId || active.calleeId === userId);
      if (!isParticipant && !data.matchIds.has(call.matchId)) {
        socket.emit('call:error', { matchId: call.matchId, reason: 'not_allowed' });
        return;
      }
      if (active?.callId === call.callId) {
        clearRingTimer(active);
        if (!active.acceptedAt) active.acceptedAt = Date.now();
        active.calleeId = userId;
        if (active.video) void scheduleVideoLimit(active, call.matchId);
      }
      await recordCallStarted(userId).catch(() => undefined);
      // Straight to the other participant's own room so the answer is never lost.
      const otherId =
        active && active.callerId === userId ? active.calleeId : active?.callerId;
      if (otherId) {
        emitToUser(otherId, 'call:accepted', {
          matchId: call.matchId,
          callId: call.callId,
          fromUserId: userId,
        });
      } else {
        socket.to(`match:${call.matchId}`).emit('call:accepted', {
          matchId: call.matchId,
          callId: call.callId,
          fromUserId: userId,
        });
      }
    });

    socket.on('call:decline', async (payload: CallPayload | null) => {
      const call = readCall(payload);
      if (!call) return;
      const active = activeCalls.get(call.matchId);
      const live = active?.callId === call.callId ? active : undefined;
      if (!live && !data.matchIds.has(call.matchId)) return;
      if (live) {
        clearRingTimer(live);
        clearVideoTimer(live);
        activeCalls.delete(call.matchId);
      }

      // Declining, or letting the phone ring out, is a missed call. It is
      // recorded with no duration so the history shows "No answer".
      const seconds = live?.acceptedAt
        ? Math.max(0, Math.round((Date.now() - live.acceptedAt) / 1000))
        : null;
      await recordCallLog({
        matchId: call.matchId,
        callerId: live?.callerId ?? userId,
        callId: call.callId,
        seconds,
        type: live?.video ? 'video' : 'voice',
      }).catch(() => undefined);

      socket.to(`match:${call.matchId}`).emit('call:declined', {
        matchId: call.matchId,
        callId: call.callId,
        fromUserId: userId,
        connected: seconds !== null,
      });
      // Also target the caller directly: the decline must always land, even if
      // the match room has not been joined yet on a fresh connection.
      const declinedBy = live?.callerId === userId ? live?.calleeId : live?.callerId;
      if (declinedBy) {
        emitToUser(declinedBy, 'call:declined', {
          matchId: call.matchId,
          callId: call.callId,
          fromUserId: userId,
          connected: seconds !== null,
        });
      }
    });

    socket.on(
      'call:end',
      async (payload: (CallPayload & { seconds?: number }) | null) => {
        const call = readCall(payload);
        if (!call) return;
        const active = activeCalls.get(call.matchId);
        const live = active?.callId === call.callId ? active : undefined;
        if (!live && !data.matchIds.has(call.matchId)) return;
        if (live) {
          clearRingTimer(live);
          clearVideoTimer(live);
          activeCalls.delete(call.matchId);
        }

        const seconds = Math.max(0, Math.round(Number(payload?.seconds ?? 0) || 0));
        await recordCallSeconds(userId, seconds).catch(() => undefined);
        if (live) recordVideoUsage(live, seconds);

        // Every finished call leaves a card, including one that was cancelled
        // before the other person picked up. Calls that never connected have no
        // duration and render as "No answer"; the insert is idempotent, so the
        // first report of the outcome wins when both sides emit call:end.
        const connected = Boolean(live?.acceptedAt) || seconds > 0;
        await recordCallLog({
          matchId: call.matchId,
          callerId: live?.callerId ?? userId,
          callId: call.callId,
          seconds: connected ? seconds : null,
          type: live?.video ? 'video' : 'voice',
        }).catch(() => undefined);

        socket.to(`match:${call.matchId}`).emit('call:ended', {
          matchId: call.matchId,
          callId: call.callId,
          fromUserId: userId,
          connected,
        });
        const hungUpOn = live?.callerId === userId ? live?.calleeId : live?.callerId;
        if (hungUpOn) {
          emitToUser(hungUpOn, 'call:ended', {
            matchId: call.matchId,
            callId: call.callId,
            fromUserId: userId,
            connected,
          });
        }
      },
    );

    socket.on('disconnect', () => {
      // Release any call this person was part of so the other side is not
      // locked out of the match.
      for (const [matchId, call] of activeCalls) {
        if (call.callerId !== userId && call.calleeId !== userId) continue;
        clearRingTimer(call);
        clearVideoTimer(call);
        const seconds = call.acceptedAt
          ? Math.max(0, Math.round((Date.now() - call.acceptedAt) / 1000))
          : 0;
        recordVideoUsage(call, seconds);
        activeCalls.delete(matchId);
      }
    });

    socket.on(
      'call:signal',
      (payload: {
        matchId?: string;
        callId?: string;
        description?: CallDescription | null;
        candidate?: CallCandidate | null;
      } | null) => {
        const call = readCall(payload);
        if (!call) return;
        const active = activeCalls.get(call.matchId);
        const live = active?.callId === call.callId ? active : undefined;
        if (!live && !data.matchIds.has(call.matchId)) return;

        const signal = {
          matchId: call.matchId,
          callId: call.callId,
          fromUserId: userId,
          description: payload?.description ?? null,
          candidate: payload?.candidate ?? null,
        };

        // Prefer the other participant's own room: the callee is recorded at
        // invite time, so the offer/answer/ICE always has a known target and
        // never depends on both sockets having joined the match room.
        const otherId =
          live && (live.callerId === userId || live.calleeId === userId)
            ? live.callerId === userId
              ? live.calleeId
              : live.callerId
            : undefined;

        if (otherId) emitToUser(otherId, 'call:signal', signal);
        else socket.to(`match:${call.matchId}`).emit('call:signal', signal);
      },
    );
  });

  return io;
}
