package com.paymentanomaly.orchestrator.dto;

import java.util.List;

public record AnomalyAnalysisResponse(
        double anomalyScore,
        boolean flagged,
        List<String> reasons,
        String explanation,
        String explanationSource
) {
}
