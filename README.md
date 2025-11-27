# Ankidude – 슬라이드 + 오디오 → Anki CSV

FastAPI + Celery 백엔드와 Next.js 프론트엔드를 이용해 강의 슬라이드(PDF)와 녹음 파일을 업로드하면 ElevenLabs Scribe v1 STT와 Gemini 3 Pro Preview(google-genai structured output)로 고품질 Anki Basic CSV를 생성합니다. `guideline.md`의 지침(모델/포맷/상태 플로우)을 따릅니다.

## 구성
- `backend/`: FastAPI API (`/api/lectures`), Celery 워커, ElevenLabs/Gemini/S3 연동
- `frontend/`: Next.js(App Router) 업로드 & Job 상태 페이지
- `guideline.md`: 요구사항 명세

## 빠른 시작 (WSL 기준)
1) **Python 가상환경**  
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 키/URL 채우기
```

2) **필수 환경 변수 채우기 (`backend/.env`)**
- `ELEVENLABS_API_KEY` – Scribe v1 STT 키  
- `GEMINI_API_KEY`, `GEMINI_MODEL_ID=gemini-3-pro-preview`  
- `DATABASE_URL` – 기본 SQLite 로컬 (`sqlite:///./ankidude.db`) 또는 Postgres URL  
- `REDIS_URL` – Celery 브로커/백엔드 (예: `redis://localhost:6379/0`)  
- 선택: `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `STORAGE_BASE_URL`

3) **서비스 실행**
- Redis (로컬 예시): `docker run -p 6379:6379 redis:7`
- API 서버:  
  ```bash
  cd backend
  uvicorn app.main:app --reload --port 8000 --app-dir .
  ```
- Celery 워커:  
  ```bash
  cd backend
  PYTHONPATH=. celery -A app.worker.tasks worker --loglevel=info
  ```

4) **프론트엔드 (선택)**
```bash
cd frontend
npm install
export NEXT_PUBLIC_API_BASE_URL="http://localhost:8000"
npm run dev   # http://localhost:3000
```

## 주요 API
- `POST /api/lectures` – multipart 업로드(`slides_pdf`, `audio_file`, 선택 필드: `title`, `subject`, `professor`) → `{ job_id, status }`
- `GET /api/lectures/{job_id}` – 상태/카드 수/다운로드 URL
- `GET /api/lectures/{job_id}/csv` – CSV 스트림 또는 S3 리다이렉트
- 헬스체크: `GET /health`

## 처리 파이프라인
1. 파일 업로드 → S3(또는 로컬 `backend/storage/`) 저장, Job DB 기록(`lectures` 테이블)  
2. Celery 워커가 상태를 `RUNNING_STT` → `RUNNING_LLM` → `GENERATING_CSV`로 갱신  
3. ElevenLabs `POST /v1/speech-to-text`(`model_id=scribe_v1`) 호출 → transcript 저장  
4. PDF 파싱(page별 title/body) → Gemini 3 Pro Preview(구글 GenAI structured output)로 슬라이드+transcript 전달 → `{cleaned_transcript, cards}` JSON  
5. 카드 리스트를 Anki CSV(`;` 구분, `#separator/#columns/#html:false`)로 직렬화 후 S3/로컬 저장, `status=DONE`

## 기타
- 기본 CORS 허용 도메인: `.env`의 `ALLOWED_ORIGINS` (예: `http://localhost:3000`)
- 로컬 개발 기본 저장소: `./storage` (Git 무시)
- DB 스키마: `lectures`, `transcripts` 테이블 (SQLAlchemy 모델 참조)

### 운영 팁
- 장시간/대용량 파일 시 Celery 타임아웃(`task_time_limit`)과 업로드 제한을 조정하세요.
- 실제 배포 시 Render(Web+Worker+Postgres/Redis)와 Vercel(프론트) 조합을 바로 적용할 수 있도록 env만 교체하면 됩니다.
