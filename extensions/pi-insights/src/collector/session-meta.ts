// Pi Insights Plugin - Session Meta Extractor
// Pi jsonl format understanding from agent-session.js:
// - type: "message" with message.role: "user"|"assistant"|"toolResult"
// - message.content: [{type: "text"|"toolCall"|"thinking"|...}]
// - toolCall: {id, name, arguments: {command: "..."}}
// - message.stopReason: "toolUse"|"stop"|"aborted"|"error"
// - type: "session" with cwd field

import { readFile } from 'fs/promises'
import { join } from 'path'
import type { SessionMeta, ScannedSession } from '../types'
import { saveSessionMeta } from '../storage'

export interface ExtractionResult {
  meta: SessionMeta
  userMessageTimestamps: string[]
}

// Pi jsonl entry types
interface PiEntry {
  type: string
  timestamp?: string
  cwd?: string
  message?: {
    role: string
    content?: Array<{
      type: string
      text?: string
      thinking?: string
      name?: string  // toolCall.name
      arguments?: Record<string, unknown>  // toolCall.arguments
      id?: string
      toolResult?: { toolCallId: string; name: string; content?: Array<{ type: string; text?: string }>; isError?: boolean }
    }>
    stopReason?: string
    usage?: { input: number; output: number }
  }
}

export async function extractSessionMeta(session: ScannedSession): Promise<ExtractionResult | null> {
  try {
    // Support both file (.jsonl) and directory modes
    let entriesPath = session.sessionPath
    if (!entriesPath.endsWith('.jsonl')) {
      entriesPath = join(session.sessionPath, 'entries.jsonl')
    }
    
    const content = await readFile(entriesPath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)
    
    const meta: SessionMeta = {
      session_id: session.sessionId,
      session_name: session.sessionName,
      project_path: session.projectPath,
      start_time: session.startTime.toISOString(),
      end_time: session.endTime?.toISOString(),
      duration_minutes: calculateDuration(session.startTime, session.endTime),
      user_message_count: 0,
      assistant_message_count: 0,
      tool_counts: {},
      languages: {},
      lines_added: 0,
      lines_removed: 0,
      error_count: 0,
      git_commits: 0,
      git_pushes: 0,
      user_interruptions: 0,
      tool_errors: 0,
    }
    
    const userMessageTimestamps: string[] = []
    
    for (const line of lines) {
      try {
        const entry: PiEntry = JSON.parse(line)
        
        // Track project path from session entry
        if (entry.type === 'session' && entry.cwd) {
          meta.project_path = entry.cwd
        }
        
        // Process message entries
        if (entry.type === 'message' && entry.message) {
          const msg = entry.message
          
          if (msg.role === 'user') {
            meta.user_message_count++
            if (entry.timestamp) {
              userMessageTimestamps.push(entry.timestamp)
            }
          } else if (msg.role === 'assistant') {
            meta.assistant_message_count++
            
            // Check for aborted/errored stops
            if (msg.stopReason === 'aborted') {
              meta.user_interruptions++
            } else if (msg.stopReason === 'error') {
              meta.error_count++
            }
            
            // Extract tool calls from content
            if (msg.content) {
              for (const item of msg.content) {
                // Check if this content item is a toolCall
                if (item.type === 'toolCall' && item.name) {
                  const toolName = item.name
                  meta.tool_counts[toolName] = (meta.tool_counts[toolName] || 0) + 1
                  
                  // Track git commands from bash
                  if (toolName === 'bash' && item.arguments) {
                    const args = item.arguments
                    const cmd = (args.command as string) || ''
                    if (cmd.startsWith('git commit')) meta.git_commits++
                    if (cmd.startsWith('git push')) meta.git_pushes++
                    
                    // Estimate lines from git diff output
                    if (cmd.includes('git diff') || cmd.includes('git add')) {
                      if (cmd.length > 100) {
                        meta.lines_added += Math.floor(cmd.length / 50)
                      }
                    }
                  }
                }
              }
            }
          } else if (msg.role === 'toolResult' && msg.content) {
            // Check tool results for errors
            for (const item of msg.content) {
              if (item.toolResult?.isError) {
                meta.tool_errors++
              }
            }
          }
        }
        
      } catch {
        // Skip malformed JSON
      }
    }
    
    return { meta, userMessageTimestamps }
    
  } catch (error) {
    console.error(`Failed to extract meta for session ${session.sessionId}:`, error)
    return null
  }
}

function calculateDuration(start: Date, end?: Date): number {
  const endTime = end || new Date()
  return Math.round((endTime.getTime() - start.getTime()) / 60000)
}

export async function extractAndSaveSessionMeta(session: ScannedSession): Promise<ExtractionResult | null> {
  const result = await extractSessionMeta(session)
  if (result) {
    await saveSessionMeta(result.meta)
  }
  return result
}

export async function extractAllSessionMetas(
  sessions: ScannedSession[],
  onProgress?: (current: number, total: number) => void
): Promise<Array<{ session: ScannedSession; result: ExtractionResult }>> {
  const results: Array<{ session: ScannedSession; result: ExtractionResult }> = []
  
  for (let i = 0; i < sessions.length; i++) {
    const result = await extractAndSaveSessionMeta(sessions[i])
    if (result) {
      results.push({ session: sessions[i], result })
    }
    
    if (onProgress) {
      onProgress(i + 1, sessions.length)
    }
  }
  
  return results
}
