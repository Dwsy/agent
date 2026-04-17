// Pi Insights Plugin - Parallel Insight Generator

import type { InsightSection, InsightResults, AggregatedData, SessionFacets } from '../types'
import { INSIGHT_SECTIONS, buildSectionContext, parseSectionResponse } from './sections'

export interface GenerationOptions {
  maxConcurrency?: number
  onProgress?: (section: string, done: number, total: number) => void
}

export async function generateInsights(
  data: AggregatedData,
  facets: Map<string, SessionFacets>,
  apiCall: (prompt: string) => Promise<string>,
  options: GenerationOptions = {}
): Promise<InsightResults> {
  const results: InsightResults = {}
  const concurrency = options.maxConcurrency || 4
  
  // Process in batches
  for (let i = 0; i < INSIGHT_SECTIONS.length; i += concurrency) {
    const batch = INSIGHT_SECTIONS.slice(i, i + concurrency)
    
    const batchPromises = batch.map(async (section) => {
      try {
        // Build context
        const context = buildSectionContext(section, data, facets)
        const prompt = section.prompt.replace('{project_areas_data}', context)
          .replace('{session_types}', context)
          .replace('{avg_messages}', context)
          .replace('{interruptions}', context)
          .replace('{success_data}', context)
          .replace('{tool_errors}', context)
          .replace('{partial_outcomes}', context)
          .replace('{tools}', context)
          .replace('{outcomes}', context)
          .replace('{patterns}', context)
          .replace('{stats}', context)
        
        // Call API
        const response = await apiCall(prompt)
        
        // Parse response
        const parsed = parseSectionResponse(section, response)
        
        // Assign to results
        ;(results as any)[section.name] = parsed
        
        // Report progress
        if (options.onProgress) {
          options.onProgress(section.name, i + 1, INSIGHT_SECTIONS.length)
        }
        
        return { section: section.name, success: true }
      } catch (error) {
        console.error(`Failed to generate section ${section.name}:`, error)
        return { section: section.name, success: false }
      }
    })
    
    await Promise.all(batchPromises)
  }
  
  // Generate at_a_glance summary
  results.at_a_glance = generateAtAGlance(data, facets)
  
  return results
}

function generateAtAGlance(
  data: AggregatedData,
  facets: Map<string, SessionFacets>
): InsightResults['at_a_glance'] {
  const whatsWorking: string[] = []
  const whatsHindering: string[] = []
  const quickWins: string[] = []
  const ambitiousWorkflows: string[] = []
  
  // Analyze outcomes
  const outcomeCount = data.outcomes
  const successRate = outcomeCount.fully_achieved / data.total_sessions
  if (successRate > 0.7) {
    whatsWorking.push(`High task completion rate (${Math.round(successRate * 100)}%)`)
  }
  
  // Analyze tool usage
  const topTool = data.top_tools[0]
  if (topTool) {
    whatsWorking.push(`Frequent use of ${topTool.tool} (${topTool.count} times)`)
  }
  
  // Analyze multi-session
  if (data.multi_session.ratio > 0.1) {
    whatsHindering.push(`Multi-session switching may cause context fragmentation`)
  }
  
  // Quick wins
  if (data.error_rate > 0.1) {
    quickWins.push(`Reduce error rate (currently ${Math.round(data.error_rate * 100)}%)`)
  }
  
  if (data.avg_messages_per_session < 10) {
    quickWins.push(`Consider more complex tasks per session`)
  }
  
  // Ambitious workflows
  if (data.multi_session.sessions_involved > 1) {
    ambitiousWorkflows.push(`Try orchestrating multiple agents in parallel`)
  }
  
  const langs = data.top_languages
  if (langs.length > 3) {
    ambitiousWorkflows.push(`Explore cross-language refactoring workflows`)
  }
  
  return {
    whats_working: whatsWorking,
    whats_hindering: whatsHindering,
    quick_wins: quickWins,
    ambitious_workflows: ambitiousWorkflows,
  }
}
