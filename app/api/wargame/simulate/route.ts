import { simulate } from '@/lib/labs';
import { clientKey, emptyGuestMission, evidenceFor, guestCookieHeader, rateLimit, readGuestState } from '@/lib/wargame-server';
import { findMission, json, markVerified, parseJsonBody, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Re-runs the shared simulate() rules on the server. Only a successful attack in
// vulnerable mode returns the simulated leaked "evidence" that contains the FLAG.
// The attack/defense checks are recorded server-side: in MongoDB for signed-in users,
// in a signed HttpOnly cookie for guests.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const mission = findMission(parsed.body.missionId);
  if (!mission) return json({ error: '미션 번호가 올바르지 않습니다.' }, 400);
  const { input, defense } = parsed.body;
  if (typeof input !== 'string' || !input.trim() || input.length > 2000 || typeof defense !== 'boolean') return json({ error: '입력값은 1~2000자 문자열이어야 합니다.' }, 400);

  let userId: string | null;
  // An auth failure must not silently downgrade a signed-in user to the guest path.
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  const limit = rateLimit(`sim:${clientKey(request, userId ?? undefined)}`, Date.now(), 60, 60_000);
  if (!limit.ok) return json({ error: `요청이 너무 많습니다. ${limit.retryAfter}초 후 다시 시도하세요.` }, 429, { 'Retry-After': String(limit.retryAfter) });

  const result = simulate(mission.id, input, defense);
  const attackSucceeded = result.attacked && !result.blocked && !defense;
  const defenseHeld = result.attacked && result.blocked && defense;
  const body = (verified: { attack: boolean; defense: boolean }) => ({ result, evidence: attackSucceeded ? evidenceFor(mission.id) : null, attackSucceeded, defenseHeld, verified });

  if (userId) {
    try {
      const record = await markVerified(userId, mission.id, attackSucceeded, defenseHeld);
      return json(body({ attack: record.attackVerified, defense: record.defenseVerified }));
    } catch { return json({ error: '실습 기록을 저장하지 못했습니다.' }, 503); }
  }
  const state = readGuestState(request);
  const m = state[mission.id] ?? emptyGuestMission();
  if (attackSucceeded) m.a = true;
  if (defenseHeld) m.d = true;
  state[mission.id] = m;
  return json(body({ attack: m.a, defense: m.d }), 200, { 'Set-Cookie': guestCookieHeader(request, state) });
}
