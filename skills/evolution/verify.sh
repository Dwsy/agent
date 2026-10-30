#!/usr/bin/env bash
# Evolution Skill Installation Verification Script

set -e

echo "🔍 Evolution Skill Installation Verification"
echo "============================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check function
check() {
  if [ -f "$1" ] || [ -d "$1" ]; then
    echo -e "${GREEN}✅${NC} $1"
    return 0
  else
    echo -e "${RED}❌${NC} $1"
    return 1
  fi
}

# Check evolution skill
echo "1. Checking Evolution Skill Files..."
check ~/.pi/agent/skills/evolution/SKILL.md
check ~/.pi/agent/skills/evolution/README.md
check ~/.pi/agent/skills/evolution/QUICKSTART.md
check ~/.pi/agent/skills/evolution/workhub-integration/lib.ts
check ~/.pi/agent/skills/evolution/workhub-integration/templates/issue-template.md
check ~/.pi/agent/skills/evolution/workhub-integration/templates/pr-template.md
echo ""

# Check evolution hook
echo "2. Checking Evolution Hook..."
check ~/.pi/hooks/evolution.ts
echo ""

# Check workhub dependency
echo "3. Checking Workhub Dependency..."
check ~/.agents/skills/workhub/SKILL.md
echo ""

# Verify file contents
echo "4. Verifying File Contents..."

# Check SKILL.md has required sections
if grep -q "Hooks Integration" ~/.pi/agent/skills/evolution/SKILL.md; then
  echo -e "${GREEN}✅${NC} SKILL.md has Hooks Integration section"
else
  echo -e "${RED}❌${NC} SKILL.md missing Hooks Integration section"
fi

# Check hook exports default function
if grep -q "export default function" ~/.pi/hooks/evolution.ts; then
  echo -e "${GREEN}✅${NC} Hook exports default function"
else
  echo -e "${RED}❌${NC} Hook missing default export"
fi

# Check workhub integration lib
if grep -q "createEvolutionIssue" ~/.pi/agent/skills/evolution/workhub-integration/lib.ts; then
  echo -e "${GREEN}✅${NC} Workhub integration has createEvolutionIssue function"
else
  echo -e "${RED}❌${NC} Workhub integration missing createEvolutionIssue function"
fi

echo ""

# Test workhub integration
echo "5. Testing Workhub Integration..."
cd ~/.pi/agent/skills/evolution/workhub-integration

if command -v bun &> /dev/null; then
  if bun lib.ts --help &> /dev/null; then
    echo -e "${GREEN}✅${NC} Workhub integration lib.ts is executable"
  else
    echo -e "${YELLOW}⚠️${NC}  Workhub integration lib.ts has errors (run 'bun lib.ts --help' to see details)"
  fi
else
  echo -e "${YELLOW}⚠️${NC}  Bun not installed, skipping execution test"
fi

echo ""

# Summary
echo "============================================"
echo "✅ Installation Complete!"
echo ""
echo "Next Steps:"
echo "  1. Read the quick start guide:"
echo "     cat ~/.pi/agent/skills/evolution/QUICKSTART.md"
echo ""
echo "  2. Start a Pi Agent session to test the hook:"
echo "     pi"
echo ""
echo "  3. Create a manual evolution issue:"
echo "     cd /path/to/project"
echo "     bun ~/.agents/skills/workhub/lib.ts create issue \"test\" \"evolution\""
echo ""
echo "For detailed documentation:"
echo "  cat ~/.pi/agent/skills/evolution/README.md"
echo "  cat ~/.pi/agent/skills/evolution/SKILL.md"
echo "============================================"