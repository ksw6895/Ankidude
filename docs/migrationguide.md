
## ✅ 목표 요약

1. **구 SDK 교체**

   * 현재 프로젝트는 `google-generativeai`(= 레거시 Gemini Python SDK)를 사용 중이다.
   * 이 SDK는 공식적으로 **deprecated** 되었고, **2025-11-30부로 지원 종료(EOL)** 가 예정되어 있다.([GitHub][1])
   * 따라서, 코드는 **신규 공식 SDK인 `google-genai` (Google GenAI SDK)** 로 전면 이관해야 한다.([Google AI for Developers][2])

2. **Structured Output 도입**

   * 지금은 단순 `generate_content(prompt)` + “프롬프트로 JSON 강제 + 정규식으로 `{...}` 추출” 구조다.
   * 이 방식은 모델이 프롬프트를 어길 경우 바로 깨지고, 포맷 안정성이 전혀 없다.
   * **신규 GenAI SDK의 structured output (JSON Schema / Pydantic 기반)** 기능으로

     * `cleaned_transcript`
     * `cards: [{front, back, tag}]`
       를 **정해진 스키마로 강제**하도록 코드를 고쳐야 한다.([Google AI for Developers][3])

3. **요청 사항**

   * 최신 공식 문서 기준(**2025-11-27 시점**)으로

     1. SDK 마이그레이션
     2. Structured output 설계 & 구현
     3. 에러 핸들링 / 회귀 테스트
        까지 패키징해서 완성된 PR 수준으로 작업할 것.

---

## 1. 환경 & 의존성 마이그레이션 지시

에이전트에게 다음을 순서대로 수행하라고 지시해 주세요.

1. **현재 상태 파악**

   * `backend/requirements.txt` 또는 `pyproject.toml` 등에서

     * `google-generativeai>=0.7.2` 사용 여부 확인.
   * `backend/app/clients/gemini.py` 에서

     * `import google.generativeai as genai`
     * `genai.configure(api_key=...)`
     * `genai.GenerativeModel(self.model_id).generate_content(prompt)`
       패턴 사용 중인지 확인.

2. **의존성 교체**

   * `google-generativeai` 제거.
   * **신규 공식 SDK** `google-genai` 추가:([Google AI for Developers][2])

     ```bash
     pip install -U google-genai
     ```
   * requirements 예시:

     ```txt
     # before
     google-generativeai>=0.7.2

     # after
     google-genai>=1.10.0  # 버전은 최신 안정판으로 맞추되, 실제 최신 버전 확인해서 명시
     ```

3. **환경 변수 정책 정리**

   * Google GenAI SDK는 기본적으로 `GEMINI_API_KEY` 또는 `GOOGLE_API_KEY` 환경변수를 읽는다.([Google AI for Developers][2])
   * 기존에 `GOOGLE_API_KEY` / `GENAI_API_KEY` 등 다른 이름을 썼다면,

     * `.env` / 배포 환경 설정을 **`GEMINI_API_KEY`** 기준으로 정리.
   * 코드에서는 가능하면 명시적 API 키 전달 없이:

     ```python
     from google import genai
     client = genai.Client()  # 키는 환경변수에서 자동 로드
     ```

---

## 2. 클라이언트 구조 리팩토링 지시

기존 구조:

```python
import google.generativeai as genai

genai.configure(api_key=...)
model = genai.GenerativeModel(self.model_id)
resp = model.generate_content(prompt)
# + _extract_json_block(resp.text) 로 JSON 파싱
```

이를 **다음 원칙으로 전면 교체**하라고 지시합니다.

1. **Google GenAI Client 사용**

   ```python
   from google import genai

   class GeminiClient:
       def __init__(self, model_id: str | None = None):
           self._client = genai.Client()
          self._model_id = model_id or os.getenv("GEMINI_MODEL_ID", "gemini-3-pro-preview")
           # 기본값은 3 Pro Preview, 속도/비용 필요 시 flash 등으로 교체 가능.
   ```

2. **호출 방식 변경**

   * `generate_content(prompt)` → `client.models.generate_content(...)`:

     ```python
     response = self._client.models.generate_content(
         model=self._model_id,
         contents=prompt,
         # 이 아래에서 structured output 설정을 넣을 예정
     )
     ```

