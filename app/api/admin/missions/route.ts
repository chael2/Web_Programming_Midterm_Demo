import { adminSession } from '@/lib/admin';
import { connectDB, FlagInstance, Mission, missionsConfigured } from '@/lib/db';
import { parseJsonBody, sameOrigin } from '@/lib/http';
import { validateMission } from '@/lib/mission-engine';
import { invalidateMissions, loadMissions } from '@/lib/missions';

// Mission management for admins (ADMIN_EMAILS). Every request re-checks the server
// session; every write is validated by validateMission() (fields, rule, lesson, and
// that the sample is an attack blocked in defense mode while the normal input is not).
const json = (body: unknown, status = 200) => Response.json(body, { status });
const MAX_ADMIN_BODY = 64 * 1024;

async function guard(request: Request, write: boolean) {
  if (write && !sameOrigin(request)) return json({ error: '허용되지 않은 요청입니다.' }, 403);
  if (!missionsConfigured()) return json({ error: '데이터베이스가 설정되지 않았습니다.' }, 503);
  try {
    const admin = await adminSession();
    if (!admin) return json({ error: '관리자만 사용할 수 있습니다.' }, 403);
    return admin;
  } catch { return json({ error: '인증 상태를 확인하지 못했습니다.' }, 503); }
}

/** All missions including unpublished ones and answer fields (admins only). */
export async function GET(request: Request) {
  const g = await guard(request, false);
  if (g instanceof Response) return g;
  try { return json({ missions: await loadMissions(true) }); }
  catch { return json({ error: '미션을 불러오지 못했습니다.' }, 503); }
}

async function save(request: Request, create: boolean) {
  const g = await guard(request, true);
  if (g instanceof Response) return g;
  const parsed = await parseJsonBody(request, MAX_ADMIN_BODY);
  if ('error' in parsed) return parsed.error;
  const { errors, mission } = validateMission(parsed.body.mission);
  if (!mission) return json({ error: '미션 내용이 올바르지 않습니다.', errors }, 400);
  try {
    await connectDB();
    if (create) {
      if (await Mission.exists({ missionId: mission.missionId })) return json({ error: '같은 missionId가 이미 있습니다.' }, 409);
      await Mission.create({ ...mission, updatedBy: g.email });
    } else {
      const result = await Mission.updateOne({ missionId: mission.missionId }, { $set: { ...mission, updatedBy: g.email } });
      if (!result.matchedCount) return json({ error: '수정할 미션이 없습니다.' }, 404);
    }
    invalidateMissions();
    return json({ mission }, create ? 201 : 200);
  } catch { return json({ error: '미션을 저장하지 못했습니다.' }, 503); }
}
export async function POST(request: Request) { return save(request, true); }
export async function PUT(request: Request) { return save(request, false); }

/** Deletes a mission and the flags issued for it. Progress records are kept for history. */
export async function DELETE(request: Request) {
  const g = await guard(request, true);
  if (g instanceof Response) return g;
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;
  const missionId = parsed.body.missionId;
  if (typeof missionId !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(missionId)) return json({ error: 'missionId가 올바르지 않습니다.' }, 400);
  try {
    await connectDB();
    const result = await Mission.deleteOne({ missionId });
    if (!result.deletedCount) return json({ error: '삭제할 미션이 없습니다.' }, 404);
    await FlagInstance.deleteMany({ missionId });
    invalidateMissions();
    return json({ deleted: missionId });
  } catch { return json({ error: '미션을 삭제하지 못했습니다.' }, 503); }
}
