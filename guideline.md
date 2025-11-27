# Anki CSV 자동 생성기 – 시스템 설계 & 구현 가이드라인 (for Coding Agent)

> 이 문서는 **강의 녹음 + 슬라이드 PDF → Anki Basic CSV**를 자동으로 생성하는 웹 서비스를  
> 고성능 코딩 에이전트가 _끝까지 구현·배포_ 할 수 있도록 하는 실행 지침이다.

---

## 0. 프로젝트 개요

### 0.1 목표

의대 강의 환경(슬라이드 + 교수 발화)을 전제로, 다음을 만족하는 시스템을 구현한다.

- 입력:
  - 강의 **오디오 파일** (mp3, m4a, wav 등, ~1시간 내외)
  - 강의 **슬라이드 PDF** (보통 PowerPoint export)
- 처리:
  - **ElevenLabs STT**로 고정밀 transcript 생성  
    - 기본 배치 STT: **Scribe v1**, `POST /v1/speech-to-text` 사용 :contentReference[oaicite:0]{index=0}  
    - 향후 필요시 실시간/스트리밍 STT: **Scribe v2 Realtime (ScribeRealtime v2)**로 확장 가능 :contentReference[oaicite:1]{index=1}
  - **Gemini 3 Pro Preview** (`gemini-3-pro-preview`, 기본)로
    - STT 결과를 슬라이드 텍스트 기준으로 **교정**
    - **Anki Basic 카드(front/back)**를 생성
    - 속도/비용을 우선하면 `GEMINI_MODEL_ID=gemini-2.5-flash` 등으로 교체 가능
- 출력:
  - **UTF-8 CSV 텍스트 파일**
  - 컬럼: `Front;Back;Tags` (세미콜론 구분)
  - 상단 메타 헤더를 통해 Anki에서 바로 import 가능하게 할 것 :contentReference[oaicite:2]{index=2}

### 0.2 비즈니스/사용자 관점 요구사항

- 의대 강의 1시간 기준:
  - **사용자 동작**: 파일 2개 업로드 + 버튼 1회 클릭 정도로 제한
  - **결과물**: 시험 대비에 실제로 도움이 되는 **30–60장 수준의 고품질 카드**
- 시스템은 “멋있어 보이는 AI 데모”가 아니라, 다음 기준을 최우선으로 한다.
  - 시간 절약: “손으로 만들면 1–2시간 걸릴 일”을 **수 분 내**에 끝내게 할 것
  - 안정성: 실패할 바에야 “줄여서라도 완성된 CSV”를 제공하는 쪽을 택함
  - 해석 가능성: LLM이 만든 카드가 **읽었을 때 납득 가능**해야 함 (환각 최소화)

---

## 1. 기술 스택 및 외부 서비스

### 1.1 LLM – Gemini 3 Pro Preview (기본, structured output)

- 기본 모델: **`gemini-3-pro-preview`** (google-genai SDK structured output)  
- 특징:
  - **텍스트 + 코드 + 이미지 + 오디오 + 비디오 + PDF** 입력 지원 (멀티모달) :contentReference[oaicite:4]{index=4}
  - 최대 **1M 토큰 입력 / 64k 토큰 출력** 컨텍스트 윈도우로,  
    강의 transcript + 전체 슬라이드를 한 번에 처리 가능
  - 고난도 추론과 긴 문맥 이해에 최적화되어 카드 품질을 우선 보장
- 속도/비용 옵션:
  - 비용·지연을 줄이고 싶으면 `GEMINI_MODEL_ID=gemini-2.5-flash` 등으로 환경변수만 교체

> **규칙:**  
> - LLM 관련 모든 기능은 **환경 변수로 주입된 단일 모델**을 사용한다.  
> - 기본값은 `gemini-3-pro-preview`, 필요 시 `GEMINI_MODEL_ID`로 오버라이드한다.

### 1.2 STT – ElevenLabs Speech-to-Text

#### 1.2.1 배치 STT: Scribe v1 (기본)

