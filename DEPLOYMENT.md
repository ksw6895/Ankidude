# 배포 가이드 (Render + Vercel 기준)

아이패드 등 외부 기기에서도 바로 사용하기 위해, 백엔드는 Render, 프론트는 Vercel로 배포하는 절차를 **버튼 클릭 단위**로 적었습니다. 모든 명령은 repo 루트(`/home/ksw6895/Projects/Ankidude`) 기준입니다.

## 0. 준비물
- GitHub 저장소: 현재 repo가 원격에 있어야 합니다.
- API 키: `ELEVENLABS_API_KEY`, `GEMINI_API_KEY` (`GEMINI_MODEL_ID=gemini-3-pro-preview`).
- S3 호환 스토리지: AWS S3 또는 R2/Wasabi 등 (버킷 1개, 퍼블릭 읽기 또는 사전 서명 URL 허용).
- Render 계정, Vercel 계정.

## 1. 백엔드 배포 (Render)
### 1-1. 사전 준비
1) Render Dashboard 접속 → Databases → PostgreSQL Create  
   - 이름 예: `ankidude-db`
   - `Connection String` 복사 → `DATABASE_URL`로 사용
2) Render Dashboard → Redis → Create Redis  
   - `Redis URL` 복사 → `REDIS_URL`로 사용
3) S3 정보 정리  
   - `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`  
   - (선택) `STORAGE_BASE_URL` (CloudFront/R2 퍼블릭 URL 등)

### 1-2. Web Service 생성 (FastAPI)
1) Render Dashboard → New → Web Service → GitHub repo 선택  
2) Root 디렉터리: `backend`  
3) Build Command:
   ```
   pip install -r requirements.txt
   ```
4) Start Command:
   ```
   gunicorn -k uvicorn.workers.UvicornWorker app.main:app
   ```
5) Environment → Add Environment Variables (필수)
   - `DATABASE_URL` = Render Postgres URL
   - `REDIS_URL` = Render Redis URL
   - `ELEVENLABS_API_KEY` = 본인 키
   - `GEMINI_API_KEY` = 본인 키
   - `GEMINI_MODEL_ID` = `gemini-3-pro-preview`
   - `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`
   - `ALLOWED_ORIGINS` = `https://<vercel-domain>` (쉼표로 추가 가능)
   - `LOCAL_STORAGE_PATH` = `./storage` (기본값, 필요 시 변경)
6) Instance type: 무료로 시작 가능하나, 오디오/LLM 처리 시간 때문에 유료 플랜 권장.
7) Deploy 버튼 클릭 → 배포 완료 후 웹 서비스 URL 확인 (예: `https://ankidude.onrender.com`).

### 1-3. Background Worker 생성 (Celery)
1) Render Dashboard → New → Background Worker → 같은 repo 선택  
2) Root 디렉터리: `backend`  
3) Build Command: `pip install -r requirements.txt`
4) Start Command:
   ```
   celery -A app.worker.tasks worker --loglevel=info
   ```
5) Environment Variables: Web Service와 동일하게 모두 추가(복사 기능 사용).  
6) Deploy → Worker가 실행되면 로그에서 `Job ...` INFO 메시지 확인.

### 1-4. 건강검진 및 CORS
- 백엔드 헬스체크: `GET https://<render-domain>/health` → `{"status":"ok"}` 응답 확인.
- CORS: `ALLOWED_ORIGINS`에 Vercel 프로덕션/프리뷰 도메인 모두 넣기.

### 1-5. 저장소/출력 경로
- 로컬 스토리지 모드: `LOCAL_STORAGE_PATH=./storage` → Render 인스턴스 재시작 시 사라질 수 있으므로 **반드시 S3 설정**을 추천.
- S3 모드: `csv_url`이 S3 퍼블릭 URL이면 프론트에서 그대로 다운로드, 아니면 API가 프락시 반환.

## 2. 프론트엔드 배포 (Vercel, Next.js)
1) Vercel Dashboard → Add New… → Project → GitHub repo 선택  
2) Framework 자동 감지: Next.js  
3) Root Directory: `frontend`  
4) Environment Variables:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://<render-domain>/api`
5) Build Command: (기본) `npm run build`  
6) Output Directory: (자동) `.next`  
7) Deploy 클릭 → Vercel 도메인 획득 (예: `https://ankidude.vercel.app`).

## 3. 배포 후 동작 점검
1) 브라우저에서 Vercel 도메인 접속 → PDF+오디오 업로드 → Job 이동  
2) Render Web Logs: 요청/다운로드 확인  
3) Render Worker Logs: `Job ... 시작 → STT → LLM → CSV 생성` INFO 로그 확인  
4) 상태가 DONE이면 다운로드 버튼 → CSV 내려받기 (UTF-8; Semicolon; `#separator` 헤더 포함).

## 4. 문제 해결 체크리스트
- 업로드 후 상태가 PENDING에서 안 움직임: Worker가 실행 중인지 확인(Celery 로그 유무).  
- CSV 404: S3 권한 또는 `STORAGE_BASE_URL` 미설정 확인. 로컬 스토리지 사용 시 인스턴스 재시작으로 파일이 날아갔을 수 있음.  
- CORS 에러: 백엔드 `ALLOWED_ORIGINS`에 Vercel 도메인 추가 후 재배포.  
- 인코딩 깨짐: CSV는 `UTF-8`로 제공, 뷰어를 UTF-8로 설정. Anki Import 시 구분자 Semicolon 선택.

## 5. 재배포/업데이트
- 코드 변경 후 Git push → Render/Vercel가 자동 빌드/배포.  
- 긴 작업 대비: Render 유료 플랜으로 타임아웃/스펙 상향, Celery `task_time_limit` 조정은 `app/core/celery_app.py`에서 가능.
