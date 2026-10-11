package com.paymentanomaly.orchestrator.repository;

import com.paymentanomaly.orchestrator.model.PaymentTransaction;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentTransactionRepository extends JpaRepository<PaymentTransaction, UUID> {

    List<PaymentTransaction> findByFlaggedOrderByTransactionTimestampDesc(boolean flagged);

    List<PaymentTransaction> findAllByOrderByTransactionTimestampDesc();
}
