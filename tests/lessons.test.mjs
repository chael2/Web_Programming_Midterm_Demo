import test from 'node:test';
import assert from 'node:assert/strict';
import { labs, simulate } from '../lib/labs.ts';
import { lessons, resolveGuided } from '../lib/lessons.ts';
import { flagFor, evidenceFor } from '../lib/wargame-server.ts';

const strings = value => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

test('every mission has complete guided-learning content', () => {
  assert.deepEqual(Object.keys(lessons).sort(), labs.map(l => l.id).sort());
  for (const lab of labs) {
    const l = lessons[lab.id];
    for (const text of strings(l)) assert.ok(text.trim().length > 0, `${lab.id} has empty text`);
    assert.ok(l.terms.length >= 2, `${lab.id} needs key terms`);
    for (const key of ['what', 'why', 'when', 'check', 'more']) assert.ok(l.concept[key].length > 20, `${lab.id}.concept.${key}`);
    assert.ok(l.takeaway.length > 10);
  }
});

test('input explanations describe the exact sample and normal values used by simulate()', () => {
  for (const lab of labs) {
    const l = lessons[lab.id];
    assert.ok(l.input.sample.startsWith(`${lab.sample} — `), `${lab.id} sample explanation must start with the sample value`);
    assert.ok(l.input.normal.startsWith(`${lab.normal} — `), `${lab.id} normal explanation must start with the normal value`);
    // The content describes the sample as an attack and the normal value as not an attack.
    assert.equal(simulate(lab.id, lab.sample, false).attacked, true);
    assert.equal(simulate(lab.id, lab.normal, false).attacked, false);
  }
});

test('defense explanations match what simulate() returns in defense mode', () => {
  for (const lab of labs) {
    const result = simulate(lab.id, lab.sample, true);
    assert.equal(result.blocked, true, `${lab.id} defense must block the sample`);
    const compare = lessons[lab.id].defense.compare;
    // Quoted outcome phrases in the compare text must appear in the real defense output,
    // except for the generic "요청 거부" family which maps to "요청 거부 / 위험 동작 미수행".
    if (lab.id === 'xss') assert.ok(result.output.startsWith('텍스트로 안전하게 출력'));
    else if (lab.id === 'logging') { for (const step of ['감사 로그', '경보', '추가 시도 제한']) assert.ok(result.output.includes(step)); }
    else if (lab.id === 'exceptions') assert.ok(result.output.includes('접근 거부 (fail closed)') && compare.includes('접근 거부 (fail closed)'));
    else { assert.equal(result.output, '요청 거부 / 위험 동작 미수행'); assert.ok(compare.includes('요청 거부'), `${lab.id} compare text should name 요청 거부`); }
  }
});

test('thresholds and fixed values quoted in lessons match the rules', () => {
  assert.equal(simulate('logging', '5', false).attacked, true);
  assert.equal(simulate('logging', '4', false).attacked, false);
  assert.ok(lessons.logging.terms.some(t => t.plain.includes('5회')));
  assert.equal(simulate('auth', 'a'.repeat(11), false).attacked, true);
  assert.equal(simulate('auth', 'a'.repeat(12), false).attacked, false);
  assert.ok(lessons.auth.defense.check.includes('12자'));
  assert.equal(simulate('csrf', 'secureguard-valid-token', true).attacked, false);
  assert.ok(lessons.csrf.concept.more.includes('secureguard-valid-token'));
  assert.equal(simulate('config', '/debug/anything', false).attacked, true);
  assert.ok(lessons.config.concept.more.includes('/debug로 시작'));
  for (const [id, bad] of [['design', 'SALE50'], ['integrity', 'maybe'], ['exceptions', 'slow']]) {
    assert.equal(simulate(id, bad, false).title, '시나리오 입력을 확인하세요');
    assert.ok(lessons[id].concept.more.includes('판정하지 않'), `${id} should say other values are not judged`);
  }
});

test('each comparison quiz has exactly one correct answer and feedback for every option', () => {
  for (const lab of labs) {
    const { question, options } = lessons[lab.id].quiz;
    assert.ok(question.endsWith('?'), `${lab.id} quiz should be a question`);
    assert.equal(options.length, 3);
    assert.equal(options.filter(o => o.correct).length, 1, `${lab.id} must have one correct option`);
    for (const o of options) assert.ok(o.why.length > 10, `${lab.id} option needs an explanation`);
  }
  // Correct answers are not always in the same position.
  const positions = new Set(labs.map(l => lessons[l.id].quiz.options.findIndex(o => o.correct)));
  assert.ok(positions.size >= 3);
});

