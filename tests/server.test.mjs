import test from 'node:test';
import assert from 'node:assert/strict';
import { labs } from './helpers/seed.mjs';
import { normalizeRecords } from '../lib/wargame.ts';
import { encodeGuestState, decodeGuestState, readGuestState, guestCookieHeader, newGuestId, GUEST_COOKIE } from '../lib/wargame-server.ts';
import { parseJsonBody, sameOrigin, MAX_BODY_BYTES } from '../lib/http.ts';
import * as ops from '../lib/wargame-db-ops.ts';

/* ---------- Guest identity and state cookie ---------- */
test('each new guest gets a different random id', () => {
  const a = newGuestId(), b = newGuestId();
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.notEqual(a, b);
  assert.notEqual(decodeGuestState(null).id, decodeGuestState(null).id, 'missing cookie → fresh guest');
});

test('guest state round-trips and rejects tampering', () => {
  const state = { id: 'a'.repeat(32), m: { access: { a: true, d: false, h: 2, w: 1 } } };
  const value = encodeGuestState(state);
  assert.deepEqual(decodeGuestState(value), state);
  const [payload, sig] = value.split('.');
  const forged = Buffer.from(JSON.stringify({ id: 'b'.repeat(32), m: { access: { a: true, d: true, h: 0, w: 0 } } })).toString('base64url');
  for (const bad of [`${forged}.${sig}`, `${payload}.${sig.slice(0, -2)}xx`, undefined, '', 'abc', 'a.b.c', 'x'.repeat(5000)]) {
    const decoded = decodeGuestState(bad);
    assert.notEqual(decoded.id, 'b'.repeat(32), 'a forged id is never accepted');
    assert.deepEqual(decoded.m, {}, 'tampered or missing cookie → empty state');
  }
});

test('guest state drops malformed mission ids and clamps counters', () => {
  const value = encodeGuestState({ id: 'c'.repeat(32), m: { 'Bad Id': { a: true, d: true, h: 0, w: 0 }, xss: { a: 'yes', d: true, h: 99, w: -4 } } });
  assert.deepEqual(decodeGuestState(value).m, { xss: { a: false, d: true, h: 3, w: 0 } });
  const badId = encodeGuestState({ id: 'not-hex', m: {} });
  assert.match(decodeGuestState(badId).id, /^[a-f0-9]{32}$/, 'invalid guest id is replaced');
});

test('guest cookie is HttpOnly, path-scoped, SameSite=Lax and Secure only over HTTPS', () => {
  const state = { id: 'd'.repeat(32), m: { csrf: { a: true, d: true, h: 1, w: 0 } } };
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
