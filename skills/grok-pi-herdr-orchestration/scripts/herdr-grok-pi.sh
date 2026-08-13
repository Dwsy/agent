#!/usr/bin/env bash
# Run and supervise grok-pi inside a Herdr pane.
# The supervisor intentionally polls at most every 60 seconds; the default is 5s.
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
STATE_DIR="${GROK_PI_HERDR_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/grok-pi-herdr}"
POLL_SECONDS="${GROK_PI_HERDR_POLL_SECONDS:-5}"

usage() {
  printf '%s\n' \
    "Usage:" \
    "  $SCRIPT_NAME start [--cwd PATH] [--label TEXT] [--model MODEL] [--thinking LEVEL] [--tools LIST] [-- EXTRA_GROK_PI_ARGS...]" \
    "  $SCRIPT_NAME prompt RUN_ID TEXT [--wait] [--timeout SECONDS]" \
    "  $SCRIPT_NAME run [--cwd PATH] [--label TEXT] [--model MODEL] [--thinking LEVEL] [--tools LIST] [--timeout SECONDS] [--output PATH] -- PROMPT" \
    "  $SCRIPT_NAME status RUN_ID" \
    "  $SCRIPT_NAME wait RUN_ID [--timeout SECONDS]" \
    "  $SCRIPT_NAME read RUN_ID [LINES]" \
    "  $SCRIPT_NAME stop RUN_ID" \
    "" \
    "RUN_ID is the value printed by start, or a path to its JSON state file." \
    "Default state directory: $STATE_DIR" \
    "Polling interval: ${POLL_SECONDS}s (must be <= 60s)."
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v herdr >/dev/null 2>&1 || fail "herdr is not installed or not on PATH"
command -v grok-pi >/dev/null 2>&1 || fail "grok-pi is not installed or not on PATH"
command -v python3 >/dev/null 2>&1 || fail "python3 is required to parse Herdr JSON responses"

case "$POLL_SECONDS" in
  ''|*[!0-9]*) fail "GROK_PI_HERDR_POLL_SECONDS must be an integer" ;;
esac
[ "$POLL_SECONDS" -le 60 ] || fail "poll interval must be <= 60 seconds"

mkdir -p "$STATE_DIR"

json_field() {
  local field="$1"
  python3 -c '
import json, sys
obj = json.load(sys.stdin)
value = obj
for part in sys.argv[1].split("."):
    if isinstance(value, dict):
        value = value.get(part)
    else:
        value = None
        break
if value is None:
    raise SystemExit(2)
if isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
' "$field"
}

state_path() {
  local run_id="${1:-}"
  [ -n "$run_id" ] || fail "RUN_ID is required"
  if [ -f "$run_id" ]; then
    printf '%s\n' "$run_id"
  else
    printf '%s/%s.json\n' "$STATE_DIR" "$run_id"
  fi
}

read_state_value() {
  local path="$1"
  local field="$2"
  [ -f "$path" ] || fail "state file not found: $path"
  json_field "$field" < "$path"
}

write_state() {
  local path="$1"
  local run_id="$2"
  local tab_id="$3"
  local pane_id="$4"
  local cwd="$5"
  local label="$6"
  local extra_json="$7"
  python3 - "$path" "$run_id" "$tab_id" "$pane_id" "$cwd" "$label" "$extra_json" <<'PY'
import json, os, sys
path, run_id, tab_id, pane_id, cwd, label, extra_json = sys.argv[1:]
extra = json.loads(extra_json)
data = {
    "run_id": run_id,
    "tab_id": tab_id,
    "pane_id": pane_id,
    "cwd": cwd,
    "label": label,
    "command": extra.get("command", []),
    "created_at": extra.get("created_at"),
    "status": "starting",
}
tmp = f"{path}.tmp.{os.getpid()}"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
}

pane_id_for() {
  read_state_value "$1" pane_id
}

tab_id_for() {
  read_state_value "$1" tab_id
}

