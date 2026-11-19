import { glLineIds } from '@/lib/breakage/ids'
import { memoYear, type Override } from '@/lib/breakage/engine'
import { nextMonthEnd, periodLabel } from '@/lib/breakage/fiscal'
import type { Assumptions, CohortMethod, CohortRow, GlRow, Snapshot, StateRule } from '@/lib/breakage/types'
import type { AuditEntity, AuditEvent, FeedMeta, PeriodState, Role, Workspace } from './types'

/**
 * Every change goes through `apply`: it returns the new workspace with its audit events appended,
 * or throws `ActionError` (locked month, missing reason, wrong person signing...).
 */
export type Action =
  | { type: 'setUser'; user: string }
  | { type: 'selectPeriod'; period: string }
  | { type: 'setMethod'; year: number; method: CohortMethod; before: string; after: string; reason: string }
  | { type: 'setAssumptions'; patch: Partial<Assumptions>; describe: Record<string, [string, string]>; reason: string }
  | { type: 'setState'; abbr: string; patch: Partial<StateRule>; reason: string }
  | { type: 'setOverride'; rowId: string; label: string; override: Omit<Override, 'by' | 'at'> | null; reason: string }
  | { type: 'tagGl'; lineId: string; year: number | null; before: number | null; label: string; reason: string }
  | { type: 'setReconciling'; year: number; amount: number; reason: string }
  | { type: 'setAmbassadors'; ids: string[]; label: string; reason?: string }
  | { type: 'loadFeed'; kind: 'cohorts'; rows: CohortRow[]; meta: FeedMeta }
  | { type: 'loadFeed'; kind: 'gl'; rows: GlRow[]; meta: FeedMeta }
  | { type: 'setPostedJe'; jeNo: string }
  | { type: 'signoff'; role: Role }
  | { type: 'clearSignoff'; role: Role; reason: string }
  | { type: 'lock'; snapshot: Snapshot }
  | { type: 'reopen'; reason: string }

export class ActionError extends Error {}

export const ROLE_LABEL: Record<Role, string> = { prepared: 'preparer', reviewed: 'reviewer', approved: 'approver' }
const ORDER: Role[] = ['prepared', 'reviewed', 'approved']
const READ_ONLY_OK = new Set<Action['type']>(['setUser', 'selectPeriod', 'reopen'])

