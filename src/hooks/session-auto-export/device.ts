import { readFileSync, existsSync } from "node:fs"
import { hostname as getHostname } from "node:os"
import { createHash } from "node:crypto"

let cachedDeviceId: string | null = null
let cachedHostname: string | null = null

const MACHINE_ID_PATHS = ["/etc/machine-id", "/var/lib/dbus/machine-id"]

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId

  for (const path of MACHINE_ID_PATHS) {
    try {
      if (existsSync(path)) {
        const id = readFileSync(path, "utf-8").trim()
        if (id) {
          cachedDeviceId = id
          return id
        }
      }
    } catch {
      continue
    }
  }

  const host = getHostname()
  cachedDeviceId = createHash("sha256").update(`fallback-${host}`).digest("hex").slice(0, 32)
  return cachedDeviceId
}

export function getHostnameCached(): string {
  if (cachedHostname) return cachedHostname
  cachedHostname = getHostname()
  return cachedHostname
}

export function generateProjectId(directory: string): string {
  return createHash("sha256").update(directory).digest("hex").slice(0, 16)
}

export function resetDeviceCache(): void {
  cachedDeviceId = null
  cachedHostname = null
}
