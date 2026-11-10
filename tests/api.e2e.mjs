// End-to-end checks of the wargame API against a running server (guest flow).
//   npm run build && npm start            (in another terminal)
//   SG_BASE_URL=http://localhost:3000 npm run test:e2e
// Skipped (not passed) when SG_BASE_URL is not set. Signed-in flows need MongoDB and
// are not covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { labs } from '../lib/labs.ts';
import { computeScore } from '../lib/wargame.ts';

const BASE = process.env.SG_BASE_URL;
const skip = BASE ? false : 'SG_BASE_URL is not set (needs a running server)';

function client() {
  let cookie = '';
  return async function call(path, body, { method = 'POST', origin = BASE, raw } = {}) {
    const headers = { 'content-type': 'application/json' };
    if (origin) headers.origin = origin;
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${BASE}${path}`, { method, headers, body: method === 'GET' ? undefined : raw ?? JSON.stringify(body) });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null; try { data = await res.json(); } catch { /* not json */ }
    return { status: res.status, data, setCookie: set };
  };
}
const flagIn = text => text?.match(/SG\{[a-z0-9_]+\}/)?.[0];

test('guest score and completion are computed from server-side state', { skip }, async () => {
  const lab = labs.find(l => l.id === 'xss');
  const call = client();
  // FLAG cannot be submitted before attack + defense are verified by the server
  let r = await call('/api/wargame/submit', { missionId: 'xss', flag: 'SG{aaaa}' });
  assert.equal(r.status, 409);
  // Hints: revealing level 2 is recorded server-side
  r = await call('/api/wargame/hint', { missionId: 'xss', level: 2 });
  assert.equal(r.status, 200); assert.equal(r.data.hintsUsed, 2); assert.equal(r.data.hints.length, 2);
  assert.match(r.setCookie, /HttpOnly/);
  // Attack in vulnerable mode returns the evidence with the FLAG
  r = await call('/api/wargame/simulate', { missionId: 'xss', input: lab.sample, defense: false });
  assert.equal(r.status, 200); assert.equal(r.data.attackSucceeded, true); assert.deepEqual(r.data.verified, { attack: true, defense: false });
  const flag = flagIn(r.data.evidence);
  assert.ok(flag, 'evidence contains a flag');
  // Still blocked until the defense check
  r = await call('/api/wargame/submit', { missionId: 'xss', flag });
  assert.equal(r.status, 409); assert.deepEqual(r.data.needs, { attack: false, defense: true });
  r = await call('/api/wargame/simulate', { missionId: 'xss', input: lab.sample, defense: true });
  assert.equal(r.data.defenseHeld, true); assert.deepEqual(r.data.verified, { attack: true, defense: true });
  // A wrong FLAG is counted by the server
  r = await call('/api/wargame/submit', { missionId: 'xss', flag: 'SG{wrong_guess}' });
  assert.equal(r.data.correct, false); assert.equal(r.data.wrongSubmissions, 1);
  // The client claims 0 hints / 0 wrong — the server ignores it
  r = await call('/api/wargame/submit', { missionId: 'xss', flag, hintsUsed: 0, wrongSubmissions: 0 });
  assert.equal(r.data.correct, true);
  assert.equal(r.data.score, computeScore(lab.level, 2, 1));
  assert.equal(r.data.hintsUsed, 2); assert.equal(r.data.wrongSubmissions, 1);
  // The verified run is consumed: a duplicate submit is rejected
  r = await call('/api/wargame/submit', { missionId: 'xss', flag });
  assert.equal(r.status, 409);
});

test('guest hints can only go up and the body cannot forge verification', { skip }, async () => {
  const call = client();
  let r = await call('/api/wargame/hint', { missionId: 'csrf', level: 1 });
  assert.equal(r.data.hintsUsed, 1);
  r = await call('/api/wargame/hint', { missionId: 'csrf', level: 0 });
  assert.equal(r.data.hintsUsed, 1, 'level 0 does not lower the recorded level');
  r = await call('/api/wargame/submit', { missionId: 'csrf', flag: 'SG{aaaa}', attackVerified: true, defenseVerified: true });
  assert.equal(r.status, 409, 'verification flags in the body are ignored');
});

test('a forged or foreign guest cookie is not trusted', { skip }, async () => {
  const res = await fetch(`${BASE}/api/wargame/submit`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, cookie: 'sg_guest=eyJ4c3MiOnsiYSI6dHJ1ZSwiZCI6dHJ1ZSwiaCI6MCwidyI6MH19.forged' }, body: JSON.stringify({ missionId: 'xss', flag: 'SG{aaaa}' }) });
  assert.equal(res.status, 409);
});

test('API input validation', { skip }, async () => {
  const call = client();
  assert.equal((await call('/api/wargame/submit', null, { raw: '{bad json' })).status, 400);
  assert.equal((await call('/api/wargame/submit', null, { raw: JSON.stringify({ missionId: 'xss', flag: 'x'.repeat(20000) }) })).status, 413);
  assert.equal((await call('/api/wargame/submit', null, { raw: '[]' })).status, 400);
  assert.equal((await call('/api/wargame/submit', { missionId: 'nope', flag: 'SG{aaaa}' })).status, 400);
  assert.equal((await call('/api/wargame/submit', { missionId: 'xss', flag: 'SG{aaaa}' }, { origin: 'http://evil.test' })).status, 403);
  assert.equal((await call('/api/wargame/submit', null, { method: 'GET' })).status, 405);
  assert.equal((await call('/api/wargame/simulate', { missionId: 'xss', input: 'x'.repeat(2001), defense: false })).status, 400);
  assert.equal((await call('/api/wargame/simulate', { missionId: 'xss', input: 'x', defense: 'yes' })).status, 400);
  assert.equal((await call('/api/wargame/hint', { missionId: 'xss', level: 4 })).status, 400);
  assert.equal((await call('/api/wargame/hint', { missionId: 'xss', level: 1.5 })).status, 400);
  const fmt = await call('/api/wargame/submit', { missionId: 'injection', flag: 'not-a-flag' });
  assert.equal(fmt.data.formatError, true);
  // Error bodies never echo internals
  const bad = await call('/api/progress', null, { raw: '{bad' });
  assert.ok(!JSON.stringify(bad.data ?? {}).match(/stack|mongo|Error:/i));
});

test('no FLAG in HTML or client bundles', { skip }, async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  assert.ok(!flagIn(html), 'home page HTML has no flag');
  const scripts = [...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]);
  assert.ok(scripts.length > 0);
  for (const src of scripts) assert.ok(!flagIn(await (await fetch(`${BASE}${src}`)).text()), `${src} has no flag`);
});