3. **모델 ID 업데이트 제안 (Devil’s advocate)**

   * **사실상 Gemini 1.0 / 1.5 계열은 은퇴 상태**이므로, 2.0 / 2.5 / 3 계열을 써야 한다.([Firebase][4])
   * 카드 생성/요약 워크로드 특성상:

     * 기본값: `gemini-3-pro-preview` (정밀도 우선)
     * 속도/비용을 우선하면 `gemini-2.5-flash` 등으로 환경변수 교체 가능하게 설계.
   * 단, **모델 문자열을 코드에 하드코딩하지 말고**,
     `.env`의 `GEMINI_MODEL_ID`로 오버라이드 가능하게 유지할 것.

---

## 3. Structured Output 스키마 설계 & 구현 지시

현재 JSON 구조는 대략 다음과 같다고 가정합니다.

```json
{
  "cleaned_transcript": "string",
  "cards": [
    {"front": "string", "back": "string", "tag": "string or null"}
  ]
}
```

### 3-1. Pydantic 모델 정의

에이전트에게 다음과 비슷한 Pydantic 모델을 **새 파일**에 정의하게 하십시오.

```python
# backend/app/schemas/gemini_cards.py (예시 경로)

from pydantic import BaseModel, Field
from typing import List, Optional

class Card(BaseModel):
    front: str = Field(description="Front side of the Anki card.")
    back: str = Field(description="Back side of the Anki card.")
    tag: Optional[str] = Field(
        default=None,
        description="Optional tag for the card (e.g., lecture/topic).",
    )

class LectureCardsOutput(BaseModel):
    cleaned_transcript: str = Field(
        description="Transcript cleaned and normalized for study."
    )
    cards: List[Card]
```

이 모델은 이후 **`response_json_schema`** 로 사용됩니다.([Google AI for Developers][3])

### 3-2. Structured Output 호출 형태로 교체

기존:

```python
result = model.generate_content(prompt)
json_data = _extract_json_block(result.text)
```

→ 신규:

```python
from google import genai
from .schemas.gemini_cards import LectureCardsOutput

client = genai.Client()

config = {
    "response_mime_type": "application/json",
    "response_json_schema": LectureCardsOutput.model_json_schema(),
}

response = client.models.generate_content(
    model=self._model_id,
    contents=prompt,
    config=config,
)

# response.text 는 JSON 문자열이어야 함
data = LectureCardsOutput.model_validate_json(response.text)
```

**필수 조건(에이전트에게 강조):**

1. **정규식 JSON 파서(`_extract_json_block`)는 전면 제거**하거나,

   * 최소한 “fallback 전용”으로만 남기되,
   * 기본 경로는 항상 structured output → Pydantic 검증 경로가 되게 할 것.
2. **에러 처리**:

   * `response.text` 가 비어 있거나(`None`) JSON 파싱 실패 시:

     * 전용 예외(`GeminiStructuredOutputError`)를 던지고,
     * 로깅에 **프롬프트 + config + raw response** 를 남길 것.
   * 필요하면 “한 번 더 시도할 때는 프롬프트에

     > If you cannot follow the schema, respond with a single JSON object with key 'error' and 'message'.
     > 를 추가해 재요청하게 만들어도 됨.
3. **테스트 케이스**:

   * 정상 케이스: 실제 짧은 샘플 슬라이드/스크립트를 넣어

     * `cleaned_transcript` 가 non-empty string
     * `cards` 길이 > 0
     * 각 카드의 front/back 이 빈 문자열이 아닌지 확인.
   * 비정상 케이스: 프롬프트를 일부러 이상하게 줘서

     * Pydantic 검증 실패 → 우리가 정의한 예외가 터지는지 확인.

---

## 4. 프롬프트 구조 개선 지시 (Structured Output 전제)

지금 프롬프트 구조:

1. 인스트럭션/규칙 (한국어 의료 강의용 Anki 카드 생성)
2. `metadata` (과목명 / 강의 제목 / 교수명)
3. `[SLIDES]` 섹션
4. `[TRANSCRIPT_RAW]` 섹션
5. 마지막 줄: “Return JSON with keys cleaned_transcript and cards ...”

이 중 **5번 문장**은 이제 “Schema 기반 출력”으로 대체해야 합니다.

에이전트에게 다음과 같은 원칙으로 수정하라고 지시해 주세요.

