// Pi Insights Plugin - Data Aggregator

import type { SessionMeta, SessionFacets, AggregatedData, MultiSessionResult } from '../types'

export function aggregateData(
  metas: SessionMeta[],
  facets: Map<string, SessionFacets>,
  multiSession: MultiSessionResult
): AggregatedData {
  const totalSessions = metas.length
  
  if (totalSessions === 0) {
    return createEmptyAggregatedData()
  }
  
  // Aggregate tool counts
  const toolCounts: Record<string, number> = {}
  const languages: Record<string, number> = {}
  let totalLinesAdded = 0
  let totalLinesRemoved = 0
  let totalErrors = 0
  let totalDuration = 0
  let totalMessages = 0
  const goalCategories: Record<string, number> = {}
  const outcomes: Record<string, number> = { fully_achieved: 0, mostly_achieved: 0, partially_achieved: 0, not_achieved: 0 }
  
  for (const meta of metas) {
    // Tool counts
    for (const [tool, count] of Object.entries(meta.tool_counts)) {
      toolCounts[tool] = (toolCounts[tool] || 0) + count
    }
    
    // Languages
    for (const [lang, count] of Object.entries(meta.languages)) {
      languages[lang] = (languages[lang] || 0) + count
    }
    
    // Lines
    totalLinesAdded += meta.lines_added
    totalLinesRemoved += meta.lines_removed
    
    // Errors
    totalErrors += meta.error_count + meta.tool_errors
    
    // Duration
    totalDuration += meta.duration_minutes
    
    // Messages
    totalMessages += meta.user_message_count + meta.assistant_message_count
    
    // Facets
    const facet = facets.get(meta.session_id)
    if (facet) {
      // Goal categories
      for (const [cat, count] of Object.entries(facet.goal_categories)) {
        goalCategories[cat] = (goalCategories[cat] || 0) + count
      }
      
      // Outcomes
      outcomes[facet.outcome] = (outcomes[facet.outcome] || 0) + 1
    }
  }
  
  // Top languages
  const topLanguages = Object.entries(languages)
    .map(([lang, count]) => ({ lang, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  
  // Top tools
  const topTools = Object.entries(toolCounts)
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
  
  // Date range
  const dates = metas
    .map(m => new Date(m.start_time))
    .sort((a, b) => a.getTime() - b.getTime())
  
  const dateRange = {
    start: dates[0]?.toISOString() || new Date().toISOString(),
    end: dates[dates.length - 1]?.toISOString() || new Date().toISOString(),
  }
  
  return {
    total_sessions: totalSessions,
    date_range: dateRange,
    tool_counts: toolCounts,
    goal_categories: goalCategories,
    outcomes,
    lines_added: totalLinesAdded,
    lines_removed: totalLinesRemoved,
    multi_session: {
      overlap_events: multiSession.overlap_events,
      sessions_involved: multiSession.sessions_involved,
      ratio: multiSession.sessions_involved > 1 
        ? multiSession.user_messages_during / totalMessages 
        : 0,
    },
    avg_session_duration: Math.round(totalDuration / totalSessions),
    avg_messages_per_session: Math.round(totalMessages / totalSessions),
    top_languages: topLanguages,
    top_tools: topTools,
    error_rate: totalMessages > 0 ? totalErrors / totalMessages : 0,
  }
}

function createEmptyAggregatedData(): AggregatedData {
  return {
    total_sessions: 0,
    date_range: { start: new Date().toISOString(), end: new Date().toISOString() },
    tool_counts: {},
    goal_categories: {},
    outcomes: { fully_achieved: 0, mostly_achieved: 0, partially_achieved: 0, not_achieved: 0 },
    lines_added: 0,
    lines_removed: 0,
    multi_session: { overlap_events: 0, sessions_involved: 0, ratio: 0 },
    avg_session_duration: 0,
    avg_messages_per_session: 0,
    top_languages: [],
    top_tools: [],
    error_rate: 0,
  }
}
