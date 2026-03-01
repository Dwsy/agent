/**
 * Tag definition from session-manager database
 */
export interface Tag {
  id: string
  name: string
  color: string
  icon?: string
  sortOrder: number
  isBuiltin: boolean
  createdAt: string
  autoRules?: string
  parentId?: string | null
}

/**
 * Session-Tag association
 */
export interface SessionTag {
  sessionId: string
  tagId: string
  position: number
  assignedAt: string
}

/**
 * Tag with assigned status for a specific session
 */
export interface TagWithStatus extends Tag {
  assigned: boolean
  assignedAt?: string
}

/**
 * Session state info
 */
export interface SessionState {
  sessionId: string
  sessionPath: string
  tags: Tag[]
  availableTags: Tag[]
}

/**
 * Database query result
 */
export interface QueryResult<T> {
  success: boolean
  data?: T
  error?: string
}