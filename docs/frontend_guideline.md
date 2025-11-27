# Ankidude Frontend Revamp Guideline (UI/UX 중심)

> **목표:** 백엔드(`Ankidude v1` 로직) 변경 없이, 프론트엔드의 심미성과 사용자 경험(UX)을 극대화하여 "단순 도구"가 아닌 "완성된 제품"으로 업그레이드한다.

---

## 1. 디자인 철학 (Design Philosophy)

**"Medical Clarity met Modern Tech"**
의대생 및 학습자가 주 타깃이므로, **신뢰감(Trust)**과 **집중(Focus)**을 최우선으로 한다.

1.  **Visual Concept**: **Clean & Cognitive-Ease**
    * 기존의 단순한 그라디언트 배경 대신, **Glassmorphism(유리 질감)**과 **Bento Grid(도시락 격자 레이아웃)** 스타일을 도입하여 현대적이고 정돈된 느낌을 준다.
    * **Color Palette**:
        * Primary: `Deep Teal` (#0F766E) - 신뢰와 의학을 상징, 기존 색상을 계승하되 더 깊이감 있게.
        * Secondary: `Soft Slate` (#64748B) - 눈이 편안한 텍스트 및 보조 색상.
        * Background: `Off-White` / `Subtle Gray` - 완전한 흰색보다 눈의 피로를 줄이는 미색 배경.
    * **Typography**:
        * Headings: 가독성이 높고 모던한 산세리프 (예: `Pretendard` 또는 `Inter`).
        * Numbers/Code: `Space Grotesk` (기존 유지, 포인트로 사용).

2.  **Interaction Principle**: **Predictable & Feedback-Rich**
    * 사용자의 모든 행동(업로드, 클릭 등)에 즉각적인 시각적 피드백을 제공한다.
    * "기다림"을 "진행 상황 확인"의 경험으로 전환한다.

---

## 2. 기술 스택 업그레이드 (Tech Stack)

기존 `Next.js` + `CSS Modules` 구조를 유지하되, 생산성과 디자인 품질을 위해 다음 라이브러리를 도입한다.

* **Styling**: **Tailwind CSS** (빠른 스타일링, 일관된 디자인 시스템)
* **Component System**: **Shadcn/UI** (Radix UI 기반, 접근성이 뛰어나고 커스터마이징이 용이한 고품질 컴포넌트)
* **Motion**: **Framer Motion** (부드러운 페이지 전환, 카드 뒤집기 애니메이션, 로딩 바)
* **Icons**: **Lucide React** (깔끔하고 통일된 아이콘 셋)
* **Data Handling**: **Zustand** (클라이언트 상태 관리 - 업로드 진행률, 미리보기 데이터 관리)
* **CSV Parsing**: **Papaparse** (백엔드 수정 없이 클라이언트에서 CSV 미리보기/수정 기능 구현용)

---

## 3. 핵심 UX 개선 시나리오

백엔드 API(`POST /lectures`, `GET /lectures/{id}`, `GET /csv`)는 그대로 사용하되, 프론트엔드에서 데이터를 처리하는 방식을 고도화한다.

### 3.1 [Landing Page] 신뢰를 주는 첫인상
* **기존**: 단순한 폼 하나.
* **개선**:
    * **Hero Section**: "강의 녹음만 올리세요. 나머지는 AI가 합니다."라는 강렬한 카피와 함께, 실제 변환되는 과정을 보여주는 15초 루프 데모 영상/애니메이션 배치.
    * **Social Proof / Feature Grid**: "STT 정확도 99%", "의학 용어 자동 보정", "Anki 즉시 호환" 등의 기능을 아이콘과 함께 그리드 형태로 배치.
    * **Sticky CTA**: 스크롤을 내려도 언제든 "시작하기" 버튼 접근 가능.

### 3.2 [Upload UX] 똑똑한 입력 과정
* **Drag & Drop Zone**: `react-dropzone`을 활용하여 파일 탐색기를 열지 않고도 파일을 놓을 수 있게 한다.
    * 파일이 올라가면 아이콘이 변경되고, 파일 크기와 형식을 즉시 검증(Validation)한다.
* **Multi-step Form**:
    * 1단계: 파일 업로드 (PDF, Audio)
    * 2단계: 메타데이터 입력 (과목명, 교수명 - 선택 사항임을 명확히 표시)
    * 이유: 한 번에 너무 많은 입력을 요구하지 않아 인지 부하를 줄인다.

### 3.3 [Processing UX] 지루하지 않은 대기 시간
* **Visual Stepper**: 단순히 텍스트(`RUNNING_STT`)만 보여주는 것이 아니라, **진행 단계 바(Stepper)**를 보여준다.
    * `대기 중` -> `음성 분석 중(STT)` -> `학습 자료 분석 중(LLM)` -> `카드 제작 중` -> `완료`
    * 각 단계마다 관련 아이콘이 반짝이거나(Pulse), 재미있는 문구("교수님의 농담을 걸러내는 중...", "의학 용어 사전 찾는 중...")를 랜덤하게 노출.
* **Estimated Time**: 파일 크기에 따라 대략적인 남은 시간을 계산해 보여준다(예: "약 3분 소요 예상").

### 3.4 [Result UX] **(핵심 차별화 포인트)**: Web Preview & Editor
백엔드는 CSV 파일만 주지만, 프론트엔드에서 이를 시각화하여 **"다운로드 전 검토"** 경험을 제공한다.

1.  **Browser-side CSV Parsing**:
    * `GET /csv`로 받은 데이터를 클라이언트 브라우저에서 파싱한다.
2.  **Card Preview Interface**:
    * 생성된 카드를 실제 Anki처럼 **앞면/뒷면 뒤집기(Flip)** 애니메이션으로 미리 보여준다.
    * 사용자가 웹상에서 카드를 넘겨보며 품질을 확인할 수 있게 한다.
3.  **Quick Edit Mode**:
    * 오타나 마음에 들지 않는 표현을 **웹에서 바로 수정**할 수 있게 한다.
    * 특정 카드를 **제외(Delete)**할 수 있게 한다.
4.  **Final Export**:
    * 수정된 내용을 바탕으로 브라우저에서 새로운 CSV를 생성하여 다운로드시킨다. (백엔드 저장소는 건드리지 않음)

### 3.5 [History UX] 로컬 기록 보관
* 로그인 기능이 없으므로, `LocalStorage`를 활용하여 사용자가 생성한 최근 10개의 Job ID를 저장한다.
* 메인 페이지 하단이나 사이드바에 "최근 작업 목록"을 보여주어, 브라우저를 닫았다 열어도 결과를 다시 다운로드할 수 있게 한다.

---

## 4. 페이지별 구현 가이드 (Implementation Detail)

### 4.1 Layout (`layout.tsx`, `globals.css`)
* **Global Navigation Bar (GNB)**: 로고(Ankidude), 최근 기록 팝오버, GitHub 링크.
* **Background**: 은은한 Mesh Gradient 애니메이션을 배경에 깔아 고급스러움을 더함.
* **Toast Provider**: 에러 발생, 업로드 완료, 클립보드 복사 등의 알림을 위한 Toast UI 설정.

### 4.2 Home Page (`page.tsx`)
* **Hero**: 타이포그래피 중심의 강렬한 헤드카피.
* **Upload Widget**:
    * Shadcn `Card`, `Input`, `Button` 컴포넌트 활용.
    * 파일 선택 시 파일명, 용량, 아이콘 표시.
    * "생성하기" 버튼 클릭 시 로딩 스피너와 함께 버튼 비활성화 (이중 제출 방지).

### 4.3 Job Status Page (`jobs/[id]/page.tsx`)
* **Polling Logic 유지**: 기존 `useInterval` 훅 로직은 유지하되, UI만 교체.
* **State Mapping**:
    * `PENDING` -> "작업 대기열 등록 중..."
    * `RUNNING_STT` -> "ElevenLabs가 음성을 텍스트로 변환하고 있습니다..." (파형 애니메이션 표시)
    * `RUNNING_LLM` -> "Gemini 3 Pro가 슬라이드와 녹취를 대조 분석합니다..." (뇌/칩 아이콘 애니메이션)
    * `GENERATING_CSV` -> "Anki 카드를 포장하고 있습니다..."
* **Completion View (DONE)**:
    * "다운로드" 버튼만 덜렁 있는 것이 아니라, **"생성 결과 리포트"** 대시보드를 보여줌.
    * 상단: 총 카드 수, 소요 시간, 태그 요약.
    * 중단: **[Card Previewer 컴포넌트]** (슬라이더 형태).
    * 하단: "CSV 다운로드 (수정사항 포함)" 버튼.

---

## 5. 실행 계획 (Action Plan)

이 순서대로 개발을 진행하면 백엔드 영향 없이 프론트엔드를 혁신할 수 있습니다.

1.  **프로젝트 세팅 (Environment Setup)**
    * `npm install tailwindcss postcss autoprefixer`
    * `npx shadcn-ui@latest init` (기본 설정)
    * 필요 컴포넌트 설치: `button`, `card`, `input`, `progress`, `toast`, `dialog`, `tabs`.

2.  **컴포넌트 개발 (Atomic Components)**
    * `FileUploadZone.tsx`: 드래그 앤 드롭 및 파일 유효성 검사.
    * `StatusStepper.tsx`: Job 상태에 따른 시각적 단계 표시기.
    * `CardPreview.tsx`: Front/Back 텍스트를 받아 뒤집히는 애니메이션 카드.

3.  **페이지 리뉴얼 (Page Implementation)**
    * `app/page.tsx`를 랜딩 페이지 + 업로드 위젯 통합 형태로 재작성.
    * `app/jobs/[id]/page.tsx`를 대시보드 형태로 재작성.

4.  **클라이언트 로직 고도화 (Client Logic)**
    * `jobs/[id]` 페이지에서 `status === DONE`일 때, `download_url`의 내용을 `fetch`로 가져와 텍스트 상태로 저장.
    * `papaparse`로 파싱 후 `CardPreview` 컴포넌트에 주입.
    * 수정된 데이터를 다시 CSV 포맷(세미콜론 구분)으로 변환하는 유틸리티 함수 작성.

5.  **폴리싱 (Polishing)**
    * 모바일 반응형 확인 (모바일에서도 카드 뒤집기 확인 가능하게).
    * 로딩 애니메이션, 트랜지션 부드럽게 조정.
    * 에러 케이스(파일 너무 큼, API 실패)에 대한 친절한 Toast 메시지 처리.
