// Pi Insights Plugin - Main Entry Point
// Usage: /insights [week|month|all]

import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'
import { complete, type Api, type Model, type UserMessage } from '@mariozechner/pi-ai'
import { getSessionsInRange } from './collector/lite-scan'
import { extractSessionMeta } from './collector/session-meta'
import { aggregateData } from './analyzer/aggregator'
import { detectMultiSession } from './analyzer/multi-session'
import { generateHtmlReport, saveReport } from './reporter/template'
import type { SessionMeta, AggregatedData, InsightResults } from './types'

// Plugin state
let currentData: AggregatedData | null = null
let currentInsights: InsightResults | null = null

// System prompt for insights generation
const INSIGHTS_SYSTEM_PROMPT = `You are a usage analyst for an AI coding assistant. Analyze the user's usage patterns and generate personalized insights.

Return your response as a JSON object with the requested insights. Keep responses concise and actionable.
Use Chinese for suggestions if the user's messages are in Chinese.`

export default function (pi: ExtensionAPI): void {
  if (process.argv.includes('--mode') && process.argv.includes('rpc')) return

  // Register /insights command
  pi.registerCommand('insights', {
    description: 'Generate insights about your pi-agent usage',
    handler: async (args, ctx) => {
      await runInsights(args, ctx)
    },
  })

  // Register /usage command (quick stats)
  pi.registerCommand('usage', {
    description: 'Show quick usage stats',
    handler: async (_args, ctx) => {
      await showQuickStats(ctx)
    },
  })
}

async function runInsights(args: string, ctx: ExtensionCommandContext): Promise<void> {
  const options = parseArgs(args)
  
  ctx.ui.setStatus('insights', 'Scanning sessions...')
  
  try {
    // Phase 1: Scan sessions
    const sessions = await getSessionsInRange(options.timeRange)
    if (sessions.length === 0) {
      ctx.ui.notify('No sessions found', 'warning')
      return
    }
    
    ctx.ui.setStatus('insights', `Found ${sessions.length} sessions...`)
    
    // Phase 2: Extract metadata
    const metas: SessionMeta[] = []
    const timestamps: Array<{ sessionId: string; timestamp: string }> = []
    
    for (let i = 0; i < sessions.length; i++) {
      const result = await extractSessionMeta(sessions[i])
      if (result) {
        metas.push(result.meta)
        timestamps.push(...result.userMessageTimestamps.map(ts => ({
          sessionId: sessions[i].sessionId,
          timestamp: ts,
        })))
      }
      if ((i + 1) % 10 === 0) {
        ctx.ui.setStatus('insights', `Extracting metadata... ${i + 1}/${sessions.length}`)
      }
    }
    
    // Phase 3: Multi-session detection
    const multiSession = detectMultiSession(timestamps)
    
    // Phase 4: Aggregate data
    ctx.ui.setStatus('insights', 'Aggregating data...')
    const aggregatedData = aggregateData(metas, new Map(), multiSession)
    currentData = aggregatedData
    
    // Phase 5: Generate AI insights
    ctx.ui.setStatus('insights', 'Generating AI insights...')
    const insights = await generateAIInsights(aggregatedData, ctx)
    currentInsights = insights
    
    // Phase 6: Generate report
    ctx.ui.setStatus('insights', 'Generating report...')
    const html = generateHtmlReport(aggregatedData, insights)
    const reportPath = await saveReport(html)
    
    ctx.ui.setStatus('insights', undefined)
    ctx.ui.notify(`Insights generated! (${sessions.length} sessions)`, 'info')
    
    // Offer to open
    if (options.openBrowser) {
      await openInBrowser(reportPath)
    } else {
      ctx.ui.notify(`Report: ${reportPath}`, 'info')
    }
    
  } catch (error) {
    ctx.ui.setStatus('insights', undefined)
    ctx.ui.notify(`Error: ${error}`, 'error')
    console.error('Insights error:', error)
  }
}

