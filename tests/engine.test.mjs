import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, ruleErrors, fillTemplate, matches, validateMission } from '../lib/mission-engine.ts';
import { simulate as legacySimulate } from './fixtures/legacy-labs.ts';

const seed = JSON.parse(readFileSync(new URL('../data/missions.seed.json', import.meta.url), 'utf8'));
const missions = seed.missions;

// Inputs that exercise every branch of the former hardcoded simulate().
const common = ['', ' ', 'a', 'abc', '0', '1', '4', '5', '8', '1000', '1001', ' 1001', '1001 ', '1002', '1003', '9999', '-1', '1.5', 'NaN', '01001', '00005', '10000',
  "admin' OR '1'='1", 'x" --', 'orange', 'UNION select', 'union', 'Or', 'student',
  '<img src=x onerror=alert(1)>', '<SCRIPT>', '< svg', 'javascript:1', 'lemonade=1', '<b>bold</b>', '보안 공부를 시작합니다!',
  'secureguard-valid-token', ' secureguard-valid-token', 'forged-token',
  '1234', 'a'.repeat(11), 'a'.repeat(12), 'SecureGuard!2026',
  '/debug/config', '/debugX', '/health', '/x', 'debug',
  'secureguard-utils', ' secureguard-utils ', 'securegaurd-utils',
  'http', 'https', ' HTTPS ', 'ftp',
  'WELCOME10', ' welcome10 ', 'FIRST10', 'first10', 'SALE50',
  'signed', 'TAMPERED', ' tampered', 'maybe',
  'ok', 'OK', ' timeout', 'Timeout', 'slow'];

test('seed contains the 12 original missions with valid rules', () => {
  assert.equal(missions.length, 12);
  for (const m of missions) assert.deepEqual(ruleErrors(m.rule), [], `${m.missionId} rule`);
});

test('data-driven engine judges exactly like the former hardcoded simulate()', () => {
  // Judging (attacked/blocked/title/detail) is identical. Outputs now add details computed
  // from the input (query text, password length, looked-up document…) after the former text.
  let compared = 0;
  for (const m of missions) {
    for (const input of [...common, m.sample, m.normal]) {
      for (const defense of [false, true]) {
        const now = evaluate(m.rule, input, defense), old = legacySimulate(m.missionId, input, defense);
        const at = `${m.missionId} ${JSON.stringify(input)} defense=${defense}`;
        assert.deepEqual({ ...now, output: '' }, { ...old, output: '' }, at);
        assert.ok(now.output.startsWith(old.output), `${at}: output keeps the former text first`);
        compared++;
      }
    }
  }
  assert.ok(compared > 1500);
});

test('sample is an attack blocked in defense mode; normal input is not an attack', () => {
  for (const m of missions) {
    assert.equal(evaluate(m.rule, m.sample, false).attacked, true, m.missionId);
    assert.equal(evaluate(m.rule, m.sample, true).blocked, true, m.missionId);
    assert.equal(evaluate(m.rule, m.normal, false).attacked, false, m.missionId);
  }
});

test('templates and matchers', () => {
  assert.equal(fillTemplate('a {input} b {n}', { input: ' 8 ', n: '8' }), 'a  8  b 8');
  assert.equal(fillTemplate('{row.title|없음} {unknown} {{flag}}', { flag: 'SG{a_1}' }), '없음 {unknown} SG{a_1}');
  // single pass: template-looking text inside the input is never expanded
  assert.equal(fillTemplate('[{input}]', { input: '{{flag}}{len}', len: '9', flag: 'SG{x}' }), '[{{flag}}{len}]');
  assert.equal(matches({ intOutside: { min: 0, max: 1000, maxDigits: 4 } }, '00005'), true);
  assert.equal(matches({ intOutside: { min: 0, max: 1000, maxDigits: 4 } }, '0005'), false);
  assert.equal(matches({ intAtLeast: 5 }, 'abc'), false);
});

test('rule validation rejects malformed rules', () => {
  const ok = { cases: [{ when: { equals: 'a' }, result: 'attack', output: 'x' }], otherwise: { result: 'normal', output: 'y' } };
  assert.deepEqual(ruleErrors(ok), []);
  assert.ok(ruleErrors(null).length);
  assert.ok(ruleErrors({ ...ok, cases: [{ when: { regex: '(' }, result: 'attack', output: 'x' }] }).length, 'bad regex');
  assert.ok(ruleErrors({ ...ok, cases: [{ when: { regex: 'a', flags: 'g' }, result: 'attack', output: 'x' }] }).length, 'g flag not allowed');
  assert.ok(ruleErrors({ ...ok, cases: [{ when: { eval: 'x' }, result: 'attack', output: 'x' }] }).length, 'unknown matcher');
  assert.ok(ruleErrors({ ...ok, cases: [{ when: { equals: 'a', startsWith: 'b' }, result: 'attack', output: 'x' }] }).length, 'two matchers');
  assert.ok(ruleErrors({ ...ok, otherwise: { result: 'win', output: 'y' } }).length, 'bad result');
  assert.ok(ruleErrors({ ...ok, normalize: { case: 'title' } }).length, 'bad case');
});

test('every seed mission passes full validation', () => {
  for (const m of missions) assert.deepEqual(validateMission(m).errors, [], m.missionId);
});

