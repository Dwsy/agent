/**
 * Pi Session State Plugin
 *
 * Unified session tagging via session-manager SQLite.
 *
 * Tool: session_tag (action: list/set/remove)
 * Commands: /state, /state-set, /state-list, /state-clear, /flow
 *
 * @module
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { registerTools } from "./tools.ts"
import { registerCommands } from "./commands.ts"
import { isDbAvailable, getDbPath, execute, initDb } from "./db.ts"

const BUILTINS = [
  { id: "builtin-todo", name: "待处理", color: "warning", sortOrder: 0 },
  { id: "builtin-wip", name: "进行中", color: "info", sortOrder: 1 },
  { id: "builtin-done", name: "已完成", color: "success", sortOrder: 2 },
  { id: "builtin-important", name: "重要", color: "destructive", sortOrder: 3 },
  { id: "builtin-archive", name: "归档", color: "slate", sortOrder: 4 },
]

function ensureBuiltinTags() {
  const now = new Date().toISOString()
  for (const tag of BUILTINS) {
    execute(`
      INSERT OR IGNORE INTO tags (id, name, color, sort_order, is_builtin, created_at)
      VALUES (?, ?, ?, ?, 1, ?)
    `, [tag.id, tag.name, tag.color, tag.sortOrder, now])
  }
}

function log(msg: string) {
  const fs = require("node:fs")
  const path = require("node:path")
  const os = require("node:os")
  // Cross-platform temp directory
  const tmpDir = os.tmpdir()
  const logPath = path.join(tmpDir, "pi-session-state.log")
  const line = `[${new Date().toISOString()}] ${msg}\n`
  fs.appendFileSync(logPath, line)
}

export default function (pi: ExtensionAPI) {
  log(`Extension loading...`)
  log(`DB path: ${getDbPath()}`)
  log(`DB available: ${isDbAvailable()}`)

  if (!isDbAvailable()) {
    log(`DB not found, initializing...`)
    const initResult = initDb()
    if (!initResult.success) {
      log(`FAILED init DB: ${initResult.error}`)
      return
    }
    log(`DB initialized`)
  }

  log(`Ensuring builtin tags...`)
  try {
    ensureBuiltinTags()
    log(`Builtin tags ensured`)
  } catch (err: any) {
    log(`FAILED ensure builtin tags: ${err.message || err}`)
  }

  log(`Registering tools...`)
  try {
    registerTools(pi)
    log(`Tools registered`)
  } catch (err: any) {
    log(`FAILED register tools: ${err.message || err}`)
    return
  }

  log(`Registering commands...`)
  try {
    registerCommands(pi)
    log(`Commands registered`)
  } catch (err: any) {
    log(`FAILED register commands: ${err.message || err}`)
  }

  log(`Extension loaded successfully`)
}

export * from "./types.ts"
export * as db from "./db.ts"
