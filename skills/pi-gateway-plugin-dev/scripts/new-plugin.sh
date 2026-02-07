#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <plugins-root> <plugin-id> <plugin-name> [plugin-description]" >&2
  exit 1
fi

PLUGINS_ROOT="$1"
PLUGIN_ID="$2"
PLUGIN_NAME="$3"
PLUGIN_DESCRIPTION="${4:-${PLUGIN_NAME} plugin for pi-gateway}"

if [[ ! "$PLUGIN_ID" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Invalid plugin-id: '$PLUGIN_ID' (use lowercase letters, digits, hyphens)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_DIR="${SKILL_DIR}/assets/templates/plugin-skeleton"
TARGET_DIR="${PLUGINS_ROOT}/${PLUGIN_ID}"

if [[ -e "$TARGET_DIR" ]]; then
  echo "Target already exists: $TARGET_DIR" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}/src"

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

ESC_ID="$(escape_sed "$PLUGIN_ID")"
ESC_NAME="$(escape_sed "$PLUGIN_NAME")"
ESC_DESC="$(escape_sed "$PLUGIN_DESCRIPTION")"

render_template() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|__PLUGIN_ID__|${ESC_ID}|g" \
    -e "s|__PLUGIN_NAME__|${ESC_NAME}|g" \
    -e "s|__PLUGIN_DESCRIPTION__|${ESC_DESC}|g" \
    "$src" > "$dest"
}

render_template "${TEMPLATE_DIR}/plugin.json" "${TARGET_DIR}/plugin.json"
render_template "${TEMPLATE_DIR}/src/index.ts" "${TARGET_DIR}/src/index.ts"
render_template "${TEMPLATE_DIR}/src/types.ts" "${TARGET_DIR}/src/types.ts"
render_template "${TEMPLATE_DIR}/src/commands.ts" "${TARGET_DIR}/src/commands.ts"
render_template "${TEMPLATE_DIR}/src/rpc-methods.ts" "${TARGET_DIR}/src/rpc-methods.ts"
render_template "${TEMPLATE_DIR}/src/hooks.ts" "${TARGET_DIR}/src/hooks.ts"
render_template "${TEMPLATE_DIR}/src/services.ts" "${TARGET_DIR}/src/services.ts"

cat <<EOF
Created plugin skeleton:
  ${TARGET_DIR}

Next:
1) Add plugin directory to pi-gateway config plugins.dirs[]
2) Start gateway and check logs for: Loaded plugin: ${PLUGIN_ID}
3) Test commands: /models, /model provider/modelId, /think medium
EOF
