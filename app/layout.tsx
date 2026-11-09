import type { Metadata } from 'next';
import './globals.css';
import './wargame.css';
import './mission.css';

// Fonts come from curated system stacks in globals.css (--sans / --mono-font),
// so builds never depend on downloading web fonts.
export const metadata: Metadata = { title: 'SecureGuard | OWASP Top 10:2025', description: 'OWASP Top 10:2025의 10개 분류를 12개 공격·방어 시뮬레이션과 워게임 미션으로 학습하는 시큐어가드 웹 보안 플랫폼.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ko"><body>{children}</body></html>;
}
