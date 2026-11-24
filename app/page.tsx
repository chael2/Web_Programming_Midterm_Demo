import { auth } from '@/auth';
import { databaseConfigured, missionsConfigured } from '@/lib/db';
import { isAdminEmail } from '@/lib/admin';
import { publishedMissions, toPublicMissions } from '@/lib/missions';
import type { PublicMission } from '@/lib/mission-engine';
import Playground from '@/components/Playground';
import { Suspense } from 'react';
import { connection } from 'next/server';
export default function Home() {
  return <Suspense fallback={<main className="content empty">SecureGuard 학습실을 준비하고 있습니다…</main>}><AuthenticatedHome /></Suspense>;
}
async function AuthenticatedHome() {
  // Auth.js may generate random values before reading cookies. Keep that work
  // inside the request boundary instead of the Cache Components static shell.
  await connection();
  const session = databaseConfigured() ? await auth() : null;
  // Missions come from MongoDB only; answer fields are stripped by toPublicMissions().
  let missions: PublicMission[] = [];
  let missionError: string | null = null;
  if (!missionsConfigured()) missionError = '미션 데이터베이스(MONGODB_URI)가 설정되지 않았습니다.';
  else {
    try { missions = toPublicMissions(await publishedMissions()); }
    catch { missionError = '미션 데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인하세요.'; }
    if (!missionError && !missions.length) missionError = '등록된 미션이 없습니다. `npm run seed:missions`로 초기 미션을 넣거나 관리자 페이지에서 추가하세요.';
  }
  const user = session?.user ? { name: session.user.name ?? '학습자', id: session.user.id ?? '', isAdmin: isAdminEmail(session.user.email) } : null;
  return <Playground user={user} missions={missions} missionError={missionError} />;
}
