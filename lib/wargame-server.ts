// SERVER-ONLY: flags and hint text. Import this module only from Route Handlers
// (app/api/**) — never from a 'use client' component, or the flags would ship in
// the browser bundle. tests/wargame.test.mjs checks that client files don't import it.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

type MissionSecret = { flagBody: string; hints: [string, string, string]; evidence: (flag: string) => string };

const secrets: Record<string, MissionSecret> = {
  access: {
    flagBody: 'idor_doc1002_owner_unchecked',
    hints: [
      '내 문서 번호는 1001입니다. 서버가 "누구의" 문서인지 확인할까요?',
      'IDOR(직접 객체 참조)는 요청한 ID의 소유자를 서버가 검증하지 않을 때 발생합니다.',
      '내 문서 번호와 인접한 다른 사용자의 문서 번호를 그대로 요청해 보세요.',
    ],
    evidence: f => `[가상 문서 #1002 · owner=user-2002]\n제목: 2학기 팀 평가 메모\n본문: 이 문서는 소유자만 볼 수 있어야 합니다.\nsecret_note: ${f}`,
  },
  csrf: {
    flagBody: 'csrf_forged_request_accepted',
    hints: [
      '서버는 "로그인되어 있는가"만 확인합니다. 요청이 정말 사용자가 보낸 것인지는요?',
      'CSRF는 쿠키 인증만 믿고 요청 출처와 토큰을 확인하지 않을 때 발생합니다.',
      '세션에 발급된 정상 토큰(secureguard-valid-token)이 아닌 임의의 값을 넣어 보세요.',
    ],
    evidence: f => `POST /account/email (가상)\nCookie: session=demo-session ✓\nX-CSRF-Token: (검증 안 함)\n→ email=attacker@example.test 로 변경됨\naudit_trace: ${f}`,
  },
  config: {
    flagBody: 'debug_route_leaks_config',
    hints: [
      '운영 서버에 개발용 기능이 남아 있지 않은지 의심해 보세요.',
      '디버그 경로나 상세 오류 응답은 내부 설정·호스트·키 정보를 노출할 수 있습니다.',
      '/debug 로 시작하는 가상 경로를 요청해 보세요.',
    ],
    evidence: f => `HTTP/1.1 200 OK (가상)\n{\n  "DB_HOST": "demo-db.internal",\n  "DEBUG": true,\n  "BUILD_FLAG": "${f}"\n}`,
  },
  supply: {
    flagBody: 'typosquat_package_installed',
    hints: [
      '패키지 이름 한 글자만 달라도 완전히 다른 제작자의 코드일 수 있습니다.',
      '타이포스쿼팅은 유명 패키지와 비슷한 이름으로 위장해 악성 코드를 유입시키는 공격입니다.',
      '승인된 secureguard-utils 와 철자가 살짝 다른 이름(예: 글자 순서 바꾸기)을 입력해 보세요.',
    ],
    evidence: f => `npm install (가상 · 실제 설치 없음)\n+ 검토되지 않은 패키지가 빌드에 포함됨\npostinstall 로그: 환경변수 수집 시도 탐지\ncollected_token: ${f}`,
  },
  crypto: {
    flagBody: 'plaintext_payment_sniffed',
    hints: [
      '결제 정보가 네트워크를 지나갈 때 누가 볼 수 있을지 생각해 보세요.',
      '암호화되지 않은 전송 프로토콜은 중간자가 내용을 그대로 읽거나 변조할 수 있습니다.',
      'TLS가 없는 프로토콜 이름을 입력해 보세요.',
    ],
    evidence: f => `[가상 패킷 캡처 · 공용 Wi-Fi]\nPOST http://payments.example/charge\ncard=4111-****-****-1111 (테스트 값)\nsniffed_marker: ${f}`,
  },
  injection: {
    flagBody: 'sqli_auth_bypass_tautology',
    hints: [
      '입력값이 SQL 문자열 안에 그대로 붙는다면, 따옴표 하나가 어떤 의미가 될까요?',
      'SQL Injection은 데이터가 쿼리 구조(명령)로 해석될 때 발생합니다. 항상 참인 조건을 떠올려 보세요.',
      "작은따옴표로 문자열을 닫고 OR 로 항상 참인 조건을 덧붙이는 형태입니다. (예: ... ' OR '1'='1)",
    ],
    evidence: f => `-- 가상 실행 쿼리 (실제 DB 없음)\nSELECT * FROM users WHERE name = '...' OR '1'='1'\n→ 1번째 행 반환: admin\nadmin_session_note: ${f}`,
  },
  xss: {
    flagBody: 'stored_xss_cookie_exfil',
    hints: [
      '댓글이 텍스트가 아니라 HTML로 그려진다면 어떤 태그를 넣을 수 있을까요?',
      'XSS는 신뢰하지 않는 입력을 HTML/스크립트로 해석해 출력할 때 발생합니다. 이벤트 핸들러 속성도 실행됩니다.',
      'img 태그의 onerror 같은 이벤트 속성이나 script 태그를 포함한 입력을 시도해 보세요.',
    ],
    evidence: f => `[가상 피해자 브라우저 · 스크립트 실행 없음]\n댓글 렌더링 중 이벤트 핸들러 실행 가능\ndocument.cookie (가상) = "session=victim-demo; ${f}"`,
  },
  design: {
    flagBody: 'coupon_reuse_business_logic',
    hints: [
      '쿠폰이 "존재하는지"만 확인하고 "이미 썼는지"는 확인하지 않는다면?',
      '안전하지 않은 설계는 문법상 정상 요청이지만 업무 규칙(1회 사용 등)이 빠져 있을 때 생깁니다.',
      '안내문에 "이미 사용됨"이라고 적힌 쿠폰 코드를 다시 제출해 보세요.',
    ],
    evidence: f => `[가상 주문 #7781]\n쿠폰 WELCOME10 적용 (사용 이력: 1회 → 2회)\n중복 할인 -10%\nledger_mismatch: ${f}`,
  },
  auth: {
    flagBody: 'weak_password_policy_bypass',
    hints: [
      '가입 화면이 어떤 비밀번호든 받아준다면 계정은 얼마나 안전할까요?',
      '인증 실패는 짧고 흔한 비밀번호를 허용하거나 대입 공격을 제한하지 않을 때 발생합니다.',
      '12자보다 짧은, 아주 흔한 비밀번호를 입력해 보세요.',
    ],
    evidence: f => `[가상 대입 공격 시뮬레이션]\n시도 1: 1234 → 로그인 성공 (0.01초)\n탈취된 계정 프로필 메모: ${f}`,
  },
  integrity: {
    flagBody: 'unsigned_order_tampered',
    hints: [
      '클라이언트가 보낸 주문 데이터를 서버가 그대로 믿어도 될까요?',
      '무결성 실패는 신뢰 경계를 넘은 데이터의 서명(MAC/전자서명)을 검증하지 않을 때 발생합니다.',
      '서명이 맞지 않는 상태, 즉 변조된(tampered) 주문 상태를 입력해 보세요.',
    ],
    evidence: f => `[가상 주문 처리 로그]\namount: 59000 → 100 (변조됨)\nsignature: invalid (검증 생략)\nprocessed_receipt: ${f}`,
  },
  logging: {
    flagBody: 'silent_bruteforce_no_alert',
    hints: [
      '로그인 실패가 수십 번 반복되어도 아무도 모른다면 어떻게 될까요?',
      '로깅·경보 실패는 보안 이벤트를 기록하지 않거나 임계값 초과 시 경보로 연결하지 않을 때 발생합니다.',
      '경보 임계값(5회) 이상의 실패 횟수를 숫자로 입력해 보세요.',
    ],
    evidence: f => `[가상 인증 서버 · 지난 1분]\nlogin_failed × 다수 → 기록 없음, 경보 없음\n공격자 메모(사후 발견): ${f}`,
  },
  exceptions: {
    flagBody: 'fail_open_timeout_bypass',
    hints: [
      '권한 확인 서비스가 응답하지 않을 때, 시스템은 문을 열어 둘까요 닫을까요?',
      'fail-open은 예외 발생 시 검증을 건너뛰고 허용하는 처리로, 보안 통제를 무력화합니다.',
      '권한 서비스가 시간 초과(timeout)된 상태를 입력해 보세요.',
    ],
    evidence: f => `[가상 게이트웨이 로그]\nauthz-service: timeout (3000ms)\ncatch → return true  // fail-open\n보호 자원 /admin/export 접근 허용\nexport_header: ${f}`,
  },
};

