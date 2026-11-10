import { MAX_HINTS } from '@/lib/wargame';
import { emptyGuestMission, guestCookieHeader, hintsFor, readGuestState } from '@/lib/wargame-server';
import { findMission, json, parseJsonBody, raiseHints, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Reveals hints 1..level. The server records the highest level revealed (it never
// decreases): in MongoDB for signed-in users (strict step-by-step order), in the signed
// guest cookie for guests. level 0 returns the hints already revealed (after a reload).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const mission = findMission(parsed.body.missionId);
  const level = parsed.body.level;
  if (!mission || typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > MAX_HINTS) return json({ error: '힌트 요청이 올바르지 않습니다.' }, 400);

  let userId: string | null;
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  if (!userId) {
    // Guests may raise their recorded level (e.g. to restore hints already counted in this
    // browser's local record) — raising only adds a penalty, so it cannot be abused; the
    // client cannot lower it.
    const state = readGuestState(request);
    const m = state[mission.id] ?? emptyGuestMission();
    m.h = Math.max(m.h, level);
    state[mission.id] = m;
    return json({ hints: hintsFor(mission.id, m.h), hintsUsed: m.h, stored: false }, 200, { 'Set-Cookie': guestCookieHeader(request, state) });
  }
  try {
    const record = await raiseHints(userId, mission.id, level);
    if (!record) return json({ error: '이전 단계 힌트를 먼저 확인하세요.' }, 400);
    return json({ hints: hintsFor(mission.id, record.hintsUsed), hintsUsed: record.hintsUsed, stored: true });
  } catch { return json({ error: '힌트 사용 기록을 저장하지 못했습니다.' }, 503); }
}
