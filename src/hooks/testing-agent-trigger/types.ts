export interface TestingAgentTriggerConfig {
  enabled?: boolean;
  patterns?: string[];
  notifyOnTrigger?: boolean;
  agentName?: string;
  agentPrompt?: string;
  debounceMs?: number;
  scenarioDir?: string;
}

export interface TestingAgentTriggerState {
  pendingFiles: Set<string>;
  lastTriggerTime: number;
  debounceTimer: ReturnType<typeof setTimeout> | null;
}
