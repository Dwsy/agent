// Pi Insights Plugin - Lite Scan (Fast Session Discovery)

import { readdir, stat, readFile } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { ScannedSession } from '../types'

// Pi session storage paths
const PI_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions')

export interface ScanOptions {
  /** Only scan sessions newer than this date */
  since?: Date
  /** Only scan sessions in this directory */
  directory?: string
  /** Max sessions to scan */
  limit?: number
}

export async function scanSessions(options: ScanOptions = {}): Promise<ScannedSession[]> {
  const sessions: ScannedSession[] = []
  const sessionsDir = options.directory || PI_SESSIONS_DIR
  
  try {
    // List all entries in sessions directory
    const entries = await readdir(sessionsDir, { withFileTypes: true })
    
    for (const entry of entries) {
      // Skip private temp directories
      if (entry.name.startsWith('--private-tmp')) continue
      
      const fullPath = join(sessionsDir, entry.name)
      
      if (entry.isDirectory()) {
        // Directory mode: look for .jsonl files inside
        const result = await scanDirectory(fullPath, entry.name, options)
        if (result) sessions.push(result)
      } else if (entry.name.endsWith('.jsonl')) {
        // File mode: pi stores sessions as .jsonl files
        const result = await scanJsonlFile(fullPath, entry.name, options)
        if (result) sessions.push(result)
      }
      
      // Respect limit
      if (options.limit && sessions.length >= options.limit) break
    }
  } catch (error) {
    console.error(`Failed to scan sessions from ${sessionsDir}:`, error)
  }
  
  // Sort by start time (newest first)
  sessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
  
  return sessions
}

async function scanDirectory(dirPath: string, dirName: string, options: ScanOptions): Promise<ScannedSession | null> {
  try {
    // Scan all .jsonl files in directory
    const files = await readdir(dirPath)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse() // newest first
    
    if (jsonlFiles.length === 0) return null
    
    // Use the first (newest) jsonl file
    const jsonlFile = jsonlFiles[0]
    const entriesPath = join(dirPath, jsonlFile)
    const fileStat = await stat(entriesPath)
    
    const meta = await parseJsonlMetadata(entriesPath, dirName)
    if (!meta) return null
    
    // Filter by date if specified
    if (options.since && meta.startTime < options.since) return null
    
    return {
      sessionId: meta.sessionId || jsonlFile.replace('.jsonl', ''),
      sessionPath: entriesPath, // Use file path
      sessionName: meta.sessionName,
      projectPath: meta.projectPath || '',
      startTime: meta.startTime,
      endTime: meta.endTime,
      fileSize: fileStat.size,
    }
  } catch {
    // Failed to scan directory
    return null
  }
}

async function scanJsonlFile(filePath: string, fileName: string, options: ScanOptions): Promise<ScannedSession | null> {
  try {
    const fileStat = await stat(filePath)
    const meta = await parseJsonlMetadata(filePath, fileName)
    
    if (!meta) return null
    
    // Filter by date if specified
    if (options.since && meta.startTime < options.since) return null
    
    // Session ID from filename (remove .jsonl)
    const sessionId = fileName.replace('.jsonl', '')
    
    return {
      sessionId,
      sessionPath: filePath, // Use file path directly
      sessionName: meta.sessionName,
      projectPath: meta.projectPath || '',
      startTime: meta.startTime,
      endTime: meta.endTime,
      fileSize: fileStat.size,
    }
  } catch {
    return null
  }
}

interface ParsedMeta {
  sessionId?: string
  sessionName?: string
  projectPath?: string
  startTime: Date
  endTime?: Date
}

async function parseJsonlMetadata(filePath: string, fallbackId: string): Promise<ParsedMeta | null> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    
    if (lines.length === 0) return null
    
    let startTime = new Date()
    let endTime: Date | undefined
    let projectPath = ''
    
    // Parse first and last entries for timestamps
    try {
      const firstEntry = JSON.parse(lines[0])
      if (firstEntry.timestamp) {
        startTime = new Date(firstEntry.timestamp)
      }
      if (firstEntry.projectPath) {
        projectPath = firstEntry.projectPath
      }
    } catch {}
    
    if (lines.length > 1) {
      try {
        const lastEntry = JSON.parse(lines[lines.length - 1])
        if (lastEntry.timestamp) {
          endTime = new Date(lastEntry.timestamp)
        }
      } catch {}
    }
    
    return {
      sessionId: fallbackId.replace('.jsonl', ''),
      startTime,
      endTime,
      projectPath,
    }
  } catch {
    return null
  }
}

export async function getSessionsInRange(range: 'week' | 'month' | 'all'): Promise<ScannedSession[]> {
  const now = new Date()
  let since: Date | undefined
  
  switch (range) {
    case 'week':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case 'month':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    case 'all':
      since = undefined
      break
  }
  
  return scanSessions({ since })
}
