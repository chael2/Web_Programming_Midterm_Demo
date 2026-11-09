import test from 'node:test';
import assert from 'node:assert/strict';
import { labs, owaspCategories, categoryUrl, normalizeCompleted, completedCategories, simulate } from '../lib/labs.ts';

for (const lab of labs) {
  test(`${lab.id}: attack succeeds only in vulnerable mode`, () => {
    const attack = simulate(lab.id, lab.sample, false);
    assert.equal(attack.attacked, true);
    assert.equal(attack.blocked, false);
    const defense = simulate(lab.id, lab.sample, true);
    assert.equal(defense.attacked, true);
    assert.equal(defense.blocked, true);
    assert.notEqual(attack.output, defense.output);
  });
  test(`${lab.id}: normal input is accepted in both modes`, () => {
    for (const defense of [false, true]) {
      const result = simulate(lab.id, lab.normal, defense);
      assert.equal(result.attacked, false);
      assert.equal(result.blocked, false);
    }
  });
}
test('unknown lab fails explicitly', () => assert.throws(() => simulate('unknown', 'input', false)));
test('XSS input remains inert text in output', () => {
  const payload = '<svg onload=alert(document.cookie)>';
  assert.equal(simulate('xss', payload, true).blocked, true);
  assert.ok(simulate('xss', payload, true).output.includes(payload));
});
test('all ten 2025 categories have a working representative scenario', () => {
  assert.deepEqual(owaspCategories.map(c => c.id), ['A01','A02','A03','A04','A05','A06','A07','A08','A09','A10']);
  assert.equal(labs.length, 12);
  assert.equal(new Set(labs.map(l => l.id)).size, labs.length);
  for (const category of owaspCategories) {
    assert.ok(labs.some(l => l.categoryId === category.id));
    assert.ok(categoryUrl(category).startsWith(`https://top10.owasp.org/2025/${category.id}_2025-`));
  }
  for (const lab of labs) assert.ok(lab.tag.startsWith(`${lab.categoryId}:2025`));
  assert.equal(labs.find(l => l.id === 'csrf').categoryId, 'A01');
  assert.equal(labs.find(l => l.id === 'xss').categoryId, 'A05');
  assert.equal(labs.find(l => l.id === 'injection').categoryId, 'A05');
});
test('existing progress survives expansion without marking new scenarios complete', () => {
  const old = ['injection', 'xss', 'csrf', 'auth', 'access', 'config'];
  assert.deepEqual(normalizeCompleted([...old, 'injection', 'unknown', null]), old);
  assert.equal(completedCategories(old).length, 4);
  assert.equal(completedCategories([]).length, 0);
  assert.equal(completedCategories(labs.map(l => l.id)).length, 10);
  assert.equal(completedCategories(['access']).length, 0);
  assert.deepEqual(normalizeCompleted(null), []);
});
test('invalid scenario values do not count as successful attacks or defenses', () => {
  for (const [id, input] of [['logging', '-1'], ['logging', '1001'], ['logging', 'NaN'], ['logging', '1.5'], ['logging', ''], ['integrity', 'unknown'], ['design', 'unknown'], ['exceptions', 'unknown']]) {
    for (const defense of [false, true]) {
      const result = simulate(id, input, defense);
      assert.equal(result.attacked, false);
      assert.equal(result.blocked, false);
      assert.equal(result.title, '시나리오 입력을 확인하세요');
    }
  }
});
test('A09 distinguishes detection and response from logging alone', () => {
  assert.equal(simulate('logging', '4', true).attacked, false);
  const result = simulate('logging', '5', true);
  assert.equal(result.blocked, true);
  assert.ok(result.output.includes('감사 로그'));
  assert.ok(result.output.includes('경보'));
  assert.ok(result.output.includes('추가 시도 제한'));
});
