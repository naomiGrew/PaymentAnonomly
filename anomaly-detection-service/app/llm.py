from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from app.models import AnalyzeTransactionRequest
from app.settings import LlmSettings


class LlmExplanationError(RuntimeError):
    pass


class LlmExplainer:
    def __init__(self, settings: LlmSettings) -> None:
        self.settings = settings

    def explain(
        self,
        request_model: AnalyzeTransactionRequest,
        anomaly_score: float,
        flagged: bool,
        reasons: list[str],
    ) -> str:
        payload = {
            "model": self.settings.model,
            "temperature": 0.2,
            "max_tokens": 180,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You explain payment anomaly alerts for fraud analysts. "
                        "Write plain English in 2 sentences max. "
                        "Mention the risk level, the strongest reasons, and whether the payment "
                        "looks normal or needs review. Do not invent facts."
                    ),
                },
                {
                    "role": "user",
                    "content": self._build_user_prompt(
                        request_model=request_model,
                        anomaly_score=anomaly_score,
                        flagged=flagged,
                        reasons=reasons,
                    ),
                },
            ],
        }

        http_request = request.Request(
            self.settings.chat_completions_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.settings.api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        try:
            with request.urlopen(http_request, timeout=self.settings.timeout_seconds) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise LlmExplanationError(
                f"LLM explanation request failed with status {exc.code}: {details}"
            ) from exc
        except error.URLError as exc:
            raise LlmExplanationError(f"LLM explanation request failed: {exc.reason}") from exc

        content = self._extract_content(response_payload)
        if not content:
            raise LlmExplanationError("LLM explanation response did not include message content")

        return content

    @staticmethod
    def _build_user_prompt(
        request_model: AnalyzeTransactionRequest,
        anomaly_score: float,
        flagged: bool,
        reasons: list[str],
    ) -> str:
        reason_text = ", ".join(reasons) if reasons else "no explicit reasons"
        risk_label = "flagged for analyst review" if flagged else "considered normal"
        return (
            f"Transaction summary:\n"
            f"- accountId: {request_model.accountId}\n"
            f"- merchant: {request_model.merchant}\n"
            f"- amount: {request_model.amount:.2f} {request_model.currency}\n"
            f"- payment country: {request_model.country}\n"
            f"- home country: {request_model.homeCountry}\n"
            f"- payment method: {request_model.paymentMethod}\n"
            f"- transaction type: {request_model.transactionType}\n"
            f"- timestamp: {request_model.transactionTimestamp.isoformat()}\n"
            f"- anomaly score: {anomaly_score:.4f}\n"
            f"- status: {risk_label}\n"
            f"- reasons: {reason_text}\n"
        )

    @staticmethod
    def _extract_content(payload: dict[str, Any]) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            return ""

        message = choices[0].get("message", {})
        content = message.get("content")

        if isinstance(content, str):
            return content.strip()

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
            return "\n".join(parts).strip()

        return ""
