'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { loginAction, registerAction } from '@/app/actions';
export default function AuthForm({ register = false }: { register?: boolean }) {
  const [error, action, pending] = useActionState(register ? registerAction : loginAction, '');
  return <main className="auth-page">
    <section className="auth-card">
      <Link className="brand" href="/"><strong>SecureGuard</strong><span className="brand-sub">OWASP WARGAME</span></Link>
      <p className="eyebrow">{register ? 'Create account' : 'Sign in'}</p>
      <h1>{register ? '계정 만들기' : '로그인'}</h1>
      <p>{register ? '계정을 만들면 미션 진도와 점수가 서버에 저장됩니다.' : '계정에 저장된 미션 진도와 점수를 이어서 확인하세요.'}</p>
      <form action={action}>
        {register && <label className="field"><span className="field-label">이름</span><input name="name" autoComplete="name" required minLength={2} maxLength={40} placeholder="2~40자" /></label>}
        <label className="field"><span className="field-label">이메일</span><input name="email" type="email" autoComplete="email" required placeholder="student@example.com" /></label>
        <label className="field"><span className="field-label">비밀번호</span><input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={72} placeholder={register ? '12자 이상' : ''} aria-describedby={register ? 'pw-hint' : undefined} />{register && <span id="pw-hint" className="field-hint">12자 이상, UTF-8 기준 72바이트 이하</span>}</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={pending}>{pending ? '처리 중…' : register ? '가입하고 시작하기' : '로그인'}</button>
      </form>
      <div className="auth-foot">
        <span>{register ? '이미 계정이 있나요?' : '아직 계정이 없나요?'} <Link href={register ? '/login' : '/register'}>{register ? '로그인' : '회원가입'}</Link></span>
        <Link href="/">게스트로 둘러보기</Link>
      </div>
    </section>
  </main>;
}
