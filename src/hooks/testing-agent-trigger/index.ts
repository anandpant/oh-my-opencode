import type { PluginInput } from "@opencode-ai/plugin";
import { minimatch } from "minimatch";
import { platform } from "os";
import { log } from "../../shared/logger";
import {
  getNotifySendPath,
  getOsascriptPath,
  getPowershellPath,
} from "../session-notification-utils";
import { DEFAULT_CONFIG, HOOK_NAME } from "./constants";
import type {
  TestingAgentTriggerConfig,
  TestingAgentTriggerState,
} from "./types";

export type { TestingAgentTriggerConfig } from "./types";

type Platform = "darwin" | "linux" | "win32" | "unsupported";

function detectPlatform(): Platform {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "unsupported";
}

async function sendNotification(
  ctx: PluginInput,
  p: Platform,
  title: string,
  message: string
): Promise<void> {
  try {
    switch (p) {
      case "darwin": {
        const osascriptPath = await getOsascriptPath();
        if (!osascriptPath) return;
        const esTitle = title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        const esMessage = message.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        await ctx.$`${osascriptPath} -e ${'display notification "' + esMessage + '" with title "' + esTitle + '"'}`.catch(
          () => {}
        );
        break;
      }
      case "linux": {
        const notifySendPath = await getNotifySendPath();
        if (!notifySendPath) return;
        await ctx.$`${notifySendPath} ${title} ${message} --urgency=low 2>/dev/null`.catch(
          () => {}
        );
        break;
      }
      case "win32": {
        const powershellPath = await getPowershellPath();
        if (!powershellPath) return;
        const psTitle = title.replace(/'/g, "''");
        const psMessage = message.replace(/'/g, "''");
        await ctx.$`${powershellPath} -Command ${'[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null; $xml = \'<toast><visual><binding template="ToastText02"><text id="1">' + psTitle + '</text><text id="2">' + psMessage + "</text></binding></visual></toast>'; $toast = [Windows.Data.Xml.Dom.XmlDocument]::new(); $toast.LoadXml($xml); [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('OpenCode').Show([Windows.UI.Notifications.ToastNotification]::new($toast))"}`.catch(
          () => {}
        );
        break;
      }
    }
  } catch (err) {
    log(`${HOOK_NAME}: notification failed`, { error: err });
  }
}

function matchesPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    minimatch(filePath, pattern, { matchBase: true })
  );
}

export function createTestingAgentTriggerHook(
  ctx: PluginInput,
  userConfig: TestingAgentTriggerConfig = {}
) {
  const config: Required<TestingAgentTriggerConfig> = {
    ...DEFAULT_CONFIG,
    ...userConfig,
  };
  const currentPlatform = detectPlatform();

  const state: TestingAgentTriggerState = {
    pendingFiles: new Set(),
    lastTriggerTime: 0,
    debounceTimer: null,
  };

  async function triggerTestingAgent() {
    if (state.pendingFiles.size === 0) return;

    const files = Array.from(state.pendingFiles);
    state.pendingFiles.clear();
    state.lastTriggerTime = Date.now();

    const fileList = files.join(", ");
    const prompt = config.agentPrompt.replace("{{files}}", fileList);

    log(`${HOOK_NAME}: triggering agent`, { files, agent: config.agentName });

    if (config.notifyOnTrigger && currentPlatform !== "unsupported") {
      await sendNotification(
        ctx,
        currentPlatform,
        "Testing Agent Triggered",
        `${files.length} file(s) changed in web layer`
      );
    }
  }

  function scheduleTestingAgent() {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      triggerTestingAgent();
    }, config.debounceMs);
  }

  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ) => {
      if (!config.enabled) return;

      const editTools = ["edit", "write", "multiedit", "mcp_edit", "mcp_write"];
      if (!editTools.includes(input.tool.toLowerCase())) return;

      const args = output.args;
      const filePath =
        (args?.file_path as string | undefined) ??
        (args?.filePath as string | undefined) ??
        (args?.path as string | undefined);

      if (!filePath) return;

      if (!matchesPattern(filePath, config.patterns)) {
        log(`${HOOK_NAME}: file does not match patterns`, {
          filePath,
          patterns: config.patterns,
        });
        return;
      }

      log(`${HOOK_NAME}: web file edited`, { filePath });
      state.pendingFiles.add(filePath);
      scheduleTestingAgent();
    },
  };
}
