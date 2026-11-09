# SecureGuard — Web Security Playground

중부대학교 웹보안프로그래밍 1~7주차 강의와 시큐어가드 팀 회의록을 바탕으로 만든 웹 보안 교육용 프로젝트입니다.

## 실행

Node.js 24 LTS를 사용합니다.

```bash
npm install
npm run dev
```

http://localhost:3000 에 접속합니다. PowerShell 실행 정책으로 npm이 막히면 `npm.cmd run dev`를 사용하세요.

설정 없이도 대시보드, OWASP Top 10:2025의 12개 실습, 코드 가이드, 게스트 진도와 리포트 다운로드를 사용할 수 있습니다. 게스트 진도는 현재 브라우저에 저장되고 계정으로 자동 이전하지 않습니다.

## MongoDB·로그인 설정

1. `.env.example`을 `.env.local`로 복사합니다.
2. 로컬 MongoDB 또는 Atlas 연결 문자열을 `MONGODB_URI`에 입력합니다. Atlas에는 접속할 서버 IP를 허용하고 비밀번호 특수문자를 URL 인코딩합니다.
3. 아래 명령의 출력값을 `AUTH_SECRET`에 입력합니다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

4. `AUTH_URL`을 접속 주소로 설정하고 서버를 재시작합니다. 배포 빌드 전에도 환경변수를 설정합니다.
5. `/register`에서 이름·이메일·12자 이상 비밀번호로 가입합니다. bcrypt 입력 한도 때문에 비밀번호는 UTF-8 기준 72바이트 이하여야 합니다.

설정 이후 회원가입·자동 로그인·로그아웃, 계정별 진도, 게시판 작성·조회·본인 글 수정·삭제를 사용할 수 있습니다. 권한은 서버에서 작성자 ID로 검사하고 비밀번호는 bcrypt 해시로만 저장합니다. `.env.local`과 비밀키는 커밋하지 않습니다.

## 발표 시연 순서

1. 대시보드에서 **취약점 실습 시작하기** 또는 **워게임 미션**에서 미션을 고릅니다.
2. 미션 목표와 설명을 읽고, 필요하면 **힌트**를 단계별로 엽니다(점수 감소 규칙이 화면에 표시됩니다).
3. 공격 모드에서 입력 후 **시뮬레이션 실행** → 서버가 판정하고, 공격이 성공하면 가상 **유출 데이터**에 FLAG가 섞여 나옵니다.
4. 같은 입력으로 **방어 모드 ON → 시뮬레이션 실행**으로 차단을 확인합니다.
5. 유출 데이터에서 찾은 `SG{...}` FLAG를 **제출**하면 서버가 검증하고 점수와 완료 화면을 보여줍니다.
6. **대시보드/학습 리포트**에서 총점, 분류별 진행률, 최근 완료 미션, 미션별 최고 점수를 확인합니다.
7. DB 연결 시 회원가입과 게시판 CRUD도 시연합니다.

## 워게임 구조

| 항목 | 내용 |
| --- | --- |
| FLAG | `lib/wargame-server.ts`(서버 전용)에만 존재. 클라이언트 번들에 포함되지 않으며 테스트가 이를 검사합니다. `WARGAME_FLAG_SECRET`을 설정하면 배포마다 다른 HMAC 접미사가 붙습니다. |
| 판정 | `POST /api/wargame/simulate`가 기존 `simulate()`를 서버에서 다시 실행하고, 공격 모드 성공 시에만 FLAG가 든 가상 유출 데이터를 반환합니다. |
| 힌트 | `POST /api/wargame/hint` · 미션당 3단계. 로그인 사용자는 서버가 단계 순서와 사용 기록을 관리합니다. |
| 제출 | `POST /api/wargame/submit` · 서버에서 FLAG 비교(timing-safe)·점수 계산. 로그인 사용자는 서버에 기록된 공격 성공·방어 차단 확인이 있어야 제출할 수 있습니다. 1분에 미션별 8회 제한(서버 인스턴스 메모리 기준). |
| 점수 | 입문 100점·중급 150점. 힌트 1/2/3단계 누적 −10/−30/−60%, 틀린 FLAG 1회 −5%(최대 −20%), 최저 20%. 미션별 최고 점수를 합산합니다. **교육용 게임 점수이며 보안 역량 평가가 아닙니다.** |
| 저장 | 로그인: MongoDB `Progress.wargame[]`(기존 `completed` 유지). 게스트: `localStorage`의 `secureguard-guest-progress`(기존)와 `secureguard-guest-wargame`. |

기존 `completed` 기록은 그대로 완료로 인정되며 점수는 "이전 기록"으로 표시됩니다. 다시 플레이해 FLAG를 제출하면 점수가 기록됩니다.

## 실습 범위

