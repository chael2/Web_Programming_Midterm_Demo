'use client';
// Guided Learning Mode for a wargame mission (steps 0–6).
// Talks to /api/wargame/* for simulation, hints and FLAG checks; FLAG values and hint
// text never live in this bundle. The guided step state (stage, quiz) is UI-only and is
// kept separate from verification state (attempts), which the server re-checks on submit.
import { useEffect, useState, type ReactNode } from 'react';
import { labs, owaspCategories, simulate, type Simulation } from '@/lib/labs';
import { basePoints, computeScore, emptyRecord, HINT_PENALTY_PERCENT, MAX_HINTS, MIN_SCORE_PERCENT, missionObjectives, WRONG_FLAG_PENALTY_CAP_PERCENT, WRONG_FLAG_PENALTY_PERCENT, type MissionRecord } from '@/lib/wargame';
import { lessons, resolveGuided } from '@/lib/lessons';
import { StatusTag, type TagState } from '@/components/ui';
import { GuidedMission } from '@/components/mission/GuidedMission';

export type Lab = typeof labs[number];
export type Mode = 'attack' | 'defense';
export type Run = { input: string; result: Simulation; offline: boolean };
export type ClearInfo = { score: number; hintsUsed: number; wrongSubmissions: number; best: number };

const HINT_LABELS = ['방향 잡기', '핵심 원리', '접근 방법'];
const STAGES = [
  { short: '소개', title: '미션 소개', purpose: '이번 미션에서 무엇을 배우고, 무엇을 하면 완료되는지 확인합니다.', action: '내용을 읽고 ‘실습 시작’을 누르세요.', done: '‘실습 시작’ 누르기' },
  { short: '개념', title: '개념 이해', purpose: '실습 전에 이 취약점이 무엇이고 왜 위험한지 이해합니다.', action: '네 가지 설명을 읽고, 더 알고 싶으면 ‘자세히 보기’를 펼치세요.', done: '‘공격 실습으로’ 누르기' },
  { short: '공격', title: '공격 실습', purpose: '보안 검증이 빠진 서버에서 공격이 어떻게 성립하는지 직접 재현합니다.', action: '입력값을 정하고, 실행 전에 값을 확인한 뒤 ‘공격 시뮬레이션 실행’을 누르세요.', done: '공격 시뮬레이션 1회 이상 실행' },
  { short: '관찰', title: '결과 관찰', purpose: '공격 결과가 보안 측면에서 무엇을 뜻하는지 해석합니다.', action: '결과 요약부터 다음 확인 사항까지 차례로 읽으세요.', done: '공격이 성립한 결과 확인' },
  { short: '방어', title: '방어 확인', purpose: '같은 입력에 방어 코드를 적용하면 무엇이 달라지는지 비교합니다.', action: '‘방어 적용 결과 확인’을 누르고, 비교한 뒤 질문에 답하세요.', done: '방어 모드 차단 확인 + 비교 질문 정답' },
  { short: 'FLAG', title: 'FLAG 제출', purpose: '공격 결과 데이터에서 찾은 FLAG로 미션 수행을 인증합니다.', action: 'FLAG를 입력하고 ‘FLAG 제출’을 누르세요.', done: '서버에서 FLAG 검증 성공' },
  { short: '완료', title: '학습 완료', purpose: '이번 미션에서 배운 내용을 정리합니다.', action: '핵심 내용을 다시 읽고 다음 미션으로 이동하세요.', done: '—' },
];
const HOWTO: string[][] = [
  ['학습 목표와 상황 설명을 읽고 이번 미션이 어떤 문제를 다루는지 파악하세요.', '완료 조건을 확인한 뒤 ‘실습 시작’을 누르면 개념 설명으로 넘어갑니다.'],
  ['“무엇인가 → 왜 문제인가 → 언제 생기는가 → 이번에 확인할 것” 순서로 읽으세요.', '모르는 용어는 용어 풀이를 참고하세요. 다 읽었으면 ‘공격 실습으로’를 누르세요.'],
  ['입력란 위의 “입력값의 의미”를 먼저 읽으세요.', '직접 입력하거나 ‘공격 예제 입력’으로 값을 채울 수 있습니다. 예제는 실행되지 않고 입력란만 채우므로, 값을 확인한 뒤 실행하세요.', '‘정상 입력’과 결과를 비교해 보면 판정 규칙을 이해하는 데 도움이 됩니다.'],
  ['결과 요약에서 공격이 성립했는지 먼저 확인하세요.', '공격이 성립하지 않았다면 ‘공격 실습으로 돌아가기’를 눌러 다른 입력을 시도하세요.', '성립했다면 결과 데이터를 살펴본 뒤 ‘방어 확인으로’를 누르세요.'],
  ['입력값은 공격 실습에서 성공한 값이 그대로 사용됩니다.', '‘방어 적용 결과 확인’을 누르면 공격 결과와 나란히 비교표가 나타납니다.', '비교한 뒤 질문에 답하세요. 틀려도 이유를 보고 다시 고를 수 있습니다.'],
  ['아래 ‘실습 결과 다시 보기’를 펼치면 공격 결과 데이터를 다시 볼 수 있습니다.', 'FLAG는 SG{…} 형식입니다. 찾은 값을 그대로 입력하세요.', '틀리면 감점되지만 형식 오류는 감점되지 않습니다.'],
  ['핵심 요약과 기억할 문장을 다시 읽어 보세요.', '‘다시 도전하기’로 같은 미션을 다시 풀 수 있으며, 최고 점수만 반영됩니다.'],
];
const MODE_NAME: Record<Mode, string> = { attack: '공격 모드', defense: '방어 모드' };

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: '응답을 해석하지 못했습니다.' }));
  return { ok: response.ok, status: response.status, data };
}

