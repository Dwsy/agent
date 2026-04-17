// Pi Insights Plugin - Insight Sections Definition

import type { InsightSection, AggregatedData, SessionFacets } from '../types'

export const INSIGHT_SECTIONS: InsightSection[] = [
  {
    name: 'project_areas',
    prompt: `Analyze the project areas worked on based on this data:
{project_areas_data}

Generate insights about what types of projects/areas the user works on most.
Return JSON: { "areas": [{ "name": "area name", "session_count": 5, "description": "description" }] }`,
    maxTokens: 8192,
  },
  {
    name: 'interaction_style',
    prompt: `Analyze the user's interaction style based on:
- Session types: {session_types}
- Average messages per session: {avg_messages}
- User interruptions: {interruptions}

Generate a narrative describing how this user interacts with the AI.
Return JSON: { "narrative": "paragraph", "key_pattern": "pattern description" }`,
    maxTokens: 8192,
  },
  {
    name: 'what_works',
    prompt: `Based on successful outcomes and highlights:
{success_data}

Identify the most impressive/effective workflows the user has developed.
Return JSON: { "impressive_workflows": [{ "title": "name", "description": "desc" }] }`,
    maxTokens: 8192,
  },
  {
    name: 'friction_analysis',
    prompt: `Analyze friction points from:
- Tool errors: {tool_errors}
- User interruptions: {interruptions}
- Partial outcomes: {partial_outcomes}

Identify the main friction categories and their impact.
Return JSON: { "categories": [{ "name": "category", "frequency": 5, "impact": "high/medium/low" }] }`,
    maxTokens: 8192,
  },
  {
    name: 'suggestions',
    prompt: `Based on the user's patterns and missing features:
Tools used: {tools}
Outcome distribution: {outcomes}

Suggest features to try and better usage patterns.
Return JSON: { "features_to_try": ["suggestion"], "usage_patterns": ["pattern"] }`,
    maxTokens: 8192,
  },
  {
    name: 'on_the_horizon',
    prompt: `Looking at the usage patterns:
{patterns}

Suggest opportunities for growth or experimentation the user hasn't explored.
Return JSON: { "opportunities": ["opportunity descriptions"] }`,
    maxTokens: 8192,
  },
  {
    name: 'fun_ending',
    prompt: `Find interesting/fun facts from this data:
{stats}

Include any surprising patterns or notable achievements.
Return JSON: { "interesting_facts": ["fact descriptions"] }`,
    maxTokens: 8192,
  },
]

export function buildSectionContext(
  section: InsightSection,
  data: AggregatedData,
  facets: Map<string, SessionFacets>
): string {
  switch (section.name) {
    case 'project_areas':
      return JSON.stringify({
        projects: [...new Set([...facets.values()].map(f => f.underlying_goal.split('/')[0]))],
        sessions: data.total_sessions,
      })
    
    case 'interaction_style':
      const sessionTypes = [...facets.values()].map(f => f.session_type)
      const typeCount: Record<string, number> = {}
      for (const t of sessionTypes) {
        typeCount[t] = (typeCount[t] || 0) + 1
      }
      return JSON.stringify({
        session_types: typeCount,
        avg_messages: data.avg_messages_per_session,
        interruptions: data.multi_session.overlap_events,
      })
    
    case 'what_works':
      const successes = [...facets.values()]
        .filter(f => f.outcome === 'fully_achieved')
        .map(f => ({ goal: f.underlying_goal, success: f.primary_success }))
      return JSON.stringify({ successes, count: successes.length })
    
    case 'friction_analysis':
      return JSON.stringify({
        tool_errors: Object.entries(data.tool_counts)
          .filter(([t]) => t.includes('error') || t.includes('fail'))
          .reduce((acc, [t, c]) => ({ ...acc, [t]: c }), {}),
        interruptions: data.multi_session.overlap_events,
        partial_outcomes: data.outcomes.partially_achieved,
      })
    
    case 'suggestions':
      return JSON.stringify({
        tools: data.top_tools.slice(0, 5),
        outcomes: data.outcomes,
      })
    
    case 'on_the_horizon':
      return JSON.stringify({
        patterns: [...facets.values()].map(f => f.session_type),
        languages: data.top_languages,
      })
    
    case 'fun_ending':
      return JSON.stringify({
        total_sessions: data.total_sessions,
        lines_written: data.lines_added,
        tools_explored: Object.keys(data.tool_counts).length,
        achievements: [...facets.values()].filter(f => f.outcome === 'fully_achieved').length,
      })
    
    default:
      return JSON.stringify(data)
  }
}

export function parseSectionResponse(section: InsightSection, response: string): any {
  try {
    let jsonStr = response.trim()
    
    // Remove markdown code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }
    
    // Find JSON object
    const startIdx = jsonStr.indexOf('{')
    const endIdx = jsonStr.lastIndexOf('}')
    
    if (startIdx !== -1 && endIdx !== -1) {
      jsonStr = jsonStr.substring(startIdx, endIdx + 1)
      return JSON.parse(jsonStr)
    }
    
    return null
  } catch {
    return null
  }
}
