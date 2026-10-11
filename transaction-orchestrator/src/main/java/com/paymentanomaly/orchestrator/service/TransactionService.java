package com.paymentanomaly.orchestrator.service;

import com.paymentanomaly.orchestrator.dto.AnomalyAnalysisResponse;
import com.paymentanomaly.orchestrator.dto.CreateTransactionRequest;
import com.paymentanomaly.orchestrator.dto.TransactionResponse;
import com.paymentanomaly.orchestrator.model.PaymentTransaction;
import com.paymentanomaly.orchestrator.repository.PaymentTransactionRepository;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TransactionService {

    private final PaymentTransactionRepository repository;
    private final AnomalyDetectionClient anomalyDetectionClient;

    public TransactionService(
            PaymentTransactionRepository repository,
            AnomalyDetectionClient anomalyDetectionClient
    ) {
        this.repository = repository;
        this.anomalyDetectionClient = anomalyDetectionClient;
    }

    public TransactionResponse createTransaction(CreateTransactionRequest request) {
        AnomalyAnalysisResponse analysis = Objects.requireNonNull(
                anomalyDetectionClient.analyze(request.toAnalysisRequest()),
                "Anomaly service returned no response"
        );

        PaymentTransaction transaction = new PaymentTransaction();
        transaction.setAccountId(request.accountId());
        transaction.setMerchant(request.merchant());
        transaction.setAmount(request.amount());
        transaction.setCurrency(request.currency());
        transaction.setCountry(request.country());
        transaction.setHomeCountry(request.homeCountry());
        transaction.setPaymentMethod(request.paymentMethod());
        transaction.setTransactionType(request.transactionType());
        transaction.setTransactionTimestamp(request.transactionTimestamp());
        transaction.setFlagged(analysis.flagged());
        transaction.setAnomalyScore(analysis.anomalyScore());
        transaction.setReasons(analysis.reasons());
        transaction.setExplanation(analysis.explanation());
        transaction.setExplanationSource(analysis.explanationSource());

        return toResponse(repository.save(transaction));
    }

    public TransactionResponse getTransaction(UUID transactionId) {
        return repository.findById(transactionId)
                .map(this::toResponse)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Transaction not found"));
    }

    public List<TransactionResponse> listTransactions(Boolean flagged) {
        List<PaymentTransaction> transactions = flagged == null
                ? repository.findAllByOrderByTransactionTimestampDesc()
                : repository.findByFlaggedOrderByTransactionTimestampDesc(flagged);

        return transactions.stream()
                .map(this::toResponse)
                .toList();
    }

    private TransactionResponse toResponse(PaymentTransaction transaction) {
        return new TransactionResponse(
                transaction.getId(),
                transaction.getAccountId(),
                transaction.getMerchant(),
                transaction.getAmount(),
                transaction.getCurrency(),
                transaction.getCountry(),
                transaction.getHomeCountry(),
                transaction.getPaymentMethod(),
                transaction.getTransactionType(),
                transaction.getTransactionTimestamp(),
                transaction.isFlagged(),
                transaction.getAnomalyScore(),
                transaction.getReasons(),
                transaction.getExplanation(),
                transaction.getExplanationSource() == null ? "template" : transaction.getExplanationSource(),
                transaction.getCreatedAt()
        );
    }
}
