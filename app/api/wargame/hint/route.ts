import { MAX_HINTS } from '@/lib/wargame';
import { hintsFor } from '@/lib/wargame-server';
import { findMission, json, loadProgress, readJson, recordIn, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Reveals hints 1..level. For signed-in users the server records the highest
// level revealed (it never decreases) and enforces step-by-step reveal.
// level 0 just returns the hints already revealed (e.g. after a page reload).
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const body = await readJson(request);
  const mission = findMission(body?.missionId);
  const level = body?.level;
  if (!mission || typeof level !== 'number' || !Number.isInteger(level) || level < 0 || level > MAX_HINTS) return json({ error: '힌트 요청이 올바르지 않습니다.' }, 400);

  let userId: string | null;
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  if (!userId) return json({ hints: hintsFor(mission.id, level), hintsUsed: level, stored: false });
  try {
    const doc = await loadProgress(userId);
    const record = recordIn(doc, mission.id);
    if (level > record.hintsUsed + 1) return json({ error: '이전 단계 힌트를 먼저 확인하세요.' }, 400);
    if (level > record.hintsUsed) { record.hintsUsed = level; await doc.save(); }
    return json({ hints: hintsFor(mission.id, record.hintsUsed), hintsUsed: record.hintsUsed, stored: true });
  } catch { return json({ error: '힌트 사용 기록을 저장하지 못했습니다.' }, 503); }
}
