// Pi Insights Plugin - Multi-Session Detection

import type { MultiSessionResult } from '../types'

// 30 minute overlap window
const OVERLAP_WINDOW_MS = 30 * 60 * 1000

export interface SessionTimestamp {
  sessionId: string
  timestamp: string
}

export function detectMultiSession(sessions: SessionTimestamp[]): MultiSessionResult {
  if (sessions.length < 2) {
    return {
      overlap_events: 0,
      sessions_involved: sessions.length,
      user_messages_during: 0,
      pattern: 'isolated',
    }
  }
  
  // Sort by timestamp
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  
  const sessionLastIndex = new Map<string, number>()
  const windowStart = { index: 0 }
  const activeInWindow = new Set<string>()
  let overlapEvents = 0
  let sessionsInvolved = 0
  let userMessagesDuring = 0
  
  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i]
    const msgTime = new Date(msg.timestamp).getTime()
    
    // Expand window
    const windowEndTime = msgTime
    const windowStartTime = msgTime - OVERLAP_WINDOW_MS
    
    // Shrink window from left
    while (windowStart.index < i) {
      const oldMsg = sorted[windowStart.index]
      const oldTime = new Date(oldMsg.timestamp).getTime()
      
      if (oldTime < windowStartTime) {
        const oldInWindow = activeInWindow.has(oldMsg.sessionId)
        if (oldInWindow) {
          activeInWindow.delete(oldMsg.sessionId)
        }
        windowStart.index++
      } else {
        break
      }
    }
    
    // Check for overlap (message from session already in window)
    if (activeInWindow.has(msg.sessionId)) {
      overlapEvents++
      userMessagesDuring++
    }
    
    // Add current session to window
    activeInWindow.add(msg.sessionId)
    sessionLastIndex.set(msg.sessionId, i)
  }
  
  // Count unique sessions
  sessionsInvolved = new Set(sessions.map(s => s.sessionId)).size
  
  // Determine pattern
  let pattern: MultiSessionResult['pattern'] = 'isolated'
  if (sessionsInvolved > 1 && overlapEvents > 0) {
    // Check if there's switching pattern (s1 -> s2 -> s1)
    const sessionOrder = sorted.map(s => s.sessionId)
    const uniquePattern = detectSwitchingPattern(sessionOrder)
    pattern = uniquePattern ? 'switching' : 'parallel'
  }
  
  return {
    overlap_events: overlapEvents,
    sessions_involved: sessionsInvolved,
    user_messages_during: userMessagesDuring,
    pattern,
  }
}

function detectSwitchingPattern(order: string[]): boolean {
  if (order.length < 3) return false
  
  // Simple heuristic: if we see the same session after another session,
  // it's likely switching
  const seen = new Set<string>()
  let lastSession: string | null = null
  
  for (const session of order) {
    if (lastSession !== null && session !== lastSession) {
      if (seen.has(session)) {
        return true // Found s1 -> s2 -> s1 pattern
      }
    }
    seen.add(session)
    lastSession = session
  }
  
  return false
}

export function calculateMultiSessionRatio(
  result: MultiSessionResult,
  totalMessages: number
): number {
  if (totalMessages === 0) return 0
  return result.user_messages_during / totalMessages
}