let seq = 0
const eventId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`
const fmt = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function apply(ws: Workspace, a: Action, now = new Date().toISOString()): Workspace {
  const p = ws.periods[ws.current]
  if (!READ_ONLY_OK.has(a.type) && p?.status === 'locked') {
    throw new ActionError(`${p.period.label} is locked. Reopen it with a reason to make changes.`)
  }
  const events: AuditEvent[] = []
  const log = (entity: AuditEntity, entityId: string, action: string, extra: Partial<AuditEvent> = {}) =>
    events.push({ id: eventId(), at: now, user: ws.user, period: ws.current, entity, entityId, action, ...extra })
  const needReason = (r: string | undefined, what: string) => {
    if (!r?.trim()) throw new ActionError(`Add a reason for ${what}; it goes in the activity log.`)
  }
  const withPeriod = (patch: Partial<PeriodState>, base: Workspace = ws): Workspace => ({ ...base, periods: { ...base.periods, [ws.current]: { ...base.periods[ws.current], ...patch } } })
  const done = (next: Workspace) => ({ ...next, audit: [...next.audit, ...events] })
  // A change to the numbers after sign-off clears it: each person signs what they saw.
  const touch = (patch: Partial<PeriodState>, base: Workspace = ws): Workspace => {
    const signed = ORDER.filter((r) => p.signoffs[r])
    if (signed.length) {
      log('period', p.period.label, 'Sign-offs cleared by a change', { before: signed.map((r) => ROLE_LABEL[r]).join(', ') })
      return withPeriod({ ...patch, signoffs: {}, status: 'open' }, base)
    }
    return withPeriod(patch, base)
  }

  switch (a.type) {
    case 'setUser':
      return { ...ws, user: a.user.trim() || ws.user }

    case 'selectPeriod':
      if (!ws.periods[a.period]) throw new ActionError(`No period ${a.period}`)
      return { ...ws, current: a.period }

    case 'setMethod': {
      needReason(a.reason, 'changing a rate assumption')
      if ((a.method.method === 'target' || a.method.method === 'toGo') && !(a.method.pct >= 0 && a.method.pct <= 1)) throw new ActionError('Enter a percentage between 0 and 100.')
      log('assumption', String(a.year), 'Changed redemption assumption', { field: `${a.year} expected redemption`, before: a.before, after: a.after, reason: a.reason })
      return done(touch({ assumptions: { ...p.assumptions, methods: { ...p.assumptions.methods, [a.year]: a.method } } }))
    }

    case 'setAssumptions': {
      needReason(a.reason, 'changing an assumption')
      for (const [field, [before, after]] of Object.entries(a.describe)) log('assumption', field, 'Changed assumption', { field, before, after, reason: a.reason })
      return done(touch({ assumptions: { ...p.assumptions, ...a.patch } }))
    }

    case 'setState': {
      needReason(a.reason, 'changing a state exemption')
      const prev = ws.states.find((s) => s.abbr === a.abbr)
      if (!prev) throw new ActionError(`No state ${a.abbr}`)
      for (const k of Object.keys(a.patch) as (keyof StateRule)[]) {
        if (prev[k] !== a.patch[k]) log('state', a.abbr, 'Changed state exemption', { field: `${prev.name} · ${k === 'status' ? 'exemption' : k}`, before: fmt(prev[k]), after: fmt(a.patch[k]), reason: a.reason })
      }
      const states = ws.states.map((s) => (s.abbr === a.abbr ? { ...s, ...a.patch } : s))
      return done(touch({}, { ...ws, states }))
    }

    case 'setOverride': {
      needReason(a.reason, a.override ? 'overriding a customer' : 'removing an override')
      const prev = p.overrides[a.rowId]
      const overrides = { ...p.overrides }
      const describe = (o?: Pick<Override, 'category' | 'state'>) => (o ? [o.category && `category ${o.category}`, o.state && `state ${o.state}`].filter(Boolean).join(', ') : undefined)
      if (a.override) overrides[a.rowId] = { ...a.override, note: a.reason, by: ws.user, at: now }
      else delete overrides[a.rowId]
      log('customer', a.rowId, a.override ? 'Overrode exemption' : 'Removed override', { field: a.label, before: fmt(describe(prev)), after: fmt(describe(a.override ?? undefined)), reason: a.reason })
      return done(touch({ overrides }))
    }

    case 'tagGl': {
      needReason(a.reason, 'retagging a GL line')
      const glTags = { ...ws.glTags }
      if (a.year == null) delete glTags[a.lineId]
      else glTags[a.lineId] = a.year
      log('gl_line', a.lineId, 'Tagged issuance year', { field: a.label, before: fmt(a.before), after: fmt(a.year), reason: a.reason })
      return done(touch({}, { ...ws, glTags }))
    }

    case 'setReconciling': {
      needReason(a.reason, 'a reconciling item')
      const reconciling = { ...p.reconciling }
      const before = reconciling[a.year]
      if (a.amount) reconciling[a.year] = a.amount
      else delete reconciling[a.year]
      log('reconciling', String(a.year), 'Changed reconciling item', { field: String(a.year), before: before == null ? '—' : money(before), after: money(a.amount), reason: a.reason })
      return done(touch({ reconciling }))
    }

    case 'setAmbassadors': {
      log('ambassador', 'list', 'Replaced ambassador list', { before: `${ws.ambassadors.length} customers`, after: `${a.ids.length} customers · ${a.label}`, reason: a.reason })
      return done(touch({}, { ...ws, ambassadors: a.ids }))
    }

    case 'loadFeed': {
      const prev = p.feeds[a.kind]
      log('feed', a.kind, prev ? 'Replaced source data' : 'Loaded source data', {
        before: prev ? `${prev.label} · ${prev.rows} rows · #${prev.checksum}` : undefined,
        after: `${a.meta.label} · ${a.meta.rows} rows · #${a.meta.checksum}`,
      })
      const feeds = { ...p.feeds, [a.kind]: a.meta }
      if (a.kind === 'cohorts') {
        // Overrides follow the customer; ones whose row is gone stay listed so nothing is lost silently.
        return done(touch({ cohorts: a.rows, feeds }))
      }
      // Lines with no year in the memo keep the year they had (same line id) in the previous load.
      const prevIds = glLineIds(p.gl)
      const prevYear = new Map(p.gl.map((r, i) => [prevIds[i], r.year]))
      const rows = a.rows.map((r, i) => {
        if (r.year != null || memoYear(r.memo) != null) return r
        const y = prevYear.get(glLineIds(a.rows)[i])
        return y != null ? { ...r, year: y } : r
      })
      return done(touch({ gl: rows, feeds }))
    }

    case 'setPostedJe':
      log('je', a.jeNo, 'Set JE number', { before: fmt(p.postedJe.jeNo), after: fmt(a.jeNo) })
      return done(withPeriod({ postedJe: { jeNo: a.jeNo.trim() } }))

    case 'signoff': {
      const i = ORDER.indexOf(a.role)
      if (i > 0 && !p.signoffs[ORDER[i - 1]]) throw new ActionError(`The ${ROLE_LABEL[ORDER[i - 1]]} signs off first.`)
      if (a.role === 'reviewed' && p.signoffs.prepared?.by === ws.user) throw new ActionError('The reviewer has to be someone other than the preparer.')
      if (a.role === 'approved' && (p.signoffs.prepared?.by === ws.user || p.signoffs.reviewed?.by === ws.user)) throw new ActionError('Final sign-off has to come from someone who did not prepare or review.')
      log('period', p.period.label, `Signed off as ${ROLE_LABEL[a.role]}`)
      return done(withPeriod({ signoffs: { ...p.signoffs, [a.role]: { by: ws.user, at: now } }, status: a.role }))
    }

    case 'clearSignoff': {
      needReason(a.reason, 'removing a sign-off')
      log('period', p.period.label, `Removed ${ROLE_LABEL[a.role]} sign-off`, { reason: a.reason })
      const keep = ORDER.slice(0, ORDER.indexOf(a.role))
      const signoffs = Object.fromEntries(keep.filter((r) => p.signoffs[r]).map((r) => [r, p.signoffs[r]]))
      return done(withPeriod({ signoffs, status: keep.at(-1) ?? 'open' }))
    }

    case 'lock': {
      if (!p.signoffs.approved) throw new ActionError('Lock after final sign-off.')
      log('period', p.period.label, 'Locked period', { after: `Breakage adjustment ${money(a.snapshot.adjustment)}${p.postedJe.jeNo ? ` · JE ${p.postedJe.jeNo}` : ''}` })
      const history = [...ws.history.filter((h) => h.period !== p.period.label), a.snapshot].sort((x, y) => x.period.localeCompare(y.period))
      let next: Workspace = withPeriod({ status: 'locked', closing: { lockedAt: now, lockedBy: ws.user, adjustment: a.snapshot.adjustment } }, { ...ws, history })
      // Next month starts from this month's assumptions, overrides and reconciling items.
      const nextEnd = nextMonthEnd(p.period.monthEnd)
      const label = periodLabel(nextEnd)
      if (!ws.periods[label]) {
        const carry = (m?: FeedMeta): FeedMeta | undefined => m && { ...m, carried: true, label: `Carried over from ${p.period.label}: ${m.label}` }
        const np: PeriodState = {
          period: { label, monthEnd: nextEnd }, status: 'open', feeds: { cohorts: carry(p.feeds.cohorts), gl: carry(p.feeds.gl) },
          cohorts: p.cohorts, gl: p.gl, assumptions: p.assumptions, overrides: p.overrides, reconciling: p.reconciling, reconcilingNote: p.reconcilingNote,
          postedJe: { jeNo: '' }, signoffs: {},
        }
        next = { ...next, periods: { ...next.periods, [label]: np } }
        events.push({ id: eventId(), at: now, user: ws.user, period: label, entity: 'period', entityId: label, action: 'Opened period', after: `Assumptions and ${Object.keys(p.overrides).length} overrides carried from ${p.period.label}` })
      }
      return done(next)
    }

    case 'reopen': {
      needReason(a.reason, 'reopening a locked period')
      if (p.status !== 'locked') throw new ActionError('This period is not locked.')
      log('period', p.period.label, 'Reopened period', { reason: a.reason })
      return done(withPeriod({ status: 'open', signoffs: {}, closing: undefined }))
    }
  }
}