export const secretMissionIds = Object.keys(secrets);
export function hasMission(id: unknown): id is string {
  return typeof id === 'string' && Object.hasOwn(secrets, id);
}

// ---------------------------------------------------------------------------
// Secrets. The flag bodies above are public (this repository), so any shared
// deployment must add a secret HMAC suffix. Resolution order:
//   1. WARGAME_FLAG_SECRET                       (recommended)
//   2. a key derived from AUTH_SECRET            (already required for login)
//   3. production only: a random per-process key (works for a single `next start`
//      process; flags change on restart — a warning is logged)
//   4. development only: no suffix, readable flags for local testing
// The random key is kept on globalThis so dev hot-reloads don't rotate it.
// ---------------------------------------------------------------------------
type SecretSource = 'flag-secret' | 'auth-secret' | 'ephemeral' | 'none';
const globalKeys = globalThis as unknown as { __sgEphemeralKey?: string; __sgWarned?: boolean };
function ephemeralKey() {
  if (!globalKeys.__sgEphemeralKey) globalKeys.__sgEphemeralKey = randomBytes(32).toString('hex');
  return globalKeys.__sgEphemeralKey;
}
function derive(label: string, secret: string) {
  return createHmac('sha256', secret).update(`secureguard:${label}`).digest('hex');
}
export function flagSecret(): { key: string | null; source: SecretSource } {
  if (process.env.WARGAME_FLAG_SECRET) return { key: process.env.WARGAME_FLAG_SECRET, source: 'flag-secret' };
  if (process.env.AUTH_SECRET) return { key: derive('wargame-flag', process.env.AUTH_SECRET), source: 'auth-secret' };
  if (process.env.NODE_ENV === 'production') {
    if (!globalKeys.__sgWarned) {
      globalKeys.__sgWarned = true;
      console.warn('[secureguard] WARGAME_FLAG_SECRET/AUTH_SECRET is not set: using a random per-process FLAG key. FLAGs change on restart and are not shared across instances.');
    }
    return { key: ephemeralKey(), source: 'ephemeral' };
  }
  return { key: null, source: 'none' };
}
/** Key for signing guest progress cookies; never empty (falls back to a per-process key). */
function guestKey() {
  const base = process.env.WARGAME_FLAG_SECRET ?? process.env.AUTH_SECRET;
  return base ? derive('guest-state', base) : derive('guest-state', ephemeralKey());
}

