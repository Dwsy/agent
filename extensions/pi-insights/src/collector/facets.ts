// Pi Insights Plugin - AI Facet Extractor

import type { SessionFacets, SessionMeta } from '../types'
import { saveFacets, loadFacets } from '../storage'

const MAX_CHUNK_SIZE = 25000 // characters per chunk

export interface FacetExtractionContext {
  sessionMeta: SessionMeta
  sessionSummary: string
}

export async function extractFacets(
  session: FacetExtractionContext,
  apiCall: (prompt: string) => Promise<string>
): Promise<SessionFacets | null> {
  // Check cache first
  const cached = await loadFacets(session.sessionMeta.session_id)
  if (cached) {
    return cached
  }
  
  try {
    // Build prompt
    const prompt = buildFacetPrompt(session)
    
    // Call API
    const response = await apiCall(prompt)
    
    // Parse JSON response
    const facets = parseFacetResponse(response, session.sessionMeta.session_id)
    if (!facets) {
      return null
    }
    
    // Cache result
    await saveFacets(session.sessionMeta.session_id, facets)
    
    return facets
  } catch (error) {
    console.error(`Failed to extract facets for ${session.sessionMeta.session_id}:`, error)
    return null
  }
}

function buildFacetPrompt(session: FacetExtractionContext): string {
  const { sessionMeta, sessionSummary } = session
  
  return `You are analyzing a pi-agent coding session. Extract structured insights from this session summary.

Session ID: ${sessionMeta.session_id}
Project: ${sessionMeta.project_path}
Duration: ${sessionMeta.duration_minutes} minutes
User Messages: ${sessionMeta.user_message_count}
Assistant Messages: ${sessionMeta.assistant_message_count}
Tools Used: ${JSON.stringify(sessionMeta.tool_counts)}
Lines Added: ${sessionMeta.lines_added}
Lines Removed: ${sessionMeta.lines_removed}
Errors: ${sessionMeta.error_count}

Session Summary:
${sessionSummary}

Extract the following facets as JSON:
{
  "session_id": "${sessionMeta.session_id}",
  "underlying_goal": "What the user was trying to accomplish",
  "goal_categories": {"coding": 5, "debugging": 2, "planning": 1},
  "outcome": "fully_achieved|mostly_achieved|partially_achieved|not_achieved",
  "user_satisfaction_counts": {"resolved": 3, "partial": 1, "unresolved": 0},
  "claude_helpfulness": "very_helpful|helpful|neutral|unhelpful",
  "session_type": "single_task|multi_task|iterative_refinement",
  "friction_counts": {"context_overflow": 0, "tool_errors": 2, "misunderstandings": 1},
  "primary_success": "Key success from this session",
  "brief_summary": "2-3 sentence summary"
}

Output ONLY valid JSON, no explanation.`
}

function parseFacetResponse(response: string, sessionId: string): SessionFacets | null {
  try {
    // Try to extract JSON from response
    let jsonStr = response.trim()
    
    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    // Find JSON object
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    
    if (startIdx === -1 || endIdx === -1) {
      return null
    }
    
    jsonStr = jsonStr.substring(startIdx, endIdx + 1)
    const parsed = JSON.parse(jsonStr)
    
    // Validate required fields
    if (!parsed.session_id) {
      parsed.session_id = sessionId
    }
    
    // Validate enum values
    const validOutcomes = ['fully_achieved', 'mostly_achieved', 'partially_achieved', 'not_achieved']
    if (!validOutcomes.includes(parsed.outcome)) {
      parsed.outcome = 'partially_achieved'
    }
    
    const validTypes = ['single_task', 'multi_task', 'iterative_refinement']
    if (!validTypes.includes(parsed.session_type)) {
      parsed.session_type = 'single_task'
    }
    
    const validHelpfulness = ['very_helpful', 'helpful', 'neutral', 'unhelpful']
    if (!validHelpfulness.includes(parsed.claude_helpfulness)) {
      parsed.claude_helpfulness = 'helpful'
    }
    
    return parsed as SessionFacets
  } catch (error) {
    console.error('Failed to parse facet response:', error)
    return null
  }
}

export async function summarizeForFacets(
  sessionMeta: SessionMeta,
  messageContent: string[],
  apiCall: (prompt: string) => Promise<string>
): Promise<string> {
  // If content is small enough, summarize directly
  const content = messageContent.join('\n\n---\n\n')
  if (content.length <= MAX_CHUNK_SIZE) {
    return summarizeChunk(content, sessionMeta, apiCall)
  }
  
  // Chunk long content
  const chunks: string[] = []
  for (let i = 0; i < content.length; i += MAX_CHUNK_SIZE) {
    chunks.push(content.substring(i, i + MAX_CHUNK_SIZE))
  }
  
  // Summarize each chunk in parallel
  const summaries = await Promise.all(
    chunks.map((chunk, idx) => summarizeChunk(chunk, sessionMeta, apiCall, idx + 1, chunks.length))
  )
  
  // Combine and summarize
  const combined = summaries.join('\n\n')
  return summarizeChunk(combined, sessionMeta, apiCall, 'final', 1)
}

async function summarizeChunk(
  content: string,
  sessionMeta: SessionMeta,
  apiCall: (prompt: string) => Promise<string>,
  part?: number | string,
  totalParts?: number
): Promise<string> {
  const partStr = part !== undefined ? `\n[Part ${part} of ${totalParts}]` : ''
  
  const prompt = `Summarize this pi-agent session transcript${partStr}:

Project: ${sessionMeta.project_path}
Duration: ${sessionMeta.duration_minutes} min
Tools: ${Object.keys(sessionMeta.tool_counts).join(', ')}

Transcript:
${content}

Provide a concise summary of:
1. Main tasks attempted
2. Key outcomes
3. Notable issues or successes

Keep under 500 words.`
  
  return apiCall(prompt)
}
