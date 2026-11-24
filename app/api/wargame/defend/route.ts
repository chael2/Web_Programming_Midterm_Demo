import { missionsConfigured } from '@/lib/db';
import { evaluate, judgeDefense } from '@/lib/mission-engine';
import { clientKey, emptyGuestMission, guestCookieHeader, rateLimit, readGuestState } from '@/lib/wargame-server';
import { findMission, json, markVerified, parseJsonBody, recordDefense, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Defense lab: the learner chooses defense measures. The server applies them to the
// vulnerable server and replays three tests (the learner's own attack, an attack
// variant, a normal request). The effect of each option and the variant are stored in
// MongoDB and are never sent to the browser before this check. The defense is verified
// only when every required fix is chosen and nothing breaks normal users.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!missionsConfigured()) return json({ error: '미션 데이터베이스가 설정되지 않았습니다.' }, 503);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const { input, measures } = parsed.body;
  if (typeof input !== 'string' || !input.trim() || input.length > 2000) return json({ error: '공격 입력은 1~2000자 문자열이어야 합니다.' }, 400);
  if (!Array.isArray(measures) || measures.length > 10 || !measures.every(x => typeof x === 'string' && x.length <= 30) || new Set(measures).size !== measures.length) return json({ error: '방어책 목록이 올바르지 않습니다.' }, 400);

  let userId: string | null;
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  const limit = rateLimit(`sim:${clientKey(request, userId ?? undefined)}`, Date.now(), 60, 60_000);
  if (!limit.ok) return json({ error: `요청이 너무 많습니다. ${limit.retryAfter}초 후 다시 시도하세요.` }, 429, { 'Retry-After': String(limit.retryAfter) });

  try {
    const mission = await findMission(parsed.body.missionId);
    if (!mission) return json({ error: '미션 번호가 올바르지 않습니다.' }, 400);
    const known = new Set(mission.defenseLab.options.map(o => o.id));
    if (!(measures as string[]).every(id => known.has(id))) return json({ error: '이 미션에 없는 방어책입니다.' }, 400);
    if (!evaluate(mission.rule, input, false).attacked) return json({ error: '실습하기에서 공격에 성공한 입력으로 방어를 검증하세요.' }, 400);

    const report = judgeDefense(mission, input, measures as string[]);
    if (userId) {
      const before = await markVerified(userId, mission.missionId, false, false);
      if (!before.attackVerified) return json({ error: '먼저 공격 모드에서 공격을 성공시켜야 합니다.' }, 409);
      const record = await recordDefense(userId, mission.missionId, report.held, report.inDepth);
      const stats = { defenseTries: record.defenseTries, defenseFirstTry: record.defenseFirstTry, defenseDepth: record.defenseDepth };
      return json({ report, stats, verified: { attack: record.attackVerified, defense: record.defenseVerified } });
    }
    const state = readGuestState(request);
    const m = state.m[mission.missionId] ?? emptyGuestMission();
    if (!m.a) return json({ error: '먼저 공격 모드에서 공격을 성공시켜야 합니다.' }, 409);
    // Bonus conditions are recorded once, by the check that first verifies the defense.
    if (!m.d) {
      const firstTry = !m.t;
      m.t = (m.t ?? 0) + 1;
      if (report.held) { m.d = true; m.b = (firstTry ? 1 : 0) | (report.inDepth ? 2 : 0); }
    }
    state.m[mission.missionId] = m;
    const stats = { defenseTries: m.t ?? 0, defenseFirstTry: ((m.b ?? 0) & 1) === 1, defenseDepth: ((m.b ?? 0) & 2) === 2 };
    return json({ report, stats, verified: { attack: m.a, defense: m.d } }, 200, { 'Set-Cookie': guestCookieHeader(request, state) });
  } catch { return json({ error: '방어 검증을 처리하지 못했습니다.' }, 503); }
}
