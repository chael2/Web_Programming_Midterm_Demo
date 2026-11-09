import { auth } from '@/auth';
import { connectDB, databaseConfigured, Notice } from '@/lib/db';
import mongoose from 'mongoose';
export async function GET() {
  if (!databaseConfigured()) return Response.json({ notices: [], configured: false });
  try { await connectDB(); const notices = await Notice.find().sort({ createdAt: -1 }).limit(50).lean(); return Response.json({ notices, configured: true }); }
  catch { return Response.json({ error: '게시글을 불러오지 못했습니다.' }, { status: 503 }); }
}
async function mutate(request: Request, remove: boolean) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  if (!databaseConfigured()) return Response.json({ error: '서버 설정이 필요합니다.' }, { status: 503 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  try {
    const { id, title, content } = await request.json();
    if (typeof id !== 'string' || !mongoose.isValidObjectId(id)) return Response.json({ error: '올바르지 않은 게시글입니다.' }, { status: 400 });
    if (!remove && (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || title.length > 100 || !content.trim() || content.length > 5000)) return Response.json({ error: '제목 1~100자, 본문 1~5000자를 입력하세요.' }, { status: 400 });
    await connectDB();
    const filter = { _id: id, authorId: session.user.id };
    const notice = remove ? await Notice.findOneAndDelete(filter) : await Notice.findOneAndUpdate(filter, { $set: { title: title.trim(), content: content.trim() } }, { new: true });
    if (!notice) return Response.json({ error: '게시글이 없거나 수정 권한이 없습니다.' }, { status: 404 });
    return Response.json({ notice });
  } catch { return Response.json({ error: '게시글 변경에 실패했습니다.' }, { status: 503 }); }
}
export async function PATCH(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: '허용되지 않은 요청입니다.' }, { status: 403 });
  if (!databaseConfigured()) return Response.json({ error: '게시판 작성은 MongoDB 및 인증 설정이 필요합니다.' }, { status: 503 });
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '로그인 후 작성하세요.' }, { status: 401 });
  try {
    const { title, content } = await request.json();
    if (typeof title !== 'string' || typeof content !== 'string' || !title.trim() || title.length > 100 || !content.trim() || content.length > 5000) return Response.json({ error: '제목 1~100자, 본문 1~5000자를 입력하세요.' }, { status: 400 });
    await connectDB();
    const notice = await Notice.create({ title: title.trim(), content: content.trim(), authorId: session.user.id, author: session.user.name });
    return Response.json({ notice }, { status: 201 });
  } catch { return Response.json({ error: '게시글을 저장하지 못했습니다.' }, { status: 503 }); }
}
