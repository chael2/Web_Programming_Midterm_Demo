'use client';
// Score pieces shared by the mission header, help dialog, defense step and completion screen.
// The numbers are only a preview: the server recomputes the score with the same rules.
import { scoreBreakdown, type MissionRecord, type ScoreBreakdown } from '@/lib/wargame';

type BonusState = 'earned' | 'open' | 'missed';
/** Where each bonus stands in the current attempt. */
export function bonusStates(record: MissionRecord): Record<'self' | 'firstTry' | 'depth', BonusState> {
  const self: BonusState = record.hintsUsed || record.wrongSubmissions ? 'missed' : 'open';
  const firstTry: BonusState = record.defenseVerified ? (record.defenseFirstTry ? 'earned' : 'missed') : record.defenseTries ? 'missed' : 'open';
  const depth: BonusState = record.defenseVerified ? (record.defenseDepth ? 'earned' : 'missed') : 'open';
  return { self, firstTry, depth };
}
/** Score if the FLAG were submitted now, and the best still reachable in this attempt. */
export function scorePreview(level: string, record: MissionRecord) {
  const now = scoreBreakdown(level, record.hintsUsed, record.wrongSubmissions, record);
  const states = bonusStates(record);
  const reachable = now.total + now.bonuses.reduce((sum, b) => sum + (!b.earned && states[b.id] === 'open' ? b.points : 0), 0);
  return { now, states, reachable };
}

const STATE_LABEL: Record<BonusState, string> = { earned: '획득', open: '도전 가능', missed: '이번엔 놓침' };
export function BonusList({ level, record }: { level: string; record: MissionRecord }) {
  const { now, states } = scorePreview(level, record);
  return <ul className="gm-bonuses">{now.bonuses.map(b => {
    const st = b.id === 'self' && states.self === 'open' ? 'open' : b.earned ? 'earned' : states[b.id];
    return <li key={b.id} className={`is-${st}`}><b>+{b.points}</b><span>{b.label}<small>{b.how}</small></span><em>{STATE_LABEL[st]}</em></li>;
  })}</ul>;
}

/** Final score as a receipt: base, penalties, bonuses. */
export function ScoreReceipt({ breakdown }: { breakdown: ScoreBreakdown }) {
  const rows: [string, string, string?][] = [['기본 점수', `${breakdown.base}`]];
  if (breakdown.hintPenalty) rows.push(['힌트 감점', `−${breakdown.hintPenalty}`, 'minus']);
  if (breakdown.wrongPenalty) rows.push([`오답 감점${breakdown.floorApplied ? ' (최저 점수 보장)' : ''}`, `−${breakdown.wrongPenalty}`, 'minus']);
  for (const b of breakdown.bonuses) rows.push([`${b.label} 보너스`, b.earned ? `+${b.points}` : '—', b.earned ? 'plus' : 'none']);
  return <table className="gm-receipt">
    <tbody>{rows.map(([k, v, tone]) => <tr key={k} className={tone ? `is-${tone}` : ''}><th scope="row">{k}</th><td className="mono">{v}</td></tr>)}</tbody>
    <tfoot><tr><th scope="row">획득 점수</th><td className="mono"><b>{breakdown.total}</b> / {breakdown.max}</td></tr></tfoot>
  </table>;
}
