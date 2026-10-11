from fastapi import FastAPI, HTTPException

from app.anomaly import PaymentAnomalyDetector
from app.llm import LlmExplainer, LlmExplanationError
from app.models import AnalyzeTransactionRequest, AnalyzeTransactionResponse
from app.settings import LlmSettings

app = FastAPI(
    title="Payment Anomaly Detection Service",
    version="0.1.0",
    description="Scores transactions for anomalous behavior and explains the decision in plain English.",
)

detector = PaymentAnomalyDetector(
    explainer=LlmExplainer(settings) if (settings := LlmSettings.from_env()) is not None else None
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "explanationMode": detector.explanation_mode}


@app.post("/analyze", response_model=AnalyzeTransactionResponse)
def analyze_transaction(request: AnalyzeTransactionRequest) -> AnalyzeTransactionResponse:
    try:
        return detector.analyze(request)
    except LlmExplanationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
