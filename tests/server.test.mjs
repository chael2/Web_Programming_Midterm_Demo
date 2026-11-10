import test from 'node:test';
import assert from 'node:assert/strict';
import { labs } from '../lib/labs.ts';
import { normalizeRecords, FLAG_PATTERN } from '../lib/wargame.ts';
import { flagFor, flagSecret, verifyFlag, encodeGuestState, decodeGuestState, readGuestState, guestCookieHeader, GUEST_COOKIE } from '../lib/wargame-server.ts';
import { parseJsonBody, sameOrigin, MAX_BODY_BYTES } from '../lib/http.ts';
import * as ops from '../lib/wargame-db-ops.ts';

const ENV_KEYS = ['WARGAME_FLAG_SECRET', 'AUTH_SECRET', 'NODE_ENV'];
function withEnv(env, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

/* ---------- FLAG secret handling ---------- */
test('development without secrets uses readable fixed flags', () => withEnv({ NODE_ENV: 'development' }, () => {
  assert.equal(flagSecret().source, 'none');
  assert.equal(flagFor('access'), 'SG{idor_doc1002_owner_unchecked}');
}));

test('production without secrets never uses the public fixed flags', () => withEnv({ NODE_ENV: 'production' }, () => {
  const warn = console.warn; console.warn = () => {};
  try {
    assert.equal(flagSecret().source, 'ephemeral');
    const flag = flagFor('access');
    assert.notEqual(flag, 'SG{idor_doc1002_owner_unchecked}');
    assert.match(flag, FLAG_PATTERN);
    assert.equal(flagFor('access'), flag, 'stable within the process');
    assert.equal(verifyFlag('access', flag), true);
    assert.equal(verifyFlag('access', 'SG{idor_doc1002_owner_unchecked}'), false);
  } finally { console.warn = warn; }
}));

test('AUTH_SECRET derives deployment-specific flags; WARGAME_FLAG_SECRET takes precedence', () => {
  const fromAuth = withEnv({ AUTH_SECRET: 'auth-secret-a' }, () => { assert.equal(flagSecret().source, 'auth-secret'); return flagFor('xss'); });
  const fromOtherAuth = withEnv({ AUTH_SECRET: 'auth-secret-b' }, () => flagFor('xss'));
  const fromFlag = withEnv({ AUTH_SECRET: 'auth-secret-a', WARGAME_FLAG_SECRET: 'flag-secret' }, () => { assert.equal(flagSecret().source, 'flag-secret'); return flagFor('xss'); });
  assert.notEqual(fromAuth, fromOtherAuth);
  assert.notEqual(fromAuth, fromFlag);
  assert.ok(!fromAuth.includes('auth-secret'), 'the secret itself never appears in a flag');
  for (const f of [fromAuth, fromFlag]) assert.match(f, FLAG_PATTERN);
});

/* ---------- Guest state cookie ---------- */
test('guest state round-trips and rejects tampering', () => {
  const value = encodeGuestState({ access: { a: true, d: false, h: 2, w: 1 } });
  assert.deepEqual(decodeGuestState(value), { access: { a: true, d: false, h: 2, w: 1 } });
  const [payload, sig] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ access: { a: true, d: true, h: 0, w: 0 } })).toString('base64url');
  assert.deepEqual(decodeGuestState(`${forged}.${sig}`), {}, 'changed payload with old signature');
  assert.deepEqual(decodeGuestState(`${payload}.${sig.slice(0, -2)}xx`), {}, 'changed signature');
  for (const bad of [undefined, '', 'abc', 'a.b.c', 'x'.repeat(5000)]) assert.deepEqual(decodeGuestState(bad), {});
});

test('guest state drops unknown missions and clamps counters', () => {
  const value = encodeGuestState({ nope: { a: true, d: true, h: 0, w: 0 }, xss: { a: 'yes', d: true, h: 99, w: -4 } });
  assert.deepEqual(decodeGuestState(value), { xss: { a: false, d: true, h: 3, w: 0 } });
});

test('guest cookie is HttpOnly, path-scoped, SameSite=Lax and Secure only over HTTPS', () => {
  const state = { csrf: { a: true, d: true, h: 1, w: 0 } };
  const http = guestCookieHeader(new Request('http://localhost:3000/api/wargame/submit'), state);
  const https = guestCookieHeader(new Request('https://example.test/api/wargame/submit'), state);
  for (const h of [http, https]) { assert.ok(h.startsWith(`${GUEST_COOKIE}=`)); assert.match(h, /HttpOnly/); assert.match(h, /Path=\/api\/wargame/); assert.match(h, /SameSite=Lax/); }
  assert.doesNotMatch(http, /Secure/);
  assert.match(https, /Secure/);
  const cookie = http.split(';')[0];
  const request = new Request('http://localhost/api/wargame/submit', { headers: { cookie: `other=1; ${cookie}` } });
  assert.deepEqual(readGuestState(request), state);
});

/* ---------- Request parsing ---------- */
test('parseJsonBody rejects oversized, malformed and non-object bodies', async () => {
  const req = body => new Request('http://localhost/api/x', { method: 'POST', body });
  assert.equal((await parseJsonBody(req('x'.repeat(MAX_BODY_BYTES + 1)))).error?.status, 413);
  assert.equal((await parseJsonBody(req('{bad json'))).error?.status, 400);
  assert.equal((await parseJsonBody(req('[1,2]'))).error?.status, 400);
  assert.equal((await parseJsonBody(req('"str"'))).error?.status, 400);
  assert.equal((await parseJsonBody(req(''))).error?.status, 400);
  assert.deepEqual((await parseJsonBody(req('{"missionId":"xss"}'))).body, { missionId: 'xss' });
  const declaredLarge = new Request('http://localhost/api/x', { method: 'POST', body: '{}', headers: { 'content-length': String(MAX_BODY_BYTES + 10) } });
  assert.equal((await parseJsonBody(declaredLarge)).error?.status, 413);
});

test('sameOrigin accepts only a matching Origin header', () => {
  const r = origin => new Request('http://localhost:3000/api/x', { method: 'POST', headers: origin ? { origin } : {} });
  assert.equal(sameOrigin(r('http://localhost:3000')), true);
  assert.equal(sameOrigin(r('http://evil.test')), false);
  assert.equal(sameOrigin(r(null)), false);
});

/* ---------- MongoDB atomic update documents ---------- */
test('every query is scoped to the session user document', () => {
  for (const filter of [ops.userFilter('u1'), ops.recordFilter('u1', 'xss'), ops.missingRecordFilter('u1', 'xss'), ops.hintFilter('u1', 'xss', 2), ops.clearFilter('u1', 'xss', { hintsUsed: 0, wrongSubmissions: 0 }), ops.firstSolveFilter('u1', 'xss')]) {
    assert.equal(filter.userId, 'u1');
  }
});

test('mission records are pushed only when missing (no duplicates under concurrency)', () => {
  assert.deepEqual(ops.missingRecordFilter('u1', 'xss'), { userId: 'u1', 'wargame.missionId': { $ne: 'xss' } });
  assert.deepEqual(ops.pushRecordUpdate({ missionId: 'xss' }), { $push: { wargame: { missionId: 'xss' } } });
  assert.deepEqual(ops.ensureDocUpdate(), { $setOnInsert: { completed: [], wargame: [] } });
});

test('hint updates enforce order and never lower the level', () => {
  assert.deepEqual(ops.hintFilter('u1', 'xss', 3), { userId: 'u1', wargame: { $elemMatch: { missionId: 'xss', hintsUsed: { $gte: 2 } } } });
  assert.deepEqual(ops.hintUpdate(3), { $max: { 'wargame.$.hintsUsed': 3 } });
  assert.deepEqual(ops.wrongUpdate(), { $inc: { 'wargame.$.wrongSubmissions': 1 } });
  assert.deepEqual(ops.verifyUpdate(true, false), { $set: { 'wargame.$.attackVerified': true } });
});

test('a clear applies only to the exact verified run and resets it', () => {
  const filter = ops.clearFilter('u1', 'xss', { hintsUsed: 1, wrongSubmissions: 2 });
  assert.deepEqual(filter.wargame.$elemMatch, { missionId: 'xss', attackVerified: true, defenseVerified: true, hintsUsed: 1, wrongSubmissions: 2 });
  const now = new Date('2026-01-01T00:00:00Z');
  const update = ops.clearUpdate('xss', 65, now);
  assert.equal(update.$set['wargame.$.attackVerified'], false);
  assert.equal(update.$set['wargame.$.defenseVerified'], false);
  assert.equal(update.$set['wargame.$.wrongSubmissions'], 0);
  assert.deepEqual(update.$max, { 'wargame.$.bestScore': 65 });
  assert.deepEqual(update.$inc, { 'wargame.$.clears': 1 });
  assert.deepEqual(update.$addToSet, { completed: 'xss' });
  assert.deepEqual(ops.firstSolveFilter('u1', 'xss').wargame.$elemMatch, { missionId: 'xss', firstSolvedAt: null });
});

test('reading records keeps the first duplicate entry, matching positional updates', () => {
  const ids = labs.map(l => l.id);
  const records = normalizeRecords([{ missionId: 'xss', bestScore: 90 }, { missionId: 'xss', bestScore: 10 }], ids);
  assert.equal(records.xss.bestScore, 90);
});
