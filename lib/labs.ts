export const owaspCategories = [
  { id: 'A01', title: 'Broken Access Control', ko: '접근 제어 오류', summary: '자원 소유권과 요청 권한을 서버에서 확인합니다.', slug: 'Broken_Access_Control' },
  { id: 'A02', title: 'Security Misconfiguration', ko: '보안 설정 오류', summary: '디버그 기능과 불필요한 정보 노출을 막습니다.', slug: 'Security_Misconfiguration' },
  { id: 'A03', title: 'Software Supply Chain Failures', ko: '소프트웨어 공급망 실패', summary: '의존성과 빌드·배포 경로의 신뢰성을 검증합니다.', slug: 'Software_Supply_Chain_Failures' },
  { id: 'A04', title: 'Cryptographic Failures', ko: '암호화 실패', summary: '민감 정보의 전송·저장에 적합한 암호 기술을 적용합니다.', slug: 'Cryptographic_Failures' },
  { id: 'A05', title: 'Injection', ko: '인젝션', summary: '신뢰하지 않는 입력을 명령이나 HTML과 분리합니다.', slug: 'Injection' },
  { id: 'A06', title: 'Insecure Design', ko: '안전하지 않은 설계', summary: '기획 단계부터 업무 규칙과 악용 가능성을 검토합니다.', slug: 'Insecure_Design' },
  { id: 'A07', title: 'Authentication Failures', ko: '인증 실패', summary: '계정 인증과 세션 수명주기를 안전하게 관리합니다.', slug: 'Authentication_Failures' },
  { id: 'A08', title: 'Software or Data Integrity Failures', ko: '소프트웨어 또는 데이터 무결성 실패', summary: '코드와 데이터가 신뢰 경계를 넘을 때 변조 여부를 검증합니다.', slug: 'Software_or_Data_Integrity_Failures' },
  { id: 'A09', title: 'Security Logging and Alerting Failures', ko: '보안 로깅 및 경보 실패', summary: '보안 이벤트를 기록하고 대응할 수 있는 경보로 연결합니다.', slug: 'Security_Logging_and_Alerting_Failures' },
  { id: 'A10', title: 'Mishandling of Exceptional Conditions', ko: '예외 상황 처리 오류', summary: '오류·자원 부족 같은 비정상 상황에서도 안전하게 실패합니다.', slug: 'Mishandling_of_Exceptional_Conditions' },
] as const;
export type CategoryId = typeof owaspCategories[number]['id'];
export function categoryUrl(category: typeof owaspCategories[number]) {
  return `https://top10.owasp.org/2025/${category.id}_2025-${category.slug}/`;
}

// Mission content and judging rules live in MongoDB (see lib/missions.ts and
// lib/mission-engine.ts). Only the OWASP taxonomy and progress helpers stay in code.
export function normalizeCompleted(value: unknown, validIds: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && validIds.includes(id)))];
}
/** A category counts as complete when it has at least one mission and all of them are completed. */
export function completedCategories(completed: readonly string[], missions: readonly { id: string; categoryId: string }[]) {
  return owaspCategories.filter(category => {
    const items = missions.filter(m => m.categoryId === category.id);
    return items.length > 0 && items.every(m => completed.includes(m.id));
  });
}
