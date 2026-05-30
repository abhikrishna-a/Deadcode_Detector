import json
import os
from pathlib import Path

from openai import AsyncOpenAI
from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[2] / ".env")

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


def get_groq_client() -> AsyncOpenAI:
    groq_api_key = os.getenv("GROQ_API_KEY", "")
    if not groq_api_key:
        raise RuntimeError("No Groq API key configured. Set GROQ_API_KEY env var.")
    return AsyncOpenAI(api_key=groq_api_key, base_url=GROQ_BASE_URL)


async def call_groq_json(prompt: str, system: str | None = None) -> dict:
    client = get_groq_client()
    groq_model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    messages = []
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
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Groq returned invalid JSON: {exc}\nRaw: {raw[:500]}")
