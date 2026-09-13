# 어디 있니?

> 우리 학교 분실물 찾기

《어디 있니?》는 학교 구성원이 한곳에서 분실 신고, 습득물 확인, 목격 단서
공유와 보관 장소 확인을 할 수 있도록 만드는 반응형 웹앱입니다.

## 주요 사용자

- 학생: 분실 신고, 습득물 등록, 찾기 단서 작성
- 일반 교사: 습득물 인수, 보관 장소 입력, 반환 처리
- 최종 관리자 교사: 게시물 관리와 교사 권한 관리

새 사용자는 학생 권한으로 시작합니다. 교사 권한과 관리자 권한은 화면에서
임의로 바꿀 수 없으며 서버에서 검증하도록 설계합니다.

## 현재 구현 상태

현재 화면에서 다음 기능을 확인할 수 있습니다.

- 모바일·데스크톱 반응형 메인 화면
- 물건 이름·분류·색상·장소 검색
- 분실·습득 필터
- 물건 상세 화면
- 분실·습득 등록 화면
- 앱 내부 알림 화면
- 도움 포인트 총점·배지·활동 내역 시연
- `도움 됐어요`, 교사 인수 확인 및 관리자 지급 취소 시연
- Firebase Google 로그인 기반 코드
- Firestore 물건 등록과 공개 목록 실시간 조회 기반
- 사진 업로드·카메라 촬영·미리보기·자동 축소 및 Firestore 저장
- 로그인 계정 역할에 따른 학생·교사·최종 관리자 메뉴 구분

Firebase 프로젝트 `school-findit`에는 서울 리전 Firestore 데이터베이스가
생성되어 있으며 삭제 보호가 적용되어 있습니다. 학교 도메인 또는 허용 계정
설정이 끝나기 전에는 보안 규칙이 데이터 접근을 차단합니다.

현재는 여러 역할 시험을 위해 이메일이 확인된 Gmail 계정을 임시 허용합니다.
최초 지정 계정은 최종 관리자로, 나머지 새 계정은 학생으로 생성됩니다. 학교
도메인이 확정되면 Gmail 임시 허용 규칙을 학교 계정 정책으로 교체해야 합니다.

아직 실제 운영 기능으로 연결되지 않은 항목도 있습니다.

- 이용량 증가 시 사진을 전용 객체 저장소로 이전
- 찾기 단서 작성·수정·삭제
- 교사 인증코드와 역할 변경
- 교사의 습득물 인수·반환 처리
- 실제 알림 생성과 읽음 처리
- 관리자 화면과 신고·숨김·삭제 기록
- 도움 포인트 거래의 서버 검증과 Firestore 영구 저장

따라서 현재 상태를 완성된 학교 운영 버전으로 배포하지 않습니다.

## 사용 기술

- Next.js / Vinext
- React, TypeScript
- Tailwind CSS
- Shadcn 계열 UI 컴포넌트
- Firebase Authentication
- Cloud Firestore
- Cloud Firestore 압축 사진 저장(소규모 시험 운영용)
- pnpm

## 로컬 실행

필요 환경:

- Node.js 22.13 이상
- pnpm 11.25

의존성을 설치하고 개발 서버를 실행합니다.

```bash
corepack pnpm install
corepack pnpm dev
```

기본 개발 주소는 `http://localhost:5173`입니다.

## Firebase 설정

1. `.env.example`을 복사해 `.env.local`을 만듭니다.
2. Firebase 콘솔의 웹 앱 설정값을 입력합니다.
3. 임시 허용 계정 또는 학교 Google Workspace 도메인을 설정합니다.
4. Authentication에서 Google 로그인 제공자를 활성화합니다.
5. Firestore 보안 규칙을 배포합니다.

필요한 환경변수:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_SCHOOL_EMAIL_DOMAIN=
```

Firebase 웹 앱 설정값은 클라이언트 식별 정보입니다. 서비스 계정 비공개 키,
Google 계정 비밀번호와 교사 인증코드는 저장소에 올리지 않습니다.
`.env.local`은 Git에서 제외됩니다.

Firestore 규칙과 인덱스를 배포하려면 다음 명령을 사용합니다.

```bash
corepack pnpm firebase deploy --only firestore:rules,firestore:indexes
```

현재 사진은 결제수단 없이 시험할 수 있도록 브라우저에서 긴 변 1,000px 이하의
JPEG로 축소하고 Firestore 물건 문서에 저장합니다. 이미지 문자열은 450,000자
이하로 제한합니다. 이용량이 늘면 목록 읽기 비용과 속도에 불리하므로 전용 객체
저장소로 이전해야 합니다.

## Vercel 배포

Vinext 앱은 Vercel에서 정적 웹앱으로 빌드합니다. `vercel.json`에 빌드 명령과
`dist/client` 출력 경로가 포함되어 있습니다. Vercel 프로젝트의 Environment
Variables에 위 Firebase 환경변수를 Production, Preview, Development 환경별로
등록해야 합니다. 로컬 `.env.local` 파일은 보안을 위해 GitHub에 올리지 않습니다.

## 검사 명령

변경 후 아래 검사를 실행합니다.

```bash
corepack pnpm lint
corepack pnpm exec tsc --noEmit
corepack pnpm build
```

## 개인정보와 보안 원칙

- 학교에서 허용한 Google 계정만 접근할 수 있어야 합니다.
- 작성자의 실명과 이메일을 다른 학생에게 공개하지 않습니다.
- 얼굴, 이름표, 학생증 정보와 전화번호가 보이는 사진은 올리지 않습니다.
- 학생이 등록한 습득물은 교사가 실제로 인수하기 전까지 공개하지 않습니다.
- 권한 변경, 숨김과 삭제 같은 관리 작업은 서버에서도 검증하고 기록합니다.
- 인증정보와 비공개 키는 소스나 Git 커밋에 포함하지 않습니다.

## 저장소

GitHub: https://github.com/apodeix/school-findit

자세한 기능 범위와 개발 원칙은 `AGENTS.md`에서 확인할 수 있습니다.