1. **프롬프트 마지막 부분 정리**

   * “JSON만 반환해라” 같은 문구는

     * “모델에게 방향을 알려주는 정도”로 유지하되,
     * 구체적인 키/형식 정의는 **Pydantic 스키마에 맡긴다.**
   * 예시:

     ```text
     You are generating Korean/English medical study cards for Anki.

     Follow these rules:
     - Use the metadata, slides, and transcript faithfully.
     - Normalize medical terminology and fix obvious STT errors.
     - Do not hallucinate content that is not supported by the input.

     The API will pass you a response schema that defines:
     - cleaned_transcript: normalized transcript string
     - cards: an array of objects with front/back/tag

     Make sure your response fully populates all required fields of that schema.
     ```

2. **메타데이터 섹션 유지**

   * 현행 `Course / Lecture Title / Professor` 형태는 그대로 두되,
   * structured output 도입 후에도 **cards.tag 기본값을 메타데이터에서 유도**할 수 있게,

     * 예: 태그 기본값: `"신경학: {lecture_title}"` 등으로 프롬프트에서 지시.

3. **Devil’s advocate 포인트 (에이전트에게 신중 요청)**

   * “모든 걸 스키마에 밀어 넣는다고 해서 100% schema adherence가 보장되지는 않는다”는 점은 알려져 있다.([Google AI Developers Forum][5])
   * 따라서:

     * 프롬프트에서 **명시적으로 schema 를 존중하라고 지시**

     -

     * 클라이언트 단에서 Pydantic 검증 실패 시 재시도/폴백 로직이 **반드시 필요**하다고 강조.

---

## 5. 회귀(Regression) & 버그 리스크 관련 지시

초고성능 에이전트에게 “고집 세게” 시킬 부분입니다.

1. **기존 동작과의 호환성 검증**

   * 과거에 저장해 둔 샘플 강의 슬라이드/스크립트에 대해

     * 구 SDK 버전 결과(JSON)를 **샘플로 저장**해 두고,
     * 신규 structured output 결과와 **구조/정보량 비교**:

       * 카드 개수
       * 카드 front/back의 평균 길이
       * tag 분포
   * 기존 대비 “카드 수가 지나치게 줄어들지 않는지”,
     “불필요하게 장황해지지 않았는지” 체크.

2. **토큰 한도 이슈 방어**

   * Google GenAI SDK에서 structured output 사용 시
     `max_output_tokens` 초과 상황에서 `response.text / response.parsed` 가 `None` 이 되는 이슈 리포트가 있었다는 점을 염두에 둘 것.([GitHub][6])
   * 대응:

     * `generation_config` / `config` 에서 `max_output_tokens` 를 적절히 넉넉하게 설정.
     * 그래도 `None` 이 나오면,

       * “요약 강도”를 조금 올리는 프롬프트로 자동 재시도하도록 설계(예: 슬라이드/스크립트 일부만 사용).

3. **모델/SDK 버전 변화에 대한 안정성**

   * 새 SDK (`google-genai`)는 앞으로도 계속 업데이트될 예정이고, JSON Schema 지원도 최근에 강화되었다.([blog.google][7])
   * 에이전트에게:

     * **SDK 마이너 버전 업에 의해 인터페이스가 바뀔 가능성**을 고려한 추상화 레이어를 만들라고 요청.

       * 예: `GeminiCardGenerator` 인터페이스를 하나 두고,
       * 내부에서만 `google.genai` 구체 구현을 사용.

---

## 6. 에이전트에게 직접 줄 “최종 지시문” 예시

마지막으로, sir께서 그대로 복붙해서 쓰실 수 있는 버전입니다.

