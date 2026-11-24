// End-to-end checks of the wargame API against a running server (guest flow).
//   npm run build && npm start            (in another terminal)
//   SG_BASE_URL=http://localhost:3000 npm run test:e2e
// Skipped (not passed) when SG_BASE_URL is not set. The server's database must contain
// the seed missions (npm run seed:missions). Signed-in flows are not covered here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { labs } from './helpers/seed.mjs';
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
const fixesOf = lab => lab.defenseLab.options.filter(o => o.effect === 'fix').map(o => o.id);

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
  r = await call('/api/wargame/defend', { missionId: 'xss', input: lab.sample, measures: fixesOf(lab) });
  assert.equal(r.status, 200); assert.equal(r.data.report.held, true); assert.deepEqual(r.data.verified, { attack: true, defense: true });
  // A wrong FLAG is counted by the server
  r = await call('/api/wargame/submit', { missionId: 'xss', flag: 'SG{wrong_guess}' });
  assert.equal(r.data.correct, false); assert.equal(r.data.wrongSubmissions, 1);
  // The client claims 0 hints / 0 wrong — the server ignores it
  r = await call('/api/wargame/submit', { missionId: 'xss', flag, hintsUsed: 0, wrongSubmissions: 0 });
  assert.equal(r.data.correct, true);
  // hints 2, one wrong answer, defense verified on the first check
  assert.equal(r.data.score, computeScore(lab.level, 2, 1, { defenseFirstTry: true }));
  assert.equal(r.data.breakdown.total, r.data.score);
  assert.deepEqual(r.data.breakdown.bonuses.map(b => b.earned), [false, true, false]);
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
  // Missions are rendered from the database without answers
  for (const m of labs) {
    for (const h of m.hints) assert.ok(!html.includes(h), `${m.missionId} hint in HTML`);
    assert.ok(!html.includes(m.flagPrefix), `${m.missionId} flag prefix in HTML`);
  }
});

test('every user gets a different random flag; another user\'s flag is rejected', { skip }, async () => {
  const lab = labs.find(l => l.id === 'crypto');
  const solve = async call => {
    const attack = await call('/api/wargame/simulate', { missionId: lab.id, input: lab.sample, defense: false });
    assert.equal(attack.status, 200);
    await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: fixesOf(lab) });
    return flagIn(attack.data.evidence);
  };
  const alice = client(), bob = client();
  const flagA = await solve(alice), flagB = await solve(bob);
  assert.match(flagA, new RegExp(`^SG\\{${lab.flagPrefix}_[0-9a-f]{16}\\}$`));
  assert.notEqual(flagA, flagB, 'two guests must receive different flags');
  // the same user keeps the same flag on a repeated attack
  assert.equal(await solve(alice), flagA);
  // Bob submits Alice's flag → wrong
  const stolen = await bob('/api/wargame/submit', { missionId: lab.id, flag: flagA });
  assert.equal(stolen.data.correct, false, 'another user\'s flag must not be accepted');
  // Bob's own flag → correct
  const own = await bob('/api/wargame/submit', { missionId: lab.id, flag: flagB });
  assert.equal(own.data.correct, true);
});

test('the attack sample is only revealed at hint level 3', { skip }, async () => {
  const lab = labs.find(l => l.id === 'auth');
  const call = client();
  let r = await call('/api/wargame/hint', { missionId: lab.id, level: 2 });
  assert.equal(r.data.sample, undefined);
  r = await call('/api/wargame/hint', { missionId: lab.id, level: 3 });
  assert.equal(r.data.sample, lab.sample);
});

test('legacy progress POST (completion without FLAG) is gone', { skip }, async () => {
  const r = await fetch(`${BASE}/api/progress`, { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE }, body: JSON.stringify({ id: 'xss' }) });
  assert.equal(r.status, 405);
});

