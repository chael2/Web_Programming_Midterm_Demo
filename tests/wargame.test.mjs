import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { computeScore, basePoints, normalizeRecords, totalScore, maxTotalScore, maxMissionScore, scoreBreakdown, rankFor, FLAG_PATTERN, emptyRecord } from '../lib/wargame.ts';
import { toPublicMissions } from '../lib/mission-engine.ts';
import { rateLimit } from '../lib/wargame-server.ts';
import { labs } from './helpers/seed.mjs';

const ids = labs.map(l => l.id);

test('per-user flags fit the FLAG format for every mission prefix', () => {
  // Real flags are SG{<prefix>_<16 random hex>} (lib/missions.ts flagForOwner).
  for (const m of labs) assert.match(`SG{${m.flagPrefix}_0123456789abcdef}`, FLAG_PATTERN, m.missionId);
});

test('missions sent to the browser contain no answers', () => {
  const pub = toPublicMissions(labs, () => 'X');
  assert.equal(pub.length, labs.length);
  for (const m of pub) {
    for (const k of ['rule', 'sample', 'flagPrefix', 'evidence', 'hints', 'missionId', 'published', 'order']) assert.ok(!(k in m), `${m.id} exposes ${k}`);
    assert.ok(!('sample' in m.lesson.input), `${m.id} exposes lesson.input.sample`);
  }
  const text = JSON.stringify(pub);
  for (const m of labs) {
    for (const h of m.hints) assert.ok(!text.includes(h), `${m.missionId} hint leaked`);
    assert.ok(!text.includes(m.evidence.split('{{flag}}')[0].trim()), `${m.missionId} evidence leaked`);
    assert.ok(!text.includes(m.flagPrefix), `${m.missionId} flag prefix leaked`);
  }
});

test('score rules: base points, hint and wrong-answer penalties, floor', () => {
  assert.equal(basePoints('입문'), 100);
  assert.equal(basePoints('중급'), 150);
  // no hints and no wrong answers → +10% "스스로 해결" bonus
  assert.equal(computeScore('입문', 0, 0), 110);
  assert.equal(computeScore('입문', 1, 0), 90);
  assert.equal(computeScore('입문', 2, 0), 70);
  assert.equal(computeScore('입문', 3, 0), 40);
  assert.equal(computeScore('중급', 3, 0), 60);
  assert.equal(computeScore('입문', 0, 2), 90);
  // defense bonuses: first-try +15%, defense in depth +10%
  assert.equal(computeScore('입문', 0, 0, { defenseFirstTry: true, defenseDepth: true }), 135);
  assert.equal(computeScore('중급', 3, 0, { defenseFirstTry: true }), 60 + 23);
  assert.equal(maxMissionScore('입문'), 135);
  assert.equal(maxMissionScore('중급'), 203);
  const b = scoreBreakdown('입문', 2, 1, { defenseDepth: true });
  assert.deepEqual([b.base, b.hintPenalty, b.wrongPenalty, b.total], [100, 30, 5, 75]);
  assert.deepEqual(b.bonuses.map(x => x.earned), [false, false, true]);
  assert.equal(rankFor(0, 1000).title, '보안 입문자');
  assert.deepEqual(rankFor(99, 1000).next, { title: '취약점 탐색자', need: 1 });
  assert.equal(rankFor(1000, 1000).next, null);
  assert.equal(computeScore('입문', 0, 50), 80, 'wrong-answer penalty is capped at 20%');
  assert.equal(computeScore('입문', 3, 50), 20, 'never below the 20% floor');
  assert.equal(computeScore('입문', 99, -5), 40, 'out-of-range values are clamped');
  assert.equal(maxTotalScore(labs.map(l => l.level)), labs.reduce((s, l) => s + maxMissionScore(l.level), 0));
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

test('client code never imports server-only modules or contains mission answers', () => {
  const clientFiles = [
    ...readdirSync(new URL('../components/', import.meta.url), { recursive: true }).filter(f => /\.tsx?$/.test(f)).map(f => `../components/${String(f).replaceAll('\\', '/')}`),
    '../lib/labs.ts', '../lib/wargame.ts', '../lib/lessons.ts', '../lib/mission-engine.ts',
  ];
  const answers = labs.flatMap(m => [...m.hints, m.evidence.split('{{flag}}')[0].trim(), m.flagPrefix]);
  for (const file of clientFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const mod of ['wargame-server', 'wargame-store', 'lib/missions', 'lib/db', 'lib/admin', 'node:crypto', 'mongoose']) assert.ok(!imports.some(i => i.endsWith(mod) || i === mod), `${file} must not import ${mod}`);
    for (const a of answers) assert.ok(!source.includes(a), `${file} contains mission answer text: ${a.slice(0, 30)}`);
    assert.ok(!source.includes('dangerouslySetInnerHTML'), `${file} must not use dangerouslySetInnerHTML`);
  }
});
