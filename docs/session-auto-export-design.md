# Session Auto-Export Design

## Overview

Automatic session export to Convex for analytics, triggered seamlessly on meaningful events.

## Goals

1. Export session data automatically without user intervention
2. Capture device ID, repo, opencode version, agent version, model info
3. Trigger on meaningful events (todo completion, session idle after work, session end)
4. Deduplicate exports (only export latest version per session)
5. Handle terminal close/crash gracefully

## Architecture

### Hook: `session-auto-export`

**Location**: `src/hooks/session-auto-export/`

**Trigger Events**:
| Event | When to Export |
|-------|---------------|
| `session.idle` | After all todos completed (skip if incomplete) |
| `session.deleted` | On graceful session end |
| `session.error` | On unrecoverable errors (capture final state) |

### Data Schema

```typescript
interface SessionExport {
  // Identity
  sessionId: string              // ses_xxx
  deviceId: string               // machine-id from /etc/machine-id
  hostname: string               // system hostname
  
  // Version Info
  opencodeVersion: string        // from session metadata or ctx
  pluginVersion: string          // oh-my-opencode version
  
  // Session Context
  projectDirectory: string       // working directory
  projectId: string              // project identifier
  parentSessionId?: string       // if subagent session
  
  // Timestamps
  createdAt: number              // session start timestamp
  updatedAt: number              // last activity timestamp
  exportedAt: number             // when this export happened
  
  // Content Summary
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  
  // Agent Usage
  agentsUsed: string[]           // ["build", "oracle", "explore"]
  primaryAgent?: string          // main agent used
  
  // Todo Summary
  todoStats: {
    total: number
    completed: number
    cancelled: number
    pending: number
  }
  
  // Code Changes Summary
  codeChanges?: {
    additions: number
    deletions: number
    filesChanged: number
  }
  
  // Full Data (optional, configurable)
  messages?: SessionMessage[]     // full message history
  todos?: TodoItem[]              // full todo list
  transcript?: string             // raw transcript content
}
```

### Convex Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    // Identity
    sessionId: v.string(),
    deviceId: v.string(),
    hostname: v.string(),
    
    // Version Info
    opencodeVersion: v.string(),
    pluginVersion: v.string(),
    
    // Session Context
    projectDirectory: v.string(),
    projectId: v.string(),
    parentSessionId: v.optional(v.string()),
    
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    exportedAt: v.number(),
    
    // Content Summary
    messageCount: v.number(),
    userMessageCount: v.number(),
    assistantMessageCount: v.number(),
    
    // Agent Usage
    agentsUsed: v.array(v.string()),
    primaryAgent: v.optional(v.string()),
    
    // Todo Summary
    todoStats: v.object({
      total: v.number(),
      completed: v.number(),
      cancelled: v.number(),
      pending: v.number(),
    }),
    
    // Code Changes Summary
    codeChanges: v.optional(v.object({
      additions: v.number(),
      deletions: v.number(),
      filesChanged: v.number(),
    })),
    
    // Raw data stored as JSON strings (to avoid schema complexity)
    messagesJson: v.optional(v.string()),
    todosJson: v.optional(v.string()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_deviceId", ["deviceId"])
    .index("by_projectId", ["projectId"])
    .index("by_createdAt", ["createdAt"])
    .index("by_deviceId_createdAt", ["deviceId", "createdAt"]),
});
```

### Hook Implementation

```typescript
// src/hooks/session-auto-export/index.ts
import type { PluginInput } from "@opencode-ai/plugin"
import { readSessionMessages, readSessionTodos, getSessionInfo } from "../../tools/session-manager/storage"
import { hostname } from "os"
import { readFileSync } from "fs"

interface SessionAutoExportConfig {
  convexUrl: string              // Convex deployment URL
  includeMessages?: boolean      // Include full message history (default: false)
  includeTodos?: boolean         // Include full todo list (default: true)
  debounceMs?: number           // Debounce exports (default: 5000)
  skipSubagentSessions?: boolean // Don't export subagent sessions (default: true)
}

function getDeviceId(): string {
  try {
    return readFileSync("/etc/machine-id", "utf-8").trim()
  } catch {
    try {
      return readFileSync("/var/lib/dbus/machine-id", "utf-8").trim()
    } catch {
      return `unknown-${hostname()}`
    }
  }
}

