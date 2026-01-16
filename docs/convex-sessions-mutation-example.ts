import { mutation } from "./_generated/server"
import { v } from "convex/values"

export const upsert = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first()

    if (existing) {
      await ctx.db.patch(existing._id, args)
      return existing._id
    }

    return await ctx.db.insert("sessions", args)
  },
})