- 엔드포인트: `POST https://api.elevenlabs.io/v1/speech-to-text` :contentReference[oaicite:7]{index=7}
- 모델:
  - `model_id=scribe_v1`
- 특징:  
  - 99개 언어 지원, 다화자, word-level timestamp, diarization, audio event 태깅 지원 :contentReference[oaicite:8]{index=8}
  - 회의, 팟캐스트 등 **사전 녹음된 파일**을 위한 고정밀 STT에 최적화
- 가격 (Developer API) – 시간당 과금, 플랜별 **대략 $0.22–0.4 / hour** 수준 :contentReference[oaicite:9]{index=9}

> **디폴트 선택:**  
> - 본 프로젝트는 **사전 녹음된 강의 파일**을 대상으로 하므로,  
>   단순하고 안정적인 `scribe_v1` 배치 STT를 **기본으로 사용**한다.  
> - 아키텍처는 나중에 `Scribe v2 Realtime`로 교체 가능하도록 STT 영역을 인터페이스화한다.

#### 1.2.2 실시간 STT: Scribe v2 Realtime (옵션/확장)

- 용도:
  - 추후 “실시간 강의 중 실시간 카드 후보 생성/메모” 등으로 확장할 때 사용
- 특징: :contentReference[oaicite:10]{index=10}
  - **Scribe v2 Realtime**: 150ms 이하 지연, 90+ 언어 지원
  - WebSocket 기반 스트리밍 API:  
    `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=...` :contentReference[oaicite:11]{index=11}
- 가격:
  - 비슷한 플랜에서 시간당 **$0.28 이하**까지도 제공하는 것으로 안내 :contentReference[oaicite:12]{index=12}

> **철학적 선택:**  
> - 현재 요구사항(녹음 후 처리)에서는 Scribe v1이 **더 단순하고 충분히 최신 및 고정밀**이다.  
> - 코드 구조만 잘 나누어 두고, 추후 실시간 기능을 원할 때 Scribe v2 Realtime 브랜치를 추가하는 형태를 권장한다.

### 1.3 인프라 & 배포

- **백엔드 (API + Worker)**: Render
- **프론트엔드 (웹 UI)**: Vercel + Next.js

#### 1.3.1 Render (FastAPI + Worker + DB/Queue)

- Render는 FastAPI 앱을 **웹 서비스**, **백그라운드 워커**, **Cron** 등으로 나누어 배포할 수 있다. :contentReference[oaicite:13]{index=13}  
- 권장 구성:
  - Web Service: FastAPI (Gunicorn/Uvicorn) – `/api/...` HTTP 처리
  - Background Worker: Celery/RQ Worker – STT/LLM 등 장시간 Job 처리
  - PostgreSQL: Render PostgreSQL 인스턴스
  - Redis: Render Redis 또는 Key-Value 서비스

#### 1.3.2 Vercel (Next.js 프론트엔드)

- Vercel은 Next.js의 “공식” 호스팅 플랫폼이며, Git 연동 및 CI/CD가 기본 제공된다. :contentReference[oaicite:14]{index=14}  
- 권장 구성:
  - Next.js (Pages Router 또는 App Router 중 택1)
  - Pages:
    - `/` – 메인 업로드/설명 페이지
    - `/jobs/[id]` – Job 상태 및 결과 다운로드 페이지

---

## 2. 시스템 전반 아키텍처

### 2.1 컴포넌트 요약

1. **Frontend (Next.js on Vercel)**
   - 파일 업로드 UI (슬라이드 PDF + 오디오)
   - Job 생성 요청 전송
   - Job 상태 폴링 및 결과 다운로드 링크 제공

2. **Backend API (FastAPI on Render – Web Service)**
   - 인증(초기엔 생략 가능), 입력 검증
   - 업로드된 파일을 Object Storage(S3 호환)에 저장
   - Job 메타데이터를 DB에 기록
   - Worker에게 작업 큐 삽입

