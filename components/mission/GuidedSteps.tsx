'use client';
// One component per guided step. Each step starts with StepHeader (purpose + concrete
// actions), explains inputs before running, and says what to look for after running.
import type { ReactNode } from 'react';
import { MAX_HINTS } from '@/lib/wargame';
import { StatusTag } from '@/components/ui';
import { verdict, type Run } from '@/components/Wargame';
import type { StepProps } from './GuidedMission';

/** Step titles, purpose and concrete actions shown at the top of each step. */
export const STEPS = [
  { name: '이해하기', guide: '이번 미션에서 무엇을 배우는지 파악하는 단계입니다.', actions: ['아래 설명을 위에서부터 읽으세요.', '준비되면 ‘실습 시작’을 누르세요.'] },
  { name: '실습하기', guide: '보안 검증이 빠진 상황에서 입력이 어떻게 처리되는지 직접 실행해 보는 단계입니다.', actions: ['“입력값의 의미”를 읽으세요.', '입력란에 값을 넣으세요.', '‘공격 시뮬레이션 실행’을 누르세요.'] },
  { name: '결과 관찰하기', guide: '실행 결과를 읽고, 왜 그런 결과가 나왔는지 이해하는 단계입니다.', actions: ['판정과 입력한 값을 확인하세요.', '“확인할 것” 목록을 하나씩 살펴보세요.', '공격이 성공했다면 ‘방어하기’를 누르세요.'] },
  { name: '방어하기', guide: '같은 입력에 보안 검증을 적용하면 무엇이 달라지는지 비교하는 단계입니다.', actions: ['적용되는 검증을 읽으세요.', '‘방어 적용 결과 확인’을 누르세요.', '전후 비교와 코드 차이를 본 뒤 질문에 답하세요.'] },
  { name: 'FLAG 제출 및 완료', guide: 'FLAG를 제출해 미션 해결을 인증하고, 배운 내용을 정리하는 단계입니다.', actions: ['결과 데이터에서 SG{…} 형식의 FLAG를 찾으세요.', 'FLAG를 입력하고 ‘FLAG 제출’을 누르세요.'] },
];

function StepHeader({ n }: { n: number }) {
  const s = STEPS[n - 1];
  return <header className="gm-step-head">
    <p className="gm-step-count">단계 {n} / {STEPS.length}</p>
    <h2 id="gm-step-title">{s.name}</h2>
    <p className="gm-step-guide">{s.guide}</p>
    <div className="gm-todo"><p>지금 할 일</p><ol>{s.actions.map(a => <li key={a}>{a}</li>)}</ol></div>
  </header>;
}
function Part({ title, children }: { title: string; children: ReactNode }) {
  return <section className="gm-part"><h3>{title}</h3>{children}</section>;
}
function Checks({ items }: { items: string[] }) {
  return <ul className="gm-checks">{items.map(t => <li key={t}>{t}</li>)}</ul>;
}
function Actions({ children }: { children: ReactNode }) { return <div className="gm-actions">{children}</div>; }

/* ---------- 1. 이해하기 ---------- */
export function UnderstandStep({ lesson, guided, go }: StepProps) {
  return <>
    <StepHeader n={1} />
    <Part title="이 취약점은"><p className="gm-lead">{guided.brief}</p></Part>
    <Part title="상황"><p>{guided.situation}</p></Part>
    <Part title="학습 목표"><p>{guided.goal}</p></Part>
    <Part title="이번 미션에서 할 일"><ol className="gm-numbered">{guided.todo.map(t => <li key={t}>{t}</li>)}</ol></Part>
    <details className="gm-more"><summary>용어 풀이</summary>
      <dl className="gm-terms">{lesson.terms.map(t => <div key={t.term}><dt>{t.term}</dt><dd>{t.plain}</dd></div>)}</dl>
    </details>
    <Actions><button className="btn btn-primary gm-cta" onClick={() => go(2)}>실습 시작 →</button></Actions>
  </>;
}

