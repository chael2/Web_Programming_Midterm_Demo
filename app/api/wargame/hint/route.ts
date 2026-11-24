import { missionsConfigured } from '@/lib/db';
import type { MissionData } from '@/lib/mission-engine';
import { MAX_HINTS } from '@/lib/wargame';
import { emptyGuestMission, guestCookieHeader, readGuestState } from '@/lib/wargame-server';
import { findMission, json, parseJsonBody, raiseHints, sameOrigin, sessionUserId } from '@/lib/wargame-store';

/** Hints 1..level from the mission document; at the last level the attack example is revealed too. */
function hintPayload(mission: MissionData, level: number) {
  const lesson = mission.lesson as { input?: { sample?: string } };
  return {
    hints: mission.hints.slice(0, level),
    hintsUsed: level,
    ...(level >= MAX_HINTS ? { sample: mission.sample, sampleNote: lesson.input?.sample ?? null } : {}),
  };
}

// Reveals hints 1..level. The server records the highest level revealed (it never
// decreases): in MongoDB for signed-in users (strict step-by-step order), in the signed
// guest cookie for guests. level 0 returns the hints already revealed (after a reload).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!missionsConfigured()) return json({ error: '미션 데이터베이스가 설정되지 않았습니다.' }, 503);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const level = parsed.body.level;
  if (typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > MAX_HINTS) return json({ error: '힌트 요청이 올바르지 않습니다.' }, 400);

  let userId: string | null;
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  try {
    const mission = await findMission(parsed.body.missionId);
    if (!mission) return json({ error: '힌트 요청이 올바르지 않습니다.' }, 400);
    if (!userId) {
      // Guests may raise their recorded level (e.g. to restore hints already counted in this
      // browser's local record) — raising only adds a penalty, so it cannot be abused.
      const state = readGuestState(request);
      const m = state.m[mission.missionId] ?? emptyGuestMission();
      m.h = Math.max(m.h, level);
      state.m[mission.missionId] = m;
      return json({ ...hintPayload(mission, m.h), stored: false }, 200, { 'Set-Cookie': guestCookieHeader(request, state) });
    }
    const record = await raiseHints(userId, mission.missionId, level);
    if (!record) return json({ error: '이전 단계 힌트를 먼저 확인하세요.' }, 400);
    return json({ ...hintPayload(mission, record.hintsUsed), stored: true });
  } catch { return json({ error: '힌트 사용 기록을 저장하지 못했습니다.' }, 503); }
}