3. **Worker (Celery/RQ on Render – Background Worker)**
   - Job 큐에서 작업을 가져와 순차 처리:
     1. ElevenLabs STT 호출
     2. PDF 파싱
     3. Gemini 2.5 Flash Structured Output 프롬프트 구성/호출
     4. LLM 출력 검증/정제
     5. CSV 생성 및 Object Storage에 저장
   - Job 상태를 DB에 업데이트

4. **Storage (S3 호환)**
   - 원본 파일 (audio, pdf)
   - 중간 결과 (raw transcript, parsed slides)
   - 최종 결과 (CSV)

5. **Database (PostgreSQL)**
   - 사용자 계정(선택)
   - Lecture / Job 메타 정보
   - STT/LLM 로그 (필요 시)

### 2.2 데이터 플로우 (요약)

1. 사용자가 PDF + 오디오 업로드 → `POST /api/lectures`
2. API 서버가 파일을 S3에 저장하고, Job 레코드 생성 (`status=PENDING`)
3. Worker가 Job을 가져와:
   - `status=RUNNING_STT` → ElevenLabs STT 호출, transcript 저장
   - `status=RUNNING_LLM` → Gemini 2.5 Flash에 슬라이드 + transcript를 전달, 카드 JSON 생성
   - `status=GENERATING_CSV` → 카드 JSON → CSV 텍스트 파일 생성, S3에 저장
   - 완료 시 `status=DONE`, 카드 수, CSV URL 기록
4. 프론트엔드는 `/api/lectures/{id}`를 주기적으로 조회하여 상태 표시
5. `status=DONE`일 때 다운로드 링크 노출, CSV 다운로드

---

## 3. API 설계 (백엔드)

### 3.1 주요 엔드포인트

#### 3.1.1 강의 생성 (업로드)

- `POST /api/lectures`
- 요청 (multipart/form-data):
  - `slides_pdf`: PDF 파일 (필수)
  - `audio_file`: 오디오 파일 (필수)
  - `title`: 문자열 (선택)
  - `subject`: 문자열 (선택)
  - `professor`: 문자열 (선택)
- 응답 (JSON):

```json
{
  "job_id": "uuid",
  "status": "PENDING"
}
````

#### 3.1.2 Job 상태 조회

* `GET /api/lectures/{job_id}`
* 응답 예시:

```json
{
  "job_id": "uuid",
  "status": "RUNNING_LLM",
  "created_at": "2025-11-25T12:34:56Z",
  "updated_at": "2025-11-25T12:40:10Z",
  "card_count": null,
  "download_url": null,
  "error_message": null
}
```

* 완료 시:

```json
{
  "job_id": "uuid",
  "status": "DONE",
  "card_count": 47,
  "download_url": "https://storage.example.com/exports/uuid.csv",
  "error_message": null
}
```

#### 3.1.3 CSV 다운로드

* `GET /api/lectures/{job_id}/csv`
* 동작:

  * DB에서 job 조회 → S3에서 CSV 파일 스트림 가져오기
  * 헤더:

    * `Content-Type: text/csv; charset=utf-8`
    * `Content-Disposition: attachment; filename="lecture-{job_id}.csv"`

---

## 4. DB 스키마 (초안)

### 4.1 lectures 테이블

| 필드명           | 타입        | 설명                                                                               |
| ------------- | --------- | -------------------------------------------------------------------------------- |
| id            | UUID (PK) | Job ID                                                                           |
| title         | text      | 강의 제목                                                                            |
| subject       | text      | 과목명                                                                              |
| professor     | text      | 교수명                                                                              |
| slides_url    | text      | S3 상의 PDF URL                                                                    |
| audio_url     | text      | S3 상의 오디오 URL                                                                    |
| status        | text      | `PENDING` / `RUNNING_STT` / `RUNNING_LLM` / `GENERATING_CSV` / `DONE` / `FAILED` |
| card_count    | int       | 생성된 카드 수                                                                         |
| csv_url       | text      | S3 상의 CSV URL                                                                    |
| error_message | text      | 실패 시 오류 메시지                                                                      |
| created_at    | timestamp | 생성 시각                                                                            |
| updated_at    | timestamp | 마지막 업데이트 시각                                                                      |

### 4.2 transcripts (선택, 분리 시)

| 필드명          | 타입        | 설명                  |
| ------------ | --------- | ------------------- |
| id           | UUID (PK) |                     |
| lecture_id   | UUID (FK) | lectures.id         |
| raw_text     | text      | STT 원문              |
| cleaned_text | text      | LLM 교정 후 transcript |
| words_json   | jsonb     | word-level 정보 (선택)  |

### 4.3 cards (선택, DB에 저장할 경우)

| 필드명        | 타입        | 설명     |
| ---------- | --------- | ------ |
| id         | UUID (PK) |        |
| lecture_id | UUID (FK) |        |
| front      | text      | 카드 앞면  |
| back       | text      | 카드 뒷면  |
| tag        | text      | 태그 문자열 |

> 초기 버전에서는 단순화를 위해
> **카드를 DB에 저장하지 않고, CSV 파일만 결과로 유지**하는 것도 가능하다.
> (향후 웹에서 카드 편집/삭제 기능을 붙이려면 DB 저장 구조가 필요해진다.)

---

## 5. STT 처리 (ElevenLabs)

### 5.1 Scribe v1 배치 STT 호출 규약

* 엔드포인트:
  `POST https://api.elevenlabs.io/v1/speech-to-text` ([ElevenLabs][1])
