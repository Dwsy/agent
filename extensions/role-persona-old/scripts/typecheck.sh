#!/usr/bin/env bash
# Typecheck the extension against the pi installation that actually loads it.
#
# pi's extension loader aliases bare imports to its own bundled packages
# (see pi-coding-agent dist/core/extensions/loader.js). This script mirrors
# those aliases as tsc `paths`, so the typecheck matches runtime resolution:
#   @earendil-works/pi-ai        -> pi-ai compat entrypoint (same as runtime)
#   @sinclair/typebox            -> pi's bundled `typebox` package
# Optional native deps (lancedb / onnxruntime / llama) are stubbed by
# types/optional-deps.d.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

PI_BIN="$(readlink -f "$(command -v pi)")"
PI_ROOT="${PI_BIN%/dist/cli.js}"
PI_NM="$PI_ROOT/node_modules"

if [[ ! -d "$PI_NM/@earendil-works" ]]; then
  echo "error: cannot locate pi installation from 'pi' binary ($PI_BIN)" >&2
  exit 1
fi

GEN=tsconfig.typecheck.gen.json
trap 'rm -f "$GEN"' EXIT

cat > "$GEN" <<EOF
{
  "compilerOptions": {
    "noEmit": true,
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "skipLibCheck": true,
    "strict": false,
    "types": ["node"],
    "typeRoots": ["$PI_NM/@types"],
    "baseUrl": ".",
    "paths": {
      "@earendil-works/pi-coding-agent": ["$PI_ROOT/dist/index.d.ts"],
      "@earendil-works/pi-ai": ["$PI_NM/@earendil-works/pi-ai/dist/compat.d.ts"],
      "@earendil-works/pi-ai/compat": ["$PI_NM/@earendil-works/pi-ai/dist/compat.d.ts"],
      "@earendil-works/pi-tui": ["$PI_NM/@earendil-works/pi-tui/dist/index.d.ts"],
      "@sinclair/typebox": ["$PI_NM/typebox/build/index.d.mts"]
    }
  },
  "include": ["index.ts", "runtime/**/*.ts", "types/**/*.d.ts"],
  "exclude": ["**/*.test.ts"]
}
EOF

bunx tsc -p "$GEN"
echo "typecheck OK"