/** `SG{<body>}` in local development, `SG{<body>_<8 hex HMAC>}` whenever a key is available. */
export function flagFor(id: string) {
  const body = secrets[id].flagBody;
  const { key } = flagSecret();
  if (!key) return `SG{${body}}`;
  const suffix = createHmac('sha256', key).update(id).digest('hex').slice(0, 8);
  return `SG{${body}_${suffix}}`;
}
export function verifyFlag(id: string, submitted: string) {
  if (!hasMission(id)) return false;
  const digest = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(digest(flagFor(id)), digest(submitted.trim()));
}
export function hintsFor(id: string, level: number) {
  return secrets[id].hints.slice(0, Math.max(0, Math.min(3, level)));
}
export function evidenceFor(id: string) {
  return secrets[id].evidence(flagFor(id));
}

// Small in-memory sliding-window limiter. Per server instance only — good
// enough for a classroom deployment; a shared store would be needed at scale.
const windows = new Map<string, number[]>();
export const SUBMIT_LIMIT = 8;
export const SUBMIT_WINDOW_MS = 60_000;
export function rateLimit(key: string, now = Date.now(), limit = SUBMIT_LIMIT, windowMs = SUBMIT_WINDOW_MS) {
  const recent = (windows.get(key) ?? []).filter(t => now - t < windowMs);
  if (recent.length >= limit) {
    windows.set(key, recent);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  windows.set(key, recent);
  if (windows.size > 5000) for (const [k, v] of windows) if (!v.some(t => now - t < windowMs)) windows.delete(k);
  return { ok: true, retryAfter: 0 };
}
// ---------------------------------------------------------------------------
// Guest state. Guests have no database row, so the server keeps their per-mission
// verification and penalty counters in an HMAC-signed, HttpOnly cookie. The submit
// API computes the guest score from this cookie instead of trusting the request body.
// A guest can still reset it by clearing cookies (documented limitation); guest scores
// are only ever stored in that guest's own browser.
// ---------------------------------------------------------------------------
export const GUEST_COOKIE = 'sg_guest';
export type GuestMission = { a: boolean; d: boolean; h: number; w: number };
export type GuestState = Record<string, GuestMission>;
const clampN = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.trunc(v))) : 0;
const sign = (payload: string) => createHmac('sha256', guestKey()).update(payload).digest('base64url');

export function emptyGuestMission(): GuestMission { return { a: false, d: false, h: 0, w: 0 }; }
export function encodeGuestState(state: GuestState) {
  const payload = Buffer.from(JSON.stringify(state)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
/** Returns the verified state, or an empty state for a missing, malformed or tampered cookie. */
export function decodeGuestState(value: string | undefined | null): GuestState {
  if (!value || value.length > 4096) return {};
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra !== undefined) return {};
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return {};
  try {
    const raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, Record<string, unknown>>;
    const state: GuestState = {};
    for (const [id, m] of Object.entries(raw ?? {})) {
      if (!hasMission(id) || !m || typeof m !== 'object') continue;
      state[id] = { a: m.a === true, d: m.d === true, h: clampN(m.h, 3), w: clampN(m.w, 1000) };
    }
    return state;
  } catch { return {}; }
}
export function readGuestState(request: Request): GuestState {
  const cookie = request.headers.get('cookie') ?? '';
  const match = cookie.split(';').map(c => c.trim()).find(c => c.startsWith(`${GUEST_COOKIE}=`));
  return decodeGuestState(match ? decodeURIComponent(match.slice(GUEST_COOKIE.length + 1)) : null);
}
/** Set-Cookie header value. `Secure` only over HTTPS so a plain-HTTP local demo still works. */
export function guestCookieHeader(request: Request, state: GuestState) {
  const https = new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  return `${GUEST_COOKIE}=${encodeGuestState(state)}; Path=/api/wargame; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${https ? '; Secure' : ''}`;
}

export function clientKey(request: Request, userId?: string) {
  if (userId) return `u:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `ip:${forwarded || request.headers.get('x-real-ip') || 'local'}`;
}