* 인증:

  * HTTP 헤더 `xi-api-key: <ELEVENLABS_API_KEY>`
* 요청 (multipart/form-data) 필드 (대표 예시):

  * `model_id`: `"scribe_v1"`
  * `file`: 오디오 파일 바이너리
  * `language_code`: `"ko"` 또는 빈 값 (자동 감지)
  * `diarize`: `"false"` (초기엔 불필요하면 false)
  * `tag_audio_events`: `"false"`
  * `timestamps_granularity`: `"word"`
* 응답 구조(요약): ([ElevenLabs][2])

```json
{
  "language_code": "ko",
  "language_probability": 0.99,
  "text": "강의 전체 transcript ...",
  "words": [
    {
      "text": "뇌간",
      "start": 12.34,
      "end": 12.57,
      "speaker": "1"
    },
    ...
  ]
}
```

### 5.2 STT 파이프라인 처리 흐름

1. Worker에서 Job 수신 후 `status=RUNNING_STT`로 변경
2. 오디오 파일을 S3에서 가져오거나, `cloud_storage_url`을 직접 전달 (2GB까지 지원) ([ElevenLabs][3])
3. ElevenLabs API 호출
4. 성공 시:

   * `raw_transcript_text` = `text` 전체
   * 필요 시 `words` JSON도 저장
   * `status=RUNNING_LLM`로 업데이트
5. 실패 시:

   * `status=FAILED`
   * `error_message`에 상세 로그 저장

---

## 6. PDF 파싱 (슬라이드 텍스트 추출)

### 6.1 목표

* “정교한 레이아웃 재현”이 아니라,
* LLM이 이해하기 좋은 단위로 나눈 **페이지 단위 텍스트 구조**를 만든다.

### 6.2 처리 규칙

* 각 PDF 페이지 → 하나의 **슬라이드**로 간주
* 추출 항목:

  * `index`: 페이지 번호 (1-base)
  * `title`: 페이지 내 최상단/가장 큰 텍스트(없으면 첫 줄)
  * `body`: 나머지 텍스트 묶음 (줄바꿈은 어느 정도 유지)
* 예시 JSON 구조:

```json
{
  "slides": [
    {
      "index": 1,
      "title": "Decorticate & Decerebrate posture",
      "body": "Decorticate posture: ...\nDecerebrate posture: ..."
    },
    ...
  ]
}
```

* 구현 라이브러리 후보 (Python):

  * `pdfplumber`, `PyMuPDF(fitz)`, `pypdf` 등

### 6.3 LLM 입력용 직렬화 포맷

