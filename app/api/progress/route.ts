import { auth } from '@/auth';
import { connectDB, databaseConfigured, Progress } from '@/lib/db';
import { labs, normalizeCompleted } from '@/lib/labs';
import { normalizeRecords } from '@/lib/wargame';
export async function GET() {
  if (!databaseConfigured()) return Response.json({ error: '서버 저장이 설정되지 않았습니다.' }, { status: 503 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try { await connectDB(); const data = await Progress.findOne({ userId: session.user.id }).lean<{ completed?: unknown; wargame?: unknown }>(); return Response.json({ completed: normalizeCompleted(data?.completed), wargame: Object.values(normalizeRecords(data?.wargame, labs.map(lab => lab.id))) }); }
  catch { return Response.json({ error: '학습 기록을 불러올 수 없습니다.' }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  if (!databaseConfigured()) return Response.json({ error: '서버 저장 설정이 필요합니다.' }, { status: 503 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const { id } = await request.json();
    if (!labs.some(lab => lab.id === id)) return Response.json({ error: '실습 번호가 올바르지 않습니다.' }, { status: 400 });
    await connectDB();
    const record = await Progress.findOneAndUpdate({ userId: session.user.id }, { $addToSet: { completed: id } }, { upsert: true, new: true });
    return Response.json({ completed: normalizeCompleted(record.completed) });
  } catch { return Response.json({ error: '진도를 저장하지 못했습니다.' }, { status: 503 }); }
}
