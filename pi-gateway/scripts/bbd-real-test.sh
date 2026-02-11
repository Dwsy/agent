#!/usr/bin/env bash
# =============================================================================
# pi-gateway v2 真实环境 BBD 测试脚本
# Target: 115.191.43.169:18789
# =============================================================================

set -euo pipefail

GW_HOST="${GW_HOST:-115.191.43.169}"
GW_PORT="${GW_PORT:-18789}"
BASE_URL="http://${GW_HOST}:${GW_PORT}"
PASS=0
FAIL=0
RESULTS=()

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

report() {
  local name="$1" expected="$2" actual="$3" status="$4"
  if [[ "$status" == "PASS" ]]; then
    PASS=$((PASS + 1))
    RESULTS+=("✅ $name | $expected | $actual")
    echo -e "${GREEN}✅ PASS${NC}: $name"
  else
    FAIL=$((FAIL + 1))
    RESULTS+=("❌ $name | $expected | $actual")
    echo -e "${RED}❌ FAIL${NC}: $name"
  fi
}

echo "=========================================="
echo "pi-gateway v2 BBD 真实环境测试"
echo "Target: ${BASE_URL}"
echo "=========================================="
echo ""

# ------------------------------------------
# T1: Health check
# ------------------------------------------
echo "--- T1: Health Check ---"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/" 2>/dev/null || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  report "Gateway reachable" "HTTP 200" "HTTP $HTTP_CODE" "PASS"
else
  report "Gateway reachable" "HTTP 200" "HTTP $HTTP_CODE" "FAIL"
  echo "Gateway unreachable, aborting."
  exit 1
fi

# ------------------------------------------
# T2: Metrics endpoint
# ------------------------------------------
echo ""
echo "--- T2: Metrics Endpoint ---"
METRICS=$(curl -s "${BASE_URL}/api/metrics" 2>/dev/null)

# Check JSON structure
for field in pool queue latency counters; do
  if echo "$METRICS" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$field' in d" 2>/dev/null; then
    report "Metrics has '$field'" "present" "present" "PASS"
  else
    report "Metrics has '$field'" "present" "missing" "FAIL"
  fi
done

# Check pool details
POOL_MIN=$(echo "$METRICS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pool',{}).get('min','?'))" 2>/dev/null || echo "?")
POOL_MAX=$(echo "$METRICS" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pool',{}).get('max','?'))" 2>/dev/null || echo "?")
report "Pool config" "min=1,max=4" "min=$POOL_MIN,max=$POOL_MAX" \
  "$( [[ "$POOL_MIN" == "1" && "$POOL_MAX" == "4" ]] && echo PASS || echo FAIL )"

# ------------------------------------------
# T3: Webhook 429 (queue full simulation)
# ------------------------------------------
echo ""
echo "--- T3: Webhook 429 ---"
# Send many rapid webhook requests to try to fill queue
LAST_CODE="200"
for i in $(seq 1 20); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${BASE_URL}/hooks/wake" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"load-test-$i\",\"source\":{\"channel\":\"webhook\",\"senderId\":\"test-$i\",\"chatId\":\"test\",\"chatType\":\"dm\"}}" \
    2>/dev/null || echo "000")
  LAST_CODE="$CODE"
done
# At least verify the endpoint exists and responds
if [[ "$LAST_CODE" != "000" ]]; then
  report "Webhook endpoint responds" "HTTP 2xx/429" "HTTP $LAST_CODE" "PASS"
else
  report "Webhook endpoint responds" "HTTP 2xx/429" "unreachable" "FAIL"
fi

# ------------------------------------------
# T4: WebSocket connectivity
# ------------------------------------------
echo ""
echo "--- T4: WebSocket ---"
if command -v websocat &>/dev/null; then
  WS_RESULT=$(echo '{"type":"req","id":"test-1","method":"ping"}' | \
    timeout 5 websocat "ws://${GW_HOST}:${GW_PORT}/ws" 2>/dev/null || echo "timeout")
  if [[ "$WS_RESULT" != "timeout" && -n "$WS_RESULT" ]]; then
    report "WebSocket connects" "response received" "got response" "PASS"
  else
    report "WebSocket connects" "response received" "timeout/empty" "FAIL"
  fi
else
  echo "⚠️  websocat not installed, skipping WS test"
  report "WebSocket connects" "response received" "skipped (no websocat)" "FAIL"
fi

# ------------------------------------------
# T5: Config endpoint (redacted)
# ------------------------------------------
echo ""
echo "--- T5: Config (redacted) ---"
CONFIG=$(curl -s "${BASE_URL}/api/config" 2>/dev/null)
if echo "$CONFIG" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('gateway',{}).get('auth',{}).get('token','') == '***' or d.get('gateway',{}).get('auth',{}).get('mode','') == 'off'" 2>/dev/null; then
  report "Config token redacted" "*** or mode=off" "redacted" "PASS"
else
  report "Config token redacted" "*** or mode=off" "exposed?" "FAIL"
fi

# ------------------------------------------
# Summary
# ------------------------------------------
echo ""
echo "=========================================="
echo "RESULTS: ${PASS} pass / ${FAIL} fail / $((PASS + FAIL)) total"
echo "=========================================="
echo ""
echo "| Test | Expected | Actual | Status |"
echo "|------|----------|--------|--------|"
for r in "${RESULTS[@]}"; do
  echo "| $r |"
done
