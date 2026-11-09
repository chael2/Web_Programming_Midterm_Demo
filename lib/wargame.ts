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
};

export function basePoints(level: string) {
  return level === '중급' ? BASE_POINTS.중급 : BASE_POINTS.입문;
}
export function clampInt(value: unknown, min: number, max: number) {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(max, Math.max(min, n));
}
export function computeScore(level: string, hintsUsed: number, wrongSubmissions: number) {
  const base = basePoints(level);
  const hints = clampInt(hintsUsed, 0, MAX_HINTS);
  const wrong = Math.min(clampInt(wrongSubmissions, 0, 1000) * WRONG_FLAG_PENALTY_PERCENT, WRONG_FLAG_PENALTY_CAP_PERCENT);
  const percent = Math.max(MIN_SCORE_PERCENT, 100 - HINT_PENALTY_PERCENT[hints] - wrong);
  return Math.round(base * percent / 100);
}
export function emptyRecord(missionId: string): MissionRecord {
  return { missionId, hintsUsed: 0, wrongSubmissions: 0, attackVerified: false, defenseVerified: false, bestScore: 0, lastScore: 0, clears: 0, firstSolvedAt: null, solvedAt: null };
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
    };
  }
  return out;
}
export function totalScore(records: Record<string, MissionRecord>) {
  return Object.values(records).reduce((sum, r) => sum + r.bestScore, 0);
}
export function maxTotalScore(levels: readonly string[]) {
  return levels.reduce((sum, level) => sum + basePoints(level), 0);
}
export const FLAG_PATTERN = /^SG\{[a-z0-9_]{4,80}\}$/;

/** Public mission objectives shown on the mission screen (no answers). */
export const missionObjectives: Record<string, string> = {
  access: '내 문서(1001)만 조회할 수 있어야 하는 기능입니다. 다른 사용자의 문서에 숨겨진 FLAG를 찾아내세요.',
  csrf: '이메일 변경 API가 요청 출처를 확인하는지 시험하고, 위조 요청이 수락될 때 남는 감사 기록에서 FLAG를 찾으세요.',
  config: '운영 서버에 남아 있는 개발용 기능을 찾아 노출된 설정 값 속 FLAG를 확보하세요.',
  supply: '승인된 패키지 목록이 없는 빌드 파이프라인에 위장 패키지를 넣어 수집된 토큰에서 FLAG를 찾으세요.',
  crypto: '결제 정보가 암호화 없이 전송되는 정책을 만들어, 가상 패킷 캡처에서 FLAG를 찾으세요.',
  injection: '로그인 아이디 입력이 SQL 문자열에 그대로 결합됩니다. 관리자 계정으로 인증을 우회해 세션 메모의 FLAG를 얻으세요.',
  xss: '댓글이 HTML로 렌더링되는지 확인하고, 피해자 브라우저의 가상 쿠키에 담긴 FLAG를 찾아내세요.',
  design: '쿠폰 적용 로직이 사용 이력을 확인하는지 시험하고, 중복 할인 장부에서 FLAG를 찾으세요.',
  auth: '비밀번호 정책이 얼마나 느슨한지 확인하고, 대입 공격으로 탈취된 가상 계정의 메모에서 FLAG를 찾으세요.',
  integrity: '서명 검증 없이 주문 데이터를 처리하는지 시험하고, 변조된 주문 영수증에서 FLAG를 찾으세요.',
  logging: '반복된 로그인 실패가 아무 경보 없이 지나가는지 확인하고, 사후에 발견된 공격자 메모의 FLAG를 찾으세요.',
  exceptions: '권한 서비스 장애 시 요청이 허용되는지(fail-open) 시험하고, 유출된 내보내기 헤더에서 FLAG를 찾으세요.',
};
