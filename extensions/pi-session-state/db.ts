/**
 * Database operations for session-manager SQLite
 * Priority: sqlite CLI > better-sqlite3
 */
import { execSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { Tag, SessionTag, QueryResult } from "./types.ts"

const DB_PATH = join(homedir(), ".pi", "agent", "sessions", "sessions.db")

let sqliteCliAvailable: boolean | null = null
let betterSqlite: any = null

/**
 * Check if sqlite3 CLI is available
 */
function hasSqliteCli(): boolean {
  if (sqliteCliAvailable !== null) return sqliteCliAvailable
  try {
    execSync("sqlite3 --version", { stdio: "ignore" })
    sqliteCliAvailable = true
    return true
  } catch {
    sqliteCliAvailable = false
    return false
  }
}

/**
 * Try to load better-sqlite3
 */
function loadBetterSqlite(): any {
  if (betterSqlite !== null) return betterSqlite
  try {
    const module = require("better-sqlite3")
    betterSqlite = module.default || module
    return betterSqlite
  } catch {
    return null
  }
}

/**
 * Execute query using sqlite CLI
 */
function queryWithCli<T>(sql: string, params?: any[]): QueryResult<T[]> {
  try {
    // Substitute ? placeholders
    let finalSql = sql
    if (params) {
      let idx = 0
      finalSql = sql.replace(/\?/g, () => escapeValue(params[idx++]))
    }

    const result = spawnSync(
      "sqlite3",
      [DB_PATH, "-json", finalSql],
      { encoding: "utf-8", timeout: 5000 }
    )

    if (result.error) {
      return { success: false, error: result.error.message }
    }

    if (result.status !== 0) {
      return { success: false, error: result.stderr || "Unknown error" }
    }

    const stdout = result.stdout.trim()
    if (!stdout) return { success: true, data: [] as T[] }

    const data = JSON.parse(stdout) as T[]
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Execute query using better-sqlite3
 */
function queryWithBetterSqlite<T>(sql: string, params?: any[]): QueryResult<T[]> {
  const Database = loadBetterSqlite()
  if (!Database) {
    return { success: false, error: "better-sqlite3 not available" }
  }

  try {
    const db = new Database(DB_PATH)
    db.pragma("journal_mode = WAL")

    const stmt = db.prepare(sql)
    const data = params ? stmt.all(...params) : stmt.all()

    db.close()
    return { success: true, data: data as T[] }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Execute query with fallback
 */
function query<T>(sql: string, params?: any[]): QueryResult<T[]> {
  if (hasSqliteCli()) {
    return queryWithCli<T>(sql, params)
  }
  return queryWithBetterSqlite<T>(sql, params)
}

/**
 * Escape value for SQL string literal
 */
function escapeValue(val: any): string {
  if (val === null || val === undefined) return "NULL"
  if (typeof val === "number") return String(val)
  return `'${String(val).replace(/'/g, "''")}'`
}

/**
 * Execute non-query (INSERT/UPDATE/DELETE)
 */
function execute(sql: string, params?: any[]): QueryResult<void> {
  // Substitute ? placeholders
  let finalSql = sql
  if (params) {
    let idx = 0
    finalSql = sql.replace(/\?/g, () => escapeValue(params[idx++]))
  }

  if (hasSqliteCli()) {
    try {
      const result = spawnSync("sqlite3", [DB_PATH], {
        input: finalSql,
        encoding: "utf-8",
        timeout: 5000,
      })

      if (result.error) {
        return { success: false, error: result.error.message }
      }
      if (result.status !== 0) {
        return { success: false, error: result.stderr || "Unknown error" }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  // Use better-sqlite3
  const Database = loadBetterSqlite()
  if (!Database) {
    return { success: false, error: "No SQLite backend available" }
  }

  try {
    const db = new Database(DB_PATH)
    db.pragma("journal_mode = WAL")

    const stmt = db.prepare(sql)
    params ? stmt.run(...params) : stmt.run()

    db.close()
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check database availability
 */
export function isDbAvailable(): boolean {
  return existsSync(DB_PATH)
}

/**
 * Initialize database with required tables
 */
export function initDb(): { success: boolean; error?: string } {
  const { mkdirSync } = require("node:fs")
  const { dirname } = require("node:path")

  // Ensure directory exists
  const dbDir = dirname(DB_PATH)
  try {
    mkdirSync(dbDir, { recursive: true })
  } catch (err: any) {
    return { success: false, error: `Failed to create directory: ${err.message}` }
  }

  // Create tables
  const createTables = `
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'info',
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      auto_rules TEXT,
      parent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS session_tags (
      session_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      assigned_at TEXT NOT NULL,
      PRIMARY KEY (session_id, tag_id),
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_tags_session ON session_tags(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_tags_tag ON session_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(LOWER(name));
  `

  const result = execute(createTables)
  if (!result.success) {
    return { success: false, error: result.error }
  }

  return { success: true }
}

/**
 * Get database path
 */
export function getDbPath(): string {
  return DB_PATH
}

/**
 * Get all available tags
 */
export function getAllTags(): QueryResult<Tag[]> {
  const result = query<Tag>(`
    SELECT 
      id,
      name,
      color,
      icon,
      sort_order as sortOrder,
      is_builtin as isBuiltin,
      created_at as createdAt,
      auto_rules as autoRules,
      parent_id as parentId
    FROM tags
    ORDER BY sort_order, created_at
  `)

  if (!result.success) return result

  // Convert is_builtin from 0/1 to boolean
  const data = result.data?.map(tag => ({
    ...tag,
    isBuiltin: tag.isBuiltin === 1 || (tag.isBuiltin as any) === true,
  }))

  return { success: true, data }
}

/**
 * Get tags for a specific session
 */
export function getTagsForSession(sessionId: string): QueryResult<Tag[]> {
  const result = query<Tag>(`
    SELECT 
      t.id,
      t.name,
      t.color,
      t.icon,
      t.sort_order as sortOrder,
      t.is_builtin as isBuiltin,
      t.created_at as createdAt,
      t.auto_rules as autoRules,
      t.parent_id as parentId
    FROM tags t
    INNER JOIN session_tags st ON t.id = st.tag_id
    WHERE st.session_id = ?
    ORDER BY st.position, st.assigned_at
  `, [sessionId])

  if (!result.success) return result

  const data = result.data?.map(tag => ({
    ...tag,
    isBuiltin: tag.isBuiltin === 1 || (tag.isBuiltin as any) === true,
  }))

  return { success: true, data }
}

/**
 * Get all session-tag associations
 */
export function getAllSessionTags(): QueryResult<SessionTag[]> {
  return query<SessionTag>(`
    SELECT 
      session_id as sessionId,
      tag_id as tagId,
      position,
      assigned_at as assignedAt
    FROM session_tags
  `)
}

/**
 * Assign a tag to a session
 */
export function assignTag(sessionId: string, tagId: string): QueryResult<void> {
  const now = new Date().toISOString()
  return execute(`
    INSERT OR REPLACE INTO session_tags (session_id, tag_id, position, assigned_at)
    VALUES (?, ?, 0, ?)
  `, [sessionId, tagId, now])
}

/**
 * Remove a tag from a session
 */
export function removeTag(sessionId: string, tagId: string): QueryResult<void> {
  return execute(`
    DELETE FROM session_tags
    WHERE session_id = ? AND tag_id = ?
  `, [sessionId, tagId])
}

/**
 * Move session from one tag to another
 */
export function moveSessionTag(
  sessionId: string,
  fromTagId: string | null,
  toTagId: string
): QueryResult<void> {
  const now = new Date().toISOString()

  // Start with removing from old tag if specified
  if (fromTagId) {
    const removeResult = removeTag(sessionId, fromTagId)
    if (!removeResult.success) return removeResult
  }

  // Assign to new tag
  return execute(`
    INSERT OR REPLACE INTO session_tags (session_id, tag_id, position, assigned_at)
    VALUES (?, ?, 0, ?)
  `, [sessionId, toTagId, now])
}

/**
 * Get builtin tags (system status tags)
 */
export function getBuiltinTags(): QueryResult<Tag[]> {
  const result = getAllTags()
  if (!result.success) return result

  return {
    success: true,
    data: result.data?.filter(t => t.isBuiltin) || [],
  }
}

/**
 * Get tag by name (case-insensitive)
 */
export function getTagByName(name: string): QueryResult<Tag | null> {
  const result = query<Tag>(`
    SELECT 
      id,
      name,
      color,
      icon,
      sort_order as sortOrder,
      is_builtin as isBuiltin,
      created_at as createdAt,
      auto_rules as autoRules,
      parent_id as parentId
    FROM tags
    WHERE LOWER(name) = LOWER(?)
    LIMIT 1
  `, [name])

  if (!result.success) return { success: false, error: result.error }

  const tag = result.data?.[0]
  if (tag) {
    return {
      success: true,
      data: {
        ...tag,
        isBuiltin: tag.isBuiltin === 1 || (tag.isBuiltin as any) === true,
      },
    }
  }

  return { success: true, data: null }
}

/**
 * Get or create a tag by name
 */
export function getOrCreateTag(
  name: string,
  color: string = "info",
  icon?: string
): QueryResult<Tag> {
  // Try to find existing
  const existing = getTagByName(name)
  if (!existing.success) return { success: false, error: existing.error }
  if (existing.data) return { success: true, data: existing.data }

  // Create new tag
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const now = new Date().toISOString()

  const result = execute(`
    INSERT INTO tags (id, name, color, icon, sort_order, is_builtin, created_at)
    VALUES (?, ?, ?, ?, 0, 0, ?)
  `, [id, name, color, icon || null, now])

  if (!result.success) return { success: false, error: result.error }

  return {
    success: true,
    data: {
      id,
      name,
      color,
      icon,
      sortOrder: 0,
      isBuiltin: false,
      createdAt: now,
    },
  }
}