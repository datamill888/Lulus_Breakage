import { seedWorkspace } from './seed'
import type { Workspace } from './types'

/**
 * Storage for the standalone app: the whole workspace in this browser's localStorage.
 * In the close app this becomes database tables with the audit log written server side;
 * callers only use load / save.
 */
export interface Repository {
  load(): Workspace
  save(ws: Workspace): void
  reset(): Workspace
}

const KEY = 'osc-breakage:v1'

export const localRepository: Repository = {
  load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const ws = JSON.parse(raw) as Workspace
        if (ws.version === 1) return ws
      }
    } catch { /* storage unavailable */ }
    return seedWorkspace()
  },
  save(ws) {
    try { localStorage.setItem(KEY, JSON.stringify(ws)) } catch { /* storage unavailable or full */ }
  },
  reset() {
    try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
    return seedWorkspace()
  },
}
