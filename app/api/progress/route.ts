import { auth } from '@/auth';
import { databaseConfigured } from '@/lib/db';
import { loadProgress } from '@/lib/wargame-store';

// Read-only: the signed-in user's own progress. Missions are completed ONLY by a correct
// FLAG submission (/api/wargame/submit); the former POST that marked a mission complete
// by id was removed because it bypassed the FLAG check.
export async function GET() {
  if (!databaseConfigured()) return Response.json({ error: '서버 저장이 설정되지 않았습니다.' }, { status: 503 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const { records, completed } = await loadProgress(session.user.id);
    return Response.json({ completed, wargame: Object.values(records) });
  } catch { return Response.json({ error: '학습 기록을 불러올 수 없습니다.' }, { status: 503 }); }
}