pane_output() {
  local pane="$1"
  local lines="${2:-80}"
  herdr pane read "$pane" --source recent-unwrapped --lines "$lines" --format text 2>/dev/null || true
}

process_info() {
  local pane="$1"
  herdr pane process-info --pane "$pane" 2>/dev/null || true
}

is_grok_alive() {
  local pane="$1"
  local info
  info="$(process_info "$pane")"
  printf '%s' "$info" | python3 -c '
import json, sys
try:
    obj = json.load(sys.stdin)
    processes = obj.get("result", {}).get("process_info", {}).get("foreground_processes", [])
    names = {p.get("argv0") for p in processes if isinstance(p, dict)}
    raise SystemExit(0 if ("grok-pi" in names or "pi-rpc" in names) else 1)
except Exception:
    raise SystemExit(1)
'
}

probe_state() {
  local pane="$1"
  local output
  output="$(pane_output "$pane" 100)"
  if ! is_grok_alive "$pane"; then
    PROBE_STATE="exited"
  elif printf '%s' "$output" | rg -q 'Thinking|Waiting for response|Responding|Working|\[stop\]'; then
    PROBE_STATE="working"
  elif printf '%s' "$output" | rg -q 'Question|Allow|Approve|Select an option|waiting for user'; then
    PROBE_STATE="blocked"
  else
    PROBE_STATE="idle"
  fi
  PROBE_OUTPUT="$output"
}

print_status() {
  local path="$1"
  local pane="$2"
  local run_id tab_id cwd label
  run_id="$(read_state_value "$path" run_id)"
  tab_id="$(read_state_value "$path" tab_id)"
  cwd="$(read_state_value "$path" cwd)"
  label="$(read_state_value "$path" label)"
  probe_state "$pane"
  python3 - "$run_id" "$tab_id" "$pane" "$cwd" "$label" "$PROBE_STATE" "$PROBE_OUTPUT" <<'PY'
import json, sys, datetime
run_id, tab_id, pane, cwd, label, state, output = sys.argv[1:]
print(json.dumps({
    "run_id": run_id,
    "tab_id": tab_id,
    "pane_id": pane,
    "cwd": cwd,
    "label": label,
    "state": state,
    "checked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "recent_output": output,
}, ensure_ascii=False))
PY
}

wait_for_state() {
  local path="$1"
  local timeout_seconds="$2"
  local pane
  pane="$(pane_id_for "$path")"
  local started now elapsed
  started="$(date +%s)"
  while :; do
    probe_state "$pane"
    now="$(date +%s)"
    elapsed=$((now - started))
    printf '[grok-pi-herdr] t=%ss state=%s pane=%s\n' "$elapsed" "$PROBE_STATE" "$pane" >&2
    if [ "$PROBE_STATE" = "idle" ] || [ "$PROBE_STATE" = "blocked" ] || [ "$PROBE_STATE" = "exited" ]; then
      printf '%s\n' "$PROBE_STATE"
      return 0
    fi
    [ "$elapsed" -lt "$timeout_seconds" ] || {
      printf 'timeout\n'
      return 124
    }
    sleep "$POLL_SECONDS"
  done
}

parse_timeout() {
  case "$1" in
    ''|*[!0-9]*) fail "timeout must be an integer number of seconds" ;;
  esac
  [ "$1" -gt 0 ] || fail "timeout must be greater than zero"
}

