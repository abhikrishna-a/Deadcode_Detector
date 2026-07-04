import os

from openai import AsyncOpenAI


class KeyManager:
    def __init__(self, env_var: str = "XAI_API_KEYS", base_url: str = "https://api.x.ai/v1"):
        raw = os.getenv(env_var, "")
        self._keys: list[str] = [k.strip() for k in raw.split(",") if k.strip()]
        self._base_url = base_url
        self._index = 0
        self._failed: set = set()

    @property
    def has_keys(self) -> bool:
        return len(self._keys) > 0

    def get_client(self) -> AsyncOpenAI:
        if not self._keys:
            raise RuntimeError("No xAI API keys configured. Set XAI_API_KEYS env var.")

        for _ in range(len(self._keys)):
            idx = self._index % len(self._keys)
            if idx in self._failed:
                self._index += 1
                continue
            self._index = idx
            return AsyncOpenAI(api_key=self._keys[idx], base_url=self._base_url)

        self._failed.clear()
        self._index = 0
        return AsyncOpenAI(api_key=self._keys[0], base_url=self._base_url)

    def mark_failed(self):
        idx = self._index % len(self._keys) if self._keys else 0
        self._failed.add(idx)
        self._index = (idx + 1) % len(self._keys) if self._keys else 0


xai_key_manager = KeyManager()
