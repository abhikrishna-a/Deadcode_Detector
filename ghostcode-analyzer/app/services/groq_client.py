import json
import os
from pathlib import Path

from openai import AsyncOpenAI
from dotenv import load_dotenv

# Resolve .env relative to the project root (ghostcode-analyzer/.env)
# regardless of where uvicorn is launched from
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"
if not _ENV_PATH.exists():
    # fallback: one level up from app/
    _ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

load_dotenv(_ENV_PATH, override=True)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def get_groq_client() -> AsyncOpenAI:
    raw_key = os.getenv("GROQ_API_KEY", "")
    # Strip accidental whitespace or surrounding quotes added in .env
    groq_api_key = raw_key.strip().strip("\"'")

    if not groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. "
            f"Add it to {_ENV_PATH} as: GROQ_API_KEY=gsk_..."
        )
    if not groq_api_key.startswith("gsk_"):
        raise RuntimeError(
            f"GROQ_API_KEY looks wrong (does not start with 'gsk_'). "
            f"Current value preview: '{groq_api_key[:8]}...'. "
            "Get a valid key from https://console.groq.com/keys"
        )

    return AsyncOpenAI(api_key=groq_api_key, base_url=GROQ_BASE_URL)


async def call_groq_json(prompt: str, system: str | None = None) -> dict:
    client = get_groq_client()
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip()

    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=groq_model,
        messages=messages,
        temperature=0.1,
        max_tokens=8192,
        response_format={"type": "json_object"},
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
