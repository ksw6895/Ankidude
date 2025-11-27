# 📝 최종 구현 계획서: Ankidude 확장 (PDF 필기 노트 + 독립 파이프라인)

## 1\. 개요

**"슬라이드 + 오디오 → Anki CSV"** 기능에 더해, **"슬라이드 우측에 강의 내용을 정리한 PDF 노트 생성"** 기능을 추가한다.
사용자는 파일 업로드 시 **Anki 카드 생성**과 **PDF 필기 노트 생성**을 각각 또는 동시에 선택할 수 있으며, 두 작업은 독립적인 LLM 프로세스를 거친다.

## 2\. 기술 스택 및 라이브러리 업데이트

  * **Backend:** Python, FastAPI, Celery, Redis
  * **PDF Manipulation:** **`pymupdf` (PyMuPDF)** - *신규 추가*
  * **AI:** Gemini 1.5 Pro/Flash (Google GenAI SDK) - *독립 호출*
  * **STT:** ElevenLabs Scribe v1 - *1회 호출 후 결과 공유*
  * **Frontend:** Next.js (App Router), Tailwind CSS, Lucide React

### 📦 의존성 추가 (`backend/requirements.txt`)

```text
pymupdf>=1.23.0  # 고성능 PDF 조작 (페이지 확장 및 텍스트 삽입)
```

-----

## 3\. 백엔드 아키텍처 및 데이터 흐름

### 3.1 파이프라인 구조 (`backend/app/services/pipeline.py`)

기존의 단일 선형 구조를 **"공통 전처리 -\> 분기 처리"** 구조로 변경합니다.

#### 단계 1: 공통 전처리 (STT & Parsing)

1.  **PDF 파싱:** `pdf_parser`를 통해 슬라이드 텍스트 및 페이지 정보 추출.
2.  **STT (오디오 존재 시):**
      * **ElevenLabs Scribe v1**을 **단 1회** 호출.
      * 결과물(`transcript`)을 변수에 저장하여 이후 단계인 Anki 생성과 Note 생성 양쪽에 넘겨준다. (중복 호출 방지)

#### 단계 2: Anki 카드 생성 (선택 시)

  * **Gemini 호출 A:** `generate_anki_cards(slides, transcript)`
  * **프롬프트 A:** 기존 로직 유지 (시험 대비용 Q\&A, 25\~50개 내외).
  * **결과:** `LectureCardsOutput` (Pydantic) -\> CSV 변환 -\> S3 저장.

#### 단계 3: PDF 필기 노트 생성 (선택 시)

  * **Gemini 호출 B:** `generate_lecture_notes(slides, transcript)`
  * **프롬프트 B:**
      * "강의 스크립트와 슬라이드를 매칭하여 설명형 노트를 작성하라."
      * **제약:** "각 페이지당 내용은 **500자**를 넘지 않도록 요약 및 정리할 것." (레이아웃 보존)
      * **형식:** Markdown (헤더, 불릿 포인트, 볼드체 활용).
      * **출력 스키마:** `List[PageNote(page_number, content)]`
  * **PDF 생성:** PyMuPDF를 사용하여 원본 PDF 변형 및 저장 (상세 로직은 4번 항목 참조).

-----

## 4\. PDF 생성 로직 (PyMuPDF) - `backend/app/services/pdf_note_service.py`

### 4.1 페이지 확장 전략 (30% Rule)

  * 원본 PDF의 `MediaBox` (페이지 크기)를 수정한다.
  * **너비 계산:** `New Width = Original Width * 1.3` (오른쪽에 \*\*30%\*\*의 여백 공간 추가).
  * 기존 콘텐츠는 좌측에 유지하고, 늘어난 우측 30% 영역을 필기 공간으로 활용한다.

