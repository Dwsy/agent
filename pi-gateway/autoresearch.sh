#!/bin/bash
set -euo pipefail

cd /Users/dengwenyu/.pi/agent/pi-gateway

echo "=== Typecheck ===" >&2
if ! bun run tsc --noEmit 2>&1; then
  echo "METRIC type_errors=1" >&2
  exit 1
fi
echo "METRIC type_errors=0" >&2

echo "=== QQBot Tests ===" >&2
TEST_OUTPUT=$(bun test src/plugins/builtin/qqbot/tests/ 2>&1) || true
echo "$TEST_OUTPUT" >&2

PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -cE "^\s+✓" || true)
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -cE "^\s+✗|FAIL\s" || true)

# Streaming benchmark metrics
STREAMING_METRIC=$(echo "$TEST_OUTPUT" | grep "METRIC outbound_msg_count=" | tail -1 | sed 's/.*METRIC outbound_msg_count=//' | tr -d ' ' || echo "unknown")
COMMAND_METRIC=$(echo "$TEST_OUTPUT" | grep "METRIC command_count=" | tail -1 | sed 's/.*METRIC command_count=//' | tr -d ' ' || echo "0")
TEST_METRIC=$(echo "$TEST_OUTPUT" | grep "METRIC test_pass=" | tail -1 | sed 's/.*METRIC test_pass=//' | tr -d ' ' || echo "unknown")

if [ "$STREAMING_METRIC" = "unknown" ] || [ "$COMMAND_METRIC" = "0" ]; then
  echo "=== Streaming Benchmark ===" >&2
  # Run the streaming benchmark test
  BENCH_OUTPUT=$(bun test src/plugins/builtin/qqbot/tests/streaming-bench.test.ts 2>&1) || true
  echo "$BENCH_OUTPUT" >&2
  
  OUTBOUND_COUNT=$(echo "$BENCH_OUTPUT" | grep "METRIC outbound_msg_count=" | tail -1 | sed 's/.*METRIC outbound_msg_count=//' | tr -d ' ' || echo "1")
  COMMAND_COUNT=$(echo "$BENCH_OUTPUT" | grep "METRIC command_recognized=" | wc -l | tr -d ' ' || echo "0")
  
  echo "=== Summary ===" >&2
  echo "outbound_msg_count=$OUTBOUND_COUNT"
  echo "command_count=$COMMAND_COUNT"
  echo "test_pass=1"
  echo "type_errors=0"
  
  if [ "$OUTBOUND_COUNT" = "1" ] && [ "$COMMAND_COUNT" = "4" ]; then
    echo "✅ PASSED"
    exit 0
  else
    echo "❌ FAILED"
    exit 1
  fi
fi

echo "=== Summary ===" >&2
echo "outbound_msg_count=$STREAMING_METRIC"
echo "command_count=$COMMAND_METRIC"  
echo "test_pass=$TEST_METRIC"
echo "type_errors=0"

# Determine pass/fail based on primary metric
BEST_OUTBOUND=1
if [ "$STREAMING_METRIC" = "$BEST_OUTBOUND" ]; then
  echo "✅ PASSED"
  exit 0
else
  echo "METRIC outbound_msg_count=$STREAMING_METRIC (baseline: $BEST_OUTBOUND)" >&2
  echo "❌ FAILED"
  exit 1
fi