[OWASP Top 10:2025 공식 분류](https://top10.owasp.org/2025/) 10개를 모두 포함한 **12개 대표 시나리오**입니다. 각 분류에 속한 모든 CWE나 공격 변형을 재현한다는 의미는 아닙니다.

| 2025 분류 | 대표 실습 |
| --- | --- |
| A01 Broken Access Control — 접근 제어 오류 | 타인 문서 조회, CSRF 토큰 검증 |
| A02 Security Misconfiguration — 보안 설정 오류 | 디버그 경로 정보 노출 |
| A03 Software Supply Chain Failures — 소프트웨어 공급망 실패 | 이름이 비슷한 가상 의존성 패키지 검증 |
| A04 Cryptographic Failures — 암호화 실패 | 민감 정보 전송 시 HTTP/HTTPS 정책 |
| A05 Injection — 인젝션 | SQL Injection, XSS |
| A06 Insecure Design — 안전하지 않은 설계 | 이미 사용한 쿠폰의 중복 사용 |
| A07 Authentication Failures — 인증 실패 | 취약한 비밀번호 정책 |
| A08 Software or Data Integrity Failures — 무결성 실패 | 가상 주문 데이터 서명 검증 |
| A09 Security Logging and Alerting Failures — 로깅 및 경보 실패 | 반복 로그인 실패의 기록·경보·대응 |
| A10 Mishandling of Exceptional Conditions — 예외 상황 처리 오류 | 권한 서비스 장애 시 fail-closed 처리 |

대시보드의 학습 지도에서 10개 분류를 선택할 수 있습니다. 실습 목록은 공식 번호 순서로 묶고 분류·난이도·검색어로 필터링합니다. 코드 가이드와 리포트에도 2025 분류를 표시합니다.

전체 실습 진도는 12개 시나리오를 기준으로 계산하며, 분류 완료는 해당 분류의 모든 시나리오를 완료했을 때 인정합니다. 기존 6개 실습의 ID와 저장 기록을 유지하여, 이전 실습을 모두 완료했다면 확장 후 진도는 6/12(50%), 완료 분류는 4/10입니다. 새 시나리오는 자동 완료되지 않습니다.

사용자 입력을 정해진 규칙으로 판정하는 **교육용 시뮬레이션**입니다. 실제 SQL·임의 JavaScript 실행이나 외부 서버 요청은 하지 않습니다. XSS 입력도 React 텍스트로 표시합니다. 코드 패널은 축약된 학습 예시이며 실제 인증·DB 코드와 구분합니다. 패턴 판정은 실제 보안 진단이 아닙니다.

학습 진도는 공격·방어 결과를 확인한 완료 기록입니다. 보안 역량 점수가 아니며 완료 요청을 성적 평가나 부정행위 방지용으로 검증하지 않습니다.

## 자료 반영

| 자료 | 구현 |
| --- | --- |
| 01~02 개요·개발 환경 | React, TypeScript, Next.js App Router, Tailwind v4, MongoDB, Auth.js |
| 03~04 Next.js | 레이아웃, Server/Client Component, 라우트와 서버 API |
| 05 게시판 | 작성·조회·수정·삭제, 입력 검증, 처리 중 상태 |
| 06 MongoDB | Mongoose 연결 재사용, User·Notice·Progress 모델 |
| 07 인증 | Auth.js Credentials, JWT 세션, bcrypt, 인증 Server Action |
| 팀 회의록 | 공격/방어 비교, 취약점별 원인·가이드, 개인 진도·리포트 |

회의록의 Express/MySQL 구상은 수업의 Next.js/MongoDB 스택으로 통합했습니다. SQL Injection은 독립 시뮬레이션이며 실제 저장 DB는 MongoDB입니다.

## 구조

- `app/`: 페이지, 인증 Server Action, 스타일
- `app/api/auth/`: Auth.js 라우트
- `app/api/notices/`: 게시판 CRUD API
- `app/api/progress/`: 계정별 진도 API
- `components/`: 플랫폼 UI와 인증 폼
- `lib/db.ts`: MongoDB 연결·모델
- `lib/labs.ts`: 실습 콘텐츠·판정
- `auth.ts`: 인증·세션 설정
- `tests/`: 시뮬레이션 회귀 테스트

## 검증·배포

```bash
npm test
npm run build
npm start
```

39개 테스트는 각 모듈의 공격·방어·정상 입력, 2025 분류 전체 포함, 기존 진도 호환, 잘못된 시나리오 값과 로깅·경보 대응, FLAG 검증·고유성, 힌트 단계, 점수 규칙, 기록 정규화, 제출 제한, 클라이언트 코드의 FLAG 미포함을 검사합니다. MongoDB·인증 전체 흐름은 환경변수를 설정한 서버에서 추가 확인해야 합니다. Vercel에서는 `MONGODB_URI`, `AUTH_SECRET`, 배포 주소에 맞는 `AUTH_URL`을 등록하고 빌드·배포합니다.

현재는 발표·학습용 구현입니다. 운영 서비스로 확장할 때는 분산 저장소 기반 요청 제한, 이메일 검증, 비밀번호 복구와 모니터링을 추가해야 합니다.

의존성 검사에서 ESLint 개발 도구의 `braces` 전이 의존성 관련 high 경고 5건이 확인되었습니다. 자동 수정은 Next.js ESLint 설정의 메이저 다운그레이드를 제안하므로 적용하지 않았습니다.

런타임 의존성 검사(`npm audit --omit=dev`)에서는 취약점 0건이 확인되었습니다. 화면은 HTTP 응답으로 검증했으며 자동 브라우저 조작·모바일 스크린샷 검증은 수행하지 않았습니다.
#   W e b _ P r o g r a m m i n g _ M i d t e r m _ D e m o  
 