import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { adminSession } from '@/lib/admin';
import { missionsConfigured } from '@/lib/db';
import AdminMissions from '@/components/AdminMissions';

export default function AdminPage() {
  return <Suspense fallback={<main className="content empty">관리자 페이지를 준비하고 있습니다…</main>}><AdminGate /></Suspense>;
}
async function AdminGate() {
  await connection();
  const admin = missionsConfigured() ? await adminSession().catch(() => null) : null;
  if (!admin) return <main className="content">
    <header className="page-header"><div><p className="eyebrow">SecureGuard · Admin</p><h1>접근 권한이 없습니다</h1><p className="page-lede">미션 관리는 관리자 계정(ADMIN_EMAILS에 등록된 이메일)으로 로그인해야 사용할 수 있습니다.</p></div></header>
    <p><Link className="btn btn-secondary" href="/login">로그인</Link> <Link className="btn btn-ghost" href="/">홈으로</Link></p>
  </main>;
  return <AdminMissions adminEmail={admin.email} />;
}
