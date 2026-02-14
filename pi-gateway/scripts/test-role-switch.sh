#!/bin/bash
# P4 角色切换 UX 集成测试脚本

set -e

GATEWAY_URL="${GATEWAY_URL:-http://localhost:52134}"
WS_URL="${WS_URL:-ws://localhost:52134/ws}"

echo "=== P4 Role Switch Integration Test ==="
echo "Gateway: $GATEWAY_URL"
echo ""

# Test 1: WS session.listRoles
echo "[Test 1] WS session.listRoles"
echo '{"type":"req","id":"1","method":"session.listRoles"}' | \
  websocat "$WS_URL" | jq . || echo "FAIL: session.listRoles"
echo ""

# Test 2: WS session.setRole (requires existing session)
echo "[Test 2] WS session.setRole"
SESSION_KEY="agent:main:webchat:test-role-switch"
echo "{\"type\":\"req\",\"id\":\"2\",\"method\":\"session.setRole\",\"params\":{\"sessionKey\":\"$SESSION_KEY\",\"role\":\"coding\"}}" | \
  websocat "$WS_URL" | jq . || echo "FAIL: session.setRole"
echo ""

# Test 3: REST API /api/memory/roles (existing endpoint)
echo "[Test 3] GET /api/memory/roles"
curl -s "$GATEWAY_URL/api/memory/roles" | jq . || echo "FAIL: /api/memory/roles"
echo ""

# Test 4: WebSocket connect and role change flow
echo "[Test 4] Full WebSocket role switch flow"
(
  # Connect
  echo '{"type":"req","id":"1","method":"connect"}'
  sleep 0.5
  # List roles
  echo '{"type":"req","id":"2","method":"session.listRoles"}'
  sleep 0.5
  # Set role for test session
  echo "{\"type\":\"req\",\"id\":\"3\",\"method\":\"session.setRole\",\"params\":{\"sessionKey\":\"agent:main:webchat:flow-test\",\"role\":\"default\"}}"
  sleep 2
) | websocat "$WS_URL" | jq -c . || echo "FAIL: flow test"
echo ""

echo "=== P4 Role Switch Test Complete ==="
echo ""
echo "Manual Telegram/Discord test:"
echo "  /role          - List available roles"
echo "  /role coding   - Switch to 'coding' role"
echo "  /role unknown  - Should show error"
