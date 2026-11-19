import type { CohortRow, GlRow } from '@/lib/breakage/types'

/**
 * Live pulls, replacing the uploads. The app calls one server endpoint that holds the Looker and
 * Intacct credentials:
 *
 *   GET {VITE_BREAKAGE_PULL_URL}?feed=cohorts&asOf=2026-05-31
 *     → Looker Look 5700 (store credit by customer, issued / used by year), joined to the address
 *       look (most recent address first), rolled up the same way the upload parser does
 *   GET …?feed=gl&to=2026-05-31
 *     → Intacct GLDETAIL for 4065 since 2016 (include RECORDNO for stable line ids)
 *
 * Responses use the same row shapes as `upload.ts`, so nothing downstream changes.
 */
export interface LivePull {
  cohorts(asOf: string): Promise<{ rows: CohortRow[]; customers: number }>
  gl(to: string): Promise<GlRow[]>
}

const BASE = (import.meta.env?.VITE_BREAKAGE_PULL_URL as string | undefined) ?? ''
export const liveConfigured = () => BASE.length > 0

async function get<T>(params: Record<string, string>): Promise<T> {
  if (!liveConfigured()) throw new Error('Live pulls are not connected yet. Set VITE_BREAKAGE_PULL_URL to the pull endpoint.')
  const res = await fetch(`${BASE}?${new URLSearchParams(params)}`)
  if (!res.ok) throw new Error(`Pull failed (${res.status}): ${await res.text()}`)
  return res.json() as Promise<T>
}

export const live: LivePull = {
  cohorts: (asOf) => get({ feed: 'cohorts', asOf }),
  gl: (to) => get({ feed: 'gl', to }),
}
