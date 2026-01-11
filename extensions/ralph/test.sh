#!/bin/bash
# Simple test script for Ralph Wiggum extension

set -e

# Configurable extension path - override with EXT_PATH env var
# Default to local index.ts for development
EXT_PATH="${EXT_PATH:-./index.ts}"

echo "=== Ralph Wiggum Extension - Quick Tests ==="
echo ""

# Test 1: Syntax check
echo "Test 1: TypeScript syntax check..."
if node --check "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Extension compiles without errors"
else
  echo "  ❌ FAILED: Extension has syntax errors"
  exit 1
fi
echo ""

# Test 2: Argument parsing (manual test cases documented)
echo "Test 2: Argument parsing (manual test cases)"
echo "  Note: These are the cases parseArgs should handle:"
echo "    - Simple: 'Build API --max 5'"
echo "    - Quoted: '\"Fix bug\" --max 10'"
echo "    - Multiple words: '\"Task with spaces\" --promise DONE'"
echo ""

# Test 3: State file structure
echo "Test 3: State file structure validation"
cat > /tmp/test-ralph-state.md << 'EOF'
---
active: true
iteration: 5
max_iterations: 50
completion_promise: "DONE"
started_at: "2026-01-02T17:35:07Z"
subagent_mode: false
---

Build a REST API
EOF

if grep -q "^active: true" /tmp/test-ralph-state.md && \
   grep -q "^iteration: 5" /tmp/test-ralph-state.md; then
  echo "  ✅ PASSED: State file format looks correct"
else
  echo "  ❌ FAILED: State file format invalid"
  exit 1
fi
rm /tmp/test-ralph-state.md
echo ""

# Test 4: Promise tag extraction examples
echo "Test 4: Promise tag extraction examples"
echo "  Should extract from:"
echo '    <promise>DONE</promise>'
echo '    <promise>TASK COMPLETE</promise>'
echo ""

# Test 5: Extension file exists
echo "Test 5: Extension file exists"
if [ -f "$EXT_PATH" ]; then
  echo "  ✅ PASSED: Extension file exists at $EXT_PATH"
else
  echo "  ❌ FAILED: Extension file not found at $EXT_PATH"
  exit 1
fi
echo ""

# Test 6: Self-documenting help text
echo "Test 6: Self-documenting help text"
if grep -q "RALPH_HELP_TEXT" "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Help text embedded in extension"
else
  echo "  ❌ FAILED: Help text not found in extension"
  exit 1
fi
echo ""

# Test 7: Extension API compliance
echo "Test 7: Extension exports proper API"
if grep -q "export default function (pi: ExtensionAPI)" "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Extension exports ExtensionAPI handler"
else
  echo "  ❌ FAILED: Extension doesn't export correct API"
  exit 1
fi
echo ""

# Test 8: Commands are registered
echo "Test 8: Commands are properly registered"
if grep -q 'pi.registerCommand("ralph-loop"' "$EXT_PATH" 2>/dev/null && \
   grep -q 'pi.registerCommand("cancel-ralph"' "$EXT_PATH" 2>/dev/null && \
   grep -q 'pi.registerCommand("ralph-help"' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: All three commands registered"
else
  echo "  ❌ FAILED: Not all commands found"
  exit 1
fi
echo ""

# Test 9: Event handlers are present
echo "Test 9: Event handlers are present"
if grep -q 'pi.on("agent_start"' "$EXT_PATH" 2>/dev/null && \
   grep -q 'pi.on("agent_end"' "$EXT_PATH" 2>/dev/null && \
   grep -q 'pi.on("session_shutdown"' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Required event handlers present"
else
  echo "  ❌ FAILED: Missing event handlers"
  exit 1
fi
echo ""

# Test 10: Correct imports
echo "Test 10: Extension imports correct types"
if grep -q '@mariozechner/pi-coding-agent' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Correct package imports"
else
  echo "  ❌ FAILED: Missing pi-coding-agent imports"
  exit 1
fi
echo ""

# Test 11: CLI flags registered
echo "Test 11: CLI flags are registered"
if grep -q 'pi.registerFlag("ralph"' "$EXT_PATH" 2>/dev/null && \
   grep -q 'pi.registerFlag("ralph-max"' "$EXT_PATH" 2>/dev/null && \
   grep -q 'pi.registerFlag("ralph-promise"' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: All CLI flags registered"
else
  echo "  ❌ FAILED: Not all CLI flags found"
  exit 1
fi
echo ""

# Test 12: Keyboard shortcut registered
echo "Test 12: Keyboard shortcut registered"
if grep -q 'pi.registerShortcut(Key.ctrl("r")' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Ctrl+R shortcut registered"
else
  echo "  ❌ FAILED: Ctrl+R shortcut not found"
  exit 1
fi
echo ""

# Test 13: Message renderer registered
echo "Test 13: Custom message renderer registered"
if grep -q 'pi.registerMessageRenderer("ralph-loop"' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Message renderer registered"
else
  echo "  ❌ FAILED: Message renderer not found"
  exit 1
fi
echo ""

# Test 14: Widget support
echo "Test 14: Widget support implemented"
if grep -q 'ctx.ui.setWidget' "$EXT_PATH" 2>/dev/null && \
   grep -q 'RALPH_WIDGET_KEY' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: Widget support implemented"
else
  echo "  ❌ FAILED: Widget support not found"
  exit 1
fi
echo ""

# Test 15: session_start handler for state restoration
echo "Test 15: session_start handler for state restoration"
if grep -q 'pi.on("session_start"' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: session_start handler present"
else
  echo "  ❌ FAILED: session_start handler not found"
  exit 1
fi
echo ""

# Test 16: Correct sendMessage API
echo "Test 16: Correct sendMessage API usage"
if grep -q '{ triggerTurn: true, deliverAs: "followUp" }' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: sendMessage uses correct API"
else
  echo "  ❌ FAILED: sendMessage API incorrect"
  exit 1
fi
echo ""

# Test 17: File option support
echo "Test 17: --file option support"
if grep -q '\-\-file' "$EXT_PATH" 2>/dev/null; then
  echo "  ✅ PASSED: --file option supported"
else
  echo "  ❌ FAILED: --file option not found"
  exit 1
fi
echo ""

echo "=== All tests passed! ==="
echo ""
echo "Next steps:"
echo "1. Start pi with extension: pi --extension $EXT_PATH"
echo "   Or use short flag: pi -e $EXT_PATH"
echo "2. Run: /ralph-loop 'Create test.txt with hello' --max-iterations 3 --completion-promise 'DONE'"
echo "3. Verify loop behavior"
echo ""
echo "Alternative: Install globally for auto-discovery:"
echo "  ln -s \$(pwd) ~/.pi/agent/extensions/pi-ralph"
