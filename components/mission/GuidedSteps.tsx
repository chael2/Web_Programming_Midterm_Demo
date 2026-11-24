'use client';
// One component per guided step. Each step starts with StepHeader (purpose + concrete
// actions), explains inputs before running, and says what to look for after running.
import type { ReactNode } from 'react';
import { MAX_HINTS } from '@/lib/wargame';
import { StatusTag } from '@/components/ui';
import { verdict, type Run } from '@/components/Wargame';
import type { StepProps } from './GuidedMission';
import { BonusList, ScoreReceipt } from './ScoreParts';

/** Step titles, purpose and concrete actions shown at the top of each step. */
export const STEPS = [
  { name: '이해하기', guide: '이번 미션에서 무엇을 배우는지 파악하는 단계입니다.', actions: ['아래 설명을 위에서부터 읽으세요.', '준비되면 ‘실습 시작’을 누르세요.'] },
  { name: '실습하기', guide: '보안 검증이 빠진 서버를 상대로 직접 공격 입력을 만들어 보는 단계입니다.', actions: ['입력란에 값을 넣고, “서버가 받는 모습”에서 입력이 어디에 들어가는지 보세요.', '결과를 예상해 본 뒤 ‘공격 시뮬레이션 실행’을 누르세요.', '실패하면 입력을 바꿔 다시 시도하세요.'] },
  { name: '결과 관찰하기', guide: '실행 결과를 읽고, 왜 그런 결과가 나왔는지 이해하는 단계입니다.', actions: ['판정과 입력한 값을 확인하세요.', '“확인할 것” 목록을 하나씩 살펴보세요.', '공격이 성공했다면 ‘직접 방어하기’를 누르세요.'] },
  { name: '방어하기', guide: '직접 방어책을 골라 서버를 고치고, 내 공격·변형 공격·정상 요청으로 검증하는 단계입니다.', actions: ['방어책 목록에서 필요한 것을 고르세요.', '‘패치 적용 후 재공격’을 눌러 세 가지 테스트 결과를 보세요.', '실패한 테스트가 있으면 방어책을 고쳐 다시 검증하세요.', '모두 통과하면 코드 차이를 보고 질문에 답하세요.'] },
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
/** The vulnerable server's code path with the learner's input inserted live (text only, never HTML). */
function Trace({ template, input }: { template: string; input: string }) {
  const parts = template.split('{input}');
  return <pre className="gm-trace mono" aria-label="취약한 서버가 입력을 처리하는 모습">{parts.map((p, i) => <span key={i}>{p}{i < parts.length - 1 && <mark className="gm-trace-input">{input || ' '}</mark>}</span>)}</pre>;
}
function History({ runs, blockedLabel }: { runs: Run[]; blockedLabel?: string }) {
  if (!runs.length) return null;
  return <Part title={`시도 기록 (${runs.length})`}>
    <ol className="gm-history">{runs.map((r, i) => { const v = verdict(r.result, 'attack', blockedLabel); return <li key={i}><StatusTag state={v.state}>{v.label}</StatusTag><code className="mono">{r.input}</code></li>; })}</ol>
  </Part>;
}
export function PracticeStep({ lab, lesson, guided, session, record, go, openHelp, prediction, setPrediction }: StepProps) {
  const { input, setInput, busy, hintError } = session;
  const sample = session.revealedSample;
  const note = sample && input === sample.value ? { label: '이 예제 입력의 의미', text: sample.note ?? '힌트 3단계에서 공개된 공격 예제입니다.' }
    : input === lab.normal ? { label: '이 정상 입력의 의미', text: lesson.input.normal }
      : { label: '직접 입력한 값', text: '입력이 위 서버 코드의 어느 자리에 들어가는지 보고, 그 자리에서 어떤 의미가 될지 생각해 보세요.' };
  async function attack() { if (await session.run(input)) go(3); }
  return <>
    <StepHeader n={2} />
    <Part title="상황"><p>{guided.modes.attack}</p></Part>
    <Part title="입력값의 의미"><p>{lesson.input.field}</p></Part>
    <form className="gm-bench" onSubmit={e => { e.preventDefault(); void attack(); }}>
      <label className="gm-label" htmlFor="gm-input">{lab.field}</label>
      <input id="gm-input" className="gm-input mono" value={input} maxLength={2000} onChange={e => setInput(e.target.value)} autoComplete="off" spellCheck={false} aria-describedby="gm-input-note" />
      <p className="gm-input-note" id="gm-input-note" aria-live="polite"><b>{note.label}</b>{note.text}</p>
      <p className="gm-label">서버가 받는 모습 <span className="gm-small">입력하는 대로 바뀝니다</span></p>
      <Trace template={lab.trace} input={input} />
      <fieldset className="gm-predict">
        <legend>실행 전에 예상해 보세요 <span className="gm-small">(선택)</span></legend>
        <label><input type="radio" name={`gm-predict-${lab.id}`} checked={prediction === 'attack'} onChange={() => setPrediction('attack')} /> 공격이 성공할 것이다</label>
        <label><input type="radio" name={`gm-predict-${lab.id}`} checked={prediction === 'safe'} onChange={() => setPrediction('safe')} /> 정상 요청으로 처리될 것이다</label>
      </fieldset>
      <div className="gm-bench-actions">
        <button className="btn btn-primary gm-cta" disabled={!input.trim() || busy !== ''}>{busy === 'run' ? '판정 중…' : '공격 시뮬레이션 실행'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInput(lab.normal)}>정상 입력 넣기</button>
      </div>
    </form>
    <History runs={session.history} blockedLabel={guided.blockedLabel} />
    <div className="gm-stuck">
      <p>어떤 값을 넣어야 할지 모르겠다면</p>
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => openHelp('hints')}>힌트 보기 ({record.hintsUsed}/{MAX_HINTS} 사용)</button>
        <button className="btn btn-ghost btn-sm" disabled={busy !== ''} onClick={() => { void session.fillSample(); }}>공격 예제 입력{record.hintsUsed < MAX_HINTS ? ' · 힌트 3단계로 기록' : ''}</button>
      </div>
      <p className="gm-small">먼저 위의 서버 코드를 보고 직접 시도해 보세요. 힌트와 예제는 점수가 감점됩니다. 예제 입력은 입력란만 채우고 실행하지 않습니다.</p>
    </div>
    {hintError && <p className="form-error" role="alert">{hintError}</p>}
  </>;
}

