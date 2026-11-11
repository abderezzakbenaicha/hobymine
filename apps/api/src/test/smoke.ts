/**
 * End-to-end API smoke test.
 *
 * Runs against the embedded in-memory PostgreSQL engine, seeds the demo
 * account, then exercises auth, discovery filters, matching between two real
 * accounts, chat, Plus, uploads, verification, reporting and blocking over
 * real HTTP.
 *
 * Run with: npm test --workspace @hobymine/api
 */

process.env.NODE_ENV = 'test';
process.env.PGLITE_MEMORY = '1';
process.env.PGLITE_DIR = '';
process.env.DATABASE_URL = '';
process.env.JWT_SECRET = 'hobymine-smoke-test-secret';
process.env.PORT = '0';
// The smoke test never talks to Supabase: uploads stay on local disk so the
// run cannot create or delete objects in the production bucket.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SECRET_KEY = '';
process.env.SUPABASE_STORAGE_BUCKET = '';

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

interface Json {
  [key: string]: unknown;
}

interface ApiResponse {
  status: number;
  body: Json;
}

let passed = 0;
let failed = 0;

const SMOKE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

/** A one-second silent WAV, enough to exercise the voice-intro upload path. */
const SMOKE_WAV = ((): Buffer => {
  const samples = 8000;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
})();

