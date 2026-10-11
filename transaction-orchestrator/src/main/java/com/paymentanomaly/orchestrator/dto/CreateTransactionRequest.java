package com.paymentanomaly.orchestrator.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record CreateTransactionRequest(
        @NotBlank String accountId,
        @NotBlank String merchant,
        @NotNull @DecimalMin(value = "0.01") BigDecimal amount,
        @NotBlank String currency,
        @NotBlank String country,
        @NotBlank String homeCountry,
        @NotBlank String paymentMethod,
        @NotBlank String transactionType,
        @NotNull OffsetDateTime transactionTimestamp
) {
    public AnomalyAnalysisRequest toAnalysisRequest() {
        return new AnomalyAnalysisRequest(
                accountId,
                merchant,
                amount,
                currency,
                country,
                homeCountry,
                paymentMethod,
                transactionType,
                transactionTimestamp
        );
    }
}
