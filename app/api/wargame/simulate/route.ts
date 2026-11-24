import { missionsConfigured } from '@/lib/db';
import { evaluate } from '@/lib/mission-engine';
import { fillEvidence, flagForOwner, ownerForGuest, ownerForUser } from '@/lib/missions';
import { clientKey, emptyGuestMission, guestCookieHeader, rateLimit, readGuestState } from '@/lib/wargame-server';
import { findMission, json, markVerified, parseJsonBody, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Attack mode only: judges the input against the vulnerable server with the mission's
// rule from MongoDB. A successful attack returns the leaked "evidence", which contains
// THIS user's own random flag (issued on first success). The defense is verified
// separately by /api/wargame/defend, where the learner chooses the defense measures.
// Checks are recorded server-side: MongoDB for signed-in users, a signed cookie for guests.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!missionsConfigured()) return json({ error: '미션 데이터베이스가 설정되지 않았습니다.' }, 503);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const { input, defense } = parsed.body;
  if (typeof input !== 'string' || !input.trim() || input.length > 2000 || (defense !== undefined && defense !== false)) return json({ error: '입력값은 1~2000자 문자열이어야 합니다.' }, 400);

  let userId: string | null;
  // An auth failure must not silently downgrade a signed-in user to the guest path.
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  const limit = rateLimit(`sim:${clientKey(request, userId ?? undefined)}`, Date.now(), 60, 60_000);
  if (!limit.ok) return json({ error: `요청이 너무 많습니다. ${limit.retryAfter}초 후 다시 시도하세요.` }, 429, { 'Retry-After': String(limit.retryAfter) });

  try {
    const mission = await findMission(parsed.body.missionId);
    if (!mission) return json({ error: '미션 번호가 올바르지 않습니다.' }, 400);
    const result = evaluate(mission.rule, input, false);
    const attackSucceeded = result.attacked;

    if (userId) {
      const evidence = attackSucceeded ? fillEvidence(mission, await flagForOwner(ownerForUser(userId), mission), input) : null;
      const record = await markVerified(userId, mission.missionId, attackSucceeded, false);
      return json({ result, evidence, attackSucceeded, verified: { attack: record.attackVerified, defense: record.defenseVerified } });
    }
    const state = readGuestState(request);
    const m = state.m[mission.missionId] ?? emptyGuestMission();
    if (attackSucceeded) m.a = true;
    state.m[mission.missionId] = m;
    const evidence = attackSucceeded ? fillEvidence(mission, await flagForOwner(ownerForGuest(state.id), mission), input) : null;
    return json({ result, evidence, attackSucceeded, verified: { attack: m.a, defense: m.d } }, 200, { 'Set-Cookie': guestCookieHeader(request, state) });
  } catch { return json({ error: '실습 기록을 처리하지 못했습니다.' }, 503); }
}
