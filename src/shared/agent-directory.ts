import { tmpdir } from "node:os"

export function resolveSubagentDirectory(
  agentName: string | undefined,
  parentDirectory: string
): string {
  if (!agentName) return parentDirectory
  return agentName.toLowerCase() === "librarian" ? tmpdir() : parentDirectory
}
