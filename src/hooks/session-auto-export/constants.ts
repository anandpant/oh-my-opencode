import type { SessionAutoExportConfig } from "./types"

export const DEFAULT_CONFIG: Required<Omit<SessionAutoExportConfig, "convexUrl">> & Pick<SessionAutoExportConfig, "convexUrl"> = {
  convexUrl: undefined,
  includeMessages: false,
  includeTodos: true,
  debounceMs: 5000,
  skipSubagentSessions: true,
  maxTrackedSessions: 100,
}

export const HOOK_NAME = "session-auto-export"

export const CONVEX_MUTATION_PATH = "sessions:upsert"

export const PLUGIN_VERSION = "1.0.0"
