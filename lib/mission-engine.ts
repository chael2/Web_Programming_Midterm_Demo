// Data-driven judging engine. Each mission stores its judging rule in MongoDB
// (missions.rule); this module interprets it. No mission-specific code lives here.
// Kept free of imports so it can run in Route Handlers, the admin validator and tests.

export type Simulation = { attacked: boolean; blocked: boolean; title: string; detail: string; output: string };
export type RuleResult = 'attack' | 'normal' | 'invalid';

/** One condition, evaluated against the normalized input. */
export type Matcher =
  | { equals: string }
  | { regex: string; flags?: string }
  | { startsWith: string }
  | { lengthLessThan: number }
  /** true when the value is NOT an integer string with ≤ maxDigits digits inside [min, max]. */
  | { intOutside: { min: number; max: number; maxDigits?: number } }
  | { intAtLeast: number };

export type RuleCase = { when: Matcher; result: RuleResult; output: string };
export type MissionRule = {
  normalize?: { trim?: boolean; case?: 'lower' | 'upper' };
  /** First matching case wins. */
  cases: RuleCase[];
  otherwise: { result: RuleResult; output: string };
  /** Overrides for a blocked attack in defense mode. */
  defense?: { title?: string; detail?: string; output?: string };
  /** Optional value the input is compared with for {dist} (edit distance), e.g. the approved package name. */
  reference?: string;
  /** Optional virtual data the server looks up by the normalized input; templates read {row.<field>|fallback}. */
  table?: { key: string; rows: Record<string, string>[] };
};

export const DEFAULT_DEFENSE_OUTPUT = '요청 거부 / 위험 동작 미수행';
export const INVALID_TITLE = '시나리오 입력을 확인하세요';

// ---------------------------------------------------------------------------
// Templates: outputs and evidence are computed from what the learner actually sent.
//   {input} raw input · {value} normalized · {n} number · {len} length · {escaped} HTML-escaped input
//   {match} the part of the input that triggered the rule · {dist} edit distance to rule.reference
//   {crack} estimated brute-force time for the input as a password · {row.<field>|fallback} virtual data lookup
//   {{flag}} the learner's own flag (evidence only)
// Replacement is a single pass, so text inside the input is never interpreted as a template.
// ---------------------------------------------------------------------------
export type TemplateVars = Record<string, string>;
const TOKEN = /\{\{flag\}\}|\{([a-z]+(?:\.[A-Za-z0-9_]+)?)(?:\|([^{}|]{0,80}))?\}/g;
export function fillTemplate(template: string, vars: TemplateVars) {
  return template.replace(TOKEN, (all, name: string | undefined, fallback: string | undefined) => {
    if (name === undefined) return vars.flag ?? all;
    const v = vars[name];
    if (v !== undefined && v !== '') return v;
    if (fallback !== undefined) return fallback;
    return v ?? all;
  });
}
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export function editDistance(a: string, b: string) {
  if (a.length > 200 || b.length > 200) return Math.abs(a.length - b.length) + Math.min(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** Rough offline brute-force time, assuming 10 billion guesses per second (fast unsalted hash). */
export function crackTime(password: string) {
  let size = 0;
  if (/[0-9]/.test(password)) size += 10;
  if (/[a-z]/.test(password)) size += 26;
  if (/[A-Z]/.test(password)) size += 26;
  if (/[^0-9a-zA-Z]/.test(password)) size += 33;
  const log10Seconds = password.length * Math.log10(Math.max(size, 1)) - 10;
  if (log10Seconds < 0) return '1초 미만';
  const s = 10 ** log10Seconds;
  const units: [number, string][] = [[31536000, '년'], [86400, '일'], [3600, '시간'], [60, '분'], [1, '초']];
  if (s / 31536000 >= 1e6) return '수백만 년 이상';
  const [div, unit] = units.find(([d]) => s >= d)!;
  return `약 ${Math.round(s / div).toLocaleString('ko-KR')}${unit}`;
}
export function templateVars(rule: MissionRule, input: string, value: string, match: string): TemplateVars {
  const vars: TemplateVars = {
    input, value, n: String(Number(value)), len: String([...value].length), escaped: escapeHtml(input), match: match || value,
    crack: crackTime(value),
  };
  if (rule.reference !== undefined) vars.dist = String(editDistance(value, rule.reference));
  const row = rule.table?.rows.find(r => r[rule.table!.key] === value);
  if (row) for (const [k, v] of Object.entries(row)) vars[`row.${k}`] = v;
  return vars;
}

function normalizeValue(rule: MissionRule, input: string) {
  let value = input;
  if (rule.normalize?.trim) value = value.trim();
  if (rule.normalize?.case === 'lower') value = value.toLowerCase();
  if (rule.normalize?.case === 'upper') value = value.toUpperCase();
  return value;
}

export function matches(when: Matcher, value: string): boolean {
  if ('equals' in when) return value === when.equals;
  if ('regex' in when) return new RegExp(when.regex, when.flags ?? '').test(value);
  if ('startsWith' in when) return value.startsWith(when.startsWith);
  if ('lengthLessThan' in when) return value.length < when.lengthLessThan;
  if ('intOutside' in when) {
    const { min, max, maxDigits = 15 } = when.intOutside;
    if (!new RegExp(`^\\d{1,${maxDigits}}$`).test(value)) return true;
    const n = Number(value);
    return n < min || n > max;
  }
  if ('intAtLeast' in when) return /^\d+$/.test(value) && Number(value) >= when.intAtLeast;
  return false;
}

function matchedPart(when: Matcher, value: string) {
  if ('regex' in when) return new RegExp(when.regex, when.flags ?? '').exec(value)?.[0] ?? '';
  if ('startsWith' in when) return when.startsWith;
  return value;
}
export function classify(rule: MissionRule, input: string): { result: RuleResult; output: string; value: string; vars: TemplateVars } {
  const value = normalizeValue(rule, input);
  const hitCase = rule.cases.find(c => matches(c.when, value));
  const hit = hitCase ?? rule.otherwise;
  const vars = templateVars(rule, input, value, hitCase ? matchedPart(hitCase.when, value) : '');
  return { result: hit.result, output: fillTemplate(hit.output, vars), value, vars };
}

/** Same contract as the former per-mission simulate(): judge input in vulnerable or defense mode. */
export function evaluate(rule: MissionRule, input: string, defense: boolean): Simulation {
  const { result, output, vars } = classify(rule, input);
  if (result === 'invalid') {
    return { attacked: false, blocked: false, title: INVALID_TITLE, detail: '공격 예제 입력 또는 정상 입력 버튼으로 학습용 값을 채울 수 있습니다.', output };
  }
  const attacked = result === 'attack';
  const blocked = attacked && defense;
  if (blocked) {
    return {
      attacked, blocked,
      title: rule.defense?.title ?? '위험한 동작을 방지했습니다',
      detail: rule.defense?.detail ?? '이 시나리오의 방어 정책을 적용했습니다. 아래 코드와 가이드에서 실제 구현 시 필요한 검증을 확인하세요.',
      output: fillTemplate(rule.defense?.output ?? DEFAULT_DEFENSE_OUTPUT, vars),
    };
  }
  return {
    attacked, blocked,
    title: attacked ? '취약한 동작을 재현했습니다' : '정상 입력을 처리했습니다',
    detail: '결과는 정해진 학습 규칙에 따른 시뮬레이션입니다. 실제 DB 쿼리나 공격 코드는 실행하지 않습니다.',
    output,
  };
}

/** Validates the shape of a rule coming from the admin page or the database. */
export function ruleErrors(rule: unknown): string[] {
  const errors: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const isResult = (v: unknown) => v === 'attack' || v === 'normal' || v === 'invalid';
  const str = (v: unknown, max = 500) => typeof v === 'string' && v.length <= max;
  if (!isObj(rule)) return ['rule은 객체여야 합니다.'];
  if (rule.normalize !== undefined) {
    if (!isObj(rule.normalize)) errors.push('normalize는 객체여야 합니다.');
    else {
      if (rule.normalize.trim !== undefined && typeof rule.normalize.trim !== 'boolean') errors.push('normalize.trim은 true/false여야 합니다.');
      if (rule.normalize.case !== undefined && rule.normalize.case !== 'lower' && rule.normalize.case !== 'upper') errors.push("normalize.case는 'lower' 또는 'upper'여야 합니다.");
    }
  }
  if (!Array.isArray(rule.cases) || rule.cases.length > 20) errors.push('cases는 20개 이하의 배열이어야 합니다.');
  else rule.cases.forEach((c, i) => {
    if (!isObj(c) || !isResult(c.result) || !str(c.output)) { errors.push(`cases[${i}]: result(attack|normal|invalid)와 output(500자 이하)이 필요합니다.`); return; }
    const w = c.when;
    // Exactly one condition; `flags` is an option of `regex`, not a condition of its own.
    const kinds = isObj(w) ? Object.keys(w).filter(k => !(k === 'flags' && 'regex' in w)) : [];
    if (!isObj(w) || kinds.length !== 1) { errors.push(`cases[${i}].when은 조건 하나만 가진 객체여야 합니다.`); return; }
    const kind = kinds[0];
    const arg = w[kind];
    if (kind === 'equals' || kind === 'startsWith') { if (!str(arg, 200)) errors.push(`cases[${i}].when.${kind}는 200자 이하 문자열이어야 합니다.`); }
    else if (kind === 'regex') {
      if (!str(arg, 300)) errors.push(`cases[${i}].when.regex는 300자 이하 문자열이어야 합니다.`);
      else if (w.flags !== undefined && (typeof w.flags !== 'string' || !/^[imsu]{0,4}$/.test(w.flags))) errors.push(`cases[${i}].when.flags는 i, m, s, u만 쓸 수 있습니다.`);
      else { try { new RegExp(arg as string, (w.flags as string) ?? ''); } catch { errors.push(`cases[${i}].when.regex가 올바른 정규식이 아닙니다.`); } }
    } else if (kind === 'flags') errors.push(`cases[${i}].when.flags는 regex와 함께만 쓸 수 있습니다.`);
    else if (kind === 'lengthLessThan' || kind === 'intAtLeast') { if (typeof arg !== 'number' || !Number.isInteger(arg) || arg < 0 || arg > 1e9) errors.push(`cases[${i}].when.${kind}는 0 이상 정수여야 합니다.`); }
    else if (kind === 'intOutside') {
      const o = arg as Record<string, unknown>;
      if (!isObj(o) || typeof o.min !== 'number' || typeof o.max !== 'number' || o.min > o.max || (o.maxDigits !== undefined && (typeof o.maxDigits !== 'number' || o.maxDigits < 1 || o.maxDigits > 15))) errors.push(`cases[${i}].when.intOutside는 { min, max, maxDigits? } 형식이어야 합니다.`);
    } else errors.push(`cases[${i}].when: 지원하지 않는 조건 '${kind}' (equals, regex, startsWith, lengthLessThan, intOutside, intAtLeast)`);
  });
  if (!isObj(rule.otherwise) || !isResult(rule.otherwise.result) || !str(rule.otherwise.output)) errors.push('otherwise에 result와 output이 필요합니다.');
  if (rule.reference !== undefined && !str(rule.reference, 200)) errors.push('reference는 200자 이하 문자열이어야 합니다.');
  if (rule.table !== undefined) {
    const t = rule.table;
    const rows = isObj(t) && Array.isArray(t.rows) ? t.rows : null;
    if (!isObj(t) || typeof t.key !== 'string' || !rows || rows.length > 50 || !rows.every(r => isObj(r) && Object.values(r).every(v => str(v, 300)) && typeof r[t.key as string] === 'string')) errors.push('table은 { key, rows } 형식이고, rows는 key 필드를 가진 문자열 객체 50개 이하여야 합니다.');
  }
  if (rule.defense !== undefined) {
    if (!isObj(rule.defense)) errors.push('defense는 객체여야 합니다.');
    else for (const k of ['title', 'detail', 'output']) if (rule.defense[k] !== undefined && !str(rule.defense[k])) errors.push(`defense.${k}는 500자 이하 문자열이어야 합니다.`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Defense lab: the learner picks defense measures; the server "patches" the
// vulnerable server with them and replays three tests (own attack, an attack
// variant, a normal request). Each option's effect is stored server-side only.
// ---------------------------------------------------------------------------
/** fix = required root-cause fix · extra = good defense-in-depth (optional) · partial = blocks only the exact attack seen ·
 *  none = no effect on this attack · harmful = breaks normal users or adds a new risk. */
export type DefenseEffect = 'fix' | 'extra' | 'partial' | 'none' | 'harmful';
export const DEFENSE_EFFECTS: DefenseEffect[] = ['fix', 'extra', 'partial', 'none', 'harmful'];
export const DEFENSE_EFFECT_LABEL: Record<DefenseEffect, string> = { fix: '핵심 방어', extra: '보조 방어', partial: '불완전한 방어', none: '효과 없음', harmful: '부작용' };
export type DefenseOption = { id: string; label: string; effect: DefenseEffect; why: string };
export type DefenseLab = { prompt: string; options: DefenseOption[]; variant: { input: string; note: string } };
export type DefenseTest = { kind: 'mine' | 'variant' | 'normal'; label: string; input: string; note: string; expected: 'blocked' | 'allowed'; outcome: 'blocked' | 'allowed'; ok: boolean; output: string };
export type DefenseReport = { held: boolean; inDepth: boolean; summary: string; tests: DefenseTest[]; feedback: { id: string; label: string; effect: DefenseEffect; effectLabel: string; why: string }[] };

/** Judges the learner's chosen measures. Pure: same input → same report. */
export function judgeDefense(m: { rule: MissionRule; normal: string; defenseLab: DefenseLab }, attackInput: string, chosenIds: string[]): DefenseReport {
  const chosen = m.defenseLab.options.filter(o => chosenIds.includes(o.id));
  const has = (e: DefenseEffect) => chosen.some(o => o.effect === e);
  const fixes = m.defenseLab.options.filter(o => o.effect === 'fix');
  const allFixes = fixes.every(f => chosenIds.includes(f.id));
  const anyFix = has('fix');
  const harmful = has('harmful');
  const attackRow = (kind: 'mine' | 'variant', label: string, input: string, note: string, blocked: boolean): DefenseTest => ({
    kind, label, input, note, expected: 'blocked', outcome: blocked ? 'blocked' : 'allowed', ok: blocked,
    output: evaluate(m.rule, input, blocked).output,
  });
  const mine = attackRow('mine', '내 공격 다시 보내기', attackInput, '실습하기에서 공격에 성공한 입력', anyFix || has('partial'));
  const variant = attackRow('variant', '변형된 공격', m.defenseLab.variant.input, m.defenseLab.variant.note, allFixes);
  const normal: DefenseTest = {
    kind: 'normal', label: '정상 사용자 요청', input: m.normal, note: '방어가 정상 기능을 망가뜨리지 않는지 확인', expected: 'allowed',
    outcome: harmful ? 'blocked' : 'allowed', ok: !harmful,
    output: harmful ? '방어책의 부작용으로 정상 요청까지 실패했습니다.' : evaluate(m.rule, m.normal, false).output,
  };
  const held = allFixes && !harmful;
  const summary = !chosen.length ? '방어책을 하나도 적용하지 않아 취약한 서버가 그대로입니다.'
    : held ? '모든 테스트를 통과했습니다. 공격은 막히고 정상 요청은 그대로 처리됩니다.'
      : !mine.ok ? '방금 성공한 공격이 그대로 다시 통했습니다. 고른 방어책이 이 취약점의 원인을 건드리지 않습니다.'
        : !variant.ok ? (anyFix ? '일부 공격은 막았지만 아직 뚫리는 경로가 있습니다. 함께 필요한 방어가 빠졌습니다.' : '내 공격은 막았지만 조금 바꾼 공격이 통과했습니다. 증상만 막고 원인은 고치지 못했습니다.')
          : '공격은 막았지만 정상 사용자도 서비스를 쓸 수 없게 되었습니다. 부작용이 있는 방어책을 빼세요.';
  const extras = m.defenseLab.options.filter(o => o.effect === 'extra');
  const inDepth = held && extras.length > 0 && extras.every(o => chosenIds.includes(o.id));
  return { held, inDepth, summary, tests: [mine, variant, normal], feedback: chosen.map(o => ({ id: o.id, label: o.label, effect: o.effect, effectLabel: DEFENSE_EFFECT_LABEL[o.effect], why: o.why })) };
}

/** Validates a defense lab against the mission's rule. */
export function defenseLabErrors(lab: unknown, rule: MissionRule): string[] {
  const e: string[] = [];
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  if (!isObj(lab)) return ['defenseLab은 { prompt, options, variant } 객체여야 합니다.'];
  if (!str(lab.prompt, 400)) e.push('defenseLab.prompt는 1~400자 문자열이어야 합니다.');
  const opts = Array.isArray(lab.options) ? lab.options : [];
  if (opts.length < 3 || opts.length > 8) e.push('defenseLab.options는 3~8개여야 합니다.');
  const ids = new Set<string>();
  opts.forEach((o, i) => {
    if (!isObj(o) || typeof o.id !== 'string' || !/^[a-z0-9-]{1,30}$/.test(o.id) || !str(o.label, 160) || !str(o.why, 400) || !DEFENSE_EFFECTS.includes(o.effect as DefenseEffect)) e.push(`defenseLab.options[${i}]: id(소문자·숫자·-), label(160자), why(400자), effect(${DEFENSE_EFFECTS.join('|')})가 필요합니다.`);
    else if (ids.has(o.id)) e.push(`defenseLab.options[${i}].id '${o.id}'가 중복됩니다.`);
    else ids.add(o.id);
  });
  if (!opts.some(o => isObj(o) && o.effect === 'fix')) e.push('defenseLab.options에 effect가 fix인 핵심 방어가 1개 이상 있어야 합니다.');
  const v = lab.variant;
  if (!isObj(v) || !str(v.input, 2000) || !str(v.note, 300)) e.push('defenseLab.variant는 { input, note }가 필요합니다.');
  else if (!evaluate(rule, v.input as string, false).attacked) e.push('defenseLab.variant.input이 판정 규칙에서 공격으로 판정되지 않습니다.');
  return e;
}

// ---------------------------------------------------------------------------
// Mission documents (MongoDB `missions` collection)
// ---------------------------------------------------------------------------
export const CATEGORY_IDS = ['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10'] as const;
export type MissionData = {
  missionId: string; order: number; published: boolean;
  categoryId: string; level: '입문' | '중급';
  title: string; ko: string; category: string; icon: string; color: string;
  description: string; objective: string; field: string;
  /** Server-only: the attack example (revealed only as hint level 3). */
  sample: string;
  normal: string;
  cause: string; defense: string; vulnerable: string; secure: string;
  /** Server-only judging rule. */
  rule: MissionRule;
  /** Server-only: per-user flags are SG{<flagPrefix>_<random hex>}. */
  flagPrefix: string;
  /** Server-only: leaked data shown on a successful attack; must contain {{flag}}. */
  evidence: string;
  /** Server-only: exactly 3 progressive hints. */
  hints: string[];
  /** Learning content (see lib/lessons.ts types). */
  lesson: Record<string, unknown>;
  /** Public: how the vulnerable server uses the input; {input} is replaced live in the browser. */
  trace: string;
  /** Defense lab. Only prompt and option id/label reach the browser. */
  defenseLab: DefenseLab;
};

/** What the browser receives: no rule, attack sample, flag prefix, evidence or hints. */
export type PublicMission = Omit<MissionData, 'missionId' | 'sample' | 'rule' | 'flagPrefix' | 'evidence' | 'hints' | 'published' | 'order' | 'defenseLab'> & {
  /** Defense choices without their effect, explanation or the attack variant. */
  defenseLab: { prompt: string; options: { id: string; label: string }[] };
  id: string;
  /** Display number in the current order, e.g. "01". */
  number: string;
  /** e.g. "A01:2025 · Broken Access Control" */
  tag: string;
};

/** Stable per-mission order that does not follow the stored order (which tends to list the fix first). */
function shuffledOptions(missionId: string, options: DefenseOption[]) {
  const hash = (v: string) => { let h = 2166136261; for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619); return h >>> 0; };
  return options.map(o => ({ id: o.id, label: o.label })).sort((a, b) => hash(`${missionId}:${a.id}`) - hash(`${missionId}:${b.id}`));
}
/** Strips every answer-related field (rule, sample, flag prefix, evidence, hints, sample note) before data reaches the browser. */
export function toPublicMissions(list: MissionData[], categoryTitle: (categoryId: string) => string): PublicMission[] {
  return list.map((m, i) => {
    const { missionId, sample, rule, flagPrefix, evidence, hints, published, order, lesson, defenseLab, ...rest } = m;
    void sample; void rule; void flagPrefix; void evidence; void hints; void published; void order;
    const input = (lesson.input ?? {}) as Record<string, unknown>;
    const publicInput = Object.fromEntries(Object.entries(input).filter(([k]) => k !== 'sample'));
    return { ...rest, id: missionId, number: String(i + 1).padStart(2, '0'), tag: `${m.categoryId}:2025 · ${categoryTitle(m.categoryId)}`, lesson: { ...lesson, input: publicInput },
      defenseLab: { prompt: defenseLab.prompt, options: shuffledOptions(missionId, defenseLab.options) } };
  });
}

const TEXT_FIELDS: [keyof MissionData, number][] = [
  ['title', 80], ['ko', 40], ['category', 40], ['icon', 4], ['description', 300], ['objective', 300], ['field', 80],
  ['sample', 2000], ['normal', 2000], ['cause', 600], ['defense', 600], ['vulnerable', 2000], ['secure', 2000], ['evidence', 2000], ['trace', 400],
];
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const filled = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;

function lessonErrors(lesson: unknown): string[] {
  const e: string[] = [];
  if (!isRecord(lesson)) return ['lesson은 객체여야 합니다.'];
  for (const k of ['goal', 'scenario', 'normal', 'takeaway']) if (!filled(lesson[k])) e.push(`lesson.${k}가 필요합니다.`);
  const group = (k: string, keys: string[]) => {
    const g = lesson[k];
    if (!isRecord(g)) { e.push(`lesson.${k} 객체가 필요합니다.`); return; }
    for (const x of keys) if (!filled(g[x])) e.push(`lesson.${k}.${x}가 필요합니다.`);
  };
  group('concept', ['what', 'why', 'when', 'check', 'more']);
  group('input', ['field', 'sample', 'normal']);
  group('attack', ['happened', 'meaning', 'next']);
  group('defense', ['diff', 'check', 'compare', 'result']);
  const terms = lesson.terms;
  if (!Array.isArray(terms) || !terms.length || !terms.every(t => isRecord(t) && filled(t.term) && filled(t.plain))) e.push('lesson.terms는 { term, plain } 배열이어야 합니다.');
  const q = lesson.quiz;
  const options = isRecord(q) && Array.isArray(q.options) ? q.options : [];
  const optionsOk = options.length >= 2 && options.length <= 5 && options.every(o => isRecord(o) && filled(o.text) && filled(o.why) && (o.correct === undefined || o.correct === true));
  if (!isRecord(q) || !filled(q.question) || !optionsOk || options.filter(o => isRecord(o) && o.correct === true).length !== 1) e.push('lesson.quiz는 question과 2~5개 options(정답 정확히 1개, 각 why 포함)가 필요합니다.');
  if (lesson.guided !== undefined && !isRecord(lesson.guided)) e.push('lesson.guided는 객체여야 합니다.');
  return e;
}

/** Validates a mission (admin edits and seed data) and returns a clean copy with only known fields. */
export function validateMission(input: unknown): { errors: string[]; mission: MissionData | null } {
  const e: string[] = [];
  const m = isRecord(input) ? input : {};
  if (typeof m.missionId !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(m.missionId)) e.push('missionId는 영문 소문자로 시작하는 2~40자(소문자·숫자·-)여야 합니다.');
  if (typeof m.order !== 'number' || !Number.isInteger(m.order) || m.order < 0 || m.order > 100000) e.push('order는 0~100000 정수여야 합니다.');
  if (typeof m.published !== 'boolean') e.push('published는 true/false여야 합니다.');
  if (!(CATEGORY_IDS as readonly unknown[]).includes(m.categoryId)) e.push('categoryId는 A01~A10 중 하나여야 합니다.');
  if (m.level !== '입문' && m.level !== '중급') e.push("level은 '입문' 또는 '중급'이어야 합니다.");
  for (const [k, max] of TEXT_FIELDS) {
    const v = m[k];
    if (typeof v !== 'string' || !v.trim() || v.length > max) e.push(`${k}는 1~${max}자 문자열이어야 합니다.`);
  }
  if (typeof m.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(m.color)) e.push('color는 #RRGGBB 형식이어야 합니다.');
  if (typeof m.flagPrefix !== 'string' || !/^[a-z0-9_]{3,60}$/.test(m.flagPrefix)) e.push('flagPrefix는 영문 소문자·숫자·밑줄 3~60자여야 합니다.');
  if (typeof m.evidence === 'string' && !m.evidence.includes('{{flag}}')) e.push('evidence에 {{flag}} 자리표시자가 있어야 합니다.');
  const hints = m.hints;
  if (!Array.isArray(hints) || hints.length !== 3 || !hints.every(h => typeof h === 'string' && h.trim() && h.length <= 300)) e.push('hints는 1~300자 문자열 3개여야 합니다.');
  for (const x of ruleErrors(m.rule)) e.push(`rule: ${x}`);
  for (const x of lessonErrors(m.lesson)) e.push(x);
  if (e.length) return { errors: e, mission: null };
  const rule = m.rule as MissionRule;
  const sample = m.sample as string;
  const normal = m.normal as string;
  if (!evaluate(rule, sample, false).attacked) e.push('공격 예제(sample)가 판정 규칙에서 공격으로 판정되지 않습니다.');
  else if (!evaluate(rule, sample, true).blocked) e.push('공격 예제(sample)가 방어 모드에서 차단되지 않습니다.');
  if (evaluate(rule, normal, false).attacked) e.push('정상 입력(normal)이 공격으로 판정됩니다.');
  if (!(m.trace as string).includes('{input}')) e.push('trace에 {input} 자리표시자가 있어야 합니다.');
  for (const x of defenseLabErrors(m.defenseLab, rule)) e.push(x);
  if (e.length) return { errors: e, mission: null };
  const keys: (keyof MissionData)[] = ['missionId', 'order', 'published', 'categoryId', 'level', 'title', 'ko', 'category', 'icon', 'color', 'description', 'objective', 'field', 'sample', 'normal', 'cause', 'defense', 'vulnerable', 'secure', 'rule', 'flagPrefix', 'evidence', 'hints', 'lesson', 'trace', 'defenseLab'];
  return { errors: [], mission: Object.fromEntries(keys.map(k => [k, m[k]])) as MissionData };
}