* LLM 호출 시, 텍스트 프롬프트 내에 아래와 같이 슬라이드를 구조적으로 포함시킨다.

```text
[SLIDES]

--- SLIDE 1 ---
Title: Decorticate & Decerebrate posture
Body:
Decorticate posture: ...
Decerebrate posture: ...

--- SLIDE 2 ---
Title: Causes
Body:
...

[TRANSCRIPT_RAW]

<여기에 STT 원문 전체>
```

---

## 7. LLM (Gemini 2.5 Flash, structured output) 사용 전략

### 7.1 모델 정보 및 호출

* 기본 모델 ID: `gemini-3-pro-preview` (google-genai SDK structured output)
* 속도/비용을 우선하면 `GEMINI_MODEL_ID=gemini-2.5-flash` 등으로 교체
* 입력:

  * 슬라이드 텍스트 (위 구조)
  * STT 원문 transcript
  * 간단 메타데이터 (강의명, 과목, 교수명)
* 출력:

  * `cleaned_transcript`: 슬라이드 기반으로 교정된 transcript
  * `cards`: Anki 카드 배열

### 7.2 시스템 프롬프트(역할 정의) – 요지

LLM에 전달할 **시스템 메시지**는 다음 원칙을 반드시 포함한다.

1. 역할:

   * “의대 강의용 Anki Basic 카드 전용 생성기”
2. 입력:

   * 강의 슬라이드 텍스트
   * 강의 녹취(STT 결과)
3. 해야 할 일:

   1. 슬라이드와 transcript를 비교하여, **의학 용어·영문 표기를 슬라이드 기준으로 교정**

      * 예: STT가 `데세레브레이트`라고 인식하면 `decerebrate`로 고친다.
   2. 중요/시험에 잘 나오는(high-yield) 개념 기반으로 카드 생성
4. 금지:

   * 슬라이드·transcript에 없는 내용을 **새로 만들어내지 말 것**
   * 한 카드에 여러 개념을 과도하게 넣지 말 것
   * 소설/예시/비유 위주의 카드는 생성하지 말 것

> **Devil’s advocate 관점:**
>
> * LLM이 “조금 더 친절한 설명”을 붙이고 싶어할 수 있으나,
>   이 서비스의 목적은 **시험 대비용 암기 단위**다.
>   “친절하지만 기네요”보다는 “차갑지만 외우기 좋네요”를 우선한다.

### 7.3 LLM 입력 JSON (백엔드 내부용)

백엔드에서 LLM에게 전달하는 페이로드(개념적 형태):

```json
{
  "meta": {
    "course": "Neurology",
    "lecture_title": "Posture in coma",
    "professor": "Prof. Kim"
  },
  "slides": [
    { "index": 1, "title": "Decorticate & Decerebrate posture", "body": "..." },
    { "index": 2, "title": "Causes", "body": "..." }
  ],
  "raw_transcript": "STT 원문 전체 텍스트..."
}
```

실제 호출 시에는 SDK/라이브러리 규격에 맞추어 위 내용을 텍스트 또는 구조화된 JSON으로 전달한다.

### 7.4 LLM 출력 JSON 스펙

LLM은 반드시 다음 구조의 JSON만 반환하도록 프롬프트에서 강하게 명시한다.

```json
{
  "cleaned_transcript": "교정된 transcript 전체 텍스트...",
  "cards": [
    {
      "front": "제피질 자세(decorticate posture)의 손상 부위는?",
      "back": "대뇌(대뇌피질 상위 또는 피질하 백질) 손상에 의해 발생. 상지 굴곡, 하지 신전 자세.",
      "tag": "neuro_posture"
    },
    {
      "front": "제뇌 자세(decerebrate posture)의 특징적인 팔/다리 자세는?",
      "back": "상지 신전·회내, 하지 신전, 발끝 첨족(plantar flexion). 보통 뇌간(중뇌~교뇌) 병변.",
      "tag": "neuro_posture"
    }
  ]
}
```

