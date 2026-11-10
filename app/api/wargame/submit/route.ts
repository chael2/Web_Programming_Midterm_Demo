import { clampInt, computeScore, emptyRecord, FLAG_PATTERN, MAX_HINTS } from '@/lib/wargame';
import { clientKey, emptyGuestMission, guestCookieHeader, rateLimit, readGuestState, verifyFlag } from '@/lib/wargame-server';
import { addWrongSubmission, claimClear, findMission, getRecord, json, loadProgress, parseJsonBody, sameOrigin, sessionUserId } from '@/lib/wargame-store';

const NEED_CHECKS = '공격 모드 성공과 방어 모드 차단 결과를 모두 확인한 뒤 제출하세요.';
const WRONG = 'FLAG가 일치하지 않습니다. 공격 결과의 유출 데이터를 다시 확인하세요.';

// Verifies a FLAG on the server and computes the score from server-side state only.
// Signed-in users: counters and attack/defense checks come from MongoDB.
// Guests: they come from the signed guest cookie; the request body's counters can only
// raise the penalty (to keep counts recorded earlier in this browser), never lower it.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const body = parsed.body;
  const mission = findMission(body.missionId);
  if (!mission) return json({ error: '미션 번호가 올바르지 않습니다.' }, 400);
  const flag = typeof body.flag === 'string' ? body.flag.trim() : '';
  if (!flag || flag.length > 100) return json({ error: 'FLAG를 입력하세요.' }, 400);

  let userId: string | null;
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  const limit = rateLimit(`flag:${clientKey(request, userId ?? undefined)}:${mission.id}`);
  if (!limit.ok) return json({ error: `제출이 너무 잦습니다. ${limit.retryAfter}초 후 다시 시도하세요. (1분에 최대 8회)` }, 429, { 'Retry-After': String(limit.retryAfter) });
  if (!FLAG_PATTERN.test(flag)) return json({ correct: false, formatError: true, message: 'FLAG 형식이 아닙니다. SG{영문 소문자·숫자·밑줄} 형태로 입력하세요. 형식 오류는 감점하지 않습니다.' });

  const correct = verifyFlag(mission.id, flag);

  if (!userId) {
    const state = readGuestState(request);
    const m = state[mission.id] ?? emptyGuestMission();
    if (!m.a || !m.d) return json({ error: NEED_CHECKS, needs: { attack: !m.a, defense: !m.d } }, 409);
    const hintsUsed = Math.max(m.h, clampInt(body.hintsUsed, 0, MAX_HINTS));
    const wrong = Math.max(m.w, clampInt(body.wrongSubmissions, 0, 1000));
    if (!correct) {
      state[mission.id] = { ...m, h: hintsUsed, w: wrong + 1 };
      return json({ correct: false, message: WRONG, wrongSubmissions: wrong + 1 }, 200, { 'Set-Cookie': guestCookieHeader(request, state) });
    }
    // A clear consumes this run's checks, like the signed-in flow; revealed hints stay counted.
    state[mission.id] = { a: false, d: false, h: hintsUsed, w: 0 };
    return json({ correct: true, score: computeScore(mission.level, hintsUsed, wrong), hintsUsed, wrongSubmissions: wrong, stored: false }, 200, { 'Set-Cookie': guestCookieHeader(request, state) });
  }

  try {
    const record = await getRecord(userId, mission.id);
    if (!record.attackVerified || !record.defenseVerified) return json({ error: NEED_CHECKS, needs: { attack: !record.attackVerified, defense: !record.defenseVerified } }, 409);
    if (!correct) {
      const updated = await addWrongSubmission(userId, mission.id);
      return json({ correct: false, message: WRONG, wrongSubmissions: updated.wrongSubmissions });
    }
    const score = computeScore(mission.level, record.hintsUsed, record.wrongSubmissions);
    // Atomic: only succeeds if this exact verified run is still current (blocks double submits).
    if (!await claimClear(userId, mission.id, record, score)) return json({ error: '제출 상태가 바뀌었습니다. 이미 처리되었거나 다른 요청이 진행 중입니다. 화면을 새로고침한 뒤 확인하세요.' }, 409);
    const { records, completed } = await loadProgress(userId);
    return json({ correct: true, score, hintsUsed: record.hintsUsed, wrongSubmissions: record.wrongSubmissions, stored: true, record: records[mission.id] ?? emptyRecord(mission.id), records: Object.values(records), completed });
  } catch { return json({ error: '제출 결과를 저장하지 못했습니다.' }, 503); }
}
