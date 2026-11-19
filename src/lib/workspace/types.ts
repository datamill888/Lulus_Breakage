import type { Override } from '@/lib/breakage/engine'
import type { Assumptions, CohortRow, GlRow, Snapshot, StateRule } from '@/lib/breakage/types'

export type FeedKind = 'cohorts' | 'gl'
export type FeedMode = 'sample' | 'upload' | 'live'

/** Where a feed's rows came from. Shown in the upload panel and written to the audit trail. */
export interface FeedMeta {
  mode: FeedMode
  label: string
  rows: number
  checksum: string
  loadedAt: string
  loadedBy: string
  /** Customers in the export (cohort feed), before rolling up. */
  customers?: number
  /** Looker data as of, when the file says. */
  asOf?: string
  /** True when it came over from the prior month and has not been refreshed. */
  carried?: boolean
}

/** Linda prepares, Heidi reviews, John approves. */
export type Role = 'prepared' | 'reviewed' | 'approved'
export type PeriodStatus = 'open' | Role | 'locked'

export interface Signoff {
  by: string
  at: string
}

export interface PeriodState {
  period: { label: string; monthEnd: string }
  status: PeriodStatus
  feeds: Partial<Record<FeedKind, FeedMeta>>
  cohorts: CohortRow[]
  gl: GlRow[]
  assumptions: Assumptions
  overrides: Record<string, Override>
  reconciling: Record<string, number>
  reconcilingNote: string
  postedJe: { jeNo: string }
  signoffs: Partial<Record<Role, Signoff>>
  closing?: { lockedAt: string; lockedBy: string; adjustment: number }
}

export type AuditEntity = 'assumption' | 'state' | 'customer' | 'gl_line' | 'feed' | 'period' | 'je' | 'ambassador' | 'reconciling'

/** Append-only. One row per field changed. */
export interface AuditEvent {
  id: string
  at: string
  user: string
  period: string | null
  entity: AuditEntity
  entityId: string
  action: string
  field?: string
  before?: string
  after?: string
  reason?: string
}

export interface Workspace {
  version: 1
  user: string
  current: string
  /** State exemption table (tab "GC exemptions"). Shared by every month. */
  states: StateRule[]
  /** Ambassador customer ids (tab "Ambassador", Look 5617). */
  ambassadors: string[]
  /** Issuance-year tags on GL 4065 lines set by hand, by line id. Shared: the GL is inception to date. */
  glTags: Record<string, number>
  periods: Record<string, PeriodState>
  /** Summary by year at each close, newest last. */
  history: Snapshot[]
  audit: AuditEvent[]
}