async function generateAIInsights(data: AggregatedData, ctx: ExtensionCommandContext): Promise<InsightResults> {
  const insights: InsightResults = {}
  
  // Build context for AI
  const context = buildContext(data)
  
  // Generate each section using AI
  const sections = [
    { key: 'at_a_glance', prompt: buildAtAGlancePrompt(context) },
    { key: 'what_works', prompt: buildWhatWorksPrompt(context) },
    { key: 'suggestions', prompt: buildSuggestionsPrompt(context) },
    { key: 'friction_analysis', prompt: buildFrictionPrompt(context) },
  ]
  
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    ctx.ui.setStatus('insights', `Generating ${section.key}... (${i + 1}/${sections.length})`)
    
    try {
      const result = await callAI(section.prompt, ctx)
      console.log(`[DEBUG] ${section.key} result:`, result?.substring(0, 300))
      if (result) {
        // Try to parse as JSON
        const parsed = parseJSONResponse(result)
        if (parsed) {
          console.log(`[DEBUG] ${section.key} parsed as JSON`)
          ;(insights as any)[section.key] = parsed
        } else {
          // If not JSON, create simple text structure
          console.log(`[DEBUG] ${section.key} using as text`)
          ;(insights as any)[section.key] = { text: result }
        }
      } else {
        console.log(`[DEBUG] ${section.key} result was null`)
      }
    } catch (error) {
      console.error(`Failed to generate ${section.key}:`, error)
    }
  }
  
  // Ensure at_a_glance exists
  if (!insights.at_a_glance) {
    insights.at_a_glance = generateRuleBasedAtAGlance(data)
  }
  
  return insights
}

async function callAI(prompt: string, ctx: ExtensionCommandContext): Promise<string | null> {
  // Get current model and API key
  const model = ctx.model
  if (!model) {
    ctx.ui.notify('No model available for AI insights', 'warning')
    return null
  }
  
  // Use any to bypass TypeScript issues with modelRegistry
  const registry = ctx.modelRegistry as any
  if (!registry) {
    ctx.ui.notify('No model registry available', 'warning')
    return null
  }
  
  const auth = await registry.getApiKeyAndHeaders(model)
  if (!auth || !auth.ok || !auth.apiKey) {
    ctx.ui.notify('Cannot get API key for AI insights', 'warning')
    return null
  }
  
  const userMessage: UserMessage = {
    role: 'user',
    content: [{ type: 'text', text: prompt }],
    timestamp: Date.now(),
  }
  
  try {
    const response = await complete(
      model,
      { systemPrompt: INSIGHTS_SYSTEM_PROMPT, messages: [userMessage] },
      { apiKey: auth.apiKey }
    )
    
    if (response.stopReason === 'aborted' || response.stopReason === 'error') {
      return null
    }
    
    const text = response.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('')
    
    return text || null
  } catch (error) {
    console.error('AI call failed:', error)
    return null
  }
}

function parseJSONResponse(text: string): any | null {
  // Try to extract JSON from markdown code blocks
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim())
    } catch {}
  }
  
  // Try to find JSON directly
  const startIdx = text.indexOf('{')
  const endIdx = text.lastIndexOf('}')
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    try {
      return JSON.parse(text.substring(startIdx, endIdx + 1))
    } catch {}
  }
  
  return null
}

function buildContext(data: AggregatedData): string {
  return `
Usage Data Summary:
- Total Sessions: ${data.total_sessions}
- Date Range: ${new Date(data.date_range.start).toLocaleDateString()} - ${new Date(data.date_range.end).toLocaleDateString()}
- Avg Session Duration: ${data.avg_session_duration} minutes
- Messages per Session: ${data.avg_messages_per_session}
- Lines Added: ${data.lines_added}
- Lines Removed: ${data.lines_removed}
- Top Tools: ${data.top_tools.slice(0, 5).map(t => `${t.tool}(${t.count})`).join(', ')}
- Top Languages: ${data.top_languages.slice(0, 5).map(l => l.lang).join(', ')}
- Error Rate: ${Math.round(data.error_rate * 100)}%
- Task Completion: ${data.outcomes.fully_achieved} fully, ${data.outcomes.mostly_achieved} mostly, ${data.outcomes.partially_achieved} partially
- Multi-session Usage: ${data.multi_session.sessions_involved} sessions involved, ${Math.round(data.multi_session.ratio * 100)}% overlap
`
}

function buildAtAGlancePrompt(context: string): string {
  return `${context}

Generate a brief "at a glance" analysis as JSON:
{
  "whats_working": ["item1", "item2"],
  "whats_hindering": ["item1"],
  "quick_wins": ["actionable item"],
  "ambitious_workflows": ["advanced workflow to try"]
}

Keep each array to 2-3 items max. Be specific and actionable.`
}

function buildWhatWorksPrompt(context: string): string {
  return `${context}

Identify the most impressive/effective workflows as JSON:
{
  "impressive_workflows": [
    {"title": "workflow name", "description": "brief description"}
  ]
}

Return 1-3 items. Focus on successful patterns.`
}

