import json
import os
from pathlib import Path
from typing import List

from openai import AsyncOpenAI, APIError
from dotenv import load_dotenv

# Resolve .env relative to the project root (ghostcode-analyzer/.env)
# regardless of where uvicorn is launched from
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
if not _ENV_PATH.exists():
    _ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

load_dotenv(_ENV_PATH, override=True)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class GroqKeyManager:
    def __init__(self):
        raw = os.getenv("GROQ_API_KEYS", "") or os.getenv("GROQ_API_KEY", "")
        self._keys: List[str] = [k.strip().strip("\"'") for k in raw.split(",") if k.strip()]
        self._base_url = GROQ_BASE_URL
        self._index = 0

    @property
    def has_keys(self) -> bool:
        return len(self._keys) > 0

    def get_client(self) -> AsyncOpenAI:
        if not self._keys:
            raise RuntimeError(
                "No Groq API keys configured. Set GROQ_API_KEYS env var. "
                f"Add to {_ENV_PATH} as: GROQ_API_KEYS=gsk_...,gsk_..."
            )
        key = self._keys[self._index % len(self._keys)]
        if not key.startswith("gsk_"):
            raise RuntimeError(
                f"Groq API key at index {self._index} looks wrong "
                f"(does not start with 'gsk_'). Preview: '{key[:8]}...'"
            )
        return AsyncOpenAI(api_key=key, base_url=self._base_url)

    def rotate(self):
        self._index = (self._index + 1) % len(self._keys) if self._keys else 0


groq_key_manager = GroqKeyManager()


def get_groq_client() -> AsyncOpenAI:
    return groq_key_manager.get_client()


async def call_groq_json(prompt: str, system: str | None = None) -> dict:
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    last_error = None
    max_attempts = len(groq_key_manager._keys) if groq_key_manager.has_keys else 1

    for attempt in range(max_attempts):
        try:
            client = groq_key_manager.get_client()
            response = await client.chat.completions.create(
                model=groq_model,
                messages=messages,
                temperature=0.1,
                max_tokens=8192,
                response_format={"type": "json_object"},
            )
            last_error = None
            break
        except APIError as e:
            last_error = e
            groq_key_manager.rotate()
            if attempt < max_attempts - 1:
                continue
        except Exception as e:
            last_error = e
            groq_key_manager.rotate()
            if attempt < max_attempts - 1:
                continue

    if last_error:
        raise RuntimeError(
            f"Groq API call failed after {max_attempts} key(s): {last_error}"
        )

    raw = response.choices[0].message.content or "{}"
    cleaned = (
        raw.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"Groq returned invalid JSON: {exc}\nRaw (first 500): {raw[:500]}"
        )