test('defense lab: only a correct choice of measures verifies the defense', { skip }, async () => {
  const lab = labs.find(l => l.id === 'injection');
  const call = client();
  const byEffect = e => lab.defenseLab.options.filter(o => o.effect === e).map(o => o.id);
  // Defense before any successful attack is refused
  let r = await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: fixesOf(lab) });
  assert.equal(r.status, 409);
  await call('/api/wargame/simulate', { missionId: lab.id, input: lab.sample });
  // The old one-click defense mode no longer exists
  assert.equal((await call('/api/wargame/simulate', { missionId: lab.id, input: lab.sample, defense: true })).status, 400);
  // Validation
  assert.equal((await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: ['no-such-measure'] })).status, 400);
  assert.equal((await call('/api/wargame/defend', { missionId: lab.id, input: lab.normal, measures: fixesOf(lab) })).status, 400, 'must defend against a real attack');
  assert.equal((await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: 'prepared' })).status, 400);
  // Ineffective and partial measures do not verify the defense
  r = await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: byEffect('none') });
  assert.equal(r.data.report.held, false); assert.equal(r.data.verified.defense, false); assert.equal(r.data.report.tests[0].ok, false);
  r = await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: byEffect('partial') });
  assert.equal(r.data.report.held, false); assert.equal(r.data.report.tests[0].ok, true); assert.equal(r.data.report.tests[1].ok, false, 'variant gets through');
  // A fix with a harmful side effect fails the normal-user test
  r = await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: [...fixesOf(lab), ...byEffect('harmful')] });
  assert.equal(r.data.report.held, false); assert.equal(r.data.report.tests[2].ok, false);
  r = await call('/api/wargame/submit', { missionId: lab.id, flag: 'SG{aaaa}' });
  assert.equal(r.status, 409, 'FLAG still locked');
  // The right measures (plus optional defense in depth) pass
  r = await call('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: [...fixesOf(lab), ...byEffect('extra')] });
  assert.equal(r.data.report.held, true); assert.equal(r.data.verified.defense, true);
});

test('defense answers (effects, explanations, attack variant) are not in the page', { skip }, async () => {
  const html = await (await fetch(`${BASE}/`)).text();
  for (const m of labs) {
    const v = m.defenseLab.variant.input;
    if (v.length >= 10 && /^[\w -]+$/.test(v)) assert.ok(!html.includes(v), `${m.missionId} variant in HTML`);
    for (const o of m.defenseLab.options) assert.ok(!html.includes(o.why.slice(0, 40)), `${m.missionId}/${o.id} explanation in HTML`);
  }
  assert.ok(!/"effect":"(fix|partial|harmful)"/.test(html), 'option effects in HTML');
});

test('defense bonus: only the first check counts, and bonuses reach the score', { skip }, async () => {
  const lab = labs.find(l => l.id === 'supply');
  const ids = e => lab.defenseLab.options.filter(o => o.effect === e).map(o => o.id);
  // Guest A: wrong first, then right → no first-try bonus
  const a = client();
  let r = await a('/api/wargame/simulate', { missionId: lab.id, input: lab.sample });
  const flagA = flagIn(r.data.evidence);
  r = await a('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: ids('none') });
  assert.equal(r.data.stats.defenseTries, 1); assert.equal(r.data.report.held, false);
  r = await a('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: [...ids('fix'), ...ids('extra')] });
  assert.deepEqual(r.data.stats, { defenseTries: 2, defenseFirstTry: false, defenseDepth: true });
  // checks after verification do not change the recorded bonus
  r = await a('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: ids('fix') });
  assert.equal(r.data.stats.defenseDepth, true);
  r = await a('/api/wargame/submit', { missionId: lab.id, flag: flagA });
  assert.equal(r.data.score, computeScore(lab.level, 0, 0, { defenseDepth: true }));
  // Guest B: perfect run → every bonus
  const b = client();
  r = await b('/api/wargame/simulate', { missionId: lab.id, input: lab.sample });
  const flagB = flagIn(r.data.evidence);
  r = await b('/api/wargame/defend', { missionId: lab.id, input: lab.sample, measures: [...ids('fix'), ...ids('extra')] });
  assert.deepEqual(r.data.stats, { defenseTries: 1, defenseFirstTry: true, defenseDepth: true });
  r = await b('/api/wargame/submit', { missionId: lab.id, flag: flagB });
  assert.equal(r.data.score, r.data.breakdown.max);
  // The evidence reflects what this guest typed
  r = await b('/api/wargame/simulate', { missionId: lab.id, input: 'secure-guard-utils' });
  assert.match(r.data.evidence, /npm install secure-guard-utils/);
});