/* ---------- 3. 결과 관찰하기 ---------- */
function RunSummary({ run, mode, blockedLabel }: { run: Run; mode: 'attack' | 'defense'; blockedLabel?: string }) {
  const v = verdict(run.result, mode, blockedLabel);
  return <dl className="gm-result">
    <div><dt>판정</dt><dd><StatusTag state={v.state}>{v.label}</StatusTag></dd></div>
    <div><dt>입력한 값</dt><dd><code className="mono">{run.input}</code></dd></div>
    <div><dt>시스템이 처리한 결과</dt><dd>{run.result.output}</dd></div>
  </dl>;
}
export function ObserveStep({ lab, lesson, guided, session, go, prediction }: StepProps) {
  const run = session.lastAttack;
  if (!run) return <><StepHeader n={3} /><p className="gm-empty">아직 실행 결과가 없습니다.</p><Actions><button className="btn btn-primary" onClick={() => go(2)}>← 실습하기로 이동</button></Actions></>;
  const success = run.result.attacked && !run.result.blocked;
  // simulate() returns this title for values a mission does not judge (design/integrity/logging/exceptions).
  const invalid = run.result.title === '시나리오 입력을 확인하세요';
  const predicted = prediction && !invalid ? (prediction === 'attack') === success : null;
  return <>
    <StepHeader n={3} />
    <div className={`gm-verdict ${success ? 'is-attack' : 'is-none'}`} role="status">
      <strong>{success ? '공격이 성공했습니다.' : invalid ? '판정할 수 없는 입력입니다.' : '공격이 성립하지 않았습니다.'}</strong>
      <span>{success ? '보안 검증이 빠진 서버가 입력을 그대로 처리했습니다.' : invalid ? '이 미션은 정해진 값만 판정합니다.' : '이 입력으로는 취약한 동작이 일어나지 않았습니다.'}</span>
    </div>
    {predicted !== null && <p className={`gm-feedback ${predicted ? 'is-correct' : 'is-wrong'}`}><b>{predicted ? '예상이 맞았습니다' : '예상과 달랐습니다'}</b>{predicted ? '입력이 서버 코드에서 어떻게 쓰이는지 정확히 읽었습니다.' : '아래 “왜 이런 결과가 나왔나요?”에서 예상과 다른 이유를 확인해 보세요.'}</p>}
    <RunSummary run={run} mode="attack" blockedLabel={guided.blockedLabel} />
    <Trace template={lab.trace} input={run.input} />
    <Part title="확인할 것"><Checks items={success ? guided.observe.success : invalid ? ['판정이 “입력 확인 필요”로 표시되었는지', '“시스템이 처리한 결과”에 판정 가능한 값이 안내되어 있는지'] : guided.observe.normal} /></Part>
    <Part title="왜 이런 결과가 나왔나요?">
      <p>{success ? guided.observe.why : invalid ? '안내된 값 중 하나로 다시 실행하세요.' : lesson.normal}</p>
      {success && <pre className="code gm-code"><code>{lab.vulnerable}</code></pre>}
      {!success && <details className="gm-more"><summary>판정 규칙 보기 (스스로 찾고 싶다면 열지 마세요)</summary><p className="gm-small">{guided.rule}</p></details>}
    </Part>
    {success && session.evidence && <section className="gm-data" aria-labelledby="gm-data-title">
      <h3 id="gm-data-title">결과 데이터 <span>서버가 돌려준 가상 응답</span></h3>
      <pre>{session.evidence}</pre>
      <p className="gm-small">{guided.observe.dataNote}</p>
    </section>}
    {success && <Part title="보안 측면에서의 의미"><p>{lesson.attack.meaning}</p></Part>}
    <History runs={session.history} blockedLabel={guided.blockedLabel} />
    <Actions>
      {session.attackRun ? <button className="btn btn-primary gm-cta" onClick={() => go(4)}>직접 방어하기 →</button> : null}
      <button className={session.attackRun ? 'btn btn-ghost' : 'btn btn-primary gm-cta'} onClick={() => go(2)}>{success ? '← 다른 입력도 시도해 보기' : '← 다시 시도하기'}</button>
    </Actions>
  </>;
}

