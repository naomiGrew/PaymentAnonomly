from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from app.models import AnalyzeTransactionRequest
from app.settings import LlmSettings

MAX_EXPLANATION_WORDS = 35
MAX_EXPLANATION_CHARS = 180


class LlmExplanationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SafetyCheck:
    allowed: bool
    reasons: list[str]


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
        sanitized_request = self._sanitize_inputs(request_model)
        request_payload = self._build_request(sanitized_request, anomaly_score, flagged, reasons)
        response_payload = self._call_model(request_payload)
        content = self._extract_content(response_payload)

        if not content:
            raise LlmExplanationError("LLM explanation response did not include message content")

        safety = self._evaluate_output(content, sanitized_request, reasons)
        if not safety.allowed:
            raise LlmExplanationError(
                "LLM explanation failed safety evaluation: " + "; ".join(safety.reasons)
            )

        return content

    @staticmethod
    def _build_system_prompt() -> str:
        return (
            "You are a payment fraud analyst assistant. Explain anomaly alerts for a fraud analyst in concise risk language. "
            "Only describe facts supported by the supplied transaction metadata and the model reasons. "
            "Do not make up customer identities, merchant details, or legal conclusions. "
            "Write exactly 2 sentences, with no more than 35 words total. "
            "Use cautious, professional language. Treat the result as analysis assistance, not an accusation."
        )

    @staticmethod
    def _sanitize_inputs(request_model: AnalyzeTransactionRequest) -> AnalyzeTransactionRequest:
        sanitized = request_model.copy(deep=True)
        sanitized.accountId = re.sub(r"\s+", "", sanitized.accountId)[:60]
        sanitized.merchant = sanitized.merchant.strip()[:120]
        sanitized.currency = sanitized.currency.strip().upper()[:3]
        sanitized.country = sanitized.country.strip().upper()[:3]
        sanitized.homeCountry = sanitized.homeCountry.strip().upper()[:3]
        sanitized.paymentMethod = sanitized.paymentMethod.strip()[:40]
        sanitized.transactionType = sanitized.transactionType.strip()[:40]
        return sanitized

    def _build_request(
        self,
        request_model: AnalyzeTransactionRequest,
        anomaly_score: float,
        flagged: bool,
        reasons: list[str],
    ) -> dict[str, Any]:
        return {
            "model": self.settings.model,
            "temperature": 0.1,
            "max_tokens": 80,
            "messages": [
                {
                    "role": "system",
                    "content": self._build_system_prompt(),
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
            "Transaction summary:\n"
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
            "Write exactly 2 sentences and no more than 35 words total.\n"
            "Use only the supplied facts and model reasons.\n"
            "If the transaction is normal, say it looks consistent with the baseline.\n"
            "If it is flagged, identify the main drivers and keep it concise."
        )

    def _call_model(self, payload: dict[str, Any]) -> dict[str, Any]:
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
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise LlmExplanationError(
                f"LLM explanation request failed with status {exc.code}: {details}"
            ) from exc
        except error.URLError as exc:
            raise LlmExplanationError(f"LLM explanation request failed: {exc.reason}") from exc

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

    @staticmethod
    def _evaluate_output(
        content: str,
        request_model: AnalyzeTransactionRequest,
        reasons: list[str],
    ) -> SafetyCheck:
        normalized = " ".join(content.split())
        issues: list[str] = []

        if len(normalized) > MAX_EXPLANATION_CHARS:
            issues.append("explanation is too long")
        if len(normalized.split()) > MAX_EXPLANATION_WORDS:
            issues.append("explanation is too verbose")
        if not re.search(r"(?i)\b(merchant|amount|risk|flag|normal|review|cross-border|unusual|payment|transaction)\b", normalized):
            issues.append("explanation is too generic or missing evidence")
        if any(term in normalized.lower() for term in ["guarantee", "definitely fraud", "illegal", "criminal"]):
            issues.append("explanation makes unsupported legal or certainty claims")
        if not reasons and "normal" not in normalized.lower() and "review" not in normalized.lower():
            issues.append("explanation does not reflect the factual risk signal")

        if request_model.accountId and len(request_model.accountId) > 12:
            if request_model.accountId.lower() not in normalized.lower():
                pass

        return SafetyCheck(allowed=not issues, reasons=issues)
