#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Transaction Explanation Source Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

# Query the database
docker exec paymentanonomly-postgres-1 psql -U payment_user -d payment_anomaly -c "
SELECT 
  explanation_source,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM payment_transactions), 2) as percentage
FROM payment_transactions
GROUP BY explanation_source
ORDER BY count DESC;
" | tail -n +3 | head -n -2 | while read line; do
  if [[ $line == *"llm"* ]]; then
    echo -e "${GREEN}$line${NC}"
  else
    echo -e "${YELLOW}$line${NC}"
  fi
done

echo -e "\n${BLUE}───────────────────────────────────────────────────${NC}"

# Get total count
TOTAL=$(docker exec paymentanonomly-postgres-1 psql -U payment_user -d payment_anomaly -t -c "SELECT COUNT(*) FROM payment_transactions")
LLM_COUNT=$(docker exec paymentanonomly-postgres-1 psql -U payment_user -d payment_anomaly -t -c "SELECT COUNT(*) FROM payment_transactions WHERE explanation_source = 'llm'")
LLM_PCT=$(echo "scale=2; $LLM_COUNT * 100 / $TOTAL" | bc)

echo -e "${GREEN}LLM Explanations: $LLM_COUNT / $TOTAL ($LLM_PCT%)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"