test('lesson content never contains or hints at the literal FLAG', () => {
  for (const lab of labs) {
    const text = strings(lessons[lab.id]).join('\n');
    // Describing the format as "SG{…}" is allowed; an actual flag-like value is not.
    assert.ok(!/SG\{[a-z0-9_]/.test(text), `${lab.id} lesson must not contain a flag`);
    assert.ok(!text.includes(flagFor(lab.id).slice(3, -1)), `${lab.id} lesson leaks its flag body`);
  }
});

test('access guided content matches simulate(), the server evidence and the lab code', () => {
  const lab = labs.find(l => l.id === 'access');
  const g = lessons.access.guided;
  assert.ok(g, 'access must have guided content');
  // rule: "정확히 1001이면 내 문서, 그 밖의 값은 모두 다른 사람 자원" — exact match, no trimming
  assert.ok(g.rule.includes('정확히 1001'));
  assert.equal(simulate('access', '1001', false).attacked, false);
  for (const other of ['1002', '1003', '9999', 'abc', ' 1001', '1001 ']) assert.equal(simulate('access', other, false).attacked, true, `${JSON.stringify(other)} must count as another user's resource`);
  // observe.normal says the response is my own document 1001
  assert.ok(simulate('access', '1001', false).output.includes('내 문서 1001'));
  // dataNote: evidence is always document #1002 regardless of input (server evidence takes no input)
  assert.equal(evidenceFor.length, 1);
  assert.ok(evidenceFor('access').includes('#1002') && g.observe.dataNote.includes('1002번'));
  assert.ok(evidenceFor('access').includes('owner='), 'observe checklist refers to the owner field');
  // defenseObserve quotes the exact defense output
  const defense = simulate('access', '1003', true);
  assert.equal(defense.blocked, true);
  assert.ok(g.defenseObserve.some(t => t.includes(defense.output)));
  // codeDiff: the added line exists in the secure code and not in the vulnerable code
  assert.ok(lab.secure.split('\n').includes(g.codeDiff.added));
  assert.ok(!lab.vulnerable.includes('ownerId'));
  assert.ok(lab.vulnerable.includes('return findDocument(id)'));
  // one how-to list per guided step, no flags anywhere
  assert.equal(g.howto.length, 5);
  assert.ok(!JSON.stringify(g).includes(flagFor('access').slice(3, -1)));
});

test('every mission has guided content consistent with simulate() and its code', () => {
  const quoted = text => [...text.matchAll(/“([^”]+)”/g)].map(m => m[1]);
  for (const lab of labs) {
    const g = resolveGuided(lessons[lab.id]);
    assert.ok(g, `${lab.id} must have guided content`);
    for (const text of strings(g)) assert.ok(text.trim().length > 0, `${lab.id} guided text is empty`);
    assert.equal(g.howto.length, 5, `${lab.id} needs one how-to list per step`);
    assert.equal(g.observe.success.length, 3);
    assert.ok(g.modes.attack.startsWith('보안 검증이 빠진 상황을 가정하고 입력이 어떻게 처리되는지 실습합니다.') || lab.id === 'access');
    // codeDiff.added is a real line of the secure code and absent from the vulnerable code
    assert.ok(lab.secure.split('\n').includes(g.codeDiff.added), `${lab.id} codeDiff line must be in lab.secure`);
    assert.ok(!lab.vulnerable.includes(g.codeDiff.added.trim()), `${lab.id} codeDiff line must not be in lab.vulnerable`);
    // The attack output quoted in observe.success[1] is what simulate() returns for the sample
    const attackOut = simulate(lab.id, lab.sample, false).output;
    for (const q of quoted(g.observe.success[1])) {
      const expected = q.replace('N회', `${Number(lab.sample)}회`);
      if (q.includes('공격')) continue;
      assert.ok(attackOut.startsWith(expected), `${lab.id}: "${expected}" vs "${attackOut}"`);
    }
    // The defense output quoted in defenseObserve[1] appears in simulate()'s defense output
    const defense = simulate(lab.id, lab.sample, true);
    assert.equal(defense.blocked, true);
    for (const q of quoted(g.defenseObserve[1])) assert.ok(defense.output.includes(q), `${lab.id}: defense output lacks "${q}"`);
    assert.ok(!/SG\{[a-z0-9_]/.test(JSON.stringify(g)), `${lab.id} guided content must not contain a flag`);
  }
});

test('judging rules described in guided content match simulate()', () => {
  const attacked = (id, v) => simulate(id, v, false).attacked;
  const invalid = (id, v) => simulate(id, v, false).title === '시나리오 입력을 확인하세요';
  // injection: quotes / -- / OR / UNION, case-insensitive, word-bounded
  assert.ok(attacked('injection', "a'") && attacked('injection', 'a"') && attacked('injection', 'a--') && attacked('injection', 'x Or y') && attacked('injection', 'UNION select'));
  assert.ok(!attacked('injection', 'orange') && !attacked('injection', 'student'));
  // xss: listed tags, on…= attributes, javascript:, case-insensitive
  assert.ok(attacked('xss', '<SCRIPT>') && attacked('xss', '<iframe') && attacked('xss', 'x onerror=1') && attacked('xss', 'JavaScript:1'));
  assert.ok(!attacked('xss', '<b>bold</b>'));
  // csrf: exact match including whitespace
  assert.ok(!attacked('csrf', 'secureguard-valid-token') && attacked('csrf', ' secureguard-valid-token'));
  // config: startsWith /debug, /health normal, other paths not found
  assert.ok(attacked('config', '/debugX') && !attacked('config', '/health') && simulate('config', '/x', false).output.includes('찾을 수 없'));
  // supply: trimmed exact name
  assert.ok(!attacked('supply', '  secureguard-utils ') && attacked('supply', 'secureguard-util'));
  // crypto: trimmed, case-insensitive https
  assert.ok(!attacked('crypto', ' HTTPS ') && attacked('crypto', 'ftp'));
  // design / integrity / exceptions: two values, case- and whitespace-insensitive, others invalid
  assert.ok(attacked('design', ' welcome10 ') && !attacked('design', 'first10') && invalid('design', 'SALE'));
  assert.ok(attacked('integrity', 'TAMPERED') && !attacked('integrity', ' signed') && invalid('integrity', 'x'));
  assert.ok(attacked('exceptions', ' Timeout') && !attacked('exceptions', 'OK') && invalid('exceptions', 'slow'));
  // logging: integers 0–1000, >= 5 attack, others invalid
  assert.ok(attacked('logging', '5') && !attacked('logging', '4') && invalid('logging', '1001') && invalid('logging', '2.5'));
});
