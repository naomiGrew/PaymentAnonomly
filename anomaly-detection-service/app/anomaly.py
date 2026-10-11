from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest

from app.llm import LlmExplainer
from app.models import AnalyzeTransactionRequest, AnalyzeTransactionResponse


@dataclass(frozen=True)
class AnalysisResult:
    anomaly_score: float
    flagged: bool
    reasons: list[str]


class PaymentAnomalyDetector:
    def __init__(self, explainer: LlmExplainer | None = None) -> None:
        self.model = IsolationForest(
            n_estimators=200,
            contamination=0.08,
            random_state=42,
        )
        self.model.fit(self._training_data())
        self.explainer = explainer

    def analyze(self, request: AnalyzeTransactionRequest) -> AnalyzeTransactionResponse:
        features = self._featurize(request)
        raw_score = -float(self.model.decision_function(features)[0])
        model_flagged = int(self.model.predict(features)[0]) == -1

        reasons: list[str] = []
        if request.amount >= 2500:
            reasons.append("amount is much higher than the simulated baseline")
        if request.transactionTimestamp.hour < 5 or request.transactionTimestamp.hour >= 23:
            reasons.append("transaction happened at an unusual hour")
        if request.country.upper() != request.homeCountry.upper():
            reasons.append("payment is cross-border relative to the account home country")
        if request.paymentMethod.lower() in {"crypto", "wire"}:
            reasons.append("payment method is less common in the training profile")

        anomaly_score = float(np.clip(1 / (1 + np.exp(-5 * raw_score)), 0, 1))
        flagged = model_flagged or len(reasons) >= 2 or request.amount >= 5000

        if not reasons and flagged:
            reasons.append("feature combination differs from normal transaction patterns")

        explanation, explanation_source = self._build_explanation(flagged, anomaly_score, reasons, request)
        return AnalyzeTransactionResponse(
            anomalyScore=round(anomaly_score, 4),
            flagged=flagged,
            reasons=reasons,
            explanation=explanation,
            explanationSource=explanation_source,
        )

    @property
    def explanation_mode(self) -> str:
        return "llm" if self.explainer is not None else "template"

    @staticmethod
    def _training_data() -> np.ndarray:
        rng = np.random.default_rng(42)
        amounts = rng.lognormal(mean=4.2, sigma=0.45, size=5000)
        hours = rng.integers(6, 22, size=5000)
        cross_border = rng.binomial(1, 0.08, size=5000)
        uncommon_method = rng.binomial(1, 0.05, size=5000)
        transaction_type = rng.binomial(1, 0.15, size=5000)
        return np.column_stack(
            [amounts, hours, cross_border, uncommon_method, transaction_type]
        )

    @staticmethod
    def _featurize(request: AnalyzeTransactionRequest) -> np.ndarray:
        is_cross_border = int(request.country.upper() != request.homeCountry.upper())
        uncommon_method = int(request.paymentMethod.lower() in {"crypto", "wire"})
        high_risk_type = int(request.transactionType.lower() in {"cash_advance", "refund"})
        return np.array(
            [[
                request.amount,
                request.transactionTimestamp.hour,
                is_cross_border,
                uncommon_method,
                high_risk_type,
            ]]
        )

    def _build_explanation(
        self,
        flagged: bool,
        anomaly_score: float,
        reasons: list[str],
        request: AnalyzeTransactionRequest,
    ) -> tuple[str, str]:
        if self.explainer is not None:
            return self.explainer.explain(request, anomaly_score, flagged, reasons), "llm"

        return self._template_explanation(flagged, anomaly_score, reasons, request), "template"

    @staticmethod
    def _template_explanation(
        flagged: bool,
        anomaly_score: float,
        reasons: list[str],
        request: AnalyzeTransactionRequest,
    ) -> str:
        if flagged:
            joined_reasons = "; ".join(reasons)
            return (
                f"Transaction for {request.amount:.2f} {request.currency} at {request.merchant} "
                f"was flagged with anomaly score {anomaly_score:.2f} because {joined_reasons}."
            )

        return (
            f"Transaction for {request.amount:.2f} {request.currency} at {request.merchant} "
            f"looks consistent with the current simulated baseline, with anomaly score "
            f"{anomaly_score:.2f}."
        )
