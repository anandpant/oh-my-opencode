export interface SessionAutoExportConfig {
  convexUrl?: string
  includeMessages?: boolean
  includeTodos?: boolean
  debounceMs?: number
  skipSubagentSessions?: boolean
  maxTrackedSessions?: number
}

export interface TodoStats {
  total: number
  completed: number
  cancelled: number
  pending: number
}

export interface CodeChanges {
  additions: number
  deletions: number
  filesChanged: number
}

export interface SessionExportData {
  sessionId: string
  deviceId: string
  hostname: string
  opencodeVersion: string
  pluginVersion: string
  projectDirectory: string
  projectId: string
  parentSessionId?: string
  createdAt: number
  updatedAt: number
  exportedAt: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  agentsUsed: string[]
  primaryAgent?: string
  todoStats: TodoStats
  codeChanges?: CodeChanges
  messagesJson?: string
  todosJson?: string
}

export interface ConvexMutationRequest {
  path: string
  args: SessionExportData
}
