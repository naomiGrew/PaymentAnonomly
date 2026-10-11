package com.paymentanomaly.orchestrator.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record TransactionResponse(
        UUID id,
        String accountId,
        String merchant,
        BigDecimal amount,
        String currency,
        String country,
        String homeCountry,
        String paymentMethod,
        String transactionType,
        OffsetDateTime transactionTimestamp,
        boolean flagged,
        double anomalyScore,
        List<String> reasons,
        String explanation,
        String explanationSource,
        OffsetDateTime createdAt
) {
}
