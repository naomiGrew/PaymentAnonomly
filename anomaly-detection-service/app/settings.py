from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class LlmSettings:
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float

    @property
    def chat_completions_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/chat/completions"

    @classmethod
    def from_env(cls) -> "LlmSettings | None":
        api_key = (os.getenv("LLM_API_KEY") or "").strip()
        model = (os.getenv("LLM_MODEL") or "").strip()

        if not api_key and not model:
            return None

        if not api_key or not model:
            raise ValueError("LLM_API_KEY and LLM_MODEL must both be set to enable LLM explanations")

        base_url = (os.getenv("LLM_API_BASE_URL") or "https://api.openai.com/v1").strip()
        timeout_seconds = float((os.getenv("LLM_TIMEOUT_SECONDS") or "15").strip())
        return cls(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout_seconds=timeout_seconds,
        )
