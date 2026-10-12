package com.paymentanomaly.orchestrator.controller;

import com.paymentanomaly.orchestrator.dto.CreateTransactionRequest;
import com.paymentanomaly.orchestrator.dto.TransactionResponse;
import com.paymentanomaly.orchestrator.service.TransactionService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private final TransactionService transactionService;

    public TransactionController(TransactionService transactionService) {
        this.transactionService = transactionService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransactionResponse createTransaction(@Valid @RequestBody CreateTransactionRequest request) {
        return transactionService.createTransaction(request);
    }

    @GetMapping("/{transactionId}")
    public TransactionResponse getTransaction(@PathVariable UUID transactionId) {
        return transactionService.getTransaction(transactionId);
    }

    @GetMapping
    public List<TransactionResponse> listTransactions(
            @RequestParam(required = false) Boolean flagged,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        return transactionService.listTransactions(flagged, from, to);
    }
}
