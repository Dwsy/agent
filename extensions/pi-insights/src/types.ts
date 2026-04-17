// Pi Insights Plugin - Type Definitions

export interface SessionMeta {
  session_id: string
  session_name?: string
  project_path: string
  start_time: string
  end_time?: string
  duration_minutes: number
  user_message_count: number
  assistant_message_count: number
  tool_counts: Record<string, number>
  languages: Record<string, number>
  lines_added: number
  lines_removed: number
  error_count: number
  git_commits: number
  git_pushes: number
  user_interruptions: number
  tool_errors: number
}

export interface SessionFacets {
  session_id: string
  underlying_goal: string
  goal_categories: Record<string, number>
  outcome: 'fully_achieved' | 'mostly_achieved' | 'partially_achieved' | 'not_achieved'
  user_satisfaction_counts: Record<string, number>
  claude_helpfulness: 'very_helpful' | 'helpful' | 'neutral' | 'unhelpful'
  session_type: 'single_task' | 'multi_task' | 'iterative_refinement'
  friction_counts: Record<string, number>
  primary_success: string
  brief_summary: string
}

export interface AggregatedData {
  total_sessions: number
  date_range: { start: string; end: string }
  tool_counts: Record<string, number>
  goal_categories: Record<string, number>
  outcomes: Record<string, number>
  lines_added: number
  lines_removed: number
  multi_session: {
    overlap_events: number
    sessions_involved: number
    ratio: number
  }
  avg_session_duration: number
  avg_messages_per_session: number
  top_languages: Array<{ lang: string; count: number }>
  top_tools: Array<{ tool: string; count: number }>
  error_rate: number
}

export interface MultiSessionResult {
  overlap_events: number
  sessions_involved: number
  user_messages_during: number
  pattern: 'isolated' | 'parallel' | 'switching'
}

export interface InsightSection {
  name: string
  prompt: string
  maxTokens: number
  antOnly?: boolean
}

export interface InsightResults {
  at_a_glance?: {
    whats_working: string[]
    whats_hindering: string[]
    quick_wins: string[]
    ambitious_workflows: string[]
  }
  project_areas?: {
    areas: Array<{ name: string; session_count: number; description: string }>
  }
  interaction_style?: {
    narrative: string
    key_pattern: string
  }
  what_works?: {
    impressive_workflows: Array<{ title: string; description: string }>
  }
  friction_analysis?: {
    categories: Array<{ name: string; frequency: number; impact: string }>
  }
  suggestions?: {
    features_to_try: string[]
    usage_patterns: string[]
  }
  on_the_horizon?: {
    opportunities: string[]
  }
  fun_ending?: {
    interesting_facts: string[]
  }
}

export interface InsightsConfig {
  // 时间范围筛选
  timeRange?: 'week' | 'month' | 'all'
  // 最大会话数
  maxSessions?: number
  // 最大 facet 提取数
  maxFacets?: number
  // 是否生成 HTML 报告
  generateHtml?: boolean
  // 打开浏览器查看
  openBrowser?: boolean
}

export interface ScannedSession {
  sessionId: string
  sessionPath: string
  sessionName?: string
  projectPath: string
  startTime: Date
  endTime?: Date
  fileSize: number
}
