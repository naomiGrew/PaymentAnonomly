package com.paymentanomaly.orchestrator.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record AnomalyAnalysisRequest(
        String accountId,
        String merchant,
        BigDecimal amount,
        String currency,
        String country,
        String homeCountry,
        String paymentMethod,
        String transactionType,
        OffsetDateTime transactionTimestamp
) {
}
