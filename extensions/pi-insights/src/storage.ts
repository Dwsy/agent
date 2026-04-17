// Pi Insights Plugin - Storage Layer

import { mkdir, readFile, writeFile, readdir, stat } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type { SessionMeta, SessionFacets } from './types'

const BASE_DIR = join(homedir(), '.pi', 'agent', 'usage-data')
const SESSION_META_DIR = join(BASE_DIR, 'session-meta')
const FACETS_DIR = join(BASE_DIR, 'facets')

// Ensure directories exist
async function ensureDirs(): Promise<void> {
  await mkdir(SESSION_META_DIR, { recursive: true })
  await mkdir(FACETS_DIR, { recursive: true })
}

// SessionMeta operations
export async function saveSessionMeta(meta: SessionMeta): Promise<void> {
  await ensureDirs()
  const path = join(SESSION_META_DIR, `${meta.session_id}.json`)
  await writeFile(path, JSON.stringify(meta, null, 2), { mode: 0o600 })
}

export async function loadSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const path = join(SESSION_META_DIR, `${sessionId}.json`)
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as SessionMeta
  } catch {
    return null
  }
}

export async function loadAllSessionMetas(sessionIds: string[]): Promise<Map<string, SessionMeta>> {
  const metas = new Map<string, SessionMeta>()
  await ensureDirs()
  
  // Load in batches
  const BATCH_SIZE = 50
  for (let i = 0; i < sessionIds.length; i += BATCH_SIZE) {
    const batch = sessionIds.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (id) => {
        const meta = await loadSessionMeta(id)
        return meta ? [id, meta] as const : null
      })
    )
    for (const result of results) {
      if (result) metas.set(result[0], result[1])
    }
  }
  
  return metas
}

export async function listCachedSessionMetas(): Promise<string[]> {
  await ensureDirs()
  try {
    const files = await readdir(SESSION_META_DIR)
    return files
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
  } catch {
    return []
  }
}

// Facets operations
export async function saveFacets(sessionId: string, facets: SessionFacets): Promise<void> {
  await ensureDirs()
  const path = join(FACETS_DIR, `${sessionId}.json`)
  await writeFile(path, JSON.stringify(facets, null, 2), { mode: 0o600 })
}

export async function loadFacets(sessionId: string): Promise<SessionFacets | null> {
  const path = join(FACETS_DIR, `${sessionId}.json`)
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as SessionFacets
  } catch {
    return null
  }
}

export async function loadAllFacets(sessionIds: string[]): Promise<Map<string, SessionFacets>> {
  const facets = new Map<string, SessionFacets>()
  await ensureDirs()
  
  const results = await Promise.all(
    sessionIds.map(async (id) => {
      const facet = await loadFacets(id)
      return facet ? [id, facet] as const : null
    })
  )
  
  for (const result of results) {
    if (result) facets.set(result[0], result[1])
  }
  
  return facets
}

// Cache utilities
export async function getCacheAge(filePath: string): Promise<number> {
  try {
    const stats = await stat(filePath)
    return Date.now() - stats.mtimeMs
  } catch {
    return Infinity
  }
}

export function isCacheValid(age: number, ttlMs: number): boolean {
  return age < ttlMs
}

// TTL constants (in milliseconds)
export const TTL = {
  SESSION_META: 7 * 24 * 60 * 60 * 1000, // 7 days
  FACETS: 30 * 24 * 60 * 60 * 1000,       // 30 days
} as const

// Get storage paths
export function getStoragePaths() {
  return {
    base: BASE_DIR,
    sessionMeta: SESSION_META_DIR,
    facets: FACETS_DIR,
  }
}
