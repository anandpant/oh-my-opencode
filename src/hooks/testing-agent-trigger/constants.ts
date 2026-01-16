import type { TestingAgentTriggerConfig } from "./types";

export const DEFAULT_CONFIG: Required<TestingAgentTriggerConfig> = {
  enabled: false,
  patterns: ["apps/web/**", "src/web/**", "packages/web/**"],
  notifyOnTrigger: true,
  agentName: "testing-agent",
  agentPrompt:
    "Web layer files changed: {{files}}. Smart-select and run relevant browser scenarios from test_scenarios/agent-browser/, or create new scenarios if none exist for these changes.",
  debounceMs: 2000,
  scenarioDir: "test_scenarios/agent-browser",
};

export const HOOK_NAME = "testing-agent-trigger";
