'use client';
// Mission session for the 5-step guided screen. Holds simulation/hint/FLAG state and
// talks to /api/wargame/*. Mission content arrives from MongoDB via props (PublicMission:
// no rule, attack sample, hints or flag). Each user gets their own random FLAG.
import { useEffect, useState } from 'react';
import type { DefenseReport, PublicMission, Simulation } from '@/lib/mission-engine';
import { resolveGuided, type Lesson } from '@/lib/lessons';
import { emptyRecord, MAX_HINTS, type MissionRecord, type ScoreBreakdown } from '@/lib/wargame';
import type { TagState } from '@/components/ui';
import { GuidedMission } from '@/components/mission/GuidedMission';

export type Lab = PublicMission;
export type Mode = 'attack' | 'defense';
export type Run = { input: string; result: Simulation; offline: boolean };
export type ClearInfo = { score: number; hintsUsed: number; wrongSubmissions: number; best: number; previousBest: number; breakdown: ScoreBreakdown | null };
/** The attack example and its explanation, revealed by the server at hint level 3. */
export type RevealedSample = { value: string; note: string | null };

async function post<T>(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ error: '응답을 해석하지 못했습니다.' }));
  return { ok: response.ok, status: response.status, data };
}
type HintResponse = { hints: string[]; hintsUsed: number; sample?: string; sampleNote?: string | null };

/** Verdict shown for a run. `blockedLabel` comes from the mission's guided content (default 차단됨). */
export function verdict(result: Simulation, mode: Mode, blockedLabel = '차단됨'): { state: TagState; label: string } {
  if (result.title === '시나리오 입력을 확인하세요') return { state: 'warn', label: '입력 확인 필요' };
  if (result.blocked) return { state: 'done', label: blockedLabel };
  if (result.attacked) return { state: 'danger', label: mode === 'attack' ? '공격 성공' : '방어 실패' };
  return { state: 'idle', label: '공격 아님' };
}

