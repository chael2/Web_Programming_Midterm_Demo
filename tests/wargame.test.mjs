import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { labs, simulate } from '../lib/labs.ts';
import { computeScore, basePoints, normalizeRecords, totalScore, maxTotalScore, missionObjectives, FLAG_PATTERN, emptyRecord } from '../lib/wargame.ts';
import { secretMissionIds, flagFor, verifyFlag, evidenceFor, hintsFor, hasMission, rateLimit } from '../lib/wargame-server.ts';

const ids = labs.map(l => l.id);

test('every mission has a server-side secret and a public objective', () => {
  assert.deepEqual([...secretMissionIds].sort(), [...ids].sort());
  for (const id of ids) assert.ok(missionObjectives[id]?.length > 10, id);
  assert.equal(hasMission('unknown'), false);
  assert.equal(hasMission('__proto__'), false);
});

test('flags are unique, well-formed and verified on the server', () => {
  const flags = ids.map(flagFor);
  assert.equal(new Set(flags).size, flags.length);
  for (const id of ids) {
    const flag = flagFor(id);
    assert.match(flag, FLAG_PATTERN);
    assert.equal(verifyFlag(id, flag), true);
    assert.equal(verifyFlag(id, `  ${flag}\n`), true, 'surrounding whitespace is ignored');
    assert.equal(verifyFlag(id, flag.toUpperCase()), false);
    assert.equal(verifyFlag(id, 'SG{wrong_flag}'), false);
    assert.equal(verifyFlag(id, ''), false);
  }
  assert.equal(verifyFlag(ids[0], flagFor(ids[1])), false, 'a flag only solves its own mission');
  assert.equal(verifyFlag('unknown', flagFor(ids[0])), false);
});

test('WARGAME_FLAG_SECRET makes flags deployment-specific', () => {
  const plain = flagFor('access');
  process.env.WARGAME_FLAG_SECRET = 'test-secret-value';
  try {
    const salted = flagFor('access');
    assert.notEqual(salted, plain);
    assert.match(salted, FLAG_PATTERN);
    assert.equal(verifyFlag('access', salted), true);
    assert.equal(verifyFlag('access', plain), false);
  } finally { delete process.env.WARGAME_FLAG_SECRET; }
});

test('evidence (with FLAG) corresponds to a successful vulnerable-mode attack', () => {
  for (const lab of labs) {
    const attack = simulate(lab.id, lab.sample, false);
    assert.ok(attack.attacked && !attack.blocked, `${lab.id} sample must succeed in attack mode`);
    const defense = simulate(lab.id, lab.sample, true);
    assert.ok(defense.blocked, `${lab.id} sample must be blocked in defense mode`);
    assert.ok(evidenceFor(lab.id).includes(flagFor(lab.id)));
    assert.ok(!attack.output.includes('SG{'), 'simulate() output itself never carries a flag');
  }
});

test('hints have three progressive levels', () => {
  for (const id of ids) {
    assert.equal(hintsFor(id, 0).length, 0);
    assert.equal(hintsFor(id, 1).length, 1);
    assert.equal(hintsFor(id, 3).length, 3);
    assert.equal(hintsFor(id, 9).length, 3);
    for (const hint of hintsFor(id, 3)) { assert.ok(hint.length > 10); assert.ok(!hint.includes('SG{')); }
  }
});

test('score rules: base points, hint and wrong-answer penalties, floor', () => {
  assert.equal(basePoints('입문'), 100);
  assert.equal(basePoints('중급'), 150);
  assert.equal(computeScore('입문', 0, 0), 100);
  assert.equal(computeScore('입문', 1, 0), 90);
  assert.equal(computeScore('입문', 2, 0), 70);
  assert.equal(computeScore('입문', 3, 0), 40);
  assert.equal(computeScore('중급', 3, 0), 60);
  assert.equal(computeScore('입문', 0, 2), 90);
  assert.equal(computeScore('입문', 0, 50), 80, 'wrong-answer penalty is capped at 20%');
  assert.equal(computeScore('입문', 3, 50), 20, 'never below the 20% floor');
  assert.equal(computeScore('입문', 99, -5), 40, 'out-of-range values are clamped');
  assert.equal(maxTotalScore(labs.map(l => l.level)), labs.reduce((s, l) => s + basePoints(l.level), 0));
});

test('stored records are sanitized and unknown missions dropped', () => {
  const records = normalizeRecords([
    { missionId: 'access', hintsUsed: 7, bestScore: 90, lastScore: 90, clears: 1, solvedAt: '2026-01-01T00:00:00.000Z', attackVerified: 'yes' },
    { missionId: 'nope', bestScore: 500 },
    null, 'x',
  ], ids);
  assert.deepEqual(Object.keys(records), ['access']);
  assert.equal(records.access.hintsUsed, 3);
  assert.equal(records.access.attackVerified, false);
  assert.equal(records.access.solvedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(totalScore(records), 90);
  assert.deepEqual(normalizeRecords(undefined, ids), {});
  assert.equal(emptyRecord('xss').bestScore, 0);
});

test('flag submissions are rate limited per key', () => {
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit('t-key', now + i, 3, 1000).ok, true);
  const blocked = rateLimit('t-key', now + 10, 3, 1000);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter >= 1);
  assert.equal(rateLimit('other-key', now + 10, 3, 1000).ok, true);
  assert.equal(rateLimit('t-key', now + 1001, 3, 1000).ok, true, 'window slides');
});

test('client code never imports the server-only flag module or contains flags', () => {
  const clientFiles = [
    ...readdirSync(new URL('../components/', import.meta.url), { recursive: true }).filter(f => /\.tsx?$/.test(f)).map(f => `../components/${String(f).replaceAll('\\', '/')}`),
    '../lib/labs.ts', '../lib/wargame.ts', '../lib/lessons.ts', '../app/page.tsx', '../app/layout.tsx',
  ];
  for (const file of clientFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!source.includes('wargame-server'), `${file} must not import wargame-server`);
    assert.ok(!source.includes('wargame-store'), `${file} must not import wargame-store`);
    for (const id of ids) assert.ok(!source.includes(flagFor(id).slice(3, -1)), `${file} leaks ${id} flag`);
    assert.ok(!source.includes('dangerouslySetInnerHTML'), `${file} must not use dangerouslySetInnerHTML`);
  }
});
