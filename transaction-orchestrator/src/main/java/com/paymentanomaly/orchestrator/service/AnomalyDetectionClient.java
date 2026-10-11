package com.paymentanomaly.orchestrator.service;

import com.paymentanomaly.orchestrator.dto.AnomalyAnalysisRequest;
import com.paymentanomaly.orchestrator.dto.AnomalyAnalysisResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

@Component
public class AnomalyDetectionClient {

    private final RestTemplate restTemplate;
    private final String anomalyServiceBaseUrl;

    public AnomalyDetectionClient(
            RestTemplate restTemplate,
            @Value("${anomaly.service.base-url}") String anomalyServiceBaseUrl
    ) {
        this.restTemplate = restTemplate;
        this.anomalyServiceBaseUrl = anomalyServiceBaseUrl;
    }

    public AnomalyAnalysisResponse analyze(AnomalyAnalysisRequest request) {
        return restTemplate.postForObject(
                anomalyServiceBaseUrl + "/analyze",
                request,
                AnomalyAnalysisResponse.class
        );
    }
}