export function MissionDetail({ lab, signedIn, record, done, nextLab, onBack, onOpen, onRecord, onCompleted }: {
  lab: Lab; signedIn: boolean; record: MissionRecord | undefined; done: boolean; nextLab: Lab | null;
  onBack: () => void; onOpen: (id: string) => void; onRecord: (record: MissionRecord) => void; onCompleted: (id: string, serverList?: string[]) => void;
}) {
  const lesson = lab.lesson as unknown as Lesson;
  const current = record ?? emptyRecord(lab.id);
  const [input, setInput] = useState<string>(lab.normal);
  const [lastAttack, setLastAttack] = useState<Run | null>(null);
  const [attackRun, setAttackRun] = useState<Run | null>(null); // last successful attack
  const [history, setHistory] = useState<Run[]>([]); // this session's attack attempts, newest first
  const [defense, setDefense] = useState<{ measures: string[]; report: DefenseReport; tries: number } | null>(null);
  const [evidence, setEvidence] = useState<string | null>(null);
  const [attempts, setAttempts] = useState({ attack: current.attackVerified, defense: current.defenseVerified });
  const [hints, setHints] = useState<string[]>([]);
  const [revealedSample, setRevealedSample] = useState<RevealedSample | null>(null);
  const [openHint, setOpenHint] = useState<number | null>(null);
  const [hintError, setHintError] = useState('');
  const [flag, setFlag] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'run' | 'hint' | 'flag'>('');
  const [clear, setClear] = useState<ClearInfo | null>(null);

  // Restore previously revealed hints (and the sample at level 3); they are fetched, never bundled.
  useEffect(() => {
    if (!current.hintsUsed) return;
    let cancelled = false;
    post<HintResponse>('/api/wargame/hint', { missionId: lab.id, level: signedIn ? 0 : current.hintsUsed })
      .then(r => { if (cancelled || !r.ok) return; setHints(r.data.hints); if (r.data.sample) setRevealedSample({ value: r.data.sample, note: r.data.sampleNote ?? null }); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lab.id]);

  function update(patch: Partial<MissionRecord>) { onRecord({ ...current, ...patch }); }

  /** Runs the server-side attack judgement. Returns false when the server could not be reached. */
  async function run(value: string): Promise<boolean> {
    if (!value.trim() || busy) return false;
    setBusy('run'); setHintError('');
    try {
      const r = await post<{ result: Simulation; evidence: string | null; attackSucceeded: boolean; verified: { attack: boolean; defense: boolean } }>('/api/wargame/simulate', { missionId: lab.id, input: value });
      if (!r.ok) throw new Error(r.data.error);
      const { result, evidence: leaked, attackSucceeded, verified } = r.data;
      const runInfo = { input: value, result, offline: false };
      setLastAttack(runInfo);
      setHistory(h => [runInfo, ...h].slice(0, 8));
      if (attackSucceeded) setAttackRun(runInfo);
      if (leaked) setEvidence(leaked);
      setAttempts(verified);
      if (verified.attack !== current.attackVerified || verified.defense !== current.defenseVerified) update({ attackVerified: verified.attack, defenseVerified: verified.defense });
      return true;
    } catch (error) {
      // Judging rules live only on the server, so there is no offline fallback.
      setHintError(error instanceof Error && error.message ? error.message : '서버에 연결하지 못했습니다. 잠시 후 다시 실행하세요.');
      return false;
    } finally { setBusy(''); }
  }

  /** Applies the chosen defense measures on the server and replays the tests. */
  async function defend(measures: string[]): Promise<void> {
    if (!attackRun || busy) return;
    setBusy('run'); setHintError('');
    try {
      const r = await post<{ report: DefenseReport; stats: Pick<MissionRecord, 'defenseTries' | 'defenseFirstTry' | 'defenseDepth'>; verified: { attack: boolean; defense: boolean } }>('/api/wargame/defend', { missionId: lab.id, input: attackRun.input, measures });
      if (!r.ok) throw new Error(r.data.error);
      setDefense(d => ({ measures, report: r.data.report, tries: (d?.tries ?? 0) + 1 }));
      setAttempts(r.data.verified);
      update({ attackVerified: r.data.verified.attack, defenseVerified: r.data.verified.defense, ...r.data.stats });
    } catch (error) { setHintError(error instanceof Error && error.message ? error.message : '서버에 연결하지 못했습니다. 잠시 후 다시 실행하세요.'); }
    finally { setBusy(''); }
  }

  async function revealHint(level: number) {
    if (busy || level > MAX_HINTS) return;
    setBusy('hint'); setHintError('');
    try {
      const r = await post<HintResponse>('/api/wargame/hint', { missionId: lab.id, level });
      if (!r.ok) throw new Error(r.data.error);
      setHints(r.data.hints); setOpenHint(level);
      if (r.data.sample) setRevealedSample({ value: r.data.sample, note: r.data.sampleNote ?? null });
      if (r.data.hintsUsed > current.hintsUsed) update({ hintsUsed: r.data.hintsUsed });
    } catch (error) { setHintError(error instanceof Error && error.message ? error.message : '힌트를 불러오지 못했습니다.'); }
    finally { setBusy(''); }
  }

  /** The attack example equals the final hint: reveal every level; the server then sends the sample. */
  async function fillSample() {
    if (busy) return;
    setBusy('hint'); setHintError('');
    try {
      let used = current.hintsUsed;
      let latest: HintResponse | null = null;
      for (let level = Math.max(used + 1, 1); level <= MAX_HINTS; level++) {
        const r = await post<HintResponse>('/api/wargame/hint', { missionId: lab.id, level });
        if (!r.ok) throw new Error(r.data.error);
        latest = r.data; used = r.data.hintsUsed;
      }
      if (!latest) { // all hints already used: fetch the stored state (includes the sample)
        const r = await post<HintResponse>('/api/wargame/hint', { missionId: lab.id, level: signedIn ? 0 : MAX_HINTS });
        if (!r.ok) throw new Error(r.data.error);
        latest = r.data;
      }
      setHints(latest.hints);
      if (used !== current.hintsUsed) update({ hintsUsed: used });
      if (latest.sample) { setRevealedSample({ value: latest.sample, note: latest.sampleNote ?? null }); setInput(latest.sample); }
      document.getElementById('gm-input')?.focus();
    } catch (error) { setHintError(error instanceof Error && error.message ? error.message : '힌트 기록에 실패했습니다.'); }
    finally { setBusy(''); }
  }

  async function submitFlag() {
    if (!flag.trim() || busy) return;
    setBusy('flag'); setFeedback(null);
    try {
      const r = await post<{ correct: boolean; formatError?: boolean; message?: string; score?: number; breakdown?: ScoreBreakdown; previousBest?: number; hintsUsed?: number; wrongSubmissions?: number; record?: MissionRecord; completed?: string[] }>('/api/wargame/submit', { missionId: lab.id, flag, hintsUsed: current.hintsUsed, wrongSubmissions: current.wrongSubmissions });
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
      setClear({ score, hintsUsed: data.hintsUsed ?? current.hintsUsed, wrongSubmissions: data.wrongSubmissions ?? current.wrongSubmissions, best: nextRecord.bestScore, previousBest: data.previousBest ?? current.bestScore, breakdown: data.breakdown ?? null });
      setAttempts({ attack: false, defense: false });
      setFlag('');
    } catch { setFeedback({ tone: 'error', text: '서버에 연결할 수 없습니다. FLAG 검증은 서버에서만 수행됩니다.' }); }
    finally { setBusy(''); }
  }

  function replay() {
    setClear(null); setEvidence(null); setLastAttack(null); setAttackRun(null); setDefense(null); setHistory([]);
    setInput(lab.normal); setFeedback(null);
  }

  return <GuidedMission lab={lab} lesson={lesson} guided={resolveGuided(lesson)} signedIn={signedIn} record={current} done={done} nextLab={nextLab} onBack={onBack} onOpen={onOpen}
    session={{ input, setInput, lastAttack, attackRun, history, defense, defend, evidence, attempts, hints, revealedSample, openHint, setOpenHint, hintError, flag, setFlag, feedback, setFeedback, busy, clear, run, revealHint, fillSample, submitFlag, replay }} />;
}
