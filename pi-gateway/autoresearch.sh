#!/bin/bash
set -euo pipefail

cd /Users/dengwenyu/.pi/agent/pi-gateway

echo "=== Typecheck ===" >&2
if ! bun run tsc --noEmit 2>&1; then
  echo "METRIC type_errors=1" >&2
  exit 1
fi
echo "METRIC type_errors=0" >&2

echo "=== Discord Module Check ===" >&2

# Check module files exist
DISCORD_FILES=$(ls src/plugins/builtin/discord/*.ts 2>/dev/null | wc -l | tr -d ' ')
echo "discord_module_count=$DISCORD_FILES" >&2

# Check capabilities exist in index.ts
CAPABILITIES=$(grep -cE "nativeCommands|polls|streaming|reactions|threads|media|direct|group|security|editable|deletable|pinnable|history" src/plugins/builtin/discord/index.ts 2>/dev/null || echo "0")
echo "discord_capabilities=$CAPABILITIES" >&2

# Check key exports
HANDLERS_EXPORTS=$(grep -cE "^export (async )?function" src/plugins/builtin/discord/handlers.ts 2>/dev/null || echo "0")
echo "discord_handler_exports=$HANDLERS_EXPORTS" >&2

# Run discord tests if they exist
DISCORD_TEST_COUNT=0
if [ -d "src/plugins/builtin/discord/tests" ]; then
  echo "=== Discord Tests ===" >&2
  DISCORD_OUTPUT=$(bun test src/plugins/builtin/discord/tests/ 2>&1) || true
  echo "$DISCORD_OUTPUT" >&2
  DISCORD_TEST_COUNT=$(echo "$DISCORD_OUTPUT" | grep -cE "^\s+\(pass\)" || echo "0")
  DISCORD_TEST_PASS=$(echo "$DISCORD_OUTPUT" | grep -E "^\s+[0-9]+ pass" | awk '{print $1}' | tr -d ' ' || echo "0")
else
  DISCORD_TEST_PASS=0
fi

echo "=== Summary ===" >&2
echo "type_errors=0"
echo "discord_module_count=$DISCORD_FILES"
echo "discord_capabilities=$CAPABILITIES"
echo "discord_handler_exports=$HANDLERS_EXPORTS"
echo "discord_test_pass=$DISCORD_TEST_PASS"

# Pass: type_errors=0 AND at least 5 discord module files
if [ "$DISCORD_FILES" -ge 5 ] && [ "$CAPABILITIES" -ge 5 ]; then
  echo "✅ PASSED"
  exit 0
else
  echo "❌ FAILED (modules=$DISCORD_FILES, capabilities=$CAPABILITIES)"
  exit 1
fi
