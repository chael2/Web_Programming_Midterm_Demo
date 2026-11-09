'use client';
// 5-step guided mission screen: 이해하기 → 실습하기 → 결과 관찰하기 → 방어하기 → FLAG 제출 및 완료.
// This component owns only UI state (current step, quiz answer, help panel). All simulation,
// hint, FLAG and progress state comes from MissionDetail via `session`, so the API calls,
// server-side FLAG check, scoring and progress saving are exactly the same as other missions.
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { owaspCategories } from '@/lib/labs';
import { basePoints, computeScore, MAX_HINTS, type MissionRecord } from '@/lib/wargame';
import type { GuidedContent, Lesson } from '@/lib/lessons';
import type { ClearInfo, Lab, Mode, Run } from '@/components/Wargame';
import { HelpDialog, type HelpTab } from './HelpDialog';
import { DefendStep, ObserveStep, PracticeStep, STEPS, SubmitStep, UnderstandStep } from './GuidedSteps';

/** State and handlers passed down from MissionDetail (unchanged API logic). */
export type MissionSession = {
  input: string; setInput: (value: string) => void;
  lastAttack: Run | null; attackRun: Run | null; defenseRun: Run | null; evidence: string | null;
  attempts: { attack: boolean; defense: boolean };
  hints: string[]; openHint: number | null; setOpenHint: Dispatch<SetStateAction<number | null>>; hintError: string;
  flag: string; setFlag: (value: string) => void;
  feedback: { tone: 'error' | 'info'; text: string } | null; setFeedback: (value: { tone: 'error' | 'info'; text: string } | null) => void;
  busy: '' | 'run' | 'hint' | 'flag'; clear: ClearInfo | null;
  run: (mode: Mode, value: string) => Promise<void>;
  revealHint: (level: number) => Promise<void>;
  fillSample: () => Promise<void>;
  submitFlag: () => Promise<void>;
  replay: () => void;
};
export type Quiz = { choice: number | null; checked: number | null };
export type StepProps = {
  lab: Lab; lesson: Lesson; guided: GuidedContent; session: MissionSession; record: MissionRecord;
  base: number; signedIn: boolean; done: boolean; nextLab: Lab | null;
  go: (step: number) => void; openHelp: (tab: HelpTab) => void;
  quiz: Quiz; setQuiz: Dispatch<SetStateAction<Quiz>>; quizPassed: boolean;
  onBack: () => void; onOpen: (id: string) => void; onReplay: () => void;
};

export function GuidedMission({ lab, lesson, guided, signedIn, record, done, nextLab, onBack, onOpen, session }: {
  lab: Lab; lesson: Lesson; guided: GuidedContent; signedIn: boolean; record: MissionRecord; done: boolean; nextLab: Lab | null;
  onBack: () => void; onOpen: (id: string) => void; session: MissionSession;
}) {
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [quiz, setQuiz] = useState<Quiz>({ choice: null, checked: null });
  const [helpTab, setHelpTab] = useState<HelpTab>('help');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const category = owaspCategories.find(c => c.id === lab.categoryId)!;
  const base = basePoints(lab.level);
  const quizPassed = quiz.checked !== null && lesson.quiz.options[quiz.checked]?.correct === true;

  function go(next: number) {
    setStep(next);
    setMaxStep(m => Math.max(m, next));
    document.getElementById('gm-step')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function openHelp(tab: HelpTab) { setHelpTab(tab); dialogRef.current?.showModal(); }
  function onReplay() { session.replay(); setQuiz({ choice: null, checked: null }); setStep(2); setMaxStep(2); }

  const props: StepProps = { lab, lesson, guided, session, record, base, signedIn, done, nextLab, go, openHelp, quiz, setQuiz, quizPassed, onBack, onOpen, onReplay };
  const Body = [UnderstandStep, PracticeStep, ObserveStep, DefendStep, SubmitStep][step - 1];

  return <article className="gm">
    <button className="btn btn-ghost btn-sm gm-back" onClick={onBack}>← 미션 목록</button>
    <header className="gm-head">
      <p className="eyebrow">Mission {lab.number} · {lab.categoryId}:2025 {category.ko}</p>
      <h1>{lab.title}</h1>
      <div className="gm-head-row">
        <p className="gm-facts">난이도 {lab.level} · 배점 {base}점{done ? ' · 완료한 미션' : ''}</p>
        <div className="gm-tools" role="group" aria-label="도움말과 힌트">
          <button className="btn btn-ghost btn-sm" aria-haspopup="dialog" onClick={() => openHelp('help')}>도움말</button>
          <button className="btn btn-ghost btn-sm" aria-haspopup="dialog" onClick={() => openHelp('hints')}>힌트 {record.hintsUsed}/{MAX_HINTS}</button>
          <button className="btn btn-ghost btn-sm" aria-haspopup="dialog" onClick={() => openHelp('score')}>점수 {computeScore(lab.level, record.hintsUsed, record.wrongSubmissions)}</button>
        </div>
      </div>
    </header>

    <nav className="gm-steps" aria-label="학습 단계">
      <ol>{STEPS.map((s, i) => {
        const n = i + 1;
        const state = n === step ? 'current' : n < maxStep || (n === 5 && session.clear) ? 'done' : n <= maxStep ? 'open' : 'locked';
        const label = state === 'done' ? '완료' : state === 'current' ? '진행 중' : state === 'open' ? '진행 가능' : '대기';
        return <li key={s.name} className={`gm-stepitem is-${state}`}>
          <button disabled={n > maxStep} aria-current={state === 'current' ? 'step' : undefined} onClick={() => go(n)}>
            <span className="gm-stepnum" aria-hidden="true">{state === 'done' ? '✓' : n}</span>
            <span className="gm-stepname">{s.name}</span>
            <span className="gm-stepstate">{label}</span>
          </button>
        </li>;
      })}</ol>
    </nav>

    <section className="gm-step" id="gm-step" aria-labelledby="gm-step-title">
      <Body {...props} />
    </section>

    <p className="gm-note">정해진 규칙으로 판정하는 교육용 시뮬레이션입니다. 실제 서버나 데이터베이스에 요청을 보내지 않으며, 결과 데이터와 FLAG는 모두 가상 값입니다.</p>
    <HelpDialog dialogRef={dialogRef} tab={helpTab} setTab={setHelpTab} step={step} {...props} />
  </article>;
}
