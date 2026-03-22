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
BENCH_OUTPUT=$(echo "$TEST_OUTPUT" | grep "METRIC" || true)
OUTBOUND_COUNT=$(echo "$BENCH_OUTPUT" | grep "outbound_msg_count" | head -1 | sed 's/.*outbound_msg_count=//' || echo "1")
COMMAND_COUNT=$(echo "$BENCH_OUTPUT" | grep "command_recognized=1" | wc -l || echo "0")
TEST_PASS=$((FAIL_COUNT == 0 ? 1 : 0))

echo "METRIC outbound_msg_count=$OUTBOUND_COUNT" >&2
echo "METRIC command_count=$COMMAND_COUNT" >&2
echo "METRIC test_pass=$TEST_PASS" >&2
echo "METRIC pass_count=$PASS_COUNT" >&2
echo "METRIC fail_count=$FAIL_COUNT" >&2

echo "outbound_msg_count=$OUTBOUND_COUNT"
echo "command_count=$COMMAND_COUNT"
echo "test_pass=$TEST_PASS"
echo "pass_count=$PASS_COUNT"
echo "fail_count=$FAIL_COUNT"