function buildSuggestionsPrompt(context: string): string {
  return `${context}

Suggest improvements as JSON:
{
  "features_to_try": ["specific feature suggestion"],
  "usage_patterns": ["better usage pattern"]
}

Return 2-3 items for each. Be actionable and specific.`
}

function buildFrictionPrompt(context: string): string {
  return `${context}

Analyze friction points as JSON:
{
  "categories": [
    {"name": "category name", "frequency": 5, "impact": "high/medium/low", "suggestion": "how to reduce"}
  ]
}

Identify the top 3 friction points.`
}

function generateRuleBasedAtAGlance(data: AggregatedData): InsightResults['at_a_glance'] {
  const whatsWorking: string[] = []
  const whatsHindering: string[] = []
  const quickWins: string[] = []
  const ambitiousWorkflows: string[] = []
  
  // Success rate
  const successRate = data.outcomes.fully_achieved / data.total_sessions
  if (successRate > 0.7) {
    whatsWorking.push(`High task completion rate (${Math.round(successRate * 100)}%)`)
  } else if (successRate < 0.3) {
    whatsHindering.push(`Low task completion (${Math.round(successRate * 100)}%) - try breaking tasks into smaller steps`)
  }
  
  // Tools
  if (data.top_tools.length > 0) {
    whatsWorking.push(`Frequent use of ${data.top_tools[0].tool} (${data.top_tools[0].count} times)`)
  }
  
  // Session length
  if (data.avg_session_duration > 60) {
    whatsWorking.push(`Long focused sessions (${data.avg_session_duration} min avg)`)
  } else if (data.avg_session_duration < 15) {
    quickWins.push(`Short sessions - try batching related tasks together`)
  }
  
  // Error rate
  if (data.error_rate > 0.1) {
    quickWins.push(`Reduce error rate (${Math.round(data.error_rate * 100)}%)`)
  }
  
  // Multi-session
  if (data.multi_session.sessions_involved > 1) {
    ambitiousWorkflows.push(`Multi-session detected - consider keeping related work in one session`)
  }
  
  // Languages
  if (data.top_languages.length > 0) {
    const langs = data.top_languages.slice(0, 3).map(l => l.lang).join(', ')
    whatsWorking.push(`Working with: ${langs}`)
  }
  
  return {
    whats_working: whatsWorking,
    whats_hindering: whatsHindering,
    quick_wins: quickWins,
    ambitious_workflows: ambitiousWorkflows,
  }
}

async function showQuickStats(ctx: ExtensionCommandContext): Promise<void> {
  try {
    const sessions = await getSessionsInRange('month')
    if (sessions.length === 0) {
      ctx.ui.notify('No recent sessions', 'info')
      return
    }
    
    const metas: SessionMeta[] = []
    for (const session of sessions.slice(0, 20)) {
      const result = await extractSessionMeta(session)
      if (result) metas.push(result.meta)
    }
    
    const totalMessages = metas.reduce((sum, m) => sum + m.user_message_count + m.assistant_message_count, 0)
    const totalLines = metas.reduce((sum, m) => sum + m.lines_added, 0)
    const totalErrors = metas.reduce((sum, m) => sum + m.error_count + m.tool_errors, 0)
    const topTool = Object.entries(
      metas.reduce((acc, m) => {
        for (const [tool, count] of Object.entries(m.tool_counts)) {
          acc[tool] = (acc[tool] || 0) + count
        }
        return acc
      }, {} as Record<string, number>)
    ).sort((a, b) => b[1] - a[1])[0]
    
    const stats = [
      `Sessions: ${sessions.length}`,
      `Messages: ${totalMessages}`,
      `Lines: +${totalLines}`,
      `Errors: ${totalErrors}`,
      topTool ? `Top tool: ${topTool[0]}` : '',
    ].filter(Boolean).join(' • ')
    
    ctx.ui.notify(stats, 'info')
    
  } catch (error) {
    ctx.ui.notify(`Error: ${error}`, 'error')
  }
}

function parseArgs(args: string): { timeRange: 'week' | 'month' | 'all'; openBrowser: boolean } {
  const normalized = args.toLowerCase().trim()
  
  let timeRange: 'week' | 'month' | 'all' = 'month'
  if (normalized.includes('week')) timeRange = 'week'
  else if (normalized.includes('all')) timeRange = 'all'
  
  const openBrowser = normalized.includes('--open') || normalized.includes('-o')
  
  return { timeRange, openBrowser }
}

async function openInBrowser(path: string): Promise<void> {
  const { exec } = await import('child_process')
  
  return new Promise((resolve, reject) => {
    exec(`open "${path}"`, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}