* 필드:

  * `front`: 문자열, 카드 앞면
  * `back`: 문자열, 카드 뒷면
  * `tag`: 문자열, 없으면 `""` (빈 문자열 허용)

### 7.5 카드 작성 규칙 (프롬프트에 포함)

다음 규칙을 프롬프트에 명확히 넣어야 한다.

1. **카드 타입**

   * Anki **Basic (Front & Back)** 전용
   * Cloze, Image occlusion 등은 **사용 금지**

2. **Front (앞면)**

   * 한 카드에는 **한 개념/한 질문**만 포함
   * 한국어 질문 + 필요한 경우 영어 병기
   * 예:

     * `"부갑상선 기능항진증(hyperparathyroidism)의 대표적인 3가지 증상은?"`

3. **Back (뒷면)**

   * 시험 답안으로 쓸 수 있을 만큼 **짧지만 완결적인 설명**
   * 1–3줄 또는 3–5개 bullet 수준 (초기 버전은 줄바꿈 최소화)
   * 불필요한 서론/말잇기 제거

4. **Tag**

   * 가능하면 `과목_주제` 형태 (예: `neuro_posture`, `endo_parathyroid`)
   * 애매하면 빈 문자열 허용

5. **카드 수**

   * 1시간 강의 기준 **25장** 정도
   * 교수 발화 중 “이거 중요합니다 / 시험 잘 나옵니다” 같은 표현을 우선 반영

6. **출처 제한**

   * 슬라이드와 transcript에 **동시에 존재하는 개념** 우선
   * 슬라이드에는 없고 transcript에만 나오는 내용은

     * 교수의 임상 팁/강조 사항일 때만 카드로 사용
   * 둘 다에 없는 내용은 절대 생성하지 않는다.

---

## 8. CSV 포맷 (Anki Basic 호환)

### 8.1 기본 규칙

Anki 데스크톱/모바일은 텍스트 파일 import 시 **구분자 헤더**를 인식하여 필드 구분을 설정할 수 있다. ([Render][5])

권장 포맷:

1. 인코딩: **UTF-8 (BOM 없음)**
2. 구분자: `;` (세미콜론)

   * 이유: 의학 텍스트에 콤마가 매우 자주 등장
3. 헤더(상단 메타):

```text
#separator:Semicolon
#columns:Front;Back;Tags
#html:false
```

4. 데이터 행:

```text
제피질 자세(decorticate posture)의 손상 부위는?;대뇌(대뇌피질 상위 혹은 피질하 백질) 손상에 의해 발생. 상지 굴곡, 하지 신전.;neuro_posture
제뇌 자세(decerebrate posture)의 병변 부위는?;뇌간(중뇌~상부 교뇌) 손상을 시사.;neuro_posture
```

### 8.2 줄바꿈 및 따옴표 처리

* 줄바꿈:

  * 가능하면 한 줄 내에서 `/`, `·`, `;` 등을 사용해 나열
  * 예: `bones / stones / groans / psychic overtones`
* HTML:

  * 처음에는 `#html:false` 유지, `<br>` 등은 사용하지 않는 것을 기본 전략으로 한다.
* 따옴표:

  * CSV 내 `" "`는 파싱 이슈를 만들 수 있으므로 지양
  * 필요 시 `' '` 또는 `“ ”`로 대체

---

## 9. 프론트엔드 (Next.js + Vercel)

### 9.1 페이지 구조

1. `/` (홈)

   * 설명 섹션: “슬라이드 + 녹음 → Anki CSV”
   * 업로드 폼:

     * `강의 제목`, `과목`, `교수명` 입력 필드 (선택)
     * PDF 업로드
     * 오디오 업로드
     * “생성하기” 버튼
   * 전송 후 Job ID 획득, `/jobs/[id]`로 리다이렉트

2. `/jobs/[id]`

   * Job 상태 폴링 (예: 5초 간격):

     * `PENDING`: “대기 중”
     * `RUNNING_STT`: “음성 인식 중…”
     * `RUNNING_LLM`: “카드 생성 중…”
     * `GENERATING_CSV`: “CSV 정리 중…”
     * `DONE`: “완료 – 카드 n장 생성”
     * `FAILED`: 에러 메시지 표시
   * `DONE`일 때:

     * CSV 다운로드 버튼
     * 카드 개수 요약