function check(condition: unknown, label: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL ${label}`);
}

function checkEqual<T>(actual: T, expected: T, label: string): void {
  check(
    actual === expected,
    `${label} (expected ${String(expected)}, got ${String(actual)})`,
  );
}

async function main(): Promise<void> {
  const { initDb, closeDb, sql } = await import('../db/index.js');
  const { seedDatabase, DEMO_CREDENTIALS } = await import('../db/seed.js');
  const { createApp } = await import('../app.js');
  const { attachSocket } = await import('../socket.js');
  const { setIo } = await import('../lib/realtime.js');

  await initDb();
  const seeded = await seedDatabase();
  check(seeded.seeded, 'demo database seeded');

  const app = createApp();
  const server = createServer(app);
  const io = attachSocket(server);
  setIo(io);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  console.log(`\nAPI smoke test → ${base}\n`);

  let token = '';

  async function request(
    path: string,
    options: { method?: string; body?: unknown; auth?: boolean; form?: FormData } = {},
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = {};
    if (token && options.auth !== false) headers.Authorization = `Bearer ${token}`;

    let body: string | FormData | undefined;
    if (options.form) {
      body = options.form;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const response = await fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
    });

    let parsed: Json = {};
    const text = await response.text();
    if (text) {
      try {
        parsed = JSON.parse(text) as Json;
      } catch {
        parsed = { raw: text };
      }
    }
    return { status: response.status, body: parsed };
  }

  async function registerAccount(
    name: string,
    gender: 'woman' | 'man' | 'nonbinary' = 'woman',
    countryCode = 'SG',
  ): Promise<{ token: string; id: string; email: string }> {
    const email = `smoke_${name.toLowerCase().replace(/\W+/g, '_')}_${Date.now()}@hobymine.app`;
    const response = await request('/api/auth/register', {
      auth: false,
      method: 'POST',
      body: {
        name,
        email,
        password: 'Password123!',
        age: 29,
        gender,
        countryCode,
        interestedIn: 'everyone',
        ageConfirmed: true,
      },
    });
    if (response.status !== 201) {
      throw new Error(`registration failed for ${name}: ${JSON.stringify(response.body)}`);
    }
    const user = (response.body.user ?? {}) as Json;
    const createdToken = String(response.body.token ?? '');
    const previousToken = token;
    token = createdToken;
    const form = new FormData();
    form.append('photo', new Blob([SMOKE_PNG], { type: 'image/png' }), 'avatar.png');
    const upload = await request('/api/me/photos', { method: 'POST', form });
    if (upload.status !== 201) {
      throw new Error(`photo upload failed for ${name}: ${JSON.stringify(upload.body)}`);
    }
    token = previousToken;
    return {
      token: createdToken,
      id: String(user.id ?? ''),
      email,
    };
  }

  /** Marks an account as verified through the same endpoint the app uses. */
  async function verifyAccount(accountToken: string): Promise<void> {
    const previousToken = token;
    token = accountToken;
    const result = await request('/api/verification/selfie', {
      method: 'POST',
      body: { selfieUrl: '/seed/alex-1.svg' },
    });
    token = previousToken;
    if (result.status !== 201) {
      throw new Error(`verification failed: ${JSON.stringify(result.body)}`);
    }
  }

  try {
    // ---------- Health ----------
    const health = await request('/api/health');
    checkEqual(health.status, 200, 'health returns 200');
    checkEqual(health.body.ok, true, 'health reports ok');
    checkEqual(health.body.database, 'pglite', 'health reports embedded database');

    // ---------- Auth ----------
    const badLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: DEMO_CREDENTIALS.email, password: 'wrong-password' },
    });
    checkEqual(badLogin.status, 401, 'wrong password is rejected');

    const demo = await request('/api/auth/demo', { method: 'POST' });
    checkEqual(demo.status, 200, 'demo login succeeds');
    token = String(demo.body.token ?? '');
    check(token.length > 20, 'demo login returns a JWT');
    const demoUser = (demo.body.user ?? {}) as Json;
    checkEqual(demoUser.id, 'u_demo', 'demo user identity is correct');
    checkEqual(demoUser.email, DEMO_CREDENTIALS.email, 'demo email is correct');

    // Discovery and messaging are verified-only, so the demo account verifies
    // through the same selfie endpoint members use in the app.
    const demoVerification = await request('/api/verification/selfie', {
      method: 'POST',
      body: { selfieUrl: '/seed/alex-1.svg' },
    });
    checkEqual(demoVerification.status, 201, 'the demo account can verify itself');

    const me = await request('/api/me');
    checkEqual(me.status, 200, 'GET /api/me succeeds');
    const meUser = (me.body.user ?? {}) as Json;
    check(Array.isArray(meUser.photos), 'me returns photo array');
    const mePreferences = (meUser.preferences ?? {}) as Json;
    check(
      typeof mePreferences.interestedIn === 'string',
      'me returns discovery preferences',
    );

    const noAuth = await request('/api/me', { auth: false });
    checkEqual(noAuth.status, 401, 'unauthenticated request is rejected');

    // ---------- No automated accounts ----------
    const demoIsNotBot = await request('/api/users/u_demo');
    checkEqual(demoIsNotBot.status, 200, 'the demo account is a normal profile');
    checkEqual(
      ((demoIsNotBot.body.user ?? {}) as Json).isBot,
      false,
      'the demo account is not flagged as an automated account',
    );

    // ---------- Discovery with a real second person ----------
    const partner = await registerAccount('Smoke Partner');
    const admirer = await registerAccount('Smoke Admirer', 'man');
    const demoToken = token;

    // The admirer has a verified profile; the partner deliberately stays
    // unverified for the "verified only" filter test below.
    await verifyAccount(admirer.token);

    // A verified profile is mandatory before Discovery opens at all.
    token = partner.token;
    const gatedDeck = await request('/api/discovery');
    checkEqual(gatedDeck.status, 403, 'unverified profiles cannot open discovery');
    checkEqual(
      ((gatedDeck.body.error ?? {}) as Json).code,
      'verification_required',
      'the discovery gate returns verification_required',
    );
    token = demoToken;

    // A one-sided like from the admirer gives the partner a "likes you" entry.
    token = admirer.token;
    const admirerLike = await request('/api/swipes', {
      method: 'POST',
      body: { targetId: partner.id, action: 'like' },
    });
    checkEqual(admirerLike.status, 201, 'another person can like the partner');
    checkEqual(admirerLike.body.matched, false, 'a one-sided like is not a match');
    token = demoToken;

    const discovery = await request('/api/discovery');
    checkEqual(discovery.status, 200, 'discovery returns 200');
    let candidates = (discovery.body.candidates ?? []) as Json[];
    check(candidates.length > 0, 'discovery returns candidates');
    check(
      candidates.some((candidate) => candidate.id === partner.id),
      'a real registered account shows up in the deck',
    );
    check(
      candidates.every((candidate) => candidate.isBot === false),
      'no automated accounts appear in the deck',
    );
    check(
      typeof candidates[0]?.distanceKm === 'number',
      'candidates include distance from the viewer',
    );
    const discoveryAllowance = (discovery.body.likeAllowance ?? {}) as Json;
    checkEqual(discoveryAllowance.limit, 15, 'free members have 15 likes per day');
    checkEqual(discoveryAllowance.unlimited, false, 'free like allowance is limited');
    check(
      typeof discoveryAllowance.resetsAt === 'string',
      'the like allowance reports when it resets',
    );

    // ---------- Discovery filters ----------
    token = partner.token;
    const partnerVerification = await request('/api/verification/selfie', {
      method: 'POST',
      body: { selfieUrl: '/seed/maya-1.svg' },
    });
    checkEqual(partnerVerification.status, 201, 'a person can verify themselves');

    token = demoToken;

    const countryFilter = await request('/api/me/preferences', {
      method: 'PATCH',
      body: { countryCode: 'JP' },
    });
    checkEqual(countryFilter.status, 200, 'country filter saves');
    const japanDeck = await request('/api/discovery');
    const japanCandidates = (japanDeck.body.candidates ?? []) as Json[];
    check(
      !japanCandidates.some((candidate) => candidate.id === partner.id),
      'the country filter hides people from other countries',
    );

    const backToSingapore = await request('/api/me/preferences', {
      method: 'PATCH',
      body: { countryCode: 'SG' },
    });
    checkEqual(backToSingapore.status, 200, 'country filter can be changed again');
    const singaporeDeck = await request('/api/discovery');
    candidates = (singaporeDeck.body.candidates ?? []) as Json[];
    check(
      candidates.some((candidate) => candidate.id === partner.id),
      'the country filter can be pointed back at the right country',
    );

    // ---------- Swipe → match between two real people ----------
    const firstSwipe = await request('/api/swipes', {
      method: 'POST',
      body: { targetId: partner.id, action: 'like' },
    });
    checkEqual(firstSwipe.status, 201, 'like swipe is accepted');
    checkEqual(firstSwipe.body.matched, false, 'a one-sided like is not a match');

    token = partner.token;
    const reciprocal = await request('/api/swipes', {
      method: 'POST',
      body: { targetId: 'u_demo', action: 'like' },
    });
    checkEqual(reciprocal.status, 201, 'the other person can like back');
    checkEqual(reciprocal.body.matched, true, 'a mutual like creates a match');
    const matchSummary = (reciprocal.body.match ?? {}) as Json;
    checkEqual(
      (matchSummary.user as Json | undefined)?.id,
      'u_demo',
      'the match returns the other person',
    );
    const matchId = String(matchSummary.id ?? '');
    check(matchId.length > 0, 'the match has an id');

    // ---------- Rewind is Plus-only ----------
    const lockedRewind = await request(`/api/swipes/${partner.id}`, { method: 'DELETE' });
    checkEqual(lockedRewind.status, 402, 'free members cannot rewind a swipe');
    checkEqual(
      ((lockedRewind.body.error ?? {}) as Json).code,
      'plus_required',
      'the rewind paywall error code is returned',
    );

    // ---------- Chat (no automated replies) ----------
    token = demoToken;
    const sent = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { kind: 'text', body: 'Coffee this weekend?' },
    });
    checkEqual(sent.status, 201, 'text message is sent');
    const sentMessage = (sent.body.message ?? {}) as Json;
    checkEqual(sentMessage.senderId, 'u_demo', 'sent message is attributed to the sender');

    token = partner.token;
    const history = await request(`/api/matches/${matchId}/messages?limit=50`);
    checkEqual(history.status, 200, 'chat history returns 200');
    const historyMessages = (history.body.messages ?? []) as Json[];
    check(
      historyMessages.some((message) => message.body === 'Coffee this weekend?'),
      'the other person receives the message',
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
    const afterWait = await request(`/api/matches/${matchId}/messages?limit=50`);
    const afterWaitMessages = (afterWait.body.messages ?? []) as Json[];
    checkEqual(
      afterWaitMessages.filter((message) => message.senderId === partner.id).length,
      0,
      'nobody answers automatically — only real people reply',
    );

    // ---------- Voice call history cards ----------
    const { recordCallLog } = await import('../lib/callLog.js');
    await recordCallLog({
      matchId,
      callerId: 'u_demo',
      callId: 'smoke-call-40s',
      seconds: 40,
    });
    const withCall = await request(`/api/matches/${matchId}/messages?limit=50`);
    const callCards = ((withCall.body.messages ?? []) as Json[]).filter(
      (message) => message.kind === 'call',
    );
    checkEqual(callCards.length, 1, 'a finished call adds one history card');
    const callCard = callCards[0] ?? {};
    checkEqual(callCard.body, 'voice', 'the call card records the call type');
    checkEqual(callCard.duration, 40, 'the call card records the duration');
    checkEqual(callCard.senderId, 'u_demo', 'the call card is attributed to the caller');
    check(typeof callCard.createdAt === 'string', 'the call card has a timestamp');

    // Both people can emit call:end; the card must still appear only once.
    await recordCallLog({
      matchId,
      callerId: 'u_demo',
      callId: 'smoke-call-40s',
      seconds: 40,
    });
    const afterDuplicateCall = await request(`/api/matches/${matchId}/messages?limit=50`);
    const afterDuplicateCards = ((afterDuplicateCall.body.messages ?? []) as Json[]).filter(
      (message) => message.kind === 'call',
    );
    checkEqual(
      afterDuplicateCards.length,
      1,
      'a repeated call end does not duplicate the card',
    );

    const read = await request(`/api/matches/${matchId}/read`, { method: 'POST' });
    checkEqual(read.status, 200, 'read receipt is recorded');
    check(Number(read.body.count) >= 1, 'read receipt marks incoming messages');

    // ---------- Messages are not throttled ----------
    const firstSend = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { kind: 'text', body: 'First message of my afternoon.' },
    });
    checkEqual(firstSend.status, 201, 'a free member can send a message');
    checkEqual(firstSend.body.cooldownUntil, null, 'a free message starts no cooldown');

    const secondSend = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { kind: 'text', body: 'And another one right away.' },
    });
    checkEqual(secondSend.status, 201, 'a free member can send again immediately');
    checkEqual(secondSend.body.cooldownUntil, null, 'the second message starts no cooldown');

    // ---------- Reaction alerts ----------
    const { io: ioClient } = await import('socket.io-client');
    const ownerMessageId = String(((firstSend.body.message ?? {}) as Json).id ?? '');
    check(ownerMessageId.length > 0, 'the sent message has an id');

    const reactionAlert = await new Promise<Json | null>((resolve) => {
      // `firstSend` was posted with the partner's token, so the partner owns the
      // message and is the one who should receive the alert.
      const socket = ioClient(base, {
        auth: { token: partner.token },
        transports: ['websocket'],
        reconnection: false,
      });
      const timer = setTimeout(() => {
        socket.close();
        resolve(null);
      }, 5_000);
      socket.on('connect', () => {
        void (async () => {
          token = demoToken;
          try {
            await request(`/api/matches/${matchId}/messages/${ownerMessageId}/reactions`, {
              method: 'POST',
              body: { emoji: '🔥' },
            });
          } finally {
            token = partner.token;
          }
        })();
      });
      socket.on('message:reaction:received', (payload: Json) => {
        clearTimeout(timer);
        socket.close();
        resolve(payload);
      });
    });

    check(reactionAlert !== null, 'the message owner receives a real-time reaction alert');
    checkEqual(reactionAlert?.emoji, '🔥', 'the alert carries the chosen emoji');
    checkEqual(reactionAlert?.fromUserId, 'u_demo', 'the alert identifies the reactor');
    checkEqual(reactionAlert?.fromName, 'Alex Rivera', 'the alert names the reactor');
    checkEqual(reactionAlert?.matchId, matchId, 'the alert points at the conversation');
    checkEqual(reactionAlert?.messageId, ownerMessageId, 'the alert points at the reacted message');

    const meAfterMessages = await request('/api/me');
    checkEqual(
      ((meAfterMessages.body.user ?? {}) as Json).messageCooldownUntil,
      null,
      'the account reports no message cooldown',
    );

    // ---------- Document attachments ----------
    const documentForm = new FormData();
    documentForm.append(
      'file',
      new Blob(['Packing list: passport, charger, good mood.'], { type: 'text/plain' }),
      'trip-notes.txt',
    );
    const documentUpload = await request('/api/uploads', {
      method: 'POST',
      form: documentForm,
    });
    checkEqual(documentUpload.status, 201, 'a document can be uploaded');
    checkEqual(documentUpload.body.kind, 'file', 'the upload is classified as a file');
    checkEqual(documentUpload.body.name, 'trip-notes.txt', 'the original file name is returned');
    const documentMessage = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: {
        kind: 'file',
        mediaUrl: documentUpload.body.url,
        fileName: documentUpload.body.name,
        fileSize: documentUpload.body.size,
      },
    });
    checkEqual(documentMessage.status, 201, 'a document message can be sent');
    const documentPayload = (documentMessage.body.message ?? {}) as Json;
    checkEqual(documentPayload.kind, 'file', 'the message is stored as a file');
    checkEqual(documentPayload.fileName, 'trip-notes.txt', 'the document keeps its name');
    const documentHistory = await request(`/api/matches/${matchId}/messages?limit=50`);
    check(
      ((documentHistory.body.messages ?? []) as Json[]).some(
        (message) => message.kind === 'file' && message.fileName === 'trip-notes.txt',
      ),
      'the document appears in the conversation history',
    );

    // ---------- Messaging requires a verified profile ----------
    await sql('UPDATE users SET verified = FALSE WHERE id = $1', [partner.id]);
    const gatedMessage = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { kind: 'text', body: 'Can I send this without verifying?' },
    });
    checkEqual(gatedMessage.status, 403, 'unverified profiles cannot send messages');
    checkEqual(
      ((gatedMessage.body.error ?? {}) as Json).code,
      'verification_required',
      'the message gate returns verification_required',
    );
    await sql('UPDATE users SET verified = TRUE WHERE id = $1', [partner.id]);

    // ---------- Matches list ----------
    token = demoToken;
    const matches = await request('/api/matches');
    checkEqual(matches.status, 200, 'matches list returns 200');
    const matchList = (matches.body.matches ?? []) as Json[];
    check(
      matchList.some((match) => match.id === matchId),
      'the new match appears in the match list',
    );
    check(
      matchList.every((match) => ((match.user as Json | undefined)?.isBot ?? true) === false),
      'no automated accounts appear in the match list',
    );

    // ---------- Profile + uploads ----------
    const profilePatch = await request('/api/me', {
      method: 'PATCH',
      body: {
        job: 'Product Designer',
        bio: 'Updated in the automated smoke test.',
        interests: ['Movies', 'Coffee', 'Travel'],
        lifestyle: ['Coffee addict', 'Night owl'],
        languages: ['English', 'Spanish'],
        heightCm: 178,
        relationshipGoal: 'Long-term relationship',
      },
    });
    checkEqual(profilePatch.status, 200, 'profile update succeeds');
    const patchedUser = (profilePatch.body.user ?? {}) as Json;
    checkEqual(patchedUser.bio, 'Updated in the automated smoke test.', 'bio is updated');
    checkEqual(
      ((patchedUser.lifestyle ?? []) as string[]).length,
      2,
      'lifestyle tags are saved',
    );
    checkEqual(
      ((patchedUser.languages ?? []) as string[])[1],
      'Spanish',
      'languages are saved',
    );
    checkEqual(patchedUser.heightCm, 178, 'height is saved');
    checkEqual(
      patchedUser.relationshipGoal,
      'Long-term relationship',
      'relationship goal is saved',
    );

    // The Edit profile form always sends the counts, even when the answer is
    // "no". That used to assign `kids_count`/`pet_types` twice and crash the
    // update with a 500, so keep this exact payload covered.
    const familyPatch = await request('/api/me', {
      method: 'PATCH',
      body: {
        hasKids: 'no',
        kidsCount: null,
        wantsKids: 'maybe',
        hasPets: 'no',
        petTypes: [],
        petsCount: null,
      },
    });
    checkEqual(familyPatch.status, 200, 'family and pets update without duplicate columns');
    const familyUser = (familyPatch.body.user ?? {}) as Json;
    checkEqual(familyUser.hasKids, 'no', 'kids answer is saved');
    checkEqual(familyUser.kidsCount, null, 'kids count is cleared when there are no kids');
    checkEqual(familyUser.hasPets, 'no', 'pets answer is saved');
    checkEqual(
      ((familyUser.petTypes ?? []) as string[]).length,
      0,
      'pet types are cleared when there are no pets',
    );
    checkEqual(familyUser.petsCount, null, 'pets count is cleared when there are no pets');

    const familyBack = await request('/api/me', {
      method: 'PATCH',
      body: {
        hasKids: 'yes',
        kidsCount: 2,
        hasPets: 'yes',
        petTypes: ['Dog'],
        petsCount: 1,
      },
    });
    checkEqual(familyBack.status, 200, 'family and pets can be filled in again');
    const familyBackUser = (familyBack.body.user ?? {}) as Json;
    checkEqual(familyBackUser.kidsCount, 2, 'kids count is stored');
    checkEqual(
      ((familyBackUser.petTypes ?? []) as string[])[0],
      'Dog',
      'pet type is stored',
    );
    checkEqual(familyBackUser.petsCount, 1, 'pets count is stored');

    const countryPatch = await request('/api/me', {
      method: 'PATCH',
      body: { countryCode: 'JP' },
    });
    checkEqual(countryPatch.status, 200, 'country update succeeds');
    checkEqual(
      ((countryPatch.body.user ?? {}) as Json).countryCode,
      'JP',
      'profile stores the selected country code',
    );
    checkEqual(
      ((countryPatch.body.user ?? {}) as Json).countryName,
      'Japan',
      'profile derives the country display name',
    );
    const countryReset = await request('/api/me', {
      method: 'PATCH',
      body: { countryCode: 'SG' },
    });
    checkEqual(countryReset.status, 200, 'country can be changed again');
    checkEqual(
      ((countryReset.body.user ?? {}) as Json).countryCode,
      'SG',
      'country change is persisted',
    );

    const form = new FormData();
    form.append('photo', new Blob([SMOKE_PNG], { type: 'image/png' }), 'smoke.png');
    const upload = await request('/api/me/photos', { method: 'POST', form });
    checkEqual(upload.status, 201, 'profile photo upload succeeds');
    const uploadedUser = (upload.body.user ?? {}) as Json;
    const uploadedPhotos = (uploadedUser.photos ?? []) as string[];
    check(uploadedPhotos.length >= 3, 'uploaded photo is appended to the profile');
    const uploadedUrl = String(upload.body.url ?? '');
    check(uploadedUrl.startsWith('/uploads/'), 'upload returns a public URL');

    const reordered = [uploadedUrl, ...uploadedPhotos.filter((url) => url !== uploadedUrl)];
    const reorder = await request('/api/me/photos', {
      method: 'PATCH',
      body: { photos: reordered },
    });
    checkEqual(reorder.status, 200, 'profile photos can be reordered');
    checkEqual(
      (((reorder.body.user ?? {}) as Json).photos as string[] | undefined)?.[0],
      uploadedUrl,
      'the first photo becomes the cover after a reorder',
    );

    const photoDelete = await request('/api/me/photos', {
      method: 'DELETE',
      body: { url: uploadedUrl },
    });
    checkEqual(photoDelete.status, 200, 'profile photo can be removed');
    const afterDelete = (photoDelete.body.user ?? {}) as Json;
    check(
      !((afterDelete.photos ?? []) as string[]).includes(uploadedUrl),
      'removed photo is gone from the profile',
    );

    // ---------- Voice introduction ----------
    const voiceForm = new FormData();
    voiceForm.append('file', new Blob([SMOKE_WAV], { type: 'audio/wav' }), 'smoke.wav');
    const voiceUpload = await request('/api/uploads', { method: 'POST', form: voiceForm });
    checkEqual(voiceUpload.status, 201, 'voice intro upload succeeds');
    const voiceUrl = String(voiceUpload.body.url ?? '');
    const voiceSave = await request('/api/me/voice-intro', {
      method: 'PUT',
      body: { url: voiceUrl, duration: 1 },
    });
    checkEqual(voiceSave.status, 200, 'voice intro saves after its upload');
    checkEqual(
      (((voiceSave.body.user ?? {}) as Json).voiceIntro as Json | null)?.url,
      voiceUrl,
      'voice intro is attached to the profile',
    );
    const voiceRemove = await request('/api/me/voice-intro', { method: 'DELETE' });
    checkEqual(voiceRemove.status, 200, 'voice intro can be removed');

    const prefsPatch = await request('/api/me/preferences', {
      method: 'PATCH',
      body: { interestedIn: 'everyone', ageMin: 23, ageMax: 36, maxDistance: 5000 },
    });
    checkEqual(prefsPatch.status, 200, 'preferences update succeeds');
    checkEqual(
      ((prefsPatch.body.user ?? {}) as Json).preferences &&
        (((prefsPatch.body.user ?? {}) as Json).preferences as Json).maxDistance,
      5000,
      'distance preference is stored',
    );

    // ---------- Call allowance ----------
    const freeAllowance = await request('/api/calls/allowance');
    checkEqual(freeAllowance.status, 200, 'call allowance is published');
    const freeBudget = (freeAllowance.body.allowance ?? {}) as Json;
    checkEqual(freeBudget.plan, 'free', 'a free member has a daily call budget');
    checkEqual(freeBudget.canCall, true, 'a free member can start a call');
    const freeVideoBudget = (freeAllowance.body.videoAllowance ?? {}) as Json;
    checkEqual(freeVideoBudget.plan, 'free', 'a free member has a video trial');
    checkEqual(freeVideoBudget.secondsLimit, 60, 'the free video trial is one minute');
    checkEqual(freeVideoBudget.canVideo, true, 'a fresh free member can try video calling');
    const videoAllowanceEndpoint = await request('/api/calls/video-allowance');
    checkEqual(videoAllowanceEndpoint.status, 200, 'video allowance is published');

    // ---------- Freemium likes ----------
    token = partner.token;
    const lockedLikes = await request('/api/likes');
    checkEqual(lockedLikes.status, 200, 'free users can open the likes grid');
    checkEqual(lockedLikes.body.limited, true, 'free likes are marked as limited');
    const blurredLikes = (lockedLikes.body.users ?? []) as Json[];
    check(blurredLikes.length >= 1, 'free users receive teaser profiles');
    check(
      blurredLikes.every((person) => person.name === 'Hidden admirer'),
      'free teaser profiles hide names',
    );

    // ---------- 15 likes a day for free members ----------
    const limitedMember = await registerAccount('Smoke Limit', 'man');
    await verifyAccount(limitedMember.token);
    token = limitedMember.token;
    const today = new Date().toISOString().slice(0, 10);
    await sql(
      `INSERT INTO like_usage (user_id, day, likes)
       VALUES ($1, $2, 14)
       ON CONFLICT (user_id, day) DO UPDATE SET likes = 14`,
      [limitedMember.id, today],
    );

    const fifteenthLike = await request('/api/swipes', {
      method: 'POST',
      body: { targetId: partner.id, action: 'like' },
    });
    checkEqual(fifteenthLike.status, 201, 'the 15th like of the day is allowed');
    const atLimit = (fifteenthLike.body.likeAllowance ?? {}) as Json;
    checkEqual(atLimit.used, 15, 'the daily like counter reaches 15');
    checkEqual(atLimit.remaining, 0, 'no free likes are left after the 15th');

    const sixteenthLike = await request('/api/swipes', {
      method: 'POST',
      body: { targetId: admirer.id, action: 'like' },
    });
    checkEqual(sixteenthLike.status, 402, 'the 16th like is rejected');
    const likeLimitError = (sixteenthLike.body.error ?? {}) as Json;
    checkEqual(likeLimitError.code, 'like_limit', 'the like limit error code is returned');
    const likeLimitDetails = (likeLimitError.details ?? {}) as Json;
    checkEqual(likeLimitDetails.limit, 15, 'the error reports the free daily limit');
    checkEqual(likeLimitDetails.used, 15, 'the error reports how many likes were used');
    checkEqual(likeLimitDetails.remaining, 0, 'the error reports zero likes remaining');
    check(
      typeof likeLimitDetails.resetsAt === 'string',
      'the like limit error reports when it resets',
    );

    // ---------- Profile views ----------
    token = admirer.token;
    const viewRecord = await request(`/api/users/${partner.id}/view`, { method: 'POST' });
    checkEqual(viewRecord.status, 200, 'opening a profile records a view');
    checkEqual(viewRecord.body.recorded, true, 'the profile view is stored');

    token = partner.token;
    const lockedViews = await request('/api/me/viewers');
    checkEqual(lockedViews.status, 200, 'free users can open the profile views tab');
    checkEqual(lockedViews.body.limited, true, 'free profile views are marked as limited');
    check(Number(lockedViews.body.count) >= 1, 'free users see the profile view count');
    const blurredViews = (lockedViews.body.views ?? []) as Json[];
    check(blurredViews.length >= 1, 'free users receive blurred profile view cards');
    check(
      blurredViews.every((view) => (view.user as Json | undefined)?.name === 'Profile viewer'),
      'free profile view cards hide the visitor identity',
    );

    const lockedBoost = await request('/api/plus/boost', {
      method: 'POST',
      body: { enabled: true },
    });
    checkEqual(lockedBoost.status, 402, 'boost is paywalled for free users');

    // ---------- Plus pricing ----------
    const plans = await request('/api/plus/plans');
    checkEqual(plans.status, 200, 'plus plans are published');
    const planList = (plans.body.plans ?? []) as Json[];
    const weeklyPlan = planList.find((plan) => plan.id === 'weekly');
    const monthlyPlan = planList.find((plan) => plan.id === 'monthly');
    const yearlyPlan = planList.find((plan) => plan.id === 'yearly');
    checkEqual(weeklyPlan?.amount, 199, 'the weekly plan costs $1.99');
    checkEqual(monthlyPlan?.amount, 699, 'the monthly plan costs $6.99');
    checkEqual(yearlyPlan?.amount, 3999, 'the yearly plan costs $39.99');

    const subscribe = await request('/api/plus/subscribe', {
      method: 'POST',
      body: { plan: 'yearly' },
    });
    checkEqual(subscribe.status, 200, 'Plus subscription succeeds');
    const plusUser = (subscribe.body.user ?? {}) as Json;
    checkEqual(plusUser.plus, true, 'subscription activates Plus');
    check(Boolean(plusUser.plusUntil), 'subscription sets an expiry date');
    checkEqual(subscribe.body.plan, 'yearly', 'subscription echoes the selected plan');
    checkEqual(subscribe.body.amount, 3999, 'subscription reports the yearly price');

    const rewindTarget = await registerAccount('Smoke Rewind');
    const plusSwipe = await request('/api/swipes', {
      method: 'POST',
      body: { targetId: rewindTarget.id, action: 'like' },
    });
    checkEqual(plusSwipe.status, 201, 'a Plus member can make a like');
    const plusRewind = await request(`/api/swipes/${rewindTarget.id}`, {
      method: 'DELETE',
    });
    checkEqual(plusRewind.status, 200, 'a Plus member can rewind their last swipe');
    checkEqual(plusRewind.body.ok, true, 'the rewind confirms it succeeded');

    const unlockedLikes = await request('/api/likes');
    checkEqual(unlockedLikes.status, 200, 'Plus members can see their likes');
    checkEqual(unlockedLikes.body.limited, false, 'Plus likes are no longer limited');
    const likedBy = (unlockedLikes.body.users ?? []) as Json[];
    check(likedBy.length >= 1, 'likes grid returns the remaining admirers');
    check(
      likedBy.some((person) => person.id === admirer.id),
      'likes grid shows the person who liked them',
    );

    const unlockedViews = await request('/api/me/viewers');
    checkEqual(unlockedViews.status, 200, 'Plus members can open the profile views tab');
    checkEqual(unlockedViews.body.limited, false, 'Plus profile views are no longer limited');
    const viewers = (unlockedViews.body.views ?? []) as Json[];
    check(
      viewers.some((view) => (view.user as Json | undefined)?.id === admirer.id),
      'Plus members see who viewed their profile',
    );
    check(
      viewers.every((view) => (view.user as Json | undefined)?.name !== 'Profile viewer'),
      'Plus profile view cards reveal the visitor name',
    );

    const boost = await request('/api/plus/boost', {
      method: 'POST',
      body: { enabled: true },
    });
    checkEqual(boost.status, 200, 'Plus member can start a boost');
    checkEqual(((boost.body.user ?? {}) as Json).boostActive, true, 'boost becomes active');

    const plusAllowance = await request('/api/calls/allowance');
    const plusBudget = (plusAllowance.body.allowance ?? {}) as Json;
    checkEqual(plusBudget.plan, 'plus', 'a Plus member has no daily call limit');
    checkEqual(plusBudget.canCall, true, 'a Plus member can always call');
    const plusVideoBudget = (plusAllowance.body.videoAllowance ?? {}) as Json;
    checkEqual(plusVideoBudget.plan, 'plus', 'a Plus member has unlimited video calling');
    checkEqual(plusVideoBudget.canVideo, true, 'a Plus member can always start a video call');

    // ---------- Chat stays unthrottled after upgrading ----------
    const plusFirst = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { kind: 'text', body: 'Plus members can talk freely.' },
    });
    checkEqual(plusFirst.status, 201, 'a Plus member can send a message');
    checkEqual(plusFirst.body.cooldownUntil, null, 'Plus members get no cooldown');
    const plusSecond = await request(`/api/matches/${matchId}/messages`, {
      method: 'POST',
      body: { kind: 'text', body: 'Straight away, no waiting.' },
    });
    checkEqual(plusSecond.status, 201, 'a Plus member can send a second message immediately');
    const meAsPlus = await request('/api/me');
    checkEqual(
      ((meAsPlus.body.user ?? {}) as Json).messageCooldownUntil,
      null,
      'a Plus account reports no cooldown',
    );

    const receiptsOff = await request('/api/plus/read-receipts', {
      method: 'PATCH',
      body: { enabled: false },
    });
    checkEqual(receiptsOff.status, 200, 'read receipts can be disabled');
    checkEqual(
      ((receiptsOff.body.user ?? {}) as Json).readReceipts,
      false,
      'read receipt preference is stored',
    );
    const receiptsOn = await request('/api/plus/read-receipts', {
      method: 'PATCH',
      body: { enabled: true },
    });
    checkEqual(receiptsOn.status, 200, 'read receipts can be re-enabled');

    // ---------- Verification ----------
    const verificationBefore = await request('/api/verification/status');
    checkEqual(verificationBefore.status, 200, 'verification status returns 200');
    checkEqual(verificationBefore.body.verified, true, 'verified flag lands on the profile');

    const verificationAfter = await request('/api/verification/status');
    checkEqual(verificationAfter.body.verified, true, 'verification status reflects approval');

    // ---------- Safety ----------
    const blockedAccount = await registerAccount('Smoke Blocked');
    const report = await request('/api/reports', {
      method: 'POST',
      body: {
        targetId: blockedAccount.id,
        reason: 'Fake profile',
        details: 'Automated smoke test report.',
        block: true,
      },
    });
    checkEqual(report.status, 201, 'report and block succeeds');
    checkEqual(report.body.blocked, true, 'report confirms the block');

    const blocks = await request('/api/blocks');
    checkEqual(blocks.status, 200, 'blocked accounts return 200');
    const blocked = (blocks.body.blocked ?? []) as Json[];
    check(
      blocked.some((person) => person.id === blockedAccount.id),
      'blocked profile appears in the block list',
    );

    const blockedProfile = await request(`/api/users/${blockedAccount.id}`);
    checkEqual(blockedProfile.status, 404, 'blocked profile is not directly accessible');

    const unblock = await request(`/api/blocks/${blockedAccount.id}`, { method: 'DELETE' });
    checkEqual(unblock.status, 200, 'profile can be unblocked');
    const unblockedProfile = await request(`/api/users/${blockedAccount.id}`);
    checkEqual(unblockedProfile.status, 200, 'unblocked profile is accessible again');

    // Blocking on its own, from the Block button on profiles and chats.
    const directBlock = await request(`/api/blocks/${blockedAccount.id}`, { method: 'POST' });
    checkEqual(directBlock.status, 200, 'blocking without a report succeeds');
    const afterDirectBlock = await request('/api/blocks');
    check(
      ((afterDirectBlock.body.blocked ?? []) as Json[]).some(
        (person) => person.id === blockedAccount.id,
      ),
      'a direct block appears in the block list',
    );
    const undoDirectBlock = await request(`/api/blocks/${blockedAccount.id}`, {
      method: 'DELETE',
    });
    checkEqual(undoDirectBlock.status, 200, 'a direct block can be undone');

    // ---------- Registration ----------
    const missingCountry = await request('/api/auth/register', {
      auth: false,
      method: 'POST',
      body: {
        name: 'No Country',
        email: `smoke_missing_${Date.now()}@hobymine.app`,
        password: 'Password123!',
        age: 29,
        gender: 'woman',
        interestedIn: 'men',
      },
    });
    checkEqual(missingCountry.status, 400, 'registration requires a country');

    // The 18+ checkbox is enforced by the API, not only by the client.
    const missingAge = await request('/api/auth/register', {
      auth: false,
      method: 'POST',
      body: {
        name: 'No Age',
        email: `smoke_noage_${Date.now()}@hobymine.app`,
        password: 'Password123!',
        age: 29,
        gender: 'woman',
        countryCode: 'SG',
        interestedIn: 'men',
      },
    });
    checkEqual(missingAge.status, 400, 'registration requires the 18+ confirmation');

    // Fake or random text addresses are rejected.
    const fakeEmails = [
      'notanemail',
      'random text',
      'test@test',
      'asdf@asdf.com',
      'foo@bar',
      'someone@example.com',
      'aaaaaaaaaa@gmail.com',
      'user@mailinator.com',
      'abigail@gmial.com',
      'someone@comm',
    ];
    for (const fakeEmail of fakeEmails) {
      const rejected = await request('/api/auth/register', {
        auth: false,
        method: 'POST',
        body: {
          name: 'Fake Email',
          email: fakeEmail,
          password: 'Password123!',
          age: 29,
          gender: 'woman',
          countryCode: 'SG',
          interestedIn: 'men',
          ageConfirmed: true,
        },
      });
      checkEqual(rejected.status, 400, `registration rejects "${fakeEmail}"`);
    }

    const email = `smoke_${Date.now()}@hobymine.app`;
    const registered = await request('/api/auth/register', {
      auth: false,
      method: 'POST',
      body: {
        name: 'Smoke Tester',
        email,
        password: 'Password123!',
        age: 29,
        gender: 'woman',
        countryCode: 'SG',
        interestedIn: 'men',
        ageConfirmed: true,
      },
    });
    checkEqual(registered.status, 201, 'new account registration succeeds');
    const registeredToken = String(registered.body.token ?? '');
    check(registeredToken.length > 20, 'registration returns a JWT');
    checkEqual(
      ((registered.body.user ?? {}) as Json).email,
      email,
      'registration returns the new account',
    );
    checkEqual(
      ((registered.body.user ?? {}) as Json).countryCode,
      'SG',
      'registration saves the selected country',
    );
    checkEqual(
      ((registered.body.user ?? {}) as Json).countryName,
      'Singapore',
      'registration resolves the country display name',
    );
    check(
      typeof ((registered.body.user ?? {}) as Json).termsAcceptedAt === 'string',
      'registration records the legal acceptance',
    );

    // ---------- No email verification step ----------
    checkEqual(
      ((registered.body.user ?? {}) as Json).emailVerified,
      true,
      'a fresh account is usable straight away',
    );
    check(
      registered.body.devCode === undefined,
      'registration does not hand back a verification code',
    );

    const verifyRoute = await request('/api/auth/verify-email', {
      method: 'POST',
      body: { email, code: '000000' },
    });
    checkEqual(verifyRoute.status, 404, 'the removed verification endpoint is gone');

    const newLogin = await request('/api/auth/login', {
      auth: false,
      method: 'POST',
      body: { email, password: 'Password123!' },
    });
    checkEqual(newLogin.status, 200, 'new account can sign in');

    const priorToken = token;
    token = registeredToken;
    const newMe = await request('/api/me');
    checkEqual(newMe.status, 200, 'new account can read its profile');
    checkEqual(
      (((newMe.body.user ?? {}) as Json).preferences as Json).interestedIn,
      'men',
      'registration honours the interested-in choice',
    );
    token = priorToken;

    const duplicate = await request('/api/auth/register', {
      auth: false,
      method: 'POST',
      body: {
        name: 'Duplicate',
        email,
        password: 'Password123!',
        age: 29,
        gender: 'woman',
        countryCode: 'SG',
        interestedIn: 'men',
        ageConfirmed: true,
      },
    });
    checkEqual(duplicate.status, 409, 'duplicate email is rejected');

    // ---------- Cancel Plus ----------
    const cancel = await request('/api/plus/cancel', { method: 'POST' });
    checkEqual(cancel.status, 200, 'membership can be cancelled');
    checkEqual(((cancel.body.user ?? {}) as Json).plus, false, 'cancellation turns Plus off');
    const relocked = await request('/api/likes');
    checkEqual(relocked.status, 200, 'likes grid stays accessible after cancellation');
    checkEqual(relocked.body.limited, true, 'likes blur again after cancellation');
  } finally {
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await closeDb();
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) throw new Error(`${failed} smoke test checks failed`);
}

main().catch((error) => {
  console.error('\nSmoke test failed:', error);
  process.exitCode = 1;
});
