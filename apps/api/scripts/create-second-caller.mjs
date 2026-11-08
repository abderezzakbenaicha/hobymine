// Creates a second real account that matches the demo account, for manual testing.
import { io } from 'socket.io-client';

const API = 'http://localhost:4000';

async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : {} };
}

const email = `caller_${Date.now()}@hobymine.app`;
const registered = await api('/api/auth/register', {
  method: 'POST',
  body: {
    name: 'Second Caller',
    email,
    password: 'Password123!',
    age: 27,
    gender: 'woman',
    countryCode: 'SG',
    interestedIn: 'everyone',
  },
});
if (registered.status !== 201) throw new Error(JSON.stringify(registered.body));
const token = registered.body.token;
const user = registered.body.user;

const demo = (await api('/api/auth/demo', { method: 'POST' })).body;

// The new person likes the demo account.
await api('/api/swipes', { method: 'POST', token, body: { targetId: demo.user.id, action: 'like' } });
// The demo account likes back, which creates the match.
const like = await api('/api/swipes', {
  method: 'POST',
  token: demo.token,
  body: { targetId: user.id, action: 'like' },
});

console.log(JSON.stringify({ email, password: 'Password123!', token, userId: user.id, matchId: like.body.match?.id }, null, 2));

const socket = io(API, { auth: { token }, transports: ['websocket'] });
socket.on('call:incoming', (payload) => console.log('incoming call', payload));
socket.on('call:signal', (payload) => console.log('signal', payload.description?.type ?? 'candidate'));
setTimeout(() => process.exit(0), 20000);