### 9.2 Vercel 배포 전략

* GitHub/GitLab에 프론트엔드 프로젝트 저장 후 Vercel에 연결
* CLI 또는 UI에서 간단히 배포 가능 ([Vercel][6])
* 환경 변수:

  * `NEXT_PUBLIC_API_BASE_URL` = 백엔드 API의 Render 도메인
* CORS:

  * 백엔드에서 Vercel 도메인을 허용하도록 CORS 설정

---

## 10. 백엔드 (FastAPI + Render)

### 10.1 서비스 분리

1. **Web Service (FastAPI)**

   * Start command 예:

     * `gunicorn -k uvicorn.workers.UvicornWorker app.main:app`
   * Render에서 “Web Service”로 생성 ([Render][5])

2. **Background Worker**

   * Celery/RQ Worker 실행
   * Start command 예:

     * `celery -A app.worker.celery_app worker --loglevel=info`
   * “Background Worker” 타입으로 Render에서 생성

3. **PostgreSQL / Redis**

   * Render의 관리형 PostgreSQL, Redis 사용

### 10.2 환경 변수 (예시)

* 공통:

  * `DATABASE_URL`
  * `REDIS_URL`
* 백엔드 전용:

  * `ELEVENLABS_API_KEY`
  * `GEMINI_API_KEY` (또는 `GOOGLE_API_KEY`)
  * `GEMINI_MODEL_ID=gemini-3-pro-preview` (속도/비용 우선 시 flash 등으로 교체)
  * `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
  * `ALLOWED_ORIGINS` (Vercel 도메인)

### 10.3 장기 작업 처리

* HTTP 요청 타임아웃 문제를 피하기 위해:

  * 업로드 요청에서는 **즉시 Job을 생성하고 202/200 응답**,
  * 실제 STT/LLM 작업은 Worker에서 비동기로 수행한다. ([Render][7])

---

## 11. 에러 처리 & 로깅

### 11.1 에러 처리 기준

* STT 오류:

  * 재시도 1–2회 후 실패 시 `status=FAILED`
  * `error_message`에 HTTP 상태 코드 및 요약 사유 기록
* LLM 오류:

  * JSON 파싱 실패 → LLM 재호출 1회
  * 그래도 실패 시 raw 응답을 로그로 저장
* CSV 생성 오류:

  * 카드 리스트를 재검증하여 필드 누락·타입 오류 시 필터링 후 재시도

### 11.2 로깅

* 각 Job별 로그 ID = Job ID 기반
* 주요 이벤트:

  * STT 호출 시작/종료
  * LLM 호출 시작/종료
  * CSV 생성 완료
* 심각한 에러(5xx, 외부 API 장애)는 별도 알림 대상으로 분리 가능

---

## 12. 개발 철학 (“쓸모있어야 함”)

1. **사용자 행동 최소화**

   * 업로드 → 상태 확인 → 다운로드
     이 **3단계 이외의 상호작용을 요구하지 않는 것**을 기본 규칙으로 한다.

2. **사소하지만 확실한 편익**

   * “카드 100장 대신 20장이어도 좋으니,
     각 카드는 신뢰할 수 있고, 수정할 곳이 적어야 한다.”
   * 따라서, 카드 수보다 **카드당 신뢰도**를 우선한다.

3. **사람의 최종 개입을 전제로 설계**

   * 이 시스템이 하는 일:

     * **90%의 반복 작업 제거**
   * 사람(사용자)이 할 일:

     * 생성된 카드를 한 번 훑어보고,
       중요도가 낮은 카드를 삭제하거나 표현을 미세 조정
   * 이 검수 과정 자체가 한 번의 **복습**이 되도록 의도한다.

4. **확장 가능하되, 복잡하지 않게**

   * STT, LLM, Storage, DB, 프론트엔드 모두

     * 인터페이스를 분리하여 대체 가능성을 열어둔다.
   * 하지만, 초기 버전에서는

     * “옵션/플래그”를 과도하게 도입하지 않고,
     * **합리적인 디폴트**를 하나씩 정하는 것을 우선한다.

5. **비용 대비 효과**

   * 1시간 강의당 총비용 (STT+LLM)이 **$1 미만** 수준을 목표로 한다. ([ElevenLabs][2])
   * 이 정도면 개인 학습 용도로 충분히 납득 가능한 수준.

---

## 13. 구현 우선순위 (MVP → 확장)

### 13.1 1단계 – MVP

1. FastAPI 백엔드 + Render Web Service
2. 단일 Worker (동일 코드베이스 내 비동기 처리라도 괜찮음)
3. ElevenLabs Scribe v1 STT 연동
4. Gemini 2.5 Flash(google-genai structured output)로 카드 JSON 생성
5. CSV 생성 + S3 저장
6. Next.js 최소 UI (업로드, 상태 확인, 다운로드)

### 13.2 2단계 – 안정화

1. Celery/RQ 기반 정식 Worker 도입
2. Job 재시도 정책 및 에러 로깅 강화
3. 카드 수 조절 로직 개선 (LLM 프롬프트 튜닝)
4. 간단한 사용 통계(강의당 카드 수, 처리 시간) UI 표시

### 13.3 3단계 – 확장 (옵션)

1. Scribe v2 Realtime 기반 실시간 강의 보조 (스트리밍) ([ElevenLabs][8])
2. 카드 편집 웹 UI 및 DB 저장
3. Notion / 다른 노트 앱으로의 동기화
4. 사용자별 저장소/계정 시스템

---

## 14. 코딩 에이전트용 요약 지시사항

1. **백엔드 스택**: Python + FastAPI + PostgreSQL + Redis + Celery (또는 RQ)
2. **프론트엔드 스택**: Next.js + Vercel
3. **LLM**: 기본 `gemini-3-pro-preview` (환경변수로 다른 모델 교체 가능)
4. **STT**: ElevenLabs `POST /v1/speech-to-text` + `model_id=scribe_v1` (디폴트)
5. **CSV 포맷**: UTF-8, `#separator:Semicolon`, `#columns:Front;Back;Tags`
6. **아키텍처**: Web(API) + Worker + DB + S3, Render에 배포
7. **품질 기준**:

   * 카드당 신뢰도와 시험 유용성 > 카드 수
   * “완전 자동”이 아니라 “자동 초안 + 사람 검수” 구조

