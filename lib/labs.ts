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

const existingLabs = [
  { id: 'injection', number: '01', title: 'SQL Injection', ko: '인젝션', category: '입력값 검증', level: '입문', icon: '⌘', color: '#8470ff', description: '로그인 입력값이 쿼리의 구조를 바꾸는 과정을 알아보세요.', field: '로그인 아이디', sample: "admin' OR '1'='1", normal: 'student', cause: '사용자 입력을 SQL 문자열에 직접 결합하면 데이터가 명령으로 해석될 수 있습니다.', defense: '매개변수화된 쿼리로 코드와 데이터를 분리합니다. MongoDB에서도 문자열 타입과 허용 필드를 검증해야 합니다.', vulnerable: "const sql = `SELECT * FROM users WHERE name = '${input}'`;\ndb.query(sql);", secure: "const sql = 'SELECT * FROM users WHERE name = ?';\ndb.execute(sql, [input]);" },
  { id: 'xss', number: '02', title: 'Cross-Site Scripting', ko: 'XSS', category: '출력값 처리', level: '입문', icon: '⌨', color: '#e6a957', description: '게시판에 입력한 스크립트가 화면에 출력되면 어떤 일이 생길까요?', field: '게시판 댓글', sample: '<img src=x onerror=alert("XSS")>', normal: '보안 공부를 시작합니다!', cause: '신뢰하지 않는 콘텐츠를 HTML로 출력하면 브라우저가 스크립트로 실행할 수 있습니다.', defense: 'React의 기본 텍스트 렌더링으로 이스케이프합니다. HTML을 허용해야 한다면 검증된 정화 도구와 CSP를 함께 사용합니다.', vulnerable: 'element.innerHTML = comment;\n// 사용자 입력을 HTML로 해석', secure: 'return <p>{comment}</p>;\n// React가 텍스트를 이스케이프' },
  { id: 'csrf', number: '03', title: 'Cross-Site Request Forgery', ko: 'CSRF', category: '요청 검증', level: '중급', icon: '⇄', color: '#50bfa9', description: '사용자의 의도와 다른 요청을 검증하고 차단하는 방법을 학습하세요.', field: '요청의 CSRF 토큰', sample: 'forged-token', normal: 'secureguard-valid-token', cause: '쿠키 기반 인증만 확인하면 외부 사이트에서 유도한 상태 변경 요청도 수락할 수 있습니다.', defense: '세션에 연결된 CSRF 토큰과 Origin을 검증하고 SameSite 쿠키를 적용합니다.', vulnerable: "if (session) updateEmail(body.email);\n// 요청 출처 검증 없음", secure: "if (!verifyOrigin(request)) return forbidden();\nif (!verifyCsrf(session, token)) return forbidden();\nupdateEmail(body.email);" },
  { id: 'auth', number: '04', title: 'Authentication Failures', ko: '취약한 인증', category: '인증 및 세션', level: '입문', icon: '◎', color: '#e7809a', description: '쉬운 비밀번호와 잘못된 인증 정책의 위험을 확인하세요.', field: '가입할 비밀번호 (가상)', sample: '1234', normal: 'SecureGuard!2026', cause: '쉬운 비밀번호와 무제한 로그인 시도는 계정 탈취 가능성을 높입니다.', defense: '충분한 길이의 비밀번호, bcrypt 해싱, 시도 제한과 다중 인증을 조합합니다. 이 실습은 비밀번호 길이 정책을 비교합니다.', vulnerable: "if (password.length > 0) createAccount(password);\n// 취약한 비밀번호도 허용", secure: "if (password.length < 12) return reject();\nconst hash = await bcrypt.hash(password, 12);\n// 운영 환경: 시도 제한 + MFA 추가" },
  { id: 'access', number: '05', title: 'Broken Access Control', ko: '접근 제어 오류', category: '권한 관리', level: '중급', icon: '◇', color: '#65a7eb', description: 'URL의 문서 번호를 바꾸는 것만으로 다른 사용자 정보가 보일까요?', field: '조회할 문서 번호 (내 문서: 1001)', sample: '1002', normal: '1001', cause: '로그인 여부만 검사하고 자원 소유자를 확인하지 않으면 다른 사용자의 자료를 조회할 수 있습니다.', defense: '모든 요청에서 서버가 자원 소유권과 권한을 검증합니다. 화면의 버튼을 숨기는 것만으로는 보호되지 않습니다.', vulnerable: 'return findDocument(id);\n// 문서 소유자 확인 없음', secure: 'const doc = await findDocument(id);\nif (doc.ownerId !== session.user.id) return forbidden();\nreturn doc;' },
  { id: 'config', number: '06', title: 'Security Misconfiguration', ko: '보안 설정 오류', category: '서버 설정', level: '중급', icon: '⚙', color: '#b28ae0', description: '상세 오류 메시지가 노출하는 서버 내부 정보를 살펴보세요.', field: '요청할 가상 경로', sample: '/debug/config', normal: '/health', cause: '개발용 디버그 경로와 상세 오류를 운영 환경에 노출하면 내부 구조를 알려줄 수 있습니다.', defense: '운영 환경에서 디버그 경로를 비활성화하고 일반화된 오류만 응답합니다. 비밀 값은 서버 환경변수로 관리합니다.', vulnerable: 'app.get("/debug/config", () => config);\nreturn { error: error.stack };', secure: 'if (isProduction) disableDebugRoutes();\nlogErrorOnServer(error);\nreturn { error: "요청을 처리할 수 없습니다." };' },
] as const;
const additionalLabs = [
  { id: 'supply', categoryId: 'A03', title: 'Dependency Trust', ko: '의존성 공급망 검증', category: '패키지 신뢰', level: '중급', icon: '⬡', color: '#a6a4ee', description: '이름이 비슷한 가상 패키지를 검증 없이 설치하면 어떤 일이 생길까요?', field: '설치할 가상 패키지 이름', sample: 'securegaurd-utils', normal: 'secureguard-utils', cause: '출처를 확인하지 않고 패키지를 설치하거나 빌드 경로를 신뢰하면 위장 패키지와 변조된 의존성이 유입될 수 있습니다.', defense: '실습에서는 승인된 패키지 목록을 비교합니다. 실제로는 출처·서명·잠금 파일·의존성 변경 검토, SBOM, 빌드 권한 통제를 함께 적용합니다.', vulnerable: 'install(packageName);\n// 출처와 의존성 변경 검토 없음', secure: 'if (!approvedPackages.has(packageName)) reject();\n// 출처·서명·잠금 파일·의존성 변경도 검토\ninstallReviewedDependency(packageName);' },
  { id: 'crypto', categoryId: 'A04', title: 'Sensitive Data in Transit', ko: '민감 정보 전송 보호', category: '암호화 및 전송', level: '입문', icon: '◈', color: '#72bce0', description: '가상의 결제 전송 정책에서 HTTP와 HTTPS의 차이를 확인하세요.', field: '가상 결제 전송 프로토콜 (http 또는 https)', sample: 'http', normal: 'https', cause: '민감 정보를 평문 프로토콜로 전송하면 네트워크에서 내용이 노출되거나 변조될 수 있습니다.', defense: '전송에는 올바른 인증서 검증을 갖춘 TLS와 HTTPS를 강제하고 HSTS를 적용합니다. 이 실습은 프로토콜 정책만 비교하며 실제 전송은 하지 않습니다.', vulnerable: 'send("http://payments.example", sensitiveData);\n// 민감 정보가 평문으로 전송', secure: 'if (url.protocol !== "https:") reject();\n// 인증서 검증·HSTS도 적용\nsendOverTLS(url, sensitiveData);' },
  { id: 'design', categoryId: 'A06', title: 'Coupon Business Rules', ko: '쿠폰 중복 사용 설계', category: '업무 로직', level: '중급', icon: '▧', color: '#d5b879', description: '이미 사용한 쿠폰을 다시 제출할 때 업무 규칙이 적용되는지 비교하세요.', field: '가상 쿠폰 코드 (WELCOME10은 이미 사용됨)', sample: 'WELCOME10', normal: 'FIRST10', cause: '사용자별 사용 횟수 같은 업무 제약을 설계하지 않으면 문법상 정상인 요청도 반복 악용될 수 있습니다.', defense: '실습에서는 사용자별 사용 이력을 확인합니다. 실제로는 트랜잭션·고유 제약을 통해 동시 요청에서도 한 번만 사용되도록 원자적으로 처리합니다.', vulnerable: 'if (couponExists(code)) applyDiscount();\n// 사용자별 사용 이력과 동시성 고려 없음', secure: 'await transaction(async () => {\n  await claimCouponOnce(user.id, code);\n  // DB 고유 제약으로 중복 사용 방지\n  await applyDiscount();\n});' },
  { id: 'integrity', categoryId: 'A08', title: 'Signed Data Verification', ko: '데이터 변조 검증', category: '데이터 무결성', level: '중급', icon: '▣', color: '#c991dc', description: '변조된 가상 주문 데이터를 신뢰하기 전에 서명을 확인해 보세요.', field: '가상 주문 상태 (signed 또는 tampered)', sample: 'tampered', normal: 'signed', cause: '신뢰 경계를 넘어온 데이터를 서명 검증 없이 받아들이면 주문 금액이나 처리 상태가 변조될 수 있습니다.', defense: '실습의 signed 값은 미리 정의된 검증 성공 상태입니다. 실제 서비스는 원문과 서명으로 MAC 또는 전자서명을 검증하고 만료·재전송도 확인해야 합니다.', vulnerable: 'const order = JSON.parse(request.body);\nprocessOrder(order); // 변조 여부 미확인', secure: 'if (!verifySignature(rawBody, signature, key)) reject();\nif (isExpired(order) || isReplay(order)) reject();\nprocessValidatedOrder(order);' },
  { id: 'logging', categoryId: 'A09', title: 'Detect and Alert', ko: '이상 로그인 탐지와 경보', category: '로깅 및 경보', level: '입문', icon: '◉', color: '#e9a379', description: '반복된 로그인 실패가 기록과 경보로 이어지는지 확인하세요.', field: '가상 1분 동안의 로그인 실패 횟수 (0~1000)', sample: '8', normal: '1', cause: '인증 실패 같은 보안 이벤트를 기록하지 않거나 경보와 연결하지 않으면 공격을 알아차리고 대응하기 어렵습니다.', defense: '실습에서는 가상 실패 5회 이상일 때 기록과 경보를 발생시킵니다. 실제 서비스는 비밀정보를 제외한 감사 로그, 탐지 규칙과 대응 절차를 함께 운영합니다.', vulnerable: 'if (!authenticated) return loginFailed();\n// 반복 실패를 기록하거나 알리지 않음', secure: 'auditLog({ event: "login_failed", userId, time });\nif (failuresInWindow >= threshold) {\n  alertSecurityTeam();\n  rateLimitAccountAndSource();\n}' },
  { id: 'exceptions', categoryId: 'A10', title: 'Fail Closed', ko: '오류 시 안전한 요청 거부', category: '예외 처리', level: '중급', icon: '⚑', color: '#e89087', description: '권한 확인 서비스가 중단되었을 때 요청을 허용해도 될까요?', field: '가상 권한 서비스 상태 (ok 또는 timeout)', sample: 'timeout', normal: 'ok', cause: '예외가 발생했을 때 검증을 건너뛰고 요청을 허용하는 fail-open 처리는 보안 통제를 무력화할 수 있습니다.', defense: '권한 확인 실패 시 접근을 거부하는 fail-closed 정책을 사용합니다. 오류를 서버에 기록하고 자원을 정리하며 사용자에게 재시도 가능한 일반 오류를 응답합니다.', vulnerable: 'try { return await checkPermission(); }\ncatch { return true; } // 장애 시 접근 허용', secure: 'try { return await checkPermission(); }\ncatch (error) {\n  logOnServer(error);\n  return false; // 검증 불가 시 접근 거부\n}' },
] as const;
const existingCategory: Record<typeof existingLabs[number]['id'], CategoryId> = {
  access: 'A01', csrf: 'A01', config: 'A02', injection: 'A05', xss: 'A05', auth: 'A07',
};
export const labs = [
  ...existingLabs.map(lab => ({ ...lab, categoryId: existingCategory[lab.id] })),
  ...additionalLabs,
].sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.id.localeCompare(b.id)).map((lab, index) => ({
  ...lab,
  number: String(index + 1).padStart(2, '0'),
  tag: `${lab.categoryId}:2025 · ${owaspCategories.find(category => category.id === lab.categoryId)!.title}`,
}));
export type LabId = typeof labs[number]['id'];
export function normalizeCompleted(value: unknown): LabId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is LabId => labs.some(lab => lab.id === id)))];
}
export function completedCategories(completed: readonly string[]) {
  return owaspCategories.filter(category => labs.filter(lab => lab.categoryId === category.id).every(lab => completed.includes(lab.id)));
}
export type Simulation = { attacked: boolean; blocked: boolean; title: string; detail: string; output: string };
export function simulate(id: string, input: string, defense: boolean): Simulation {
  let attacked = false;
  let output = '';
  switch (id) {
    case 'injection': attacked = /('|"|--|\bor\b|\bunion\b)/i.test(input); output = attacked ? '가상 관리자 계정으로 인증이 우회되었습니다.' : '일반 입력: 인증 우회 패턴이 탐지되지 않았습니다.'; break;
    case 'xss': attacked = /<\s*(script|img|svg|iframe)|on\w+\s*=|javascript:/i.test(input); output = attacked ? 'HTML 이벤트 실행 가능성을 탐지했습니다. 실제 스크립트는 실행하지 않습니다.' : `텍스트 댓글: ${input}`; break;
    case 'csrf': attacked = input !== 'secureguard-valid-token'; output = attacked ? '유효하지 않은 토큰으로 가상 이메일 변경 요청이 수락되었습니다.' : '유효한 토큰: 정상 요청이 수락되었습니다.'; break;
    case 'auth': attacked = input.length < 12; output = attacked ? '12자 미만의 취약한 비밀번호로 가상 가입이 허용되었습니다.' : '비밀번호 길이 정책을 통과했습니다. 길이만으로 비밀번호 안전성이 보장되지는 않습니다.'; break;
    case 'access': attacked = input !== '1001'; output = input === '1002' ? '다른 사용자 소유의 가상 문서 1002가 노출되었습니다.' : attacked ? '허용되지 않은 문서 조회 시도를 탐지했습니다. 가상 취약 서버는 소유권을 검사하지 않습니다.' : '내 문서 1001: SecureGuard 학습 노트'; break;
    case 'config': attacked = input.startsWith('/debug'); output = attacked ? '가상 디버그 정보: DB_HOST=demo-db.internal, DEBUG=true (예시 값)' : input === '/health' ? '가상 서버 상태: 정상' : '가상 경로를 찾을 수 없습니다.'; break;
    case 'supply': attacked = input.trim() !== 'secureguard-utils'; output = attacked ? '검토되지 않은 가상 패키지가 빌드에 포함되었습니다. 실제 설치는 수행하지 않습니다.' : '승인된 가상 패키지가 선택되었습니다.'; break;
    case 'crypto': attacked = input.trim().toLowerCase() !== 'https'; output = attacked ? 'TLS가 없는 가상 전송 정책이 허용되어 결제 정보 노출 가능성이 생겼습니다.' : '가상 HTTPS 전송 정책을 통과했습니다. 인증서와 TLS 설정은 별도 검증이 필요합니다.'; break;
    case 'design': {
      const code = input.trim().toUpperCase();
      if (code !== 'WELCOME10' && code !== 'FIRST10') return invalidInput('WELCOME10 또는 FIRST10 쿠폰 코드를 입력하세요.');
      attacked = code === 'WELCOME10'; output = attacked ? '이미 사용한 WELCOME10 쿠폰이 다시 적용되어 가상 중복 할인이 발생했습니다.' : '사용하지 않은 FIRST10 쿠폰으로 정상 할인이 적용되었습니다.'; break;
    }
    case 'integrity': {
      const state = input.trim().toLowerCase();
      if (state !== 'signed' && state !== 'tampered') return invalidInput('signed 또는 tampered 상태를 입력하세요.');
      attacked = state === 'tampered'; output = attacked ? '서명이 일치하지 않는 가상 주문 데이터가 처리되었습니다.' : '미리 정의된 서명 검증 성공 시나리오입니다. 실제 암호 연산은 수행하지 않습니다.'; break;
    }
    case 'logging': {
      const value = input.trim();
      if (!/^\d{1,4}$/.test(value) || Number(value) > 1000) return invalidInput('0~1000 사이의 정수 횟수를 입력하세요.');
      attacked = Number(value) >= 5; output = attacked ? `가상 로그인 실패 ${Number(value)}회가 보안 로그와 경보 없이 지나갔습니다.` : `가상 로그인 실패 ${Number(value)}회: 경보 임계값(5회) 미만입니다.`; break;
    }
    case 'exceptions': {
      const state = input.trim().toLowerCase();
      if (state !== 'ok' && state !== 'timeout') return invalidInput('ok 또는 timeout 상태를 입력하세요.');
      attacked = state === 'timeout'; output = attacked ? '권한 서비스의 시간 초과를 무시하고 가상 보호 자원 접근이 허용되었습니다.' : '가상 권한 서비스가 정상 응답하여 허가된 요청이 처리되었습니다.'; break;
    }
    default: throw new Error('존재하지 않는 실습입니다.');
  }
  const blocked = attacked && defense;
  if (id === 'logging' && attacked && defense) return { attacked, blocked: true, title: '이상 징후를 탐지하고 대응했습니다', detail: '로그 기록과 가상 경보를 발생시키고 추가 시도를 제한했습니다. 로깅 자체가 공격을 차단한다는 의미는 아닙니다.', output: `가상 실패 ${Number(input)}회 → 감사 로그 기록 → 보안 담당자 경보 → 추가 시도 제한` };
  return { attacked, blocked, title: blocked ? '위험한 동작을 방지했습니다' : attacked ? '취약한 동작을 재현했습니다' : '정상 입력을 처리했습니다', detail: blocked ? '이 시나리오의 방어 정책을 적용했습니다. 아래 코드와 가이드에서 실제 구현 시 필요한 검증을 확인하세요.' : '결과는 정해진 학습 규칙에 따른 시뮬레이션입니다. 실제 DB 쿼리나 공격 코드는 실행하지 않습니다.', output: blocked ? id === 'xss' ? `텍스트로 안전하게 출력: ${input}` : id === 'exceptions' ? '권한 검증 불가 → 접근 거부 (fail closed) / 서버 오류 기록 / 재시도 안내' : '요청 거부 / 위험 동작 미수행' : output };
}
function invalidInput(output: string): Simulation {
  return { attacked: false, blocked: false, title: '시나리오 입력을 확인하세요', detail: '공격 예제 입력 또는 정상 입력 버튼으로 학습용 값을 채울 수 있습니다.', output };
}
