import { simulate } from '@/lib/labs';
import { clientKey, evidenceFor, rateLimit } from '@/lib/wargame-server';
import { findMission, json, loadProgress, readJson, recordIn, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Re-runs the shared simulate() rules on the server. Only a successful attack in
// vulnerable mode returns the simulated leaked "evidence" that contains the FLAG.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const body = await readJson(request);
  const mission = findMission(body?.missionId);
  if (!body || !mission) return json({ error: '미션 번호가 올바르지 않습니다.' }, 400);
  const { input, defense } = body;
  if (typeof input !== 'string' || !input.trim() || input.length > 2000 || typeof defense !== 'boolean') return json({ error: '입력값은 1~2000자 문자열이어야 합니다.' }, 400);

  let userId: string | null = null;
  try { userId = await sessionUserId(); } catch { userId = null; }
  const limit = rateLimit(`sim:${clientKey(request, userId ?? undefined)}`, Date.now(), 60, 60_000);
  if (!limit.ok) return json({ error: `요청이 너무 많습니다. ${limit.retryAfter}초 후 다시 시도하세요.` }, 429, { 'Retry-After': String(limit.retryAfter) });

  const result = simulate(mission.id, input, defense);
  const attackSucceeded = result.attacked && !result.blocked && !defense;
  const defenseHeld = result.attacked && result.blocked && defense;
  let verified: { attack: boolean; defense: boolean } | null = null;
  if (userId) {
    try {
      const doc = await loadProgress(userId);
      const record = recordIn(doc, mission.id);
      if (attackSucceeded) record.attackVerified = true;
      if (defenseHeld) record.defenseVerified = true;
      if (attackSucceeded || defenseHeld) await doc.save();
      verified = { attack: record.attackVerified, defense: record.defenseVerified };
    } catch { return json({ error: '실습 기록을 저장하지 못했습니다.' }, 503); }
  }
  return json({ result, evidence: attackSucceeded ? evidenceFor(mission.id) : null, attackSucceeded, defenseHeld, verified });
}