start_run() {
  local cwd="$PWD"
  local label="grok-pi research"
  local model=""
  local thinking=""
  local tools="read,grep,find,ls"
  local -a extra_args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --cwd) [ "$#" -ge 2 ] || fail "--cwd needs a value"; cwd="$2"; shift 2 ;;
      --label) [ "$#" -ge 2 ] || fail "--label needs a value"; label="$2"; shift 2 ;;
      --model) [ "$#" -ge 2 ] || fail "--model needs a value"; model="$2"; shift 2 ;;
      --thinking) [ "$#" -ge 2 ] || fail "--thinking needs a value"; thinking="$2"; shift 2 ;;
      --tools) [ "$#" -ge 2 ] || fail "--tools needs a value"; tools="$2"; shift 2 ;;
      --) shift; extra_args=("$@"); break ;;
      *) fail "unknown start option: $1" ;;
    esac
  done
  [ -d "$cwd" ] || fail "cwd is not a directory: $cwd"
  cwd="$(cd "$cwd" && pwd -P)"

  local tab_response tab_id pane_id run_id path created_at
  tab_response="$(herdr tab create --cwd "$cwd" --label "$label" --no-focus)"
  tab_id="$(printf '%s' "$tab_response" | json_field result.tab.tab_id)"
  pane_id="$(printf '%s' "$tab_response" | json_field result.root_pane.pane_id)"
  run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  path="$STATE_DIR/$run_id.json"
  created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local -a grok_args=(--pi-cwd "$cwd" --no-alt-screen --no-extensions --no-skills --no-context-files --tools "$tools")
  [ -n "$model" ] && grok_args+=(--model "$model")
  [ -n "$thinking" ] && grok_args+=(--thinking "$thinking")
  grok_args+=("${extra_args[@]}")
  local command_json
  command_json="$(python3 - "${grok_args[@]}" <<'PY'
import json, sys
print(json.dumps(["grok-pi", *sys.argv[1:]], ensure_ascii=False))
PY
)"
  write_state "$path" "$run_id" "$tab_id" "$pane_id" "$cwd" "$label" "{\"command\":$command_json,\"created_at\":\"$created_at\"}"
  herdr pane run "$pane_id" grok-pi "${grok_args[@]}" >/dev/null

  local ready_started ready_elapsed
  ready_started="$(date +%s)"
  while ! is_grok_alive "$pane_id"; do
    ready_elapsed=$(( $(date +%s) - ready_started ))
    [ "$ready_elapsed" -lt 60 ] || fail "grok-pi did not become ready within 60s; inspect: $path"
    sleep "$POLL_SECONDS"
  done
  probe_state "$pane_id"
  printf '%s\n' "$run_id"
}

prompt_run() {
  local run_id="$1"
  local text="$2"
  shift 2
  local wait=false timeout=3600
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --wait) wait=true; shift ;;
      --timeout) [ "$#" -ge 2 ] || fail "--timeout needs a value"; timeout="$2"; shift 2 ;;
      *) fail "unknown prompt option: $1" ;;
    esac
  done
  $wait && parse_timeout "$timeout"
  local path pane
  path="$(state_path "$run_id")"
  pane="$(pane_id_for "$path")"
  is_grok_alive "$pane" || fail "grok-pi is not running in pane $pane"
  herdr pane send-text "$pane" "$text" >/dev/null
  herdr pane send-keys "$pane" enter >/dev/null
  printf '%s\n' "prompt submitted to $run_id" >&2
  if $wait; then
    local outcome rc
    if outcome="$(wait_for_state "$path" "$timeout")"; then
      :
    else
      rc=$?
      [ "$rc" -eq 124 ] && exit 124
      return "$rc"
    fi
    [ "$outcome" = "idle" ]
  fi
}

