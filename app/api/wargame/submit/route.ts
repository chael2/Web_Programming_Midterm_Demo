import { clampInt, computeScore, emptyRecord, FLAG_PATTERN, MAX_HINTS } from '@/lib/wargame';
import { clientKey, rateLimit, verifyFlag } from '@/lib/wargame-server';
import { findMission, json, loadProgress, plainCompleted, plainRecords, readJson, recordIn, sameOrigin, sessionUserId } from '@/lib/wargame-store';

// Verifies a FLAG on the server and computes the score from server-side rules.
// Signed-in users: hint usage, wrong attempts and attack/defense checks come from
// MongoDB (client values are ignored). Guests: there is no server store, so the
// client-reported counters are clamped and used only to compute a local score.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  const body = await readJson(request);
  const mission = findMission(body?.missionId);
  if (!body || !mission) return json({ error: '미션 번호가 올바르지 않습니다.' }, 400);
  const flag = typeof body.flag === 'string' ? body.flag.trim() : '';
  if (!flag || flag.length > 100) return json({ error: 'FLAG를 입력하세요.' }, 400);

  let userId: string | null;
  try { userId = await sessionUserId(); } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
  const limit = rateLimit(`flag:${clientKey(request, userId ?? undefined)}:${mission.id}`);
  if (!limit.ok) return json({ error: `제출이 너무 잦습니다. ${limit.retryAfter}초 후 다시 시도하세요. (1분에 최대 8회)` }, 429, { 'Retry-After': String(limit.retryAfter) });
  if (!FLAG_PATTERN.test(flag)) return json({ correct: false, formatError: true, message: 'FLAG 형식이 아닙니다. SG{영문 소문자·숫자·밑줄} 형태로 입력하세요. 형식 오류는 감점하지 않습니다.' });

  const correct = verifyFlag(mission.id, flag);
  if (!userId) {
    const hintsUsed = clampInt(body.hintsUsed, 0, MAX_HINTS);
    const wrong = clampInt(body.wrongSubmissions, 0, 1000);
    if (!correct) return json({ correct: false, message: 'FLAG가 일치하지 않습니다. 공격 결과의 유출 데이터를 다시 확인하세요.', wrongSubmissions: wrong + 1 });
    return json({ correct: true, score: computeScore(mission.level, hintsUsed, wrong), hintsUsed, wrongSubmissions: wrong, stored: false });
  }

  try {
    const doc = await loadProgress(userId);
    const record = recordIn(doc, mission.id);
    if (!record.attackVerified || !record.defenseVerified) return json({ error: '공격 모드 성공과 방어 모드 차단 결과를 모두 확인한 뒤 제출하세요.', needs: { attack: !record.attackVerified, defense: !record.defenseVerified } }, 409);
    if (!correct) {
      record.wrongSubmissions += 1;
      await doc.save();
      return json({ correct: false, message: 'FLAG가 일치하지 않습니다. 공격 결과의 유출 데이터를 다시 확인하세요.', wrongSubmissions: record.wrongSubmissions });
    }
    const score = computeScore(mission.level, record.hintsUsed, record.wrongSubmissions);
    const wrongSubmissions = record.wrongSubmissions;
    const now = new Date();
    record.lastScore = score;
    record.bestScore = Math.max(record.bestScore, score);
    record.clears += 1;
    if (!record.firstSolvedAt) record.firstSolvedAt = now.toISOString();
    record.solvedAt = now.toISOString();
    // Each replay starts a fresh run: wrong attempts and attack/defense checks reset,
    // revealed hints stay recorded (you have already seen them).
    record.wrongSubmissions = 0;
    record.attackVerified = false;
    record.defenseVerified = false;
    if (!doc.completed.includes(mission.id)) doc.completed.push(mission.id);
    await doc.save();
    const records = plainRecords(doc);
    return json({ correct: true, score, hintsUsed: record.hintsUsed, wrongSubmissions, stored: true, record: records[mission.id] ?? emptyRecord(mission.id), records: Object.values(records), completed: plainCompleted(doc) });
  } catch { return json({ error: '제출 결과를 저장하지 못했습니다.' }, 503); }
}
