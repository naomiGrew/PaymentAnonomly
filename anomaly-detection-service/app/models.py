from datetime import datetime

from pydantic import BaseModel, Field


class AnalyzeTransactionRequest(BaseModel):
    accountId: str
    merchant: str
    amount: float = Field(gt=0)
    currency: str
    country: str
    homeCountry: str
    paymentMethod: str
    transactionType: str
    transactionTimestamp: datetime


class AnalyzeTransactionResponse(BaseModel):
    anomalyScore: float
    flagged: bool
    reasons: list[str]
    explanation: str
    explanationSource: str
