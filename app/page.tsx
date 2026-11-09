import { auth } from '@/auth';
import { databaseConfigured } from '@/lib/db';
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
  return <Playground user={session?.user ? { name: session.user.name ?? '학습자', id: session.user.id ?? '' } : null} />;
}
