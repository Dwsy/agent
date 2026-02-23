#!/bin/bash
# BBD Test Migration Script

cd /Users/dengwenyu/.pi/agent/pi-gateway/src

# Core tests
mkdir -p core/tests/unit core/tests/integration

cp core/bbd-m2-simulation.test.ts core/tests/integration/message-queue.test.ts
cp core/bbd-m3-simulation.test.ts core/tests/integration/extension-ui.test.ts
cp core/bbd-m4-simulation.test.ts core/tests/integration/message-mode.test.ts
cp core/bbd-v3-routing.test.ts core/tests/unit/routing.skeleton.test.ts
cp core/bbd-v3-routing-real.test.ts core/tests/integration/routing.test.ts
cp core/bbd-v31-heartbeat-cron-media.test.ts core/tests/integration/telegram-integration.test.ts
cp core/bbd-v32-cron-api.test.ts core/tests/integration/cron-api.test.ts
cp core/bbd-v32-media-security.test.ts core/tests/unit/media-security.test.ts
cp core/bbd-v32-webchat-images.test.ts core/tests/integration/webchat-images.test.ts
cp core/bbd-v33-media-security.test.ts core/tests/unit/media-parser.test.ts
cp core/bbd-v33-media-send.test.ts core/tests/integration/media-send.test.ts
cp core/bbd-v33-system-prompts.test.ts core/tests/integration/system-prompts.test.ts
cp core/bbd-v34-auth.test.ts core/tests/unit/auth.test.ts
cp core/bbd-v34-exec-guard.test.ts core/tests/unit/exec-guard.test.ts
cp core/bbd-v34-message-send.test.ts core/tests/integration/message-send.test.ts
cp core/bbd-v34-ssrf-guard.test.ts core/tests/unit/ssrf-guard.test.ts
cp core/bbd-v35-bg002-bg003.test.ts core/tests/integration/drift-recovery.test.ts
cp core/bbd-v35-drift-detect.test.ts core/tests/unit/drift-detector.test.ts
cp core/bbd-v36-cron-tool.test.ts core/tests/unit/cron-tool.test.ts
cp core/bbd-v36-gateway-tools.test.ts core/tests/integration/gateway-tools.test.ts
cp core/bbd-v36-message-action.test.ts core/tests/integration/message-action.test.ts
cp core/bbd-v37-cron-completion-sync.test.ts core/tests/integration/cron-completion.test.ts
cp core/bbd-v38-gateway-tool.test.ts core/tests/unit/gateway-tool.test.ts
cp core/bbd-v38-message-action-p2.test.ts core/tests/integration/message-action-p2.test.ts

# Gateway tests
mkdir -p gateway/tests/integration
cp gateway/bbd-v34-session-reset.test.ts gateway/tests/integration/session-reset.test.ts

# Plugins tests
mkdir -p plugins/tests/unit plugins/tests/integration
cp plugins/bbd-v35-cold-start.test.ts plugins/tests/integration/cold-start.test.ts
if [ -f plugins/loader.test.ts ]; then
  cp plugins/loader.test.ts plugins/tests/unit/loader.test.ts
fi

# Telegram tests
mkdir -p plugins/builtin/telegram/tests/unit plugins/builtin/telegram/tests/integration
if [ -f plugins/builtin/telegram/__tests__/bbd-v3-step10.test.ts ]; then
  cp plugins/builtin/telegram/__tests__/bbd-v3-step10.test.ts plugins/builtin/telegram/tests/integration/telegram-step10.test.ts
fi
cp plugins/builtin/telegram/bbd-sticker.test.ts plugins/builtin/telegram/tests/integration/telegram-sticker.test.ts
cp plugins/builtin/telegram/bbd-v34-media-kind.test.ts plugins/builtin/telegram/tests/unit/telegram-media-kind.test.ts

# Security tests
mkdir -p security/tests/integration
cp security/bbd-v35-security.test.ts security/tests/integration/sender-allowlist.test.ts

# Tools tests
mkdir -p tools/tests/unit tools/tests/integration
cp tools/bbd-v3-delegate.test.ts tools/tests/integration/delegation.test.ts
cp tools/bbd-v3-metrics.test.ts tools/tests/unit/delegation-metrics.test.ts

echo "Files copied. Updating import paths..."

# Update imports
cd core/tests/unit
sed -i '' 's|from "\./|from "../../|g' *.test.ts

cd ../integration
sed -i '' 's|from "\./|from "../../|g' *.test.ts
sed -i '' 's|from "\.\./plugins/|from "../../plugins/|g' *.test.ts

cd ../../gateway/tests/integration
sed -i '' 's|from "\./|from "../../|g' *.test.ts

cd ../../plugins/tests/unit
sed -i '' 's|from "\./|from "../../|g' *.test.ts 2>/dev/null || true
sed -i '' 's|from "\.\./|from "../../|g' *.test.ts 2>/dev/null || true

cd ../integration
sed -i '' 's|from "\./|from "../../|g' *.test.ts
sed -i '' 's|from "\.\./|from "../../|g' *.test.ts

cd ../../plugins/builtin/telegram/tests/unit
sed -i '' 's|from "\./|from "../../../|g' *.test.ts
sed -i '' 's|from "\.\./|from "../../../../|g' *.test.ts

cd ../integration
sed -i '' 's|from "\./|from "../../../|g' *.test.ts
sed -i '' 's|from "\.\./|from "../../../../|g' *.test.ts

cd ../../../../../security/tests/integration
sed -i '' 's|from "\./|from "../../|g' *.test.ts

cd ../../tools/tests/unit
sed -i '' 's|from "\./|from "../../|g' *.test.ts
sed -i '' 's|from "\.\./|from "../../|g' *.test.ts

cd ../integration
sed -i '' 's|from "\./|from "../../|g' *.test.ts
sed -i '' 's|from "\.\./|from "../../|g' *.test.ts

echo "Done!"