/* ---------- 2. 실습하기 ---------- */
export function PracticeStep({ lab, lesson, guided, session, record, go, openHelp }: StepProps) {
  const { input, setInput, busy, hintError } = session;
  const note = input === lab.sample ? { label: '이 예제 입력의 의미', text: lesson.input.sample }
    : input === lab.normal ? { label: '이 정상 입력의 의미', text: lesson.input.normal }
      : { label: '직접 입력한 값', text: guided.customNote };
  async function attack() { await session.run('attack', input); go(3); }
  return <>
    <StepHeader n={2} />
    <Part title="두 가지 모드">
      <dl className="gm-modes">
        <div><dt>공격 모드 <span className="gm-now">지금 실행</span></dt><dd>{guided.modes.attack}</dd></div>
        <div><dt>방어 모드 <span>4단계에서 실행</span></dt><dd>{guided.modes.defense}</dd></div>
      </dl>
      <p className="gm-small">{guided.rule}</p>
    </Part>
    <Part title="입력값의 의미"><p>{lesson.input.field}</p></Part>
    <form className="gm-bench" onSubmit={e => { e.preventDefault(); void attack(); }}>
      <label className="gm-label" htmlFor="gm-input">{lab.field}</label>
      <input id="gm-input" className="gm-input mono" value={input} maxLength={2000} onChange={e => setInput(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="gm-input-note" />
      <p className="gm-input-note" id="gm-input-note" aria-live="polite"><b>{note.label}</b>{note.text}</p>
      <div className="gm-bench-actions">
        <button className="btn btn-primary gm-cta" disabled={!input.trim() || busy !== ''}>{busy === 'run' ? '판정 중…' : '공격 시뮬레이션 실행'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInput(lab.normal)}>정상 입력 넣기</button>
      </div>
    </form>
    <div className="gm-stuck">
      <p>어떤 값을 넣어야 할지 모르겠다면</p>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => openHelp('hints')}>힌트 보기 ({record.hintsUsed}/{MAX_HINTS} 사용)</button>
        <button className="btn btn-ghost btn-sm" disabled={busy !== ''} onClick={() => { void session.fillSample(); }}>공격 예제 입력{record.hintsUsed < MAX_HINTS ? ' · 힌트 3단계로 기록' : ''}</button>
      </div>
      <p className="gm-small">예제 입력은 입력란만 채우고 실행하지 않습니다. 실행 전에 값과 의미를 확인하세요. 힌트와 예제는 점수가 감점됩니다.</p>
    </div>
    {hintError && <p className="form-error" role="alert">{hintError}</p>}
  </>;
}

/* ---------- 3. 결과 관찰하기 ---------- */
function RunSummary({ labId, run, mode }: { labId: string; run: Run; mode: 'attack' | 'defense' }) {
  const v = verdict(labId, run.result, mode);
  return <dl className="gm-result">
    <div><dt>판정</dt><dd><StatusTag state={v.state}>{v.label}</StatusTag></dd></div>
    <div><dt>입력한 값</dt><dd><code className="mono">{run.input}</code></dd></div>
    <div><dt>시스템이 처리한 결과</dt><dd>{run.result.output}</dd></div>
  </dl>;
}
export function ObserveStep({ lab, lesson, guided, session, go }: StepProps) {
  const run = session.lastAttack;
  if (!run) return <><StepHeader n={3} /><p className="gm-empty">아직 실행 결과가 없습니다.</p><Actions><button className="btn btn-primary" onClick={() => go(2)}>← 실습하기로 이동</button></Actions></>;
  const success = run.result.attacked && !run.result.blocked;
  // simulate() returns this title for values a mission does not judge (design/integrity/logging/exceptions).
  const invalid = run.result.title === '시나리오 입력을 확인하세요';
  return <>
    <StepHeader n={3} />
    <div className={`gm-verdict ${success ? 'is-attack' : 'is-none'}`} role="status">
      <strong>{success ? '공격이 성공했습니다.' : invalid ? '판정할 수 없는 입력입니다.' : '공격이 성립하지 않았습니다.'}</strong>
      <span>{success ? '보안 검증이 빠진 서버가 입력을 그대로 처리했습니다.' : invalid ? '이 미션은 정해진 값만 판정합니다.' : '이 입력으로는 취약한 동작이 일어나지 않았습니다.'}</span>
    </div>
    <RunSummary labId={lab.id} run={run} mode="attack" />
    {run.offline && <p className="form-error">서버에 연결하지 못해 브라우저 규칙으로만 판정했습니다. 결과 데이터는 받지 못했고 진행 기록에도 반영되지 않았습니다. 다시 실행하세요.</p>}
    <Part title="확인할 것"><Checks items={success ? guided.observe.success : invalid ? ['판정이 “입력 확인 필요”로 표시되었는지', '“시스템이 처리한 결과”에 판정 가능한 값이 안내되어 있는지'] : guided.observe.normal} /></Part>
    <Part title="왜 이런 결과가 나왔나요?">
      <p>{success ? guided.observe.why : invalid ? `${guided.rule} 안내된 값 중 하나로 다시 실행하세요.` : lesson.normal}</p>
      {success && <pre className="code gm-code"><code>{lab.vulnerable}</code></pre>}
    </Part>
    {success && session.evidence && <section className="gm-data" aria-labelledby="gm-data-title">
      <h3 id="gm-data-title">결과 데이터 <span>서버가 돌려준 가상 응답</span></h3>
      <pre>{session.evidence}</pre>
      <p className="gm-small">{guided.observe.dataNote}</p>
    </section>}
    {success && <Part title="보안 측면에서의 의미"><p>{lesson.attack.meaning}</p></Part>}
    <Actions>
      {session.attackRun ? <button className="btn btn-primary gm-cta" onClick={() => go(4)}>방어하기 →</button> : null}
      <button className={session.attackRun ? 'btn btn-ghost' : 'btn btn-primary gm-cta'} onClick={() => go(2)}>← 실습하기로 돌아가기</button>
    </Actions>
  </>;
}

/* ---------- 4. 방어하기 ---------- */
export function DefendStep({ lab, lesson, guided, session, go, quiz, setQuiz, quizPassed }: StepProps) {
  const attackRun = session.attackRun;
  if (!attackRun) return <><StepHeader n={4} /><p className="gm-empty">먼저 공격 모드에서 공격을 성공시켜야 합니다.</p><Actions><button className="btn btn-primary" onClick={() => go(2)}>← 실습하기로 이동</button></Actions></>;
  const defenseRun = session.defenseRun;
  const blocked = Boolean(defenseRun?.result.blocked);
  return <>
    <StepHeader n={4} />
    <Part title="실행 전에">
      <p>{guided.defenseBefore}</p>
      <dl className="gm-result gm-result-compact">
        <div><dt>입력값</dt><dd><code className="mono">{attackRun.input}</code> <span className="gm-small">3단계에서 공격에 성공한 값</span></dd></div>
        <div><dt>적용되는 검증</dt><dd>{lesson.defense.check}</dd></div>
      </dl>
    </Part>
    <Actions><button className="btn btn-primary gm-cta" disabled={session.busy !== ''} onClick={() => { void session.run('defense', attackRun.input); }}>{session.busy === 'run' ? '판정 중…' : '방어 적용 결과 확인'}</button></Actions>

    {defenseRun && <>
      <Part title="방어 적용 전후">
        <div className="table-wrap"><table className="data-table gm-table">
          <thead><tr><th scope="col"></th><th scope="col">판정</th><th scope="col">시스템이 처리한 결과</th></tr></thead>
          <tbody>{([['방어 적용 전', attackRun, 'attack'], ['방어 적용 후', defenseRun, 'defense']] as const).map(([name, r, m]) => { const v = verdict(lab.id, r.result, m); return <tr key={name}><th scope="row">{name}</th><td><StatusTag state={v.state}>{v.label}</StatusTag></td><td>{r.result.output}</td></tr>; })}</tbody>
        </table></div>
        {defenseRun.offline && <p className="form-error">서버에 연결하지 못했습니다. 다시 실행하세요.</p>}
      </Part>
      {blocked && <>
        <Part title="확인할 것"><Checks items={guided.defenseObserve} /><p>{lesson.defense.result}</p></Part>
        <Part title="코드의 핵심 차이">
          <div className="gm-codes">
            <div><p className="gm-code-label">취약한 코드</p><pre className="code gm-code"><code>{lab.vulnerable}</code></pre></div>
            <div><p className="gm-code-label">안전한 코드</p><pre className="code gm-code"><code>{lab.secure.split('\n').map(line => line === guided.codeDiff.added
              ? <span key={line} className="gm-added">{line}<span className="gm-added-tag">  ← 추가된 검사</span>{'\n'}</span>
              : <span key={line}>{line}{'\n'}</span>)}</code></pre></div>
          </div>
          <p>{guided.codeDiff.explain}</p>
        </Part>
        <fieldset className="gm-quiz">
          <legend>이해 확인 · {lesson.quiz.question}</legend>
          {lesson.quiz.options.map((o, i) => <label key={o.text} className={`gm-option ${quiz.checked === i ? (o.correct ? 'is-correct' : 'is-wrong') : ''}`}>
            <input type="radio" name={`gm-quiz-${lab.id}`} checked={quiz.choice === i} disabled={quizPassed} onChange={() => setQuiz({ choice: i, checked: null })} />
            <span>{o.text}</span>
          </label>)}
          {quiz.checked !== null && <p className={`gm-feedback ${quizPassed ? 'is-correct' : 'is-wrong'}`} role="status"><b>{quizPassed ? '정답입니다' : '다시 생각해 보세요'}</b>{lesson.quiz.options[quiz.checked].why}</p>}
          {!quizPassed && <button className="btn btn-secondary" disabled={quiz.choice === null} onClick={() => setQuiz(q => ({ ...q, checked: q.choice }))}>답 확인</button>}
        </fieldset>
      </>}
      {!blocked && !defenseRun.offline && <p>이 입력은 방어 모드에서 차단되지 않았습니다. 3단계에서 공격에 성공한 값으로 다시 실행하세요.</p>}
    </>}
    {quizPassed && <Actions><button className="btn btn-primary gm-cta" onClick={() => go(5)}>FLAG 제출로 →</button></Actions>}
  </>;
}

/* ---------- 5. FLAG 제출 및 완료 ---------- */
export function SubmitStep(props: StepProps) {
  const { guided, session, go } = props;
  const { attempts, clear, busy, flag, feedback } = session;
  return <>
    <StepHeader n={5} />
    <Part title="FLAG란?">
      <p>FLAG는 미션을 해결했음을 확인하는 정답 문자열입니다. 실습 결과에서 FLAG를 찾아 제출하세요.</p>
      <p className="gm-small">{guided.flagWhere}</p>
    </Part>
    {clear ? <Completion {...props} /> : !(attempts.attack && attempts.defense) ? <section className="gm-locked" role="status">
      <h3>아직 FLAG를 제출할 수 없습니다</h3>
      <p>FLAG 입력란은 공격 성공과 방어 확인을 모두 마친 뒤에 열립니다.</p>
      <ul>
        <li><StatusTag state={attempts.attack ? 'done' : 'idle'}>공격 모드에서 공격 성공</StatusTag>{!attempts.attack && <button className="link-btn" onClick={() => go(2)}>실습하기로 이동</button>}</li>
        <li><StatusTag state={attempts.defense ? 'done' : 'idle'}>방어 모드에서 차단 확인</StatusTag>{!attempts.defense && <button className="link-btn" onClick={() => go(4)}>방어하기로 이동</button>}</li>
      </ul>
    </section> : <>
      <details className="gm-more">
        <summary>결과 데이터 다시 보기</summary>
        {session.evidence ? <pre className="gm-data-pre">{session.evidence}</pre> : <p>이번 실습에서 받은 결과 데이터가 없습니다. 실습하기에서 다시 실행하면 확인할 수 있습니다.</p>}
      </details>
      <form className="gm-flag" onSubmit={e => { e.preventDefault(); void session.submitFlag(); }}>
        <label className="gm-label" htmlFor="gm-flag-input">FLAG</label>
        <div className="gm-flag-row">
          <input id="gm-flag-input" className="gm-input mono" value={flag} onChange={e => { session.setFlag(e.target.value); session.setFeedback(null); }} maxLength={100} placeholder="SG{...}" spellCheck={false} autoComplete="off" aria-describedby="gm-flag-help" aria-invalid={feedback?.tone === 'error' || undefined} />
          <button className="btn btn-primary gm-cta" disabled={!flag.trim() || busy !== ''}>{busy === 'flag' ? '검증 중…' : 'FLAG 제출'}</button>
        </div>
        {feedback && <p className={`gm-flag-msg ${feedback.tone === 'error' ? 'is-error' : ''}`} role="alert">{feedback.text}</p>}
        <p id="gm-flag-help" className="gm-small">FLAG는 서버에서 검증합니다. 틀린 FLAG는 1회당 감점되며(형식 오류 제외), 1분에 최대 8회까지 제출할 수 있습니다.</p>
      </form>
    </>}
    {!clear && <Actions><button className="btn btn-ghost" onClick={() => go(4)}>← 방어하기로 돌아가기</button></Actions>}
  </>;
}

function Completion({ lab, lesson, guided, session, base, nextLab, onBack, onOpen, onReplay }: StepProps) {
  const clear = session.clear!;
  return <section className="gm-complete" role="status" aria-labelledby="gm-complete-title">
    <p><StatusTag state="done">미션 완료</StatusTag></p>
    <h3 id="gm-complete-title">{lab.title} 미션을 해결했습니다</h3>
    <dl className="gm-score">
      <div><dt>획득 점수</dt><dd><b className="mono">{clear.score}</b> / {base}점 <span className="gm-small">최고 {clear.best}점</span></dd></div>
      <div><dt>힌트 사용</dt><dd>{clear.hintsUsed ? `${clear.hintsUsed}단계까지 사용` : '사용하지 않음'}</dd></div>
      <div><dt>틀린 제출</dt><dd>{clear.wrongSubmissions}회</dd></div>
    </dl>
    <blockquote className="gm-takeaway"><span>기억할 문장</span>{lesson.takeaway}</blockquote>
    <h3 className="gm-summary-title">학습 요약</h3>
    <dl className="gm-summary">
      <div><dt>무엇이 문제였나</dt><dd>{guided.brief}</dd></div>
      <div><dt>공격 결과</dt><dd>{session.attackRun?.result.output ?? lesson.attack.happened}</dd></div>
      <div><dt>방어 결과</dt><dd>{session.defenseRun?.result.output ?? lesson.defense.result}</dd></div>
      <div><dt>방어 원리</dt><dd>{guided.codeDiff.explain}<pre className="code gm-code"><code>{guided.codeDiff.added}</code></pre></dd></div>
    </dl>
    <Actions>
      {nextLab && <button className="btn btn-primary gm-cta" onClick={() => onOpen(nextLab.id)}>다음 미션 · {nextLab.title} →</button>}
      <button className="btn btn-secondary" onClick={onReplay}>다시 도전하기</button>
      <button className="btn btn-ghost" onClick={onBack}>미션 목록</button>
    </Actions>
  </section>;
}
