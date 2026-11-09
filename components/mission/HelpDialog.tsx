'use client';
// On-demand panel for help (how to use — no penalty), hints (how to solve — score penalty)
// and score rules. Uses the native <dialog> element: focus trap, Esc to close, no library.
import type { RefObject } from 'react';
import { computeScore, HINT_PENALTY_PERCENT, MAX_HINTS, MIN_SCORE_PERCENT, WRONG_FLAG_PENALTY_CAP_PERCENT, WRONG_FLAG_PENALTY_PERCENT } from '@/lib/wargame';
import type { StepProps } from './GuidedMission';

export type HelpTab = 'help' | 'hints' | 'score';
const TABS: { id: HelpTab; label: string }[] = [{ id: 'help', label: '도움말' }, { id: 'hints', label: '힌트' }, { id: 'score', label: '점수' }];
const HINT_LABELS = ['방향 잡기', '핵심 원리', '접근 방법'];

export function HelpDialog({ dialogRef, tab, setTab, step, lab, lesson, guided, session, record, base, signedIn, go }: StepProps & {
  dialogRef: RefObject<HTMLDialogElement | null>; tab: HelpTab; setTab: (tab: HelpTab) => void; step: number;
}) {
  const close = () => dialogRef.current?.close();
  const { hints, busy } = session;
  return <dialog ref={dialogRef} className="gm-dialog" aria-labelledby="gm-dialog-title" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div className="gm-dialog-inner">
      <div className="gm-dialog-head">
        <h2 id="gm-dialog-title">도움말 · 힌트 · 점수</h2>
        <button className="btn btn-ghost btn-sm" onClick={close} aria-label="닫기">닫기</button>
      </div>
      <div className="segmented" role="group" aria-label="패널 선택">
        {TABS.map(t => <button key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'help' && <div className="gm-dialog-body">
        <p className="gm-small">도움말은 화면 사용 방법을 설명합니다. 점수에 영향을 주지 않습니다.</p>
        <h3>지금 단계에서 어떻게 하나요?</h3>
        <ul>{guided.howto[step - 1].map(t => <li key={t}>{t}</li>)}</ul>
        <h3>입력값의 의미</h3>
        <p>{lesson.input.field}</p>
        <p className="gm-small">{guided.rule}</p>
        <h3>개념 다시 보기</h3>
        <p>{guided.brief}</p>
        <button className="link-btn" onClick={() => { close(); go(1); }}>이해하기 단계로 이동</button>
      </div>}

      {tab === 'hints' && <div className="gm-dialog-body">
        <p className="gm-small">힌트는 문제 해결 방향을 알려줍니다. 순서대로 열리며, 열면 점수가 감점됩니다. 이미 연 힌트는 다시 볼 수 있습니다.</p>
        <ol className="gm-hints">{[1, 2, 3].map(level => {
          const text = hints[level - 1];
          const next = level === hints.length + 1;
          return <li key={level}>
            <p className="gm-hint-title">힌트 {level} · {HINT_LABELS[level - 1]} {text ? <span>사용함</span> : <span>누적 −{HINT_PENALTY_PERCENT[level]}%</span>}</p>
            {text ? <p>{text}</p> : <button className="btn btn-secondary btn-sm" disabled={!next || busy !== ''} onClick={() => { void session.revealHint(level); }}>{next ? `힌트 ${level} 보기` : '이전 힌트를 먼저 여세요'}</button>}
          </li>;
        })}</ol>
        {session.hintError && <p className="form-error" role="alert">{session.hintError}</p>}
        {!signedIn && <p className="gm-small">게스트의 힌트 사용 기록은 이 브라우저에만 저장됩니다.</p>}
      </div>}

      {tab === 'score' && <div className="gm-dialog-body">
        <p className="gm-score-now"><b className="mono">{computeScore(lab.level, record.hintsUsed, record.wrongSubmissions)}</b> / {base}점 <span className="gm-small">지금 제출하면 받을 점수 · 힌트 {record.hintsUsed}/{MAX_HINTS}{record.bestScore ? ` · 최고 ${record.bestScore}점` : ''}</span></p>
        <ul>
          <li>힌트 1단계 −{HINT_PENALTY_PERCENT[1]}%, 2단계까지 −{HINT_PENALTY_PERCENT[2]}%, 3단계까지 −{HINT_PENALTY_PERCENT[3]}% (누적)</li>
          <li>‘공격 예제 입력’은 힌트 3단계 사용으로 기록</li>
          <li>틀린 FLAG 1회당 −{WRONG_FLAG_PENALTY_PERCENT}%, 최대 −{WRONG_FLAG_PENALTY_CAP_PERCENT}% · 형식 오류는 감점 없음</li>
          <li>최저 {MIN_SCORE_PERCENT}% 보장 · 다시 풀면 미션별 최고 점수만 반영</li>
          <li>도움말과 이해 확인 질문은 점수에 영향을 주지 않습니다.</li>
        </ul>
        <p className="gm-small">교육용 게임 점수이며 실제 보안 역량을 평가하지 않습니다.</p>
      </div>}
    </div>
  </dialog>;
}
