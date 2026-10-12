package com.paymentanomaly.orchestrator.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.paymentanomaly.orchestrator.dto.TransactionResponse;
import com.paymentanomaly.orchestrator.model.PaymentTransaction;
import com.paymentanomaly.orchestrator.repository.PaymentTransactionRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TransactionServiceTest {

    @Mock
    private PaymentTransactionRepository repository;

    @Mock
    private AnomalyDetectionClient anomalyDetectionClient;

    private TransactionService service;

    @BeforeEach
    void setUp() {
        service = new TransactionService(repository, anomalyDetectionClient);
    }

    @Test
    void listTransactions_withoutFilters_usesDefaultOrderingAndMapsLowRisk() {
        PaymentTransaction transaction = transaction(
                false,
                List.of(),
                null
        );
        when(repository.findAllByOrderByTransactionTimestampDesc()).thenReturn(List.of(transaction));

        List<TransactionResponse> responses = service.listTransactions(null, null, null);

        verify(repository).findAllByOrderByTransactionTimestampDesc();
        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).riskLevel()).isEqualTo("LOW");
        assertThat(responses.get(0).explanationSource()).isEqualTo("template");
    }

    @Test
    void listTransactions_withFlaggedFilter_usesFlaggedQueryAndMapsMediumRisk() {
        PaymentTransaction transaction = transaction(
                true,
                List.of("feature combination differs from normal transaction patterns"),
                "llm"
        );
        when(repository.findByFlaggedOrderByTransactionTimestampDesc(true)).thenReturn(List.of(transaction));

        List<TransactionResponse> responses = service.listTransactions(true, null, null);

        verify(repository).findByFlaggedOrderByTransactionTimestampDesc(true);
        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).riskLevel()).isEqualTo("MEDIUM");
        assertThat(responses.get(0).explanationSource()).isEqualTo("llm");
    }

    @Test
    void listTransactions_withDateRangeAndFlagged_usesFlaggedRangeQueryAndMapsHighRisk() {
        Instant from = Instant.parse("2026-10-12T00:00:00Z");
        Instant to = Instant.parse("2026-10-12T23:59:59Z");
        PaymentTransaction transaction = transaction(
                true,
                List.of(
                        "transaction happened at an unusual hour",
                        "payment is cross-border relative to the account home country"
                ),
                "llm"
        );
        when(repository.findByFlaggedAndTransactionTimestampBetweenOrderByTransactionTimestampDesc(
                eq(true),
                eq(from),
                eq(to)
        )).thenReturn(List.of(transaction));

        List<TransactionResponse> responses = service.listTransactions(true, from, to);

        verify(repository).findByFlaggedAndTransactionTimestampBetweenOrderByTransactionTimestampDesc(true, from, to);
        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).riskLevel()).isEqualTo("HIGH");
    }

    @Test
    void listTransactions_withDateRangeOnly_usesRangeQuery() {
        Instant from = Instant.parse("2026-10-12T00:00:00Z");
        Instant to = Instant.parse("2026-10-12T23:59:59Z");
        PaymentTransaction transaction = transaction(
                false,
                List.of(),
                "template-fallback"
        );
        when(repository.findByTransactionTimestampBetweenOrderByTransactionTimestampDesc(from, to))
                .thenReturn(List.of(transaction));

        List<TransactionResponse> responses = service.listTransactions(null, from, to);

        verify(repository).findByTransactionTimestampBetweenOrderByTransactionTimestampDesc(from, to);
        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).riskLevel()).isEqualTo("LOW");
    }

    private PaymentTransaction transaction(boolean flagged, List<String> reasons, String explanationSource) {
        PaymentTransaction transaction = new PaymentTransaction();
        transaction.setId(UUID.randomUUID());
        transaction.setAccountId("acct-1001");
        transaction.setMerchant("Northwind Supply");
        transaction.setAmount(new BigDecimal("250.00"));
        transaction.setCurrency("USD");
        transaction.setCountry("US");
        transaction.setHomeCountry("US");
        transaction.setPaymentMethod("card");
        transaction.setTransactionType("purchase");
        transaction.setTransactionTimestamp(OffsetDateTime.of(2026, 10, 12, 10, 30, 0, 0, ZoneOffset.UTC));
        transaction.setFlagged(flagged);
        transaction.setAnomalyScore(0.55);
        transaction.setReasons(reasons);
        transaction.setExplanation("Example explanation");
        transaction.setExplanationSource(explanationSource);
        transaction.setCreatedAt(OffsetDateTime.of(2026, 10, 12, 10, 31, 0, 0, ZoneOffset.UTC));
        return transaction;
    }
}
