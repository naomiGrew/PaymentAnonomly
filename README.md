# AI-Powered Payment Anomaly Detection

Starter monorepo for an anomaly-detection platform that scores payment transactions, explains alerts in plain English, and stores flagged activity for investigation.

## Architecture

- `transaction-orchestrator/`: Java Spring Boot API that receives transactions, calls the ML service, and persists results to PostgreSQL.
- `anomaly-detection-service/`: Python FastAPI service that uses `IsolationForest` to score transactions and generate a plain-English explanation.
- `dashboard-ui/`: analyst-friendly web UI for submitting transactions and reviewing alerts.
- `docker-compose.yml`: local stack for PostgreSQL plus both services.

## Quick start

```bash
cp .env.example .env
# update CHANGE_ME values in .env
docker compose up --build
```

Once the stack is running:

- Dashboard UI: `http://localhost:3000`
- Spring Boot API: `http://localhost:8081`
- FastAPI docs: `http://localhost:8000/docs`
- Spring health: `http://localhost:8081/actuator/health`

## Example request

```bash
curl -X POST http://localhost:8081/api/v1/transactions \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "acct-1024",
    "merchant": "Luxury Electronics",
    "amount": 6200.00,
    "currency": "USD",
    "country": "NG",
    "homeCountry": "US",
    "paymentMethod": "wire",
    "transactionType": "purchase",
    "transactionTimestamp": "2026-10-09T01:24:00Z"
  }'
```

The response includes:

- anomaly score
- flagged status
- human-readable explanation
- persisted transaction id for later retrieval

## Dashboard UI

The dashboard gives you:

- live KPI cards for total transactions, flagged alerts, average risk, and cross-border volume
- a transaction submission form with low-risk and risky presets
- a recent-transactions table with filtering
- an investigation panel showing explanation text, anomaly reasons, and transaction attributes

## LLM explanations

The Python service now supports a real OpenAI-compatible chat completion endpoint for alert explanations.

Set these variables before running `docker compose up --build`:

```bash
export LLM_API_KEY=your_api_key
export LLM_MODEL=gpt-4o-mini
export LLM_API_BASE_URL=https://api.openai.com/v1
export LLM_TIMEOUT_SECONDS=15
```

Notes:

- if `LLM_API_KEY` and `LLM_MODEL` are both set, explanations are generated through the LLM
- if neither is set, the service stays in template mode
- if only one is set, the anomaly service fails fast on startup so the misconfiguration is visible

## Local development

### Python service

```bash
cd anomaly-detection-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Java service

```bash
cd transaction-orchestrator
./mvnw spring-boot:run
```

Set these environment variables if you are not using Docker Compose:

```bash
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/payment_anomaly
export SPRING_DATASOURCE_USERNAME=payment_user
export SPRING_DATASOURCE_PASSWORD=CHANGE_ME
export ANOMALY_SERVICE_BASE_URL=http://localhost:8000
export LLM_API_KEY=your_api_key
export LLM_MODEL=gpt-4o-mini
export LLM_API_BASE_URL=https://api.openai.com/v1
```

## Public repository safety checklist

Before publishing this repo, make sure to:

1. Keep `.env` out of version control and only commit `.env.example`.
2. Use non-default credentials (`CHANGE_ME` placeholders are intentional).
3. Rotate any real API keys that were used during development.
4. Run secret scanning on the repo history (example: `gitleaks detect`).

## Next build targets

1. Replace the explanation template with a real LLM-backed explainer.
2. Add synthetic transaction generation for repeatable training and demo datasets.
3. Expand alert triage with analyst notes, case states, and dashboards.