> **[초고성능 코딩 에이전트용 지시]**
>
> * 현재 프로젝트는 Python용 `google-generativeai` SDK를 사용해서 Gemini API를 호출하고 있다.
> * 이 라이브러리는 공식적으로 deprecated 되었고, 2025-11-30 이후로는 유지보수도 종료되므로, **반드시 Google GenAI SDK (`google-genai`)로 마이그레이션**해야 한다.
> * 또한, 지금은 프롬프트로만 JSON 출력을 강제하고 정규식으로 `{...}`를 뽑는 취약한 구조인데,
>   **신규 SDK의 structured output(JSON Schema / Pydantic 기반)** 을 활용해
>
>   * `cleaned_transcript: str`
>   * `cards: list[{front: str, back: str, tag: Optional[str]}]`
>     를 스키마로 강제하는 방향으로 리팩토링해 달라.
>
> 구체적으로는 다음을 수행해 줘:
>
> 1. `backend/requirements.txt` 에서 `google-generativeai` 를 제거하고, `google-genai` 최신 안정 버전을 추가해.
> 2. `backend/app/clients/gemini.py` 에서
>
>    * `import google.generativeai as genai`, `genai.configure(...)`, `GenerativeModel(...).generate_content()` 패턴을 모두 제거하고,
>    * `from google import genai` + `client = genai.Client()` + `client.models.generate_content(...)` 패턴으로 바꿔 줘.
> 3. `.env` / 설정에서 API 키는 `GEMINI_API_KEY` 기준으로 정리하고, 코드에서는 가능하면 키를 직접 넘기지 말고 환경변수 사용 방식으로 설정해.
> 4. Pydantic으로 다음과 같은 모델을 정의해:
>
>    * `Card { front: str, back: str, tag: Optional[str] }`
>    * `LectureCardsOutput { cleaned_transcript: str, cards: list[Card] }`
>      이 두 모델의 `model_json_schema()` 를 이용해서
>      `config={"response_mime_type": "application/json", "response_json_schema": LectureCardsOutput.model_json_schema()}`
>      형태로 structured output을 활성화해 줘.
> 5. 기존 `_extract_json_block` 기반 정규식 파서는 기본 경로에서 제거하고,
>
>    * `response.text` 를 `LectureCardsOutput.model_validate_json(response.text)` 로 검증하는 흐름이 기본이 되게 해 줘.
>    * 검증 실패 / JSON 없음 / `response.text is None` 등의 경우에는 전용 예외를 던지고, 프롬프트·config·raw response 를 모두 로깅한 뒤 재시도 전략을 설계해 줘.
> 6. 기존 프롬프트의 “Return JSON with keys …” 식 문장은,
>
>    * “스키마를 충실히 채울 것”을 강조하는 자연어 설명으로 변경하고,
>    * 실제 키/타입 정의는 Pydantic 스키마 + `response_json_schema`에 맡기는 구조로 정리해 줘.
> 7. 샘플 슬라이드/스크립트 몇 개를 이용해서
>
>    * 구 버전 대비 카드 개수/내용/태그 분포가 크게 망가지지 않는지 회귀 테스트를 작성하고,
>    * schema 관련 에러, max_output_tokens 한도 초과 등 엣지 케이스에 대한 단위 테스트도 같이 만들어 줘.
>
> 구현이 끝나면,
>
> * 주요 변경 파일 목록,
> * 마이그레이션 요약,
> * 테스트 시나리오 및 결과,
> * 향후 SDK/모델 버전업 시 주의할 점
>   을 간단한 Markdown(예: `gemini_migration_notes.md`)으로 정리해 줘.

---

이 정도면 sir께서 원하는 “시의성 있는 SDK 교체 + structured output 도입”을 초고성능 에이전트가 이해하고 바로 작업 돌릴 수 있을 것입니다.
혹시 나중에 **“카드 포맷 자체(예: tag 전략, 카드 길이 상한)”** 를 더 최적화하고 싶으시면, 그때는 별도로 카드 설계 규칙만 떼서 또 한 번 설계해 보겠습니다.

[1]: https://github.com/google-gemini/deprecated-generative-ai-python "GitHub - google-gemini/deprecated-generative-ai-python: This SDK is now deprecated, use the new unified Google GenAI SDK."
[2]: https://ai.google.dev/gemini-api/docs/migrate "Migrate to the Google GenAI SDK  |  Gemini API  |  Google AI for Developers"
[3]: https://ai.google.dev/gemini-api/docs/structured-output "Structured Outputs  |  Gemini API  |  Google AI for Developers"
[4]: https://firebase.google.com/docs/ai-logic/generate-structured-output?utm_source=chatgpt.com "Generate structured output (like JSON and enums ... - Firebase"
[5]: https://discuss.ai.google.dev/t/structured-output-from-api-using-responseschema-need-help/50297?utm_source=chatgpt.com "Structured output from API using responseSchema - need help!"
[6]: https://github.com/googleapis/python-genai/issues/1039?utm_source=chatgpt.com "Structured Output Returns None When max_output_tokens ..."
[7]: https://blog.google/technology/developers/gemini-api-structured-outputs/?utm_source=chatgpt.com "Improving Structured Outputs in the Gemini API"
