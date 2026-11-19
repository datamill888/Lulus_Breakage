import raw from '@/data/may2026.json'
import { checksum } from '@/lib/breakage/ids'
import type { Assumptions, CohortRow, Exemption, GlRow, Snapshot, StateRule } from '@/lib/breakage/types'
import type { PeriodState, Workspace } from './types'

interface SeedFile {
  cohorts: { category: Exemption; issued: Record<string, number>; used: Record<string, Record<string, number>>; gcIssued: Record<string, number>; gcUsedSameYear: Record<string, number>; ending: number }[]
  gl4065: GlRow[]
  states: { name: string; abbr: string; status: Exemption; condition: string; partialNote: string; comment: string }[]
  ambassadorIds: string[]
  priorSnapshots: Record<string, { year: number; booked: number; issued: number; redeemed: number; toGoPct: number; breakagePct: number; itdBreakage: number; adjustment: number }[]>
  reconciling: Record<string, number>
}

const SEED_AT = '2026-06-08T16:00:00.000Z'
export const SEED_FILE = '0. 2026-05 OSC Breakage Analysis - BREAKAGE RATES BY YEAR.xlsx'

/** The workbook's judgment calls, as of May 2026 (SUMMARY!J8:J17). */
export const WORKBOOK_ASSUMPTIONS: Assumptions = {
  partialPct: 0.4,
  conditionalCounts: true,
  noState: 'DE',
  international: 'DE',
  excludeAmbassadors: true,
  curve: { avgFrom: 2020, minCohorts: 2, horizon: 8, cushion: 0.0025 },
  methods: {
    2017: { method: 'toGo', pct: 0.0015 },
    2018: { method: 'toGo', pct: 0.0025 },
    2019: { method: 'curve' },
    2020: { method: 'curve' },
    2021: { method: 'curve' },
    2022: { method: 'target', pct: 0.85 },
    2023: { method: 'target', pct: 0.845 },
    2024: { method: 'target', pct: 0.835 },
    2025: { method: 'target', pct: 0.825 },
    2026: { method: 'target', pct: 0.825 },
  },
  expectedRange: [150_000, 180_000],
}

/** Armed Forces rows have no code in the workbook; give them the USPS ones. */
const MILITARY: Record<string, string> = { 'Armed Forces Americas': 'AA', 'Armed Forces Europe': 'AE', 'Armed Forces Pacific': 'AP' }

export function seedStates(): StateRule[] {
  return (raw as SeedFile).states.map((s) => ({ ...s, abbr: (s.abbr.trim() || MILITARY[s.name] || '').toUpperCase() }))
}

/** Pivots from tab "2026-05 Breakage" (Look 5700 support), one row per exemption category. */
export function seedCohorts(): CohortRow[] {
  return (raw as SeedFile).cohorts.map((c) => ({
    id: `cat:${c.category}`, category: c.category, customers: 0, issued: c.issued, used: c.used, gcIssued: c.gcIssued, gcUsed: c.gcUsedSameYear, ending: c.ending,
  }))
}

export function seedGl(): GlRow[] {
  return (raw as SeedFile).gl4065
}

/** April and February 2026 closes, from the SUMMARY tab's prior-month blocks. */
export function seedHistory(): Snapshot[] {
  const s = raw as SeedFile
  return ['2026-02', '2026-04'].map((period) => {
    const rows = s.priorSnapshots[period].map((r) => ({ ...r, adjustment: Math.round(r.adjustment) }))
    return { period, source: 'workbook', at: SEED_AT, rows, adjustment: rows.reduce((a, r) => a + r.adjustment, 0) }
  })
}

export function seedWorkspace(): Workspace {
  const s = raw as SeedFile
  const cohorts = seedCohorts(), gl = seedGl()
  const meta = (label: string, rows: unknown[]) => ({ mode: 'sample' as const, label, rows: rows.length, checksum: checksum(rows), loadedAt: SEED_AT, loadedBy: 'Sample data' })
  const may: PeriodState = {
    period: { label: '2026-05', monthEnd: '2026-05-31' },
    status: 'open',
    feeds: {
      cohorts: { ...meta(`${SEED_FILE} · pivots by exemption`, cohorts), asOf: '2026-05-31' },
      gl: meta(`${SEED_FILE} · GLR 4065`, gl),
    },
    cohorts,
    gl,
    assumptions: WORKBOOK_ASSUMPTIONS,
    overrides: {},
    reconciling: s.reconciling,
    reconcilingNote: '2025 adjustment passed as a reconciling item (not booked)',
    postedJe: { jeNo: '14760' },
    signoffs: {},
  }
  return {
    version: 1,
    user: 'Linda',
    current: '2026-05',
    states: seedStates(),
    ambassadors: s.ambassadorIds,
    glTags: {},
    periods: { '2026-05': may },
    history: seedHistory(),
    audit: [],
  }
}