run_once() {
  local cwd="$PWD" label="grok-pi research" model="" thinking="" tools="read,grep,find,ls" timeout=3600 output_path=""
  local -a extra_args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --cwd) [ "$#" -ge 2 ] || fail "--cwd needs a value"; cwd="$2"; shift 2 ;;
      --label) [ "$#" -ge 2 ] || fail "--label needs a value"; label="$2"; shift 2 ;;
      --model) [ "$#" -ge 2 ] || fail "--model needs a value"; model="$2"; shift 2 ;;
      --thinking) [ "$#" -ge 2 ] || fail "--thinking needs a value"; thinking="$2"; shift 2 ;;
      --tools) [ "$#" -ge 2 ] || fail "--tools needs a value"; tools="$2"; shift 2 ;;
      --timeout) [ "$#" -ge 2 ] || fail "--timeout needs a value"; timeout="$2"; shift 2 ;;
      --output) [ "$#" -ge 2 ] || fail "--output needs a value"; output_path="$2"; shift 2 ;;
      --) shift; break ;;
      *) fail "unknown run option: $1" ;;
    esac
  done
  [ "$#" -gt 0 ] || fail "run needs a prompt after --"
  parse_timeout "$timeout"
  local prompt_text="$*"
  local run_id path outcome rc
  local -a start_args=(--cwd "$cwd" --label "$label")
  [ -n "$model" ] && start_args+=(--model "$model")
  [ -n "$thinking" ] && start_args+=(--thinking "$thinking")
  start_args+=(--tools "$tools" -- "${extra_args[@]}")
  run_id="$(start_run "${start_args[@]}")"
  path="$(state_path "$run_id")"
  prompt_run "$run_id" "$prompt_text"
  if outcome="$(wait_for_state "$path" "$timeout")"; then
    :
  else
    rc=$?
    [ "$rc" -eq 124 ] && exit 124
    return "$rc"
  fi
  [ "$outcome" = "idle" ] || fail "grok-pi ended in state: $outcome"
  local pane
  pane="$(pane_id_for "$path")"
  if [ -n "$output_path" ]; then
    pane_output "$pane" 1000 > "$output_path"
    printf '%s\n' "$output_path"
  else
    pane_output "$pane" 1000
  fi
}

read_run() {
  local path pane lines="${2:-200}"
  path="$(state_path "$1")"
  pane="$(pane_id_for "$path")"
  pane_output "$pane" "$lines"
}

stop_run() {
  local path pane tab
  path="$(state_path "$1")"
  pane="$(pane_id_for "$path")"
  tab="$(tab_id_for "$path")"
  if is_grok_alive "$pane"; then
    herdr pane send-keys "$pane" ctrl+q >/dev/null || true
    sleep 1
  fi
  herdr tab close "$tab" >/dev/null || true
  python3 - "$path" <<'PY'
import json, os, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
data["status"] = "stopped"
tmp = f"{path}.tmp.{os.getpid()}"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
os.replace(tmp, path)
PY
  printf '%s\n' "stopped $1"
}

main() {
  [ "$#" -gt 0 ] || { usage; exit 2; }
  local command="$1"; shift
  case "$command" in
    start) start_run "$@" ;;
    prompt) [ "$#" -ge 2 ] || fail "prompt needs RUN_ID and TEXT"; prompt_run "$@" ;;
    run) run_once "$@" ;;
    status)
      local path pane
      path="$(state_path "${1:-}")"
      pane="$(pane_id_for "$path")"
      print_status "$path" "$pane"
      ;;
    wait)
      [ "$#" -ge 1 ] || fail "wait needs RUN_ID"
      local run_id="$1"; shift; local timeout=3600
      while [ "$#" -gt 0 ]; do case "$1" in --timeout) timeout="$2"; shift 2 ;; *) fail "unknown wait option: $1" ;; esac; done
      parse_timeout "$timeout"
      path="$(state_path "$run_id")"
      if outcome="$(wait_for_state "$path" "$timeout")"; then
        :
      else
        rc=$?
        [ "$rc" -eq 124 ] && exit 124
        return "$rc"
      fi
      printf '%s\n' "$outcome"
      [ "$outcome" = "idle" ]
      ;;
    read) [ "$#" -ge 1 ] || fail "read needs RUN_ID"; read_run "$@" ;;
    stop) [ "$#" -eq 1 ] || fail "stop needs exactly one RUN_ID"; stop_run "$1" ;;
    help|-h|--help) usage ;;
    *) fail "unknown command: $command" ;;
  esac
}

main "$@"