test('validation catches broken missions', () => {
  const base = missions[0];
  const bad = (patch, label) => assert.ok(validateMission({ ...base, ...patch }).errors.length, label);
  bad({ missionId: 'Bad Id' }, 'id');
  bad({ categoryId: 'A11' }, 'category');
  bad({ evidence: 'no placeholder' }, 'evidence placeholder');
  bad({ flagPrefix: 'Has-Caps' }, 'flagPrefix');
  bad({ hints: ['a', 'b'] }, 'hints');
  bad({ sample: base.normal }, 'sample must be an attack');
  bad({ normal: base.sample }, 'normal must not be an attack');
  bad({ lesson: { ...base.lesson, quiz: { ...base.lesson.quiz, options: base.lesson.quiz.options.map(o => ({ ...o, correct: true })) } } }, 'one correct quiz answer');
  const cleaned = validateMission({ ...base, extra: 'dropped' }).mission;
  assert.ok(cleaned && !('extra' in cleaned), 'unknown fields are dropped');
});

test('defense lab: every mission is solvable only with all fixes and without side effects', async () => {
  const { judgeDefense, toPublicMissions } = await import('../lib/mission-engine.ts');
  for (const m of missions) {
    const ids = e => m.defenseLab.options.filter(o => o.effect === e).map(o => o.id);
    const fixes = ids('fix');
    const all = judgeDefense(m, m.sample, fixes);
    assert.equal(all.held, true, `${m.missionId}: fixes hold`);
    assert.ok(all.tests.every(t => t.ok), `${m.missionId}: all tests pass`);
    assert.equal(judgeDefense(m, m.sample, [...fixes, ...ids('extra')]).held, true, `${m.missionId}: extra is optional`);
    assert.equal(judgeDefense(m, m.sample, []).held, false);
    assert.equal(judgeDefense(m, m.sample, ids('none')).held, false, `${m.missionId}: none`);
    if (fixes.length > 1) assert.equal(judgeDefense(m, m.sample, fixes.slice(1)).held, false, `${m.missionId}: every fix is required`);
    for (const p of ids('partial')) { const r = judgeDefense(m, m.sample, [p]); assert.equal(r.held, false); assert.equal(r.tests[0].ok, true); assert.equal(r.tests[1].ok, false); }
    for (const h of ids('harmful')) { const r = judgeDefense(m, m.sample, [...fixes, h]); assert.equal(r.held, false, `${m.missionId}/${h}`); assert.equal(r.tests[2].ok, false); }
    // The variant is a different real attack; the browser copy has no effects, reasons or variant
    assert.equal(evaluate(m.rule, m.defenseLab.variant.input, false).attacked, true);
    const pub = toPublicMissions([m], () => 'X')[0];
    assert.deepEqual(Object.keys(pub.defenseLab).sort(), ['options', 'prompt']);
    for (const o of pub.defenseLab.options) assert.deepEqual(Object.keys(o).sort(), ['id', 'label']);
    assert.ok(m.trace.includes('{input}'));
  }
});

test('validator rejects broken defense labs', () => {
  const base = missions.find(m => m.missionId === 'xss');
  const bad = lab => validateMission({ ...base, defenseLab: lab }).errors.join(' ');
  assert.match(bad(undefined), /defenseLab/);
  assert.match(bad({ ...base.defenseLab, options: base.defenseLab.options.map(o => ({ ...o, effect: o.effect === 'fix' ? 'extra' : o.effect })) }), /fix/);
  assert.match(bad({ ...base.defenseLab, variant: { input: 'hello', note: 'x' } }), /variant/);
  assert.match(bad({ ...base.defenseLab, options: [base.defenseLab.options[0], base.defenseLab.options[0], base.defenseLab.options[1]] }), /중복/);
  assert.match(validateMission({ ...base, trace: 'no placeholder' }).errors.join(' '), /trace/);
});

test('outputs and evidence are computed from the learner input', async () => {
  const { classify, fillTemplate: fill, crackTime, editDistance } = await import('../lib/mission-engine.ts');
  const m = id => missions.find(x => x.missionId === id);
  const ev = (id, input) => fill(m(id).evidence, { ...classify(m(id).rule, input).vars, flag: 'SG{t_1}' });
  assert.match(ev('injection', "zz' --"), /name = 'zz' --'/);
  assert.match(evaluate(m('injection').rule, 'a UNION b', false).output, /해석된 부분: UNION/);
  assert.match(ev('access', '1004'), /owner=admin/);
  assert.match(ev('access', '1003'), /장학금/);
  assert.match(evaluate(m('access').rule, '42', false).output, /해당 번호의 문서 없음/);
  assert.match(evaluate(m('auth').rule, '1234', false).output, /4자 · 예상 대입 시간 1초 미만/);
  assert.match(evaluate(m('supply').rule, 'secureguard-util', false).output, /1글자 차이/);
  assert.match(ev('config', '/debug/env'), /API_KEY/);
  assert.match(evaluate(m('xss').rule, '<b onclick=x>', true).output, /&lt;b onclick=x&gt;/);
  assert.equal(crackTime('1234'), '1초 미만');
  assert.equal(crackTime('SecureGuard!2026'), '수백만 년 이상');
  assert.equal(editDistance('kitten', 'sitting'), 3);
  for (const x of missions) assert.ok(ev(x.missionId, x.sample).includes('SG{t_1}'), `${x.missionId} evidence has the flag`);
});

test('defense options reach the browser in a stable order that does not reveal the answer', async () => {
  const { toPublicMissions } = await import('../lib/mission-engine.ts');
  const a = toPublicMissions(missions, () => 'X'), b = toPublicMissions(missions, () => 'X');
  assert.deepEqual(a.map(m => m.defenseLab.options), b.map(m => m.defenseLab.options), 'same order on every render');
  const fixFirst = a.filter(p => missions.find(m => m.missionId === p.id).defenseLab.options.find(o => o.id === p.defenseLab.options[0].id).effect === 'fix');
  assert.ok(fixFirst.length < missions.length / 2, 'the fix is not usually listed first');
});
