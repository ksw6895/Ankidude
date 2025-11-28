import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.clients.gemini import GeminiClient, GeminiStructuredOutputError
from app.schemas.gemini_cards import LectureNotesOutput


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


class _FakeModels:
    def __init__(self, response: _FakeResponse):
        self.response = response
        self.calls = []

    def generate_content(self, model: str, contents: str, config: dict):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return self.response


class _FakeClient:
    def __init__(self, response: _FakeResponse):
        self.models = _FakeModels(response)


class GeminiClientStructuredOutputTests(unittest.TestCase):
    def setUp(self):
        self.pdf_file = {"uri": "gs://files/slide.pdf", "mime_type": "application/pdf"}
        self.transcript = "This is a raw transcript"
        self.meta = {"title": "Neuro 101", "subject": "Neurology", "professor": "Kim"}

    def test_generate_cards_returns_valid_llm_result(self):
        payload = {
            "cleaned_transcript": "Normalized transcript",
            "cards": [
                {"front": "Q1", "back": "A1", "tag": "neurology"},
                {"front": "Q2", "back": "A2", "tag": None},
            ],
        }
        fake_response = _FakeResponse(json.dumps(payload))
        fake_client = _FakeClient(fake_response)

        client = GeminiClient(
            api_key="test-key", client=fake_client, model_id="fake-model", max_output_tokens=1024
        )
        result = client.generate_cards(self.pdf_file, self.transcript, self.meta)

        self.assertEqual(result.cleaned_transcript, payload["cleaned_transcript"])
        self.assertEqual(len(result.cards), 2)
        self.assertEqual(result.cards[0].front, "Q1")
        # None tag should be normalized to empty string
        self.assertEqual(result.cards[1].tag, "")

        call = fake_client.models.calls[0]
        self.assertEqual(call["model"], "fake-model")
        self.assertEqual(call["config"]["response_mime_type"], "application/json")
        self.assertIn("response_json_schema", call["config"])
        self.assertEqual(call["config"]["max_output_tokens"], 1024)
        self.assertEqual(call["contents"][0]["parts"][0]["file_data"]["file_uri"], self.pdf_file["uri"])

    def test_generate_cards_raises_on_invalid_json(self):
        fake_response = _FakeResponse("not json")
        fake_client = _FakeClient(fake_response)
        client = GeminiClient(api_key="test-key", client=fake_client)

        with self.assertRaises(GeminiStructuredOutputError):
            client.generate_cards(self.pdf_file, self.transcript, self.meta)

    def test_generate_cards_raises_on_empty_response(self):
        fake_response = _FakeResponse("")
        fake_client = _FakeClient(fake_response)
        client = GeminiClient(api_key="test-key", client=fake_client)

        with self.assertRaises(GeminiStructuredOutputError):
            client.generate_cards(self.pdf_file, self.transcript, self.meta)

    def test_generate_notes_returns_page_notes(self):
        payload = {
            "notes": [
                {"page_number": 1, "content": "# Intro\n- brief note"},
                {"page_number": 2, "content": "Summary bullet"},
            ]
        }
        fake_response = _FakeResponse(json.dumps(payload))
        fake_client = _FakeClient(fake_response)

        client = GeminiClient(
            api_key="test-key", client=fake_client, model_id="fake-model", max_output_tokens=1024
        )
        notes = client.generate_lecture_notes(self.pdf_file, self.transcript, self.meta)

        self.assertEqual(len(notes), 2)
        self.assertEqual(notes[0].page_number, 1)
        self.assertIn("Intro", notes[0].content)

        call = fake_client.models.calls[0]
        self.assertEqual(call["config"]["response_json_schema"], LectureNotesOutput.model_json_schema())

    def test_generate_notes_raises_on_empty_response(self):
        fake_response = _FakeResponse("")
        fake_client = _FakeClient(fake_response)
        client = GeminiClient(api_key="test-key", client=fake_client)

        with self.assertRaises(GeminiStructuredOutputError):
            client.generate_lecture_notes(self.pdf_file, self.transcript, self.meta)


if __name__ == "__main__":
    unittest.main()
