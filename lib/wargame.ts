// Shared (client + server) wargame rules. Contains NO flags or hint text.
// The rules are intentionally public so the mission screen can display them;
// the server recomputes every score with these same functions.

export const MAX_HINTS = 3;
export const BASE_POINTS = { 입문: 100, 중급: 150 } as const;
/** Cumulative percentage deducted after revealing hint level n (index = level). */
export const HINT_PENALTY_PERCENT = [0, 10, 30, 60] as const;
export const WRONG_FLAG_PENALTY_PERCENT = 5;
export const WRONG_FLAG_PENALTY_CAP_PERCENT = 20;
export const MIN_SCORE_PERCENT = 20;
/** Bonuses (percent of base points) that reward solving it yourself and designing a good defense. */
export const BONUSES = [
  { id: 'self', label: '스스로 해결', percent: 10, how: '힌트를 쓰지 않고 FLAG를 한 번에 맞히기' },
  { id: 'firstTry', label: '방어 설계 한 번에 성공', percent: 15, how: '첫 번째 방어 검증에서 모든 테스트 통과' },
  { id: 'depth', label: '심층 방어', percent: 10, how: '핵심 방어와 함께 보조 방어까지 모두 적용' },
] as const;
export type BonusId = (typeof BONUSES)[number]['id'];
/** Titles by share of the maximum total score. */
export const RANKS = [
  { min: 0, title: '보안 입문자' },
  { min: 0.1, title: '취약점 탐색자' },
  { min: 0.35, title: '취약점 사냥꾼' },
  { min: 0.6, title: '보안 수호자' },
  { min: 0.85, title: '시큐어가드 마스터' },
] as const;

export type MissionRecord = {
  missionId: string;
  /** Highest hint level ever revealed for this mission (0~3). Never decreases. */
  hintsUsed: number;
  /** Wrong FLAG submissions since the last clear. */
  wrongSubmissions: number;
  attackVerified: boolean;
  defenseVerified: boolean;
  bestScore: number;
  lastScore: number;
  clears: number;
  firstSolvedAt: string | null;
  solvedAt: string | null;
  /** Defense checks run in the current attempt (reset on clear). */
  defenseTries: number;
  /** Set when the defense was verified: passed on the first check / with every defense-in-depth option. */
  defenseFirstTry: boolean;
  defenseDepth: boolean;
};

export function basePoints(level: string) {
  return level === '중급' ? BASE_POINTS.중급 : BASE_POINTS.입문;
}
export function clampInt(value: unknown, min: number, max: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(max, Math.max(min, n));
}
export type DefenseStats = { defenseFirstTry?: boolean; defenseDepth?: boolean };
export type ScoreBreakdown = {
  base: number; hintPenalty: number; wrongPenalty: number; floorApplied: boolean;
  bonuses: { id: BonusId; label: string; how: string; points: number; earned: boolean }[];
  total: number; max: number;
};
/** Score = base − hint/wrong penalties (never below the floor) + earned bonuses. */
export function scoreBreakdown(level: string, hintsUsed: number, wrongSubmissions: number, stats: DefenseStats = {}): ScoreBreakdown {
  const base = basePoints(level);
  const hints = clampInt(hintsUsed, 0, MAX_HINTS);
  const wrongCount = clampInt(wrongSubmissions, 0, 1000);
  const wrong = Math.min(wrongCount * WRONG_FLAG_PENALTY_PERCENT, WRONG_FLAG_PENALTY_CAP_PERCENT);
  const raw = 100 - HINT_PENALTY_PERCENT[hints] - wrong;
  const percent = Math.max(MIN_SCORE_PERCENT, raw);
  const afterPenalty = Math.round(base * percent / 100);
  const hintPenalty = Math.round(base * HINT_PENALTY_PERCENT[hints] / 100);
  const earned: Record<BonusId, boolean> = { self: hints === 0 && wrongCount === 0, firstTry: stats.defenseFirstTry === true, depth: stats.defenseDepth === true };
  const bonuses = BONUSES.map(b => ({ id: b.id, label: b.label, how: b.how, points: Math.round(base * b.percent / 100), earned: earned[b.id] }));
  const bonus = bonuses.reduce((sum, b) => sum + (b.earned ? b.points : 0), 0);
  return { base, hintPenalty, wrongPenalty: base - afterPenalty - hintPenalty, floorApplied: raw < MIN_SCORE_PERCENT, bonuses, total: afterPenalty + bonus, max: maxMissionScore(level) };
}
export function computeScore(level: string, hintsUsed: number, wrongSubmissions: number, stats: DefenseStats = {}) {
  return scoreBreakdown(level, hintsUsed, wrongSubmissions, stats).total;
}
export function maxMissionScore(level: string) {
  const base = basePoints(level);
  return base + BONUSES.reduce((sum, b) => sum + Math.round(base * b.percent / 100), 0);
}
/** Current title and how many points are needed for the next one. */
export function rankFor(score: number, max: number) {
  const share = max > 0 ? score / max : 0;
  let i = 0;
  for (let k = 0; k < RANKS.length; k++) if (share >= RANKS[k].min) i = k;
  const next = RANKS[i + 1];
  return { title: RANKS[i].title, level: i + 1, levels: RANKS.length, next: next ? { title: next.title, need: Math.max(1, Math.ceil(next.min * max) - score) } : null };
}
export function emptyRecord(missionId: string): MissionRecord {
  return { missionId, hintsUsed: 0, wrongSubmissions: 0, attackVerified: false, defenseVerified: false, bestScore: 0, lastScore: 0, clears: 0, firstSolvedAt: null, solvedAt: null, defenseTries: 0, defenseFirstTry: false, defenseDepth: false };
}
/** Sanitizes records coming from localStorage or the DB. Unknown missions are dropped. */
export function normalizeRecords(value: unknown, validIds: readonly string[]): Record<string, MissionRecord> {
  const out: Record<string, MissionRecord> = {};
  if (!Array.isArray(value)) return out;
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = r.missionId;
    if (typeof id !== 'string' || !validIds.includes(id)) continue;
    // Keep the first entry for a mission: MongoDB positional ($) updates write to the
    // first match, so a legacy duplicate entry must not override it when reading.
    if (out[id]) continue;
    const date = (v: unknown) => (typeof v === 'string' || v instanceof Date) && !Number.isNaN(new Date(v).getTime()) ? new Date(v).toISOString() : null;
    out[id] = {
      missionId: id,
      hintsUsed: clampInt(r.hintsUsed, 0, MAX_HINTS),
      wrongSubmissions: clampInt(r.wrongSubmissions, 0, 1000),
      attackVerified: r.attackVerified === true,
      defenseVerified: r.defenseVerified === true,
      bestScore: clampInt(r.bestScore, 0, 1000),
      lastScore: clampInt(r.lastScore, 0, 1000),
      clears: clampInt(r.clears, 0, 100000),
      firstSolvedAt: date(r.firstSolvedAt),
      solvedAt: date(r.solvedAt),
      defenseTries: clampInt(r.defenseTries, 0, 1000),
      defenseFirstTry: r.defenseFirstTry === true,
      defenseDepth: r.defenseDepth === true,
    };
  }
  return out;
}
export function totalScore(records: Record<string, MissionRecord>) {
  return Object.values(records).reduce((sum, r) => sum + r.bestScore, 0);
}
export function maxTotalScore(levels: readonly string[]) {
  return levels.reduce((sum, level) => sum + maxMissionScore(level), 0);
}
export const FLAG_PATTERN = /^SG\{[a-z0-9_]{4,80}\}$/;

