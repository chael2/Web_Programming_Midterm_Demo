'use server';
import { AuthError } from 'next-auth';
import bcrypt from 'bcryptjs';
import { signIn, signOut } from '@/auth';
import { connectDB, databaseConfigured, User } from '@/lib/db';

export async function loginAction(_state: string, form: FormData) {
  if (!databaseConfigured()) return '로그인은 MONGODB_URI와 AUTH_SECRET 설정 후 사용할 수 있습니다. 지금은 게스트로 실습할 수 있습니다.';
  try { await signIn('credentials', { email: form.get('email'), password: form.get('password'), redirectTo: '/' }); }
  catch (error) { if (error instanceof AuthError) return '이메일 또는 비밀번호가 올바르지 않거나 인증 서버에 연결할 수 없습니다.'; throw error; }
  return '';
}
export async function registerAction(_state: string, form: FormData) {
  if (!databaseConfigured()) return '회원가입은 MONGODB_URI와 AUTH_SECRET 설정 후 사용할 수 있습니다.';
  const name = String(form.get('name') ?? '').trim();
  const email = String(form.get('email') ?? '').trim().toLowerCase();
  const password = String(form.get('password') ?? '');
  if (name.length < 2 || name.length > 40 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return '이름 2~40자, 올바른 이메일, 비밀번호 12자 이상(UTF-8 72바이트 이하)을 입력하세요.';
  try {
    await connectDB();
    await User.init();
    await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  } catch { return '가입을 완료하지 못했습니다. 가입 정보 또는 데이터베이스 연결을 확인하세요.'; }
  try { await signIn('credentials', { email, password, redirectTo: '/' }); }
  catch (error) { if (error instanceof AuthError) return '가입되었습니다. 로그인 화면에서 다시 로그인하세요.'; throw error; }
  return '';
}
export async function logoutAction() { await signOut({ redirectTo: '/' }); }
