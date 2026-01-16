import type { PluginInput } from "@opencode-ai/plugin"
import { readSessionMessages, readSessionTodos, getSessionInfo } from "../../tools/session-manager/storage"
import { subagentSessions, getMainSessionID } from "../../features/claude-code-session-state"
import { getDeviceId, getHostnameCached, generateProjectId } from "./device"
import { DEFAULT_CONFIG, CONVEX_MUTATION_PATH, PLUGIN_VERSION } from "./constants"
import type { SessionAutoExportConfig, SessionExportData, TodoStats } from "./types"

export type { SessionAutoExportConfig, SessionExportData }

export function createSessionAutoExport(
  ctx: PluginInput,
  config: SessionAutoExportConfig = {}
) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  if (!mergedConfig.convexUrl) {
    return async () => {}
  }

  const deviceId = getDeviceId()
  const hostname = getHostnameCached()
  const exportedSessions = new Map<string, number>()
  const pendingExports = new Map<string, ReturnType<typeof setTimeout>>()

  function cleanupTrackedSessions() {
    const max = mergedConfig.maxTrackedSessions
    if (exportedSessions.size > max) {
      const toRemove = Array.from(exportedSessions.keys()).slice(0, exportedSessions.size - max)
      for (const id of toRemove) {
        exportedSessions.delete(id)
      }
    }
  }

  function calculateTodoStats(todos: Array<{ status: string }>): TodoStats {
    return {
      total: todos.length,
      completed: todos.filter(t => t.status === "completed").length,
      cancelled: todos.filter(t => t.status === "cancelled").length,
      pending: todos.filter(t => t.status === "pending" || t.status === "in_progress").length,
    }
  }

  function findPrimaryAgent(messages: Array<{ agent?: string }>): string | undefined {
    const counts = new Map<string, number>()
    for (const msg of messages) {
      if (msg.agent) {
        counts.set(msg.agent, (counts.get(msg.agent) || 0) + 1)
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }

  async function exportSession(sessionId: string): Promise<void> {
    const lastExport = exportedSessions.get(sessionId)
    if (lastExport && Date.now() - lastExport < mergedConfig.debounceMs) {
      return
    }

    const sessionInfo = await getSessionInfo(sessionId)
    if (!sessionInfo) return

    const messages = await readSessionMessages(sessionId)
    const todos = await readSessionTodos(sessionId)

    const userMessages = messages.filter(m => m.role === "user")
    const assistantMessages = messages.filter(m => m.role === "assistant")

    const exportData: SessionExportData = {
      sessionId,
      deviceId,
      hostname,
      opencodeVersion: "unknown",
      pluginVersion: PLUGIN_VERSION,
      projectDirectory: ctx.directory,
      projectId: generateProjectId(ctx.directory),
      createdAt: sessionInfo.first_message?.getTime() || Date.now(),
      updatedAt: sessionInfo.last_message?.getTime() || Date.now(),
      exportedAt: Date.now(),
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      agentsUsed: sessionInfo.agents_used,
      primaryAgent: findPrimaryAgent(messages),
      todoStats: calculateTodoStats(todos),
      messagesJson: mergedConfig.includeMessages ? JSON.stringify(messages) : undefined,
      todosJson: mergedConfig.includeTodos ? JSON.stringify(todos) : undefined,
    }

    try {
      await fetch(`${mergedConfig.convexUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: CONVEX_MUTATION_PATH,
          args: exportData,
        }),
      })
      exportedSessions.set(sessionId, Date.now())
      cleanupTrackedSessions()
    } catch {
    }
  }

  function scheduleExport(sessionId: string): void {
    const pending = pendingExports.get(sessionId)
    if (pending) clearTimeout(pending)

    const timer = setTimeout(() => {
      exportSession(sessionId)
      pendingExports.delete(sessionId)
    }, mergedConfig.debounceMs)

    pendingExports.set(sessionId, timer)
  }

  function cancelPendingExport(sessionId: string): void {
    const pending = pendingExports.get(sessionId)
    if (pending) {
      clearTimeout(pending)
      pendingExports.delete(sessionId)
    }
  }

  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    if (event.type === "session.idle") {
      const sessionId = props?.sessionID as string | undefined
      if (!sessionId) return

      if (mergedConfig.skipSubagentSessions) {
        if (subagentSessions.has(sessionId)) return
        const mainSessionId = getMainSessionID()
        if (mainSessionId && sessionId !== mainSessionId) return
      }

      const todos = await readSessionTodos(sessionId)
      const hasIncompleteTodos = todos.some(
        t => t.status === "pending" || t.status === "in_progress"
      )

      if (!hasIncompleteTodos) {
        scheduleExport(sessionId)
      }
    }

    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string; parentID?: string } | undefined
      if (!sessionInfo?.id) return

      if (mergedConfig.skipSubagentSessions && sessionInfo.parentID) return

      cancelPendingExport(sessionInfo.id)
      await exportSession(sessionInfo.id)
    }

    if (event.type === "session.error") {
      const sessionId = props?.sessionID as string | undefined
      if (sessionId) {
        scheduleExport(sessionId)
      }
    }
  }
}
