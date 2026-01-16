import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    deviceId: v.string(),
    hostname: v.string(),
    opencodeVersion: v.string(),
    pluginVersion: v.string(),
    projectDirectory: v.string(),
    projectId: v.string(),
    parentSessionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    exportedAt: v.number(),
    messageCount: v.number(),
    userMessageCount: v.number(),
    assistantMessageCount: v.number(),
    agentsUsed: v.array(v.string()),
    primaryAgent: v.optional(v.string()),
    todoStats: v.object({
      total: v.number(),
      completed: v.number(),
      cancelled: v.number(),
      pending: v.number(),
    }),
    codeChanges: v.optional(
      v.object({
        additions: v.number(),
        deletions: v.number(),
        filesChanged: v.number(),
      })
    ),
    messagesJson: v.optional(v.string()),
    todosJson: v.optional(v.string()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_deviceId", ["deviceId"])
    .index("by_projectId", ["projectId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_deviceId_createdAt", ["deviceId", "createdAt"]),
})
