# 건축물관리용품 요청·정산 시스템
**동양미래대학교 사무처 시설관리팀**

---

## 📋 서비스 개요

| 항목 | 내용 |
|------|------|
| 요청자 페이지 | `/request` — 로그인 불필요, 누구나 접근 |
| 관리자 페이지 | `/admin` — Supabase Auth 이메일+비밀번호 로그인 |
| 배포 플랫폼 | Vercel |
| 데이터베이스 | Supabase (PostgreSQL) |
| 파일 저장 | Supabase Storage |

---

## 🚀 초기 셋업 순서

### 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성
2. **SQL Editor**에서 `supabase-schema.sql` 파일 전체 실행
3. **Storage** 탭에서 버킷 3개 생성 (모두 Public):
   - `request-photos` (요청자 첨부 사진)
   - `delivery-photos` (납품완료 사진)
   - `receipt-photos` (영수증 사진)
4. **Authentication > Users**에서 관리자 계정 생성:
   - 이메일: 관리자 이메일 입력
   - 비밀번호: 초기 비밀번호 설정

### 2. 환경변수 설정

`.env.local` 파일을 열어 아래 값을 입력:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Supabase 대시보드 → **Project Settings > API**에서 확인 가능.

### 3. Vercel 배포

```bash
# GitHub에 올린 후 Vercel에서 Import
# 또는 Vercel CLI 사용:
npx vercel

# 환경변수는 Vercel 대시보드 > Settings > Environment Variables에 동일하게 입력
```

**Vercel 환경변수 등록 항목:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 🔐 계정 관리

### 관리자 비밀번호 변경
1. `/admin` 로그인 → **설정 탭** → 비밀번호 변경
2. 또는 Supabase 대시보드 → Authentication → Users → 해당 계정 → Reset Password

### 관리자 계정 위치
- Supabase 대시보드 → Authentication → Users

---

## 🔄 Vercel 재배포 방법

### GitHub 연동 시 (자동)
- `main` 브랜치에 push하면 자동 재배포

### 수동 재배포
```bash
# 프로젝트 폴더에서
npx vercel --prod
```

또는 Vercel 대시보드 → Deployments → **Redeploy**

---

## 📁 프로젝트 구조

```
src/
├── app/
│   ├── request/          # 요청자 페이지 (/request)
│   ├── admin/
│   │   ├── login/        # 관리자 로그인
│   │   └── page.tsx      # 관리자 대시보드
│   └── api/
│       ├── requests/     # 요청 CRUD
│       ├── upload/       # 파일 업로드
│       ├── categories/   # 카테고리 관리
│       ├── vendors/      # 거래처 관리
│       ├── settings/     # 설정 관리
│       ├── admin/
│       │   ├── requests/ # 관리자용 요청 처리
│       │   └── stats/    # 대시보드 통계
│       └── excel/
│           ├── delivery/ # 납품완료 사진 엑셀
│           ├── receipt/  # 영수증 사진 엑셀
│           ├── monthly/  # 월별 정산 엑셀
│           └── all/      # 전체 이력 엑셀
├── components/
│   ├── AdminHeader.tsx
│   └── RequestDetailPanel.tsx
├── lib/supabase/         # Supabase 클라이언트
└── types/                # TypeScript 타입 정의
```

---

## 📊 주요 기능

### 요청자 페이지 (`/request`)
- 물품 요청 폼 (카테고리 칩 선택, 자동완성, 사진 첨부)
- 접수번호 자동 채번 (형식: `YY-MM-카테고리코드-NNN`)
- 접수번호로 처리 현황 조회

### 관리자 페이지 (`/admin`)
- **요청 목록**: 필터, 체크박스 일괄처리, 긴급 상단고정
- **처리 패널**: 상태 변경, 구입 정보 입력, 반려 처리
- **정산 처리**: 납품/영수증 사진 업로드, 엑셀 자동 생성
- **월별 정산**: 카테고리별 집계, 엑셀 3시트 내보내기
- **설정**: 비밀번호 변경, 카테고리/거래처 관리, 인수인계 메모

---

## ⚠️ 주의사항

- `.env.local` 파일은 절대 GitHub에 올리지 마세요 (`.gitignore`에 포함됨)
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 키입니다 — 클라이언트에 노출 금지
- Storage 버킷은 **Public**으로 설정해야 사진 URL이 정상 작동합니다

---

## 🛠️ 로컬 개발

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

개발 서버: http://localhost:3000

---

*최초 작성: 2025년 5월 | 동양미래대학교 사무처 시설관리팀*