export function verdict(labId: string, result: Simulation, mode: Mode): { state: TagState; label: string } {
  if (result.title === '시나리오 입력을 확인하세요') return { state: 'warn', label: '입력 확인 필요' };
  if (result.blocked) return { state: 'done', label: labId === 'logging' ? '탐지·대응' : '차단됨' };
  if (result.attacked) return { state: 'danger', label: mode === 'attack' ? '공격 성공' : '방어 실패' };
  return { state: 'idle', label: '공격 아님' };
}
const isInvalid = (r: Simulation) => r.title === '시나리오 입력을 확인하세요';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <section className="lesson-block"><h3>{title}</h3>{children}</section>;
}

export function MissionDetail({ lab, signedIn, record, done, nextLab, onBack, onOpen, onRecord, onCompleted }: {
  lab: Lab; signedIn: boolean; record: MissionRecord | undefined; done: boolean; nextLab: Lab | null;
  onBack: () => void; onOpen: (id: string) => void; onRecord: (record: MissionRecord) => void; onCompleted: (id: string, serverList?: string[]) => void;
}) {
  const lesson = lessons[lab.id];
  const current = record ?? emptyRecord(lab.id);
  const category = owaspCategories.find(c => c.id === lab.categoryId)!;
  const base = basePoints(lab.level);
  const preview = computeScore(lab.level, current.hintsUsed, current.wrongSubmissions);

  // UI-only guided state
  const [stage, setStage] = useState(0);
  const [maxStage, setMaxStage] = useState(0);
  const [seen, setSeen] = useState({ attack: false, defense: false });
  const [quiz, setQuiz] = useState<{ choice: number | null; checked: number | null }>({ choice: null, checked: null });
  // Simulation & verification state
  const [input, setInput] = useState<string>(lab.normal);
  const [lastAttack, setLastAttack] = useState<Run | null>(null);
  const [attackRun, setAttackRun] = useState<Run | null>(null); // last successful attack
  const [defenseRun, setDefenseRun] = useState<Run | null>(null);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [attempts, setAttempts] = useState({ attack: current.attackVerified, defense: current.defenseVerified });
  const [hints, setHints] = useState<string[]>([]);
  const [openHint, setOpenHint] = useState<number | null>(null);
  const [hintError, setHintError] = useState('');
  const [flag, setFlag] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'run' | 'hint' | 'flag'>('');
  const [clear, setClear] = useState<ClearInfo | null>(null);
  const quizPassed = quiz.checked !== null && lesson.quiz.options[quiz.checked]?.correct === true;

  // Restore previously revealed hints (they are fetched, never bundled).
  useEffect(() => {
    if (!current.hintsUsed) return;
    let cancelled = false;
    post<{ hints: string[] }>('/api/wargame/hint', { missionId: lab.id, level: signedIn ? 0 : current.hintsUsed })
      .then(r => { if (!cancelled && r.ok) setHints(r.data.hints); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.id]);

  function go(next: number) { setStage(next); setMaxStage(m => Math.max(m, next)); document.getElementById('stage-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function update(patch: Partial<MissionRecord>) { onRecord({ ...current, ...patch }); }

  async function run(mode: Mode, value: string) {
    if (!value.trim() || busy) return;
    setBusy('run');
    try {
      const r = await post<{ result: Simulation; evidence: string | null; attackSucceeded: boolean; defenseHeld: boolean; verified: { attack: boolean; defense: boolean } | null }>('/api/wargame/simulate', { missionId: lab.id, input: value, defense: mode === 'defense' });
      if (!r.ok) throw new Error(r.data.error);
      const { result, evidence: leaked, attackSucceeded, defenseHeld, verified } = r.data;
      const runInfo = { input: value, result, offline: false };
      if (mode === 'attack') {
        setLastAttack(runInfo);
        if (attackSucceeded) { setAttackRun(runInfo); setSeen(s => ({ ...s, attack: true })); }
        go(3);
      } else {
        setDefenseRun(runInfo);
        if (defenseHeld) setSeen(s => ({ ...s, defense: true }));
      }
      if (leaked) setEvidence(leaked);
      const nextAttempts = verified ?? { attack: attempts.attack || attackSucceeded, defense: attempts.defense || defenseHeld };
      setAttempts(nextAttempts);
      if (nextAttempts.attack !== current.attackVerified || nextAttempts.defense !== current.defenseVerified) update({ attackVerified: nextAttempts.attack, defenseVerified: nextAttempts.defense });
    } catch {
      // Server unreachable: show the shared rule result, but no evidence/FLAG and no verification.
      const runInfo = { input: value, result: simulate(lab.id, value, mode === 'defense'), offline: true };
      if (mode === 'attack') { setLastAttack(runInfo); go(3); } else setDefenseRun(runInfo);
    } finally { setBusy(''); }
  }

  async function revealHint(level: number) {
    if (busy || level > MAX_HINTS) return;
    setBusy('hint'); setHintError('');
    try {
      const r = await post<{ hints: string[]; hintsUsed: number }>('/api/wargame/hint', { missionId: lab.id, level });
      if (!r.ok) throw new Error(r.data.error);
      setHints(r.data.hints); setOpenHint(level);
      if (r.data.hintsUsed > current.hintsUsed) update({ hintsUsed: r.data.hintsUsed });
    } catch (error) { setHintError(error instanceof Error && error.message ? error.message : '힌트를 불러오지 못했습니다.'); }
    finally { setBusy(''); }
  }

  async function fillSample() {
    if (busy) return;
    // The attack sample is equivalent to the final hint, so reveal every level first.
    setBusy('hint'); setHintError('');
    try {
      let used = current.hintsUsed;
      let latest = hints;
      for (let level = used + 1; level <= MAX_HINTS; level++) {
        const r = await post<{ hints: string[]; hintsUsed: number }>('/api/wargame/hint', { missionId: lab.id, level });
        if (!r.ok) throw new Error(r.data.error);
        latest = r.data.hints; used = r.data.hintsUsed;
      }
      setHints(latest);
      if (used !== current.hintsUsed) update({ hintsUsed: used });
      setInput(lab.sample);
      document.getElementById('mission-input')?.focus();
    } catch (error) { setHintError(error instanceof Error && error.message ? error.message : '힌트 기록에 실패했습니다.'); }
    finally { setBusy(''); }
  }

  async function submitFlag() {
    if (!flag.trim() || busy) return;
    setBusy('flag'); setFeedback(null);
    try {
      const r = await post<{ correct: boolean; formatError?: boolean; message?: string; score?: number; hintsUsed?: number; wrongSubmissions?: number; record?: MissionRecord; completed?: string[] }>('/api/wargame/submit', { missionId: lab.id, flag, hintsUsed: current.hintsUsed, wrongSubmissions: current.wrongSubmissions });
      if (!r.ok) { setFeedback({ tone: 'error', text: r.data.error ?? '제출하지 못했습니다.' }); return; }
      const data = r.data;
      if (!data.correct) {
        if (!data.formatError && typeof data.wrongSubmissions === 'number') update({ wrongSubmissions: data.wrongSubmissions });
        setFeedback({ tone: data.formatError ? 'info' : 'error', text: data.message ?? 'FLAG가 일치하지 않습니다.' });
        return;
      }
      const score = data.score ?? 0;
      const now = new Date().toISOString();
      const nextRecord: MissionRecord = data.record ?? { ...current, hintsUsed: data.hintsUsed ?? current.hintsUsed, lastScore: score, bestScore: Math.max(current.bestScore, score), clears: current.clears + 1, firstSolvedAt: current.firstSolvedAt ?? now, solvedAt: now, wrongSubmissions: 0, attackVerified: false, defenseVerified: false };
      onRecord(nextRecord);
      onCompleted(lab.id, data.completed);
      setClear({ score, hintsUsed: data.hintsUsed ?? current.hintsUsed, wrongSubmissions: data.wrongSubmissions ?? current.wrongSubmissions, best: nextRecord.bestScore });
      setAttempts({ attack: false, defense: false });
      setFlag('');
      go(6);
    } catch { setFeedback({ tone: 'error', text: '서버에 연결할 수 없습니다. FLAG 검증은 서버에서만 수행됩니다.' }); }
    finally { setBusy(''); }
  }

  function replay() {
    setClear(null); setEvidence(null); setLastAttack(null); setAttackRun(null); setDefenseRun(null);
    setSeen({ attack: false, defense: false }); setQuiz({ choice: null, checked: null });
    setInput(lab.normal); setFeedback(null); setStage(2); setMaxStage(2);
  }

  // Missions migrated to the 5-step guided screen reuse the exact same state and API
  // handlers above; only the rendering differs. Every other mission continues below.
  const guided = resolveGuided(lesson);
  if (guided) {
    return <GuidedMission lab={lab} lesson={lesson} guided={guided} signedIn={signedIn} record={current} done={done} nextLab={nextLab} onBack={onBack} onOpen={onOpen}
      session={{ input, setInput, lastAttack, attackRun, defenseRun, evidence, attempts, hints, openHint, setOpenHint, hintError, flag, setFlag, feedback, setFeedback, busy, clear, run, revealHint, fillSample, submitFlag, replay }} />;
  }

  const canLeave = [true, true, Boolean(lastAttack), seen.attack, seen.defense && quizPassed, Boolean(clear), false];
  const blockedReason = ['', '', '공격 시뮬레이션을 한 번 실행하세요.', '공격이 성립한 결과를 확인해야 합니다. 공격 실습으로 돌아가 다른 입력을 시도하세요.', !seen.defense ? '방어 모드에서 차단을 확인하세요.' : '비교 질문에 정답을 고르세요.', 'FLAG 제출에 성공하면 완료됩니다.', ''][stage];
  const summaryOf = (i: number) => [
    `${lab.categoryId} ${category.ko} · ${lab.level}`,
    '취약점의 개념과 이번에 확인할 내용',
    lastAttack ? `입력 ${lastAttack.input}` : '',
    seen.attack ? '공격 성립 · 결과 데이터 확인' : '공격 결과 확인',
    seen.defense ? `방어 모드 차단 확인${quizPassed ? ' · 질문 정답' : ''}` : '',
    clear ? 'FLAG 검증 성공' : '',
  ][i] ?? '';

  // ---------- Stage bodies ----------
  const intro = <>
    <Block title="학습 목표"><p>{lesson.goal}</p></Block>
    <Block title="상황"><p>{lesson.scenario}</p></Block>
    <Block title="미션"><p>{missionObjectives[lab.id]}</p></Block>
    <Block title="핵심 개념">
      <dl className="terms">{lesson.terms.map(t => <div key={t.term}><dt>{t.term}</dt><dd>{t.plain}</dd></div>)}</dl>
    </Block>
    <Block title="미션 완료 조건">
      <ol className="checklist">
        <li>공격 모드에서 공격을 성립시키고 결과 데이터 확인</li>
        <li>같은 입력이 방어 모드에서 차단되는지 확인하고 비교 질문에 답하기</li>
        <li>결과 데이터에서 찾은 FLAG를 제출해 서버 검증 통과</li>
      </ol>
      <p className="fine">배점 {base}점. 힌트를 열거나 틀린 FLAG를 제출하면 감점됩니다. {done && '이미 완료한 미션입니다. 다시 풀면 최고 점수만 반영됩니다.'}</p>
    </Block>
    <div className="stage-actions"><button className="btn btn-primary" onClick={() => go(1)}>실습 시작 →</button></div>
  </>;

  const concept = <>
    <Block title="무엇인가요?"><p>{lesson.concept.what}</p></Block>
    <Block title="왜 문제가 되나요?"><p>{lesson.concept.why}</p></Block>
    <Block title="언제 발생하나요?"><p>{lesson.concept.when}</p></Block>
    <Block title="이번 실습에서 확인할 내용"><p>{lesson.concept.check}</p></Block>
    <details className="more">
      <summary>자세히 보기 · 판정 규칙과 취약한 코드</summary>
      <p>{lesson.concept.more}</p>
      <pre className="code"><code>{lab.vulnerable}</code></pre>
      <dl className="terms">{lesson.terms.map(t => <div key={t.term}><dt>{t.term}</dt><dd>{t.plain}</dd></div>)}</dl>
    </details>
    <div className="stage-actions"><button className="btn btn-primary" onClick={() => go(2)}>공격 실습으로 →</button></div>
  </>;

  const inputNote = input === lab.sample ? { label: '이 예제 입력이 재현하는 상황', text: lesson.input.sample }
    : input === lab.normal ? { label: '이 정상 입력이 재현하는 상황', text: lesson.input.normal }
      : { label: '직접 입력한 값', text: '판정 규칙에 따라 공격 여부가 정해집니다. 실행하면 다음 단계에서 결과를 해석해 줍니다.' };
  const attackStage = <>
    <Block title="무엇을 할까요?"><p>보안 검증이 빠진 취약한 서버에 입력을 보내, 공격이 성립하는지 확인합니다. 직접 입력해도 되고, ‘공격 예제 입력’으로 예제를 채울 수도 있습니다. 예제는 실행되지 않고 입력란만 채우니, 값을 확인한 뒤 실행하세요.</p></Block>
    <div className="bench bench-attack">
      <p className="bench-mode"><span className="mode-badge mono">ATTACK</span>공격 모드 · 취약한 서버가 입력을 그대로 처리합니다.</p>
      <div className="field">
        <label className="field-label" htmlFor="mission-input">{lab.field}</label>
        <p className="field-hint" id="input-meaning"><b>입력값의 의미</b> {lesson.input.field}</p>
        <textarea id="mission-input" className="mono" value={input} maxLength={2000} rows={2} onChange={e => setInput(e.target.value)} aria-describedby="input-meaning input-note" />
      </div>
      <p className="input-note" id="input-note" aria-live="polite"><span>{inputNote.label}</span>{inputNote.text}</p>
      <div className="bench-actions">
        <button className="btn btn-primary" disabled={!input.trim() || busy !== ''} onClick={() => { void run('attack', input); }}>{busy === 'run' ? '서버에서 판정 중…' : '공격 시뮬레이션 실행'}</button>
        <span className="bench-aux">
          <button className="btn btn-secondary btn-sm" disabled={busy !== ''} onClick={() => { void fillSample(); }} aria-describedby={current.hintsUsed < MAX_HINTS ? 'sample-note' : undefined}>공격 예제 입력</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setInput(lab.normal)}>정상 입력</button>
        </span>
      </div>
      {current.hintsUsed < MAX_HINTS && <p id="sample-note" className="fine">공격 예제 입력은 정답에 가까우므로 힌트 3단계 사용으로 기록됩니다(점수 감점).</p>}
      {hintError && <p className="form-error" role="alert">{hintError}</p>}
    </div>
    <p className="fine">결과 확인 안내 — 실행하면 ‘결과 관찰’ 단계로 넘어가 실제로 일어난 동작과 그 의미를 설명합니다.</p>
  </>;

  const observe = (() => {
    if (!lastAttack) return <p className="empty">아직 공격 결과가 없습니다. <button className="link-btn" onClick={() => go(2)}>공격 실습으로 이동</button></p>;
    const r = lastAttack.result;
    const v = verdict(lab.id, r, 'attack');
    const success = r.attacked && !r.blocked;
    const invalid = isInvalid(r);
    return <>
      <div className={`verdict verdict-${v.state}`}><StatusTag state={v.state}>{v.label}</StatusTag><span>{success ? '취약한 동작이 발생했습니다.' : invalid ? '이 미션에서 판정할 수 있는 입력이 아닙니다.' : '이 입력으로는 공격이 성립하지 않았습니다.'}</span></div>
      <p className="run-input"><span>실행한 입력</span><code className="mono">{lastAttack.input}</code></p>
      <Block title="실제로 발생한 동작">
        <pre className="code run-output">{r.output}</pre>
        <p>{success ? lesson.attack.happened : invalid ? '판정 규칙에 맞는 값이 아니어서 공격·방어 판정을 하지 않았습니다. 위 안내에 있는 값 중 하나를 입력하세요.' : lesson.normal}</p>
      </Block>
      {success && <Block title="보안 측면에서의 의미"><p>{lesson.attack.meaning}</p></Block>}
      {success && (evidence ? <section className="evidence" aria-labelledby="evidence-title">
        <div className="evidence-head"><h3 id="evidence-title">결과 데이터</h3><span className="mono">공격 성공 시 서버 응답 · 가상 값</span></div>
        <pre>{evidence}</pre>
      </section> : <p className="fine">서버 응답 데이터를 받지 못했습니다. 연결을 확인하고 다시 실행하세요.</p>)}
      {lastAttack.offline && <p className="form-error">서버에 연결하지 못해 브라우저 규칙으로만 판정했습니다. 결과 데이터와 FLAG는 서버 판정에서만 제공되며, 이 실행은 진행 기록에 반영되지 않습니다.</p>}
      <Block title="다음에 확인할 사항">
        <p>{success ? lesson.attack.next : '공격 실습으로 돌아가 다른 입력을 시도하세요. 막히면 오른쪽 도움말의 ‘입력값의 의미’를 읽거나 힌트를 열어 보세요.'}</p>
      </Block>
      <div className="stage-actions">
        {success || seen.attack ? <button className="btn btn-primary" onClick={() => go(4)}>방어 확인으로 →</button> : null}
        <button className={success || seen.attack ? 'btn btn-ghost' : 'btn btn-primary'} onClick={() => go(2)}>← 공격 실습으로 돌아가기</button>
      </div>
    </>;
  })();

  const defenseInput = attackRun?.input ?? input;
  const defenseStage = <>
    <Block title="공격 모드와 방어 모드의 차이"><p>{lesson.defense.diff}</p></Block>
    <Block title="적용되는 보안 검증"><p>{lesson.defense.check}</p></Block>
    <Block title="무엇을 비교할까요?"><p>{lesson.defense.compare}</p></Block>
    <div className="bench bench-defense">
      <p className="bench-mode"><span className="mode-badge mono">DEFENSE</span>방어 모드 · 같은 입력에 방어 코드를 적용합니다.</p>
      <p className="run-input"><span>공격 실습에서 사용한 입력</span><code className="mono">{defenseInput}</code></p>
      <div className="bench-actions"><button className="btn btn-primary" disabled={!defenseInput.trim() || busy !== ''} onClick={() => { void run('defense', defenseInput); }}>{busy === 'run' ? '서버에서 판정 중…' : '방어 적용 결과 확인'}</button></div>
      <p className="fine">입력을 바꾸려면 공격 실습 단계로 돌아가 다시 공격을 성립시키세요.</p>
    </div>
    {defenseRun && <section className="compare" aria-labelledby="compare-title" aria-live="polite">
      <h3 id="compare-title">공격 · 방어 결과 비교</h3>
      <div className="table-wrap"><table className="data-table">
        <thead><tr><th scope="col">모드</th><th scope="col">입력</th><th scope="col">판정</th><th scope="col">처리 결과</th></tr></thead>
        <tbody>{([['attack', attackRun], ['defense', defenseRun]] as [Mode, Run | null][]).map(([m, r]) => { if (!r) return null; const v = verdict(lab.id, r.result, m); return <tr key={m}><td>{MODE_NAME[m]}</td><td><code className="mono">{r.input}</code></td><td><StatusTag state={v.state}>{v.label}</StatusTag></td><td>{r.result.output}</td></tr>; })}</tbody>
      </table></div>
      <p className="compare-note">{defenseRun.result.blocked ? lesson.defense.result : defenseRun.offline ? '서버에 연결하지 못했습니다. 다시 시도하세요.' : '이 입력은 공격이 아니어서 방어 모드에서도 그대로 처리되었습니다. 공격이 성립한 입력으로 비교하세요.'}</p>
    </section>}
    {seen.defense && <fieldset className="quiz">
      <legend>비교 질문 · {lesson.quiz.question}</legend>
      {lesson.quiz.options.map((o, i) => <label key={i} className={`quiz-option ${quiz.checked === i ? (o.correct ? 'is-correct' : 'is-wrong') : ''}`}>
        <input type="radio" name={`quiz-${lab.id}`} checked={quiz.choice === i} onChange={() => setQuiz({ choice: i, checked: quizPassed ? quiz.checked : null })} disabled={quizPassed} />
        <span>{o.text}</span>
      </label>)}
      {quiz.checked !== null && <p className={quizPassed ? 'quiz-feedback is-correct' : 'quiz-feedback is-wrong'} role="status"><b>{quizPassed ? '정답' : '다시 생각해 보세요'}</b>{lesson.quiz.options[quiz.checked].why}</p>}
      {!quizPassed && <button className="btn btn-secondary" disabled={quiz.choice === null} onClick={() => setQuiz(q => ({ ...q, checked: q.choice }))}>답 확인</button>}
    </fieldset>}
    {quizPassed && <div className="stage-actions"><button className="btn btn-primary" onClick={() => go(5)}>FLAG 제출로 →</button></div>}
  </>;

  const canType = attempts.attack && !clear;
  const canSubmit = attempts.attack && attempts.defense && !clear;
  const flagHelp = !attempts.attack ? '서버에 공격 성공 기록이 없습니다. 공격 실습에서 다시 실행하세요.'
    : !attempts.defense ? '방어 모드에서 차단을 확인해야 제출할 수 있습니다.'
      : 'FLAG는 서버에서 검증합니다. 1분에 최대 8회까지 제출할 수 있습니다.';
  const flagStage = <>
    <p className="flag-guide">공격 성공 시 반환된 결과 데이터에서 FLAG를 찾아 입력하세요. 방어 모드에서 차단을 확인한 후 제출할 수 있습니다.</p>
    <form className="flag-form" onSubmit={e => { e.preventDefault(); void submitFlag(); }}>
      <label className="field-label" htmlFor="flag-input">FLAG</label>
      <div className="flag-row">
        <input id="flag-input" className="mono" value={flag} onChange={e => { setFlag(e.target.value); setFeedback(null); }} maxLength={100} placeholder="SG{...}" spellCheck={false} autoComplete="off" disabled={!canType} aria-describedby="flag-help" aria-invalid={feedback?.tone === 'error' || undefined} />
        <button className="btn btn-primary" disabled={!canSubmit || !flag.trim() || busy !== ''}>{busy === 'flag' ? '검증 중…' : 'FLAG 제출'}</button>
      </div>
      {feedback && <p className={feedback.tone === 'error' ? 'flag-msg is-error' : 'flag-msg'} role="alert">{feedback.text}</p>}
      <p id="flag-help" className="fine">{flagHelp}</p>
    </form>
    <ul className="flag-checks" aria-label="제출 조건">
      <li><StatusTag state={attempts.attack ? 'done' : 'idle'}>공격 성공</StatusTag></li>
      <li><StatusTag state={attempts.defense ? 'done' : 'idle'}>방어 확인</StatusTag></li>
    </ul>
    <details className="more">
      <summary>실습 결과 다시 보기</summary>
      {evidence ? <section className="evidence"><div className="evidence-head"><h3>결과 데이터</h3><span className="mono">공격 성공 시 서버 응답 · 가상 값</span></div><pre>{evidence}</pre></section> : <p>이번 세션에 받은 결과 데이터가 없습니다. 공격 실습에서 다시 실행하면 확인할 수 있습니다.</p>}
      {attackRun && defenseRun && <p className="fine">공격 모드: {attackRun.result.output} / 방어 모드: {defenseRun.result.output}</p>}
    </details>
  </>;

  const complete = clear && <>
    <div className="clear-top">
      <div><StatusTag state="done">미션 완료{current.clears > 1 ? ` · ${current.clears}회째` : ''}</StatusTag><h3 className="clear-title">{lab.title}</h3><p className="fine">사용한 힌트 {clear.hintsUsed}/{MAX_HINTS} · 오답 제출 {clear.wrongSubmissions}회</p></div>
      <p className="clear-score mono" aria-label={`획득 점수 ${clear.score}점, 배점 ${base}점`}><b>{clear.score}</b><span>/ {base}</span><small>최고 {clear.best}점</small></p>
    </div>
    <blockquote className="takeaway"><span>기억할 문장</span>{lesson.takeaway}</blockquote>
    <Block title="핵심 취약점 요약"><p>{lesson.concept.what} {lesson.concept.why}</p></Block>
    <Block title="공격과 방어 결과의 차이">
      <dl className="diff">
        <div><dt><StatusTag state="danger">공격 모드</StatusTag></dt><dd>{attackRun?.result.output ?? lesson.attack.happened}</dd></div>
        <div><dt><StatusTag state="done">방어 모드</StatusTag></dt><dd>{defenseRun?.result.output ?? lesson.defense.result}</dd></div>
      </dl>
    </Block>
    <Block title="올바른 방어 방법"><p>{lab.defense}</p><pre className="code"><code>{lab.secure}</code></pre></Block>
    <div className="stage-actions">
      {nextLab && <button className="btn btn-primary" onClick={() => onOpen(nextLab.id)}>다음 미션 · {nextLab.title} →</button>}
      <button className="btn btn-secondary" onClick={replay}>다시 도전하기</button>
      <button className="btn btn-ghost" onClick={onBack}>미션 목록</button>
    </div>
  </>;

  const bodies = [intro, concept, attackStage, observe, defenseStage, flagStage, complete];
  const info = STAGES[stage];

  return <article className="mission">
    <button className="btn btn-ghost btn-sm back-link" onClick={onBack}>← 미션 목록</button>
    <header className="mission-head">
      <p className="eyebrow">Mission {lab.number} · {lab.categoryId}:2025 {category.title}</p>
      <h1>{lab.title}</h1>
      <p className="mission-facts"><span>{category.ko}</span><span>난이도 <b>{lab.level}</b></span><span>배점 <b className="mono">{base}</b>점</span></p>
    </header>

    <nav className="guide-steps" aria-label="학습 단계">
      <ol>{STAGES.map((s, i) => {
        // done = passed through; open = reachable but its condition is not met yet
        const state = i === stage ? 'current' : i < maxStage ? 'done' : i === maxStage ? 'open' : 'locked';
        return <li key={s.short} className={`gstep gstep-${state}`}>
          <button disabled={i > maxStage} aria-current={i === stage ? 'step' : undefined} onClick={() => go(i)} aria-label={`${i}단계 ${s.title}${state === 'done' ? ' (완료)' : state === 'locked' ? ' (잠김)' : ''}`}>
            <span className="mono">{state === 'done' ? '✓' : i}</span><span className="gstep-name">{s.short}</span>
          </button>
        </li>;
      })}</ol>
    </nav>

    <div className="mission-layout">
      <div className="mission-main">
        {stage > 0 && <ol className="past-steps" aria-label="완료한 단계">
          {STAGES.slice(0, stage).map((s, i) => <li key={s.short}>
            <span className="mono" aria-hidden="true">✓</span><span className="past-title">{i}. {s.title}</span><span className="past-sum">{summaryOf(i)}</span>
            <button className="link-btn" onClick={() => go(i)}>다시 보기</button>
          </li>)}
        </ol>}

        <section className="stage" id="stage-top" aria-labelledby="stage-title">
          <header className="stage-head">
            <p className="eyebrow">단계 {stage} / 6</p>
            <h2 id="stage-title">{info.title}</h2>
            <p className="stage-purpose">{info.purpose}</p>
            <dl className="stage-meta">
              <div><dt>할 일</dt><dd>{info.action}</dd></div>
              <div><dt>완료 조건</dt><dd>{info.done}</dd></div>
            </dl>
            <a className="help-jump link-btn" href="#help-title">막혔나요? 도움말 · 힌트 보기 ↓</a>
          </header>
          <div className="stage-body">{bodies[stage]}</div>
          {stage > 0 && stage < 6 && <footer className="stage-nav">
            <button className="btn btn-ghost btn-sm" onClick={() => go(stage - 1)}>← 이전 단계</button>
            {stage >= 2 && stage < maxStage && canLeave[stage] && <button className="btn btn-secondary btn-sm" onClick={() => go(stage + 1)}>다음 단계 →</button>}
            {!canLeave[stage] && blockedReason && <span className="fine">다음 단계로 가려면: {blockedReason}</span>}
          </footer>}
        </section>
      </div>

      <aside className="mission-aside" aria-label="도움말과 힌트">
        <section className="aside-block" aria-labelledby="help-title">
          <div className="aside-head"><h2 id="help-title">도움말</h2><span className="mono">사용 방법 · 감점 없음</span></div>
          <div className="help-list">
            <details><summary>어떻게 해야 하나요?</summary><ul>{HOWTO[stage].map(t => <li key={t}>{t}</li>)}</ul></details>
            <details><summary>입력값의 의미</summary><p>{lesson.input.field}</p><p><b>정상 입력</b> {lesson.input.normal}</p>{input === lab.sample && <p><b>공격 예제</b> {lesson.input.sample}</p>}</details>
            <details><summary>결과를 관찰하는 방법</summary><ul>
              <li>판정 표시(공격 성공 · 차단됨 · 공격 아님)로 공격이 성립했는지 먼저 확인합니다.</li>
              <li>“실제로 발생한 동작”에서 서버가 입력을 어떻게 처리했는지 읽습니다.</li>
              <li>공격이 성립하면 서버가 돌려준 결과 데이터가 함께 표시됩니다. FLAG 제출 단계에서 이 데이터를 다시 살펴보게 됩니다.</li>
              <li>방어 확인 단계에서는 같은 입력의 두 결과를 나란히 비교합니다.</li>
            </ul></details>
            <details><summary>취약점 개념 다시 보기</summary><p>{lesson.concept.what}</p><p>{lesson.concept.why}</p><button className="link-btn" onClick={() => go(1)}>개념 이해 단계로 이동</button></details>
          </div>
        </section>

        <section className="aside-block" aria-labelledby="hint-title">
          <div className="aside-head"><h2 id="hint-title">힌트</h2><span className="mono">{current.hintsUsed}/{MAX_HINTS} 사용</span></div>
          <p className="fine">힌트는 문제 해결 방향을 알려줍니다. 열면 점수가 감점됩니다.</p>
          <ul className="hint-list">{[1, 2, 3].map(level => {
            const text = hints[level - 1];
            if (text) return <li key={level}><details open={openHint === level} onToggle={e => { const open = (e.currentTarget as HTMLDetailsElement).open; setOpenHint(o => open ? level : o === level ? null : o); }}>
              <summary><span>힌트 {level} · {HINT_LABELS[level - 1]}</span><span className="hint-used">사용함</span></summary><p>{text}</p>
            </details></li>;
            const next = level === hints.length + 1;
            return <li key={level}><button className="hint-reveal" disabled={!next || busy !== ''} onClick={() => { void revealHint(level); }}>
              <span>힌트 {level} 보기</span><span className="mono">{next ? `누적 −${HINT_PENALTY_PERCENT[level]}%` : '이전 힌트 먼저'}</span>
            </button></li>;
          })}</ul>
          {!signedIn && <p className="fine">게스트의 힌트 사용 기록은 이 브라우저에만 저장됩니다.</p>}
        </section>

        <section className="aside-block" aria-labelledby="score-title">
          <div className="aside-head"><h2 id="score-title">점수</h2><span className="mono">예상 {preview} / {base}</span></div>
          <p className="score-line">배점 {base}점 · 힌트 사용 시 감점 · 오답 제출 시 감점{current.bestScore ? ` · 최고 ${current.bestScore}점` : ''}</p>
          <details className="rules">
            <summary>점수 규칙 보기</summary>
            <ul>
              <li>힌트 1단계 −{HINT_PENALTY_PERCENT[1]}%, 2단계까지 −{HINT_PENALTY_PERCENT[2]}%, 3단계까지 −{HINT_PENALTY_PERCENT[3]}% (누적)</li>
              <li>‘공격 예제 입력’은 힌트 3단계 사용으로 기록</li>
              <li>틀린 FLAG 1회당 −{WRONG_FLAG_PENALTY_PERCENT}%, 최대 −{WRONG_FLAG_PENALTY_CAP_PERCENT}% · 형식 오류는 감점 없음</li>
              <li>최저 {MIN_SCORE_PERCENT}% 보장 · 재도전 시 미션별 최고 점수만 합산</li>
              <li>도움말과 비교 질문은 점수에 영향을 주지 않습니다.</li>
            </ul>
            <p className="fine">교육용 게임 점수이며 실제 보안 역량을 평가하지 않습니다.</p>
          </details>
        </section>
      </aside>
    </div>
    <p className="note">정해진 규칙으로 판정하는 교육용 시뮬레이션입니다. 결과 데이터와 FLAG는 모두 가상 값이며, 실제 DB 쿼리·스크립트 실행·외부 요청은 수행하지 않습니다.</p>
  </article>;
}