### 4.2 텍스트 렌더링

  * **영역 정의:** 우측 30% 영역에 `Rect`를 정의.
  * **폰트:** 가독성 좋은 산세리프 폰트(Noto Sans KR 등) 임베딩 권장.
  * **내용 삽입:** Gemini가 반환한 `PageNote.content` (Markdown 텍스트)를 파싱하여 해당 `Rect` 안에 `insert_textbox`로 삽입.
  * **오버플로우 처리:** 500자 제한을 두었으나, 만약 넘칠 경우 폰트 크기를 약간 줄이거나(min 8pt), 말줄임 처리.

-----

## 5\. 프론트엔드 가이드 (`frontend/`)

### 5.1 홈 화면 (`app/page.tsx`)

  * **옵션 선택 UI:** 파일 업로드 존 하단에 체크박스 그룹 추가.
      * `[v] Anki Flashcards` (기본 체크)
      * `[v] PDF Lecture Notes` (오디오 업로드 시 활성화)

### 5.2 작업 상태 페이지 (`app/jobs/[id]/page.tsx`) - **"Roadmap UI"**

단순한 텍스트 상태 표시 대신, 사용자가 전체 과정을 시각적으로 인지하여 지루함을 덜 느끼도록 **타임라인/로드맵 UI**를 구현합니다.

#### 시각화 디자인 (Status Roadmap)

진행 중인 단계는 `Pulse` 애니메이션, 완료된 단계는 `Check` 아이콘, 대기 중인 단계는 회색으로 표시합니다.

1.  **Start:** 업로드 완료
2.  **Processing Audio:** ElevenLabs STT (공통)
3.  **Generating Anki:** Gemini (Anki Prompt) → CSV
4.  **Writing Notes:** Gemini (Note Prompt) → PDF Editing
5.  **Finish:** 완료

*(사용자가 선택하지 않은 옵션은 로드맵에서 "Skipped"로 표시하거나 숨김)*

#### 결과 다운로드 (개별 버튼)

작업이 완료(`DONE`)되면 두 개의 분리된 카드/버튼을 제공합니다.

  * **[ 🗃️ Anki CSV 다운로드 ]**
      * *생성된 카드 n개*
  * **[ 📄 강의 노트 PDF 다운로드 ]**
      * *필기 완료된 PDF*

-----

## 6\. DB 및 API 스키마 변경

### DB (`Lecture` 테이블)

  * `status` (기존 유지, 전체 진행상황 표시용)
  * **`note_pdf_url`** (Column 추가): 생성된 PDF 노트의 S3 경로. `NULL`이면 생성 안 됨.

### API 응답 (`LectureStatusResponse`)

```python
class LectureStatusResponse(BaseModel):
    # ... 기존 필드 ...
    note_pdf_url: Optional[str] = None # PDF 다운로드 링크
    # 프론트엔드 로드맵 표시를 위한 상세 진행 상황 (선택적)
    current_step: Optional[str] = None # 예: "STT", "ANKI_GEN", "NOTE_GEN"
```

-----

## 7\. 작업 지시 순서 (Agent Action Plan)

1.  **Backend Setup:**

      * `requirements.txt`에 `pymupdf` 추가.
      * `app/schemas/gemini_cards.py`에 `PageNote` 스키마 추가.
      * `Lecture` 모델에 `note_pdf_url` 컬럼 추가 (Alembic 혹은 DB 재생성).

2.  **Service Implementation:**

      * `app/services/pdf_note_service.py` 구현 (30% 확장 및 텍스트 삽입 로직).
      * `app/clients/gemini.py`에 `generate_lecture_notes` 메서드 추가 (별도 프롬프트).

3.  **Pipeline Integration:**

      * `app/services/pipeline.py` 로직 개편:
          * STT 1회 수행.
          * 옵션에 따라 Gemini 호출 분기 (순차적 처리 권장: STT -\> Anki -\> Note).
          * 중간중간 `status` 업데이트로 프론트엔드에 진행 상황 알림.

4.  **Frontend Implementation:**

      * 홈 화면: 옵션 체크박스 추가 및 API 연동.
      * 상태 화면: `StatusStepper`를 `JobRoadmap` 컴포넌트로 교체하여 세부 진행 과정 시각화.
      * 완료 화면: CSV와 PDF 다운로드 버튼 분리 UI 구현.