위 지시사항을 기준으로,
코드를 모듈화된 형태로 구현하고, 로컬에서 end-to-end로 테스트한 뒤 Render/Vercel에 배포할 수 있게 하라.

[1]: https://elevenlabs.io/docs/api-reference/speech-to-text/convert?utm_source=chatgpt.com "Create transcript | ElevenLabs Documentation"
[2]: https://elevenlabs.io/docs/capabilities/speech-to-text?utm_source=chatgpt.com "Speech to Text | ElevenLabs Documentation"
[3]: https://elevenlabs.io/docs/changelog/2025/4/14?utm_source=chatgpt.com "April 14, 2025 | ElevenLabs Documentation"
[4]: https://ai.google.dev/gemini-api/docs/models/gemini?utm_source=chatgpt.com "Gemini models | Google AI for Developers"
[5]: https://render.com/docs/deploy-fastapi?utm_source=chatgpt.com "Deploy a FastAPI App"
[6]: https://vercel.com/docs/frameworks/full-stack/nextjs?utm_source=chatgpt.com "Next.js on Vercel"
[7]: https://render.com/articles/fastapi-production-deployment-best-practices?utm_source=chatgpt.com "FastAPI production deployment best practices"
[8]: https://elevenlabs.io/realtime-speech-to-text?utm_source=chatgpt.com "Scribe v2 Realtime Speech to Text - 150ms Latency API"
