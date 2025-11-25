import os
from typing import Any, Dict, Optional

import httpx

from app.core.config import get_settings


class ElevenLabsClient:
    def __init__(self, api_key: Optional[str] = None):
        settings = get_settings()
        self.api_key = api_key or settings.elevenlabs_api_key
        if not self.api_key:
            raise ValueError("ELEVENLABS_API_KEY is required for STT")
        self.base_url = "https://api.elevenlabs.io"

    def transcribe_file(
        self,
        audio_path: str,
        language_code: str | None = None,
        diarize: bool = False,
        tag_audio_events: bool = False,
    ) -> Dict[str, Any]:
        url = f"{self.base_url}/v1/speech-to-text"
        data = {
            "model_id": "scribe_v1",
            "language_code": language_code or "",
            "diarize": str(diarize).lower(),
            "tag_audio_events": str(tag_audio_events).lower(),
            "timestamps_granularity": "word",
        }

        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "application/octet-stream")}
            headers = {"xi-api-key": self.api_key}
            response = httpx.post(url, data=data, files=files, headers=headers, timeout=600)

        if response.status_code >= 400:
            raise RuntimeError(
                f"ElevenLabs STT failed ({response.status_code}): {response.text}"
            )

        return response.json()