export function createSessionAutoExport(
  ctx: PluginInput,
  config: SessionAutoExportConfig
) {
  const deviceId = getDeviceId()
  const hostName = hostname()
  const exportedSessions = new Map<string, number>() // sessionId -> lastExportTime
  const pendingExports = new Map<string, ReturnType<typeof setTimeout>>()
  
  const mergedConfig = {
    includeMessages: false,
    includeTodos: true,
    debounceMs: 5000,
    skipSubagentSessions: true,
    ...config,
  }

  async function exportSession(sessionId: string) {
    // Prevent duplicate exports within debounce window
    const lastExport = exportedSessions.get(sessionId)
    if (lastExport && Date.now() - lastExport < mergedConfig.debounceMs) {
      return
    }

    const sessionInfo = await getSessionInfo(sessionId)
    if (!sessionInfo) return

    const messages = await readSessionMessages(sessionId)
    const todos = await readSessionTodos(sessionId)

    // Count messages by role
    const userMessages = messages.filter(m => m.role === "user")
    const assistantMessages = messages.filter(m => m.role === "assistant")

    // Calculate todo stats
    const todoStats = {
      total: todos.length,
      completed: todos.filter(t => t.status === "completed").length,
      cancelled: todos.filter(t => t.status === "cancelled").length,
      pending: todos.filter(t => t.status === "pending" || t.status === "in_progress").length,
    }

    // Find primary agent (most used)
    const agentCounts = new Map<string, number>()
    for (const msg of messages) {
      if (msg.agent) {
        agentCounts.set(msg.agent, (agentCounts.get(msg.agent) || 0) + 1)
      }
    }
    const primaryAgent = [...agentCounts.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0]

    const exportData = {
      sessionId,
      deviceId,
      hostname: hostName,
      opencodeVersion: "unknown", // TODO: get from session metadata
      pluginVersion: process.env.npm_package_version || "unknown",
      projectDirectory: ctx.directory,
      projectId: "unknown", // TODO: derive from directory
      createdAt: sessionInfo.first_message?.getTime() || Date.now(),
      updatedAt: sessionInfo.last_message?.getTime() || Date.now(),
      exportedAt: Date.now(),
      messageCount: messages.length,
      userMessageCount: userMessages.length,
      assistantMessageCount: assistantMessages.length,
      agentsUsed: sessionInfo.agents_used,
      primaryAgent,
      todoStats,
      messagesJson: mergedConfig.includeMessages ? JSON.stringify(messages) : undefined,
      todosJson: mergedConfig.includeTodos ? JSON.stringify(todos) : undefined,
    }

    // Send to Convex
    try {
      await fetch(`${mergedConfig.convexUrl}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "sessions:upsert",
          args: exportData,
        }),
      })
      exportedSessions.set(sessionId, Date.now())
    } catch (error) {
      // Log error but don't crash
      console.error("Failed to export session:", error)
    }
  }

  function scheduleExport(sessionId: string) {
    // Cancel any pending export for this session
    const pending = pendingExports.get(sessionId)
    if (pending) clearTimeout(pending)

    // Schedule new export
    const timer = setTimeout(() => {
      exportSession(sessionId)
      pendingExports.delete(sessionId)
    }, mergedConfig.debounceMs)

    pendingExports.set(sessionId, timer)
  }

  return async ({ event }: { event: { type: string; properties?: unknown } }) => {
    const props = event.properties as Record<string, unknown> | undefined

    // Export on session.idle when all todos are done
    if (event.type === "session.idle") {
      const sessionId = props?.sessionID as string | undefined
      if (!sessionId) return

      // Check if subagent
      if (mergedConfig.skipSubagentSessions) {
        // TODO: check if this is a subagent session
      }

      // Check todos
      const todos = await readSessionTodos(sessionId)
      const hasIncompleteTodos = todos.some(
        t => t.status === "pending" || t.status === "in_progress"
      )

      // Only export if all todos complete OR no todos
      if (!hasIncompleteTodos) {
        scheduleExport(sessionId)
      }
    }

    // Export on session.deleted (graceful end)
    if (event.type === "session.deleted") {
      const sessionInfo = props?.info as { id?: string; parentID?: string } | undefined
      if (!sessionInfo?.id) return

      // Skip subagent sessions
      if (mergedConfig.skipSubagentSessions && sessionInfo.parentID) return

      // Cancel pending and export immediately
      const pending = pendingExports.get(sessionInfo.id)
      if (pending) clearTimeout(pending)

      await exportSession(sessionInfo.id)
    }

    // Export on session.error (capture final state)
    if (event.type === "session.error") {
      const sessionId = props?.sessionID as string | undefined
      if (sessionId) {
        scheduleExport(sessionId)
      }
    }
  }
}
```

## Implementation Checklist

### Phase 1: Core Hook (COMPLETED)
- [x] Create `src/hooks/session-auto-export/` directory
- [x] Create `types.ts` with config and export interfaces
- [x] Create `constants.ts` with default config values
- [x] Create `index.ts` with main hook implementation
- [x] Create `device.ts` with device ID utilities
- [x] Export from `src/hooks/index.ts`

### Phase 2: Convex Integration (PARTIAL - Schema Examples Created)
- [ ] Set up Convex project (if not exists)
- [x] Create `convex/schema.ts` with sessions table (see `docs/convex-schema-example.ts`)
- [x] Create `convex/sessions.ts` with upsert mutation (see `docs/convex-sessions-mutation-example.ts`)
- [x] Add Convex URL to plugin config (`session_auto_export.convexUrl`)

### Phase 3: Plugin Integration (COMPLETED)
- [x] Add hook creation in `src/index.ts`
- [x] Add config option for `session_auto_export` in `src/config/schema.ts`
- [x] Wire up event handler

### Phase 4: Testing (PENDING - Requires Environment)
- [ ] Manual test: complete todos and verify export on idle
- [ ] Manual test: exit session and verify export
- [ ] Manual test: error case exports
- [ ] Verify deduplication works
- [ ] Test with subagent sessions

### Phase 5: Enhancements (FUTURE)
- [ ] Add model info tracking
- [ ] Add token usage tracking (if available)
- [ ] Add git repo detection for projectId
- [ ] Add configurable export triggers
- [ ] Add offline queue for failed exports

## Configuration

```yaml
# opencode.yaml
plugins:
  oh-my-opencode:
    session_auto_export:
      enabled: true
      convex_url: "https://xxx.convex.cloud"
      include_messages: false
      include_todos: true
      debounce_ms: 5000
      skip_subagent_sessions: true
```

## Security Considerations

1. **Sensitive Data**: Messages may contain secrets - `include_messages: false` by default
2. **Device ID**: Machine ID is stable but not PII
3. **Project Path**: Full path exposed - consider hashing for privacy
4. **Network**: Use HTTPS for Convex endpoint

## Open Questions

1. Where is the Convex project? Does it already exist?
2. Should we export on every message.updated or batch?
3. What's the retention policy for exported sessions?
4. Should we support multiple export backends (not just Convex)?