/* ---------- 4. 방어하기 ---------- */
const TEST_STATE = { true: 'done', false: 'danger' } as const;
export function DefendStep({ lab, lesson, guided, session, go, quiz, setQuiz, quizPassed, measures, setMeasures, record }: StepProps) {
  const attackRun = session.attackRun;
  if (!attackRun) return <><StepHeader n={4} /><p className="gm-empty">먼저 공격 모드에서 공격을 성공시켜야 합니다.</p><Actions><button className="btn btn-primary" onClick={() => go(2)}>← 실습하기로 이동</button></Actions></>;
  const d = session.defense;
  const report = d?.report;
  const held = Boolean(report?.held);
  const changed = !d || d.measures.join() !== [...measures].sort().join();
  const toggle = (id: string) => setMeasures(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);
  return <>
    <StepHeader n={4} />
    <Part title="방어 과제">
      <p>{lab.defenseLab.prompt}</p>
      <dl className="gm-result gm-result-compact">
        <div><dt>막아야 할 공격</dt><dd><code className="mono">{attackRun.input}</code> <span className="gm-small">실습하기에서 성공한 내 공격</span></dd></div>
        <div><dt>검증 방법</dt><dd>패치한 서버에 ① 내 공격 ② 변형된 공격 ③ 정상 사용자 요청을 보내 봅니다. 공격은 모두 막히고 정상 요청은 통과해야 합니다.</dd></div>
      </dl>
      <details className="gm-more" open={!d}><summary>방어 보너스</summary>
        <p className="gm-small">검증은 몇 번이든 다시 할 수 있지만, 보너스는 첫 검증에서 통과하고 보조 방어까지 갖출 때 받습니다. 한 번에 맞히도록 신중하게 고르세요.</p>
        <BonusList level={lab.level} record={record} />
      </details>
    </Part>
    <form className="gm-defense" onSubmit={e => { e.preventDefault(); void session.defend([...measures].sort()); }}>
      <fieldset>
        <legend>적용할 방어책을 고르세요 <span className="gm-small">(여러 개 선택 가능)</span></legend>
        {lab.defenseLab.options.map(o => {
          const fb = report && !changed ? report.feedback.find(f => f.id === o.id) : undefined;
          return <label key={o.id} className={`gm-option gm-measure ${fb ? `is-${fb.effect}` : ''}`}>
            <input type="checkbox" checked={measures.includes(o.id)} disabled={held} onChange={() => toggle(o.id)} />
            <span>{o.label}{fb && <span className="gm-measure-fb"><b>{fb.effectLabel}</b>{fb.why}</span>}</span>
          </label>;
        })}
      </fieldset>
      {!held && <div className="gm-bench-actions">
        <button className="btn btn-primary gm-cta" disabled={!measures.length || session.busy !== ''}>{session.busy === 'run' ? '검증 중…' : d ? '수정한 방어로 다시 검증' : '패치 적용 후 재공격'}</button>
        {d && <span className="gm-small">검증 {d.tries}회</span>}
      </div>}
    </form>
    {session.hintError && <p className="form-error" role="alert">{session.hintError}</p>}

    {report && <>
      <div className={`gm-verdict ${held ? 'is-defended' : 'is-attack'}`} role="status">
        <strong>{held ? '방어에 성공했습니다.' : '아직 방어가 완성되지 않았습니다.'}</strong>
        <span>{report.summary}</span>
        {held && <span className="gm-earned">{record.defenseFirstTry && <b>+ 방어 설계 한 번에 성공</b>}{record.defenseDepth ? <b>+ 심층 방어</b> : report.inDepth ? null : <i>보조 방어까지 갖췄다면 심층 방어 보너스를 받을 수 있었습니다.</i>}</span>}
      </div>
      <Part title="검증 결과">
        <div className="table-wrap"><table className="data-table gm-table">
          <thead><tr><th scope="col">테스트</th><th scope="col">보낸 값</th><th scope="col">기대</th><th scope="col">결과</th><th scope="col">서버 응답</th></tr></thead>
          <tbody>{report.tests.map(t => <tr key={t.kind}>
            <th scope="row">{t.label}<span className="gm-small gm-block">{t.note}</span></th>
            <td><code className="mono">{t.input}</code></td>
            <td>{t.expected === 'blocked' ? '차단' : '정상 처리'}</td>
            <td><StatusTag state={TEST_STATE[String(t.ok) as 'true' | 'false']}>{t.ok ? '통과' : '실패'}</StatusTag></td>
            <td>{t.output}</td>
          </tr>)}</tbody>
        </table></div>
        {!held && <p className="gm-small">고른 방어책마다 위 목록에 효과와 이유가 표시됩니다. 빠진 방어를 더하거나 문제가 있는 방어를 빼고 다시 검증하세요.</p>}
      </Part>
    </>}

    {held && <>
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
        <li><StatusTag state={attempts.defense ? 'done' : 'idle'}>직접 고른 방어로 모든 테스트 통과</StatusTag>{!attempts.defense && <button className="link-btn" onClick={() => go(4)}>방어하기로 이동</button>}</li>
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

function Completion({ lab, lesson, guided, session, nextLab, onBack, onOpen, onReplay }: StepProps) {
  const clear = session.clear!;
  const b = clear.breakdown;
  const newBest = clear.score > clear.previousBest;
  const missed = b ? b.bonuses.filter(x => !x.earned) : [];
  return <section className="gm-complete" role="status" aria-labelledby="gm-complete-title">
    <p><StatusTag state="done">미션 완료</StatusTag></p>
    <h3 id="gm-complete-title">{lab.title} 미션을 해결했습니다</h3>
    {newBest && <p className="gm-newbest">{clear.previousBest ? `최고 점수 갱신! ${clear.previousBest}점 → ${clear.score}점` : `첫 해결! ${clear.score}점을 얻었습니다`}</p>}
    {b ? <ScoreReceipt breakdown={b} /> : <dl className="gm-score"><div><dt>획득 점수</dt><dd><b className="mono">{clear.score}</b>점</dd></div></dl>}
    <p className="gm-small">이 미션 최고 {clear.best}점 · 힌트 {clear.hintsUsed ? `${clear.hintsUsed}단계까지 사용` : '사용 안 함'} · 틀린 제출 {clear.wrongSubmissions}회</p>
    {missed.length > 0 && <p className="gm-challenge"><b>다시 도전하면 더 얻을 수 있어요</b>{missed.map(x => `${x.label} +${x.points}`).join(' · ')}{missed.some(x => x.id === 'self') && clear.hintsUsed > 0 ? ' (힌트 사용 기록은 유지되어 스스로 해결 보너스는 다시 받을 수 없습니다)' : ''}</p>}
    <blockquote className="gm-takeaway"><span>기억할 문장</span>{lesson.takeaway}</blockquote>
    <h3 className="gm-summary-title">학습 요약</h3>
    <dl className="gm-summary">
      <div><dt>무엇이 문제였나</dt><dd>{guided.brief}</dd></div>
      <div><dt>공격 결과</dt><dd>{session.attackRun?.result.output ?? lesson.attack.happened}</dd></div>
      <div><dt>방어 결과</dt><dd>{session.defense?.report.held ? session.defense.report.tests[0].output : lesson.defense.result}</dd></div>
      {session.defense && <div><dt>내가 고른 방어</dt><dd><ul className="gm-checks">{session.defense.report.feedback.map(f => <li key={f.id}><b>{f.effectLabel}</b> · {f.label}</li>)}</ul></dd></div>}
      <div><dt>방어 원리</dt><dd>{guided.codeDiff.explain}<pre className="code gm-code"><code>{guided.codeDiff.added}</code></pre></dd></div>
    </dl>
    <Actions>
      {nextLab && <button className="btn btn-primary gm-cta" onClick={() => onOpen(nextLab.id)}>다음 미션 · {nextLab.title} →</button>}
      <button className="btn btn-secondary" onClick={onReplay}>다시 도전하기</button>
      <button className="btn btn-ghost" onClick={onBack}>미션 목록</button>
    </Actions>
  </section>;
}
