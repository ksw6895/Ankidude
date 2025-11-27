# Gemini API 마이그레이션 노트

## 주요 변경 사항
- SDK를 `google-generativeai` → `google-genai`로 교체하고 의존성/설정을 업데이트했습니다.
- 기본 모델을 `gemini-3-pro-preview`로 설정하고, `GEMINI_MODEL_ID` 환경변수로 속도/비용 우선 모델(예: `gemini-2.5-flash`)로 교체 가능하도록 유지했습니다.
- Gemini 호출을 `genai.Client().models.generate_content` + **structured output**(`response_mime_type=application/json`, `response_json_schema`) 기반으로 리팩터링했습니다.
- 신규 Pydantic 스키마(`app/schemas/gemini_cards.py`)로 `cleaned_transcript` 및 `cards[{front, back, tag}]`를 강제하고, 응답을 `LectureCardsOutput` → 기존 `LLMResult`로 변환합니다.
- 정규식 JSON 파서를 제거하고, 빈 응답/검증 실패 시 `GeminiStructuredOutputError`를 로깅 후 재시도(`tenacity`, reraise=True)하도록 변경했습니다.
- 프롬프트를 “스키마 필드를 모두 채우라”는 자연어 안내로 정리하고, 태그 힌트(메타데이터 기반)와 STT 교정 규칙을 유지했습니다.
- `Card.tag`를 `Optional[str]`로 완화해 `null` 태그도 처리하며 CSV 생성 시 빈 문자열로 정규화합니다.

## 테스트
- 로컬 단위 테스트: `backend/.venv/bin/python -m unittest backend/tests/test_gemini_client.py`
  - 정상 구조 응답 → `LLMResult` 변환 및 config 전달 검증
  - 비정상 응답(JSON 파싱 실패/빈 응답) → `GeminiStructuredOutputError` 발생 검증

## 운영 시 유의점 / 후속 작업
- 환경 변수: `GEMINI_API_KEY`(또는 `GOOGLE_API_KEY`), `GEMINI_MODEL_ID` 기본값 `gemini-3-pro-preview`.
- `max_output_tokens`는 기본 16000으로 설정되어 있으며, 작업 특성에 따라 조정 가능.
- 구조화 출력이라도 모델이 스키마를 어길 수 있으니, 프로덕션에서는 로그 모니터링과 재시도/프롬프트 보강을 계속 점검하세요.
