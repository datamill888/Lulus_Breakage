import { glLineIds } from './ids'
import { periodLabel } from './fiscal'
import type { Assumptions, Category, CohortMethod, CohortRow, CustomerFlag, Exemption, GlRow, StateRule, YearMap, YearResult } from './types'

export const round2 = (v: number) => Math.round((v + Number.EPSILON * Math.sign(v)) * 100) / 100
/** Excel ROUND(x, 0): halves away from zero. */
export const round0 = (v: number) => Math.sign(v) * Math.round(Math.abs(v))
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const add = (m: YearMap, k: string, v: number) => { if (v) m[k] = (m[k] ?? 0) + v }

/** Development periods shown on the triangle (period 1 = the year of issuance). */
export const MAX_PERIOD = 14

/** Countries that count as US for escheat (territories are in the state table). */
const DOMESTIC = new Set(['US', 'USA', 'UNITED STATES', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM'])
const TERRITORY = new Set(['PR', 'GU', 'VI'])
export const isDomestic = (country?: string | null) => !country || DOMESTIC.has(country.trim().toUpperCase())

export interface Override {
  /** Put this row in a category no matter where the customer lives. */
  category?: Category
  /** Use this state instead of the one on file (relocation found in Kustomer, bad address...). */
  state?: string
  note: string
  by: string
  at: string
}

export interface EngineInput {
  /** Year the calculation is as of (the fiscal month's year). */
  asOfYear: number
  cohorts: CohortRow[]
  states: StateRule[]
  overrides: Record<string, Override>
  ambassadors: string[]
  assumptions: Assumptions
  gl: GlRow[]
  /** Issuance year tags set by hand on GL 4065 lines, by line id. */
  glTags: Record<string, number>
  /** Per-year adjustments passed as reconciling items rather than booked (SUMMARY col U). */
  reconciling: Record<string, number>
}

export type ClassifiedVia = 'override' | 'pivot' | 'ambassador' | 'international' | 'no-state' | 'unknown-state' | 'state'

export interface ClassifiedRow extends Omit<CohortRow, 'category'> {
  category: Category
  effectiveState: string | null
  via: ClassifiedVia
  issuedTotal: number
  redeemedTotal: number
  override?: Override
}

/** Decides which exemption category a row of store credit falls in, and why. */
export function classify(row: CohortRow, rules: Map<string, StateRule>, a: Assumptions, overrides: Record<string, Override>, ambassadors: Set<string>): Pick<ClassifiedRow, 'category' | 'effectiveState' | 'via'> {
  const o = overrides[row.id]
  const state = (o?.state ?? row.state ?? '').trim().toUpperCase() || null
  if (o?.category) return { category: o.category, effectiveState: state, via: 'override' }
  if (row.category) return { category: row.category, effectiveState: state, via: 'pivot' }
  if (a.excludeAmbassadors && row.customerId && ambassadors.has(row.customerId)) return { category: 'Excluded', effectiveState: state, via: 'ambassador' }
  const country = row.country?.trim().toUpperCase() || null
  const toDelaware = (via: ClassifiedVia, rule: 'DE' | 'exclude') =>
    rule === 'DE' ? { category: rules.get('DE')?.status ?? 'Partial', effectiveState: 'DE', via } : { category: 'No' as Category, effectiveState: state, via }
  // Owner outside the US, or no address: priority rules send it to the holder's state of incorporation (Delaware).
  if (!o?.state && !isDomestic(country)) return toDelaware('international', a.international)
  const st = state ?? (country && TERRITORY.has(country) ? country : null)
  if (!st) return toDelaware('no-state', a.noState)
  const rule = rules.get(st)
  if (!rule) return toDelaware('unknown-state', a.noState)
  return { category: rule.status, effectiveState: st, via: 'state' }
}

/** Share of a category's credit that counts toward breakage. */
export const share = (c: Category, a: Assumptions) =>
  c === 'Yes' ? 1 : c === 'Partial' ? a.partialPct : c === 'Conditional' ? (a.conditionalCounts ? 1 : 0) : 0

export interface Bucket { issued: YearMap; used: Record<string, YearMap>; gcIssued: YearMap; gcUsed: YearMap; ending: number; customers: number; rows: number }
const emptyBucket = (): Bucket => ({ issued: {}, used: {}, gcIssued: {}, gcUsed: {}, ending: 0, customers: 0, rows: 0 })
const addRow = (b: Bucket, r: Omit<CohortRow, 'category'>) => {
  for (const [y, v] of Object.entries(r.issued)) add(b.issued, y, v)
  for (const [y, m] of Object.entries(r.used)) for (const [u, v] of Object.entries(m)) add((b.used[y] ??= {}), u, v)
  for (const [y, v] of Object.entries(r.gcIssued)) add(b.gcIssued, y, v)
  for (const [y, v] of Object.entries(r.gcUsed)) add(b.gcUsed, y, v)
  b.ending += r.ending
  b.customers += r.customers
  b.rows += 1
}

export interface CurvePoint { period: number; excl: number | null; all: number | null; used: number; source: 'excl' | 'all' | 'tail' | 'none'; exclCount: number; allCount: number }

export interface GlLine extends GlRow {
  id: string
  net: number
  period: string
  tag: number | null
  tagSource: 'hand' | 'workbook' | 'memo' | 'posting'
}

export interface JeLine { account: number; debit: number; credit: number; memo: string; year?: number }

/** Issuance year in a GL memo: "Online Store Credit Breakage - 2024", "OSC Breakage 2023". */
export const memoYear = (memo: string): number | null => {
  const m = [...memo.matchAll(/(?<!\d)(20[1-3]\d)(?!\d)/g)]
  return m.length ? Number(m[m.length - 1][1]) : null
}

export function evaluateGl(rows: GlRow[], tags: Record<string, number>): GlLine[] {
  const ids = glLineIds(rows)
  return rows.map((r, i) => {
    const id = ids[i]
    const hand = tags[id]
    const memo = memoYear(r.memo)
    const tag = hand ?? r.year ?? memo ?? Number(periodLabel(r.posted).slice(0, 4))
    const tagSource = hand != null ? 'hand' : r.year != null ? 'workbook' : memo != null ? 'memo' : 'posting'
    return { ...r, id, net: round2(r.debit - r.credit), period: periodLabel(r.posted), tag, tagSource }
  })
}

export function defaultMethod(year: number, methods: Record<string, CohortMethod>): CohortMethod {
  if (methods[year]) return methods[year]
  const known = Object.keys(methods).map(Number).filter((y) => y < year).sort((a, b) => b - a)
  return known.length ? methods[known[0]] : { method: 'curve' }
}

export function runBreakage(inp: EngineInput) {
  const a = inp.assumptions
  const rules = new Map(inp.states.filter((s) => s.abbr).map((s) => [s.abbr.trim().toUpperCase(), s]))
  const amb = new Set(inp.ambassadors)

  // 1. Classify every row and pivot by category (the workbook's "Row Labels: Yes / Partial / ...").
  const rows: ClassifiedRow[] = inp.cohorts.map((r) => ({
    ...r,
    ...classify(r, rules, a, inp.overrides, amb),
    override: inp.overrides[r.id],
    issuedTotal: round2(sum(Object.values(r.issued))),
    redeemedTotal: round2(sum(Object.values(r.used).flatMap((m) => Object.values(m)))),
  }))
  const pivot = Object.fromEntries(['Yes', 'Partial', 'Conditional', 'No', 'Excluded'].map((c) => [c, emptyBucket()])) as Record<Category, Bucket>
  for (const r of rows) addRow(pivot[r.category], r)

  // 2. Eligible amounts: share applied per pivot cell and rounded to the cent (Partial Y = 40% of Partial).
  const years = new Set<number>()
  for (const r of inp.cohorts) for (const y of Object.keys(r.issued)) years.add(Number(y))
  for (let y = Math.min(...years, inp.asOfYear); y <= inp.asOfYear; y++) years.add(y)
  const cohortYears = [...years].filter((y) => Number.isFinite(y) && y <= inp.asOfYear).sort()
  const issued: YearMap = {}
  const used: Record<string, YearMap> = {}
  for (const [c, b] of Object.entries(pivot) as [Category, Bucket][]) {
    const k = share(c, a)
    if (!k) continue
    for (const [y, v] of Object.entries(b.issued)) add(issued, y, round2(v * k))
    for (const [y, m] of Object.entries(b.used)) for (const [u, v] of Object.entries(m)) add((used[y] ??= {}), u, round2(v * k))
  }

  // 3. Triangle: redemptions by development period, as a share of issuance.
  const age = (y: number) => inp.asOfYear - y + 1
  const dev = Object.fromEntries(cohortYears.map((y) => [y, Array.from({ length: age(y) }, (_, i) => round2(used[y]?.[y + i] ?? 0))])) as Record<number, number[]>
  const pct = Object.fromEntries(cohortYears.map((y) => [y, dev[y].map((v) => (issued[y] ? v / issued[y] : 0))])) as Record<number, number[]>
  const curve: CurvePoint[] = []
  for (let k = 1; k <= MAX_PERIOD; k++) {
    const vals = (from: number) => cohortYears.filter((y) => y >= from && age(y) >= k && pct[y][k - 1] !== 0).map((y) => pct[y][k - 1])
    const ex = vals(a.curve.avgFrom), al = vals(-Infinity)
    const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null)
    let source: CurvePoint['source'], v: number
    if (ex.length >= a.curve.minCohorts) { source = 'excl'; v = mean(ex)! }
    else if (al.length >= a.curve.minCohorts) { source = 'all'; v = mean(al)! }
    else if (k > 2 && curve[k - 2].used && curve[k - 3].used) { source = 'tail'; v = curve[k - 2].used ** 2 / curve[k - 3].used } // K30*(K30/J30)
    else { source = 'none'; v = 0 }
    curve.push({ period: k, excl: mean(ex), all: mean(al), used: v, source, exclCount: ex.length, allCount: al.length })
  }
  const curveToGo = (y: number) => sum(curve.filter((c) => c.period >= age(y) && c.period <= a.curve.horizon).map((c) => c.used)) + a.curve.cushion

  // 4. GL 4065 booked to date, by issuance year.
  const gl = evaluateGl(inp.gl, inp.glTags)
  const booked: Record<number, number> = {}
  for (const l of gl) if (l.tag != null) booked[l.tag] = round2((booked[l.tag] ?? 0) - l.net)

  // 5. The Summary, one row per issuance year.
  const results: YearResult[] = cohortYears.map((y) => {
    const g = round2(issued[y] ?? 0)
    const h = round2(sum(Object.values(used[y] ?? {})))
    const itd = g ? h / g : 0
    const method = defaultMethod(y, a.methods)
    const cv = curveToGo(y)
    const toGo = method.method === 'curve' ? cv : method.method === 'toGo' ? method.pct : method.pct - itd
    const total = itd + toGo
    const brk = 1 - total
    const factor = brk / (1 - brk)
    const itdBreakage = round0(factor * h)
    const c = booked[y] ?? 0
    const u = inp.reconciling[y] ?? 0
    return {
      year: y, age: age(y), issued: g, redeemed: h, itdPct: itd, toGoPct: toGo, curveToGoPct: cv, totalPct: total,
      breakagePct: brk, factor, itdBreakage, outstanding: round2(g - h), booked: c, reconciling: u,
      adjustment: round0(itdBreakage - c - u), method,
    }
  })
  const tot = {
    issued: round2(sum(results.map((r) => r.issued))),
    redeemed: round2(sum(results.map((r) => r.redeemed))),
    itdBreakage: sum(results.map((r) => r.itdBreakage)),
    outstanding: round2(sum(results.map((r) => r.outstanding))),
    booked: round2(sum(results.map((r) => r.booked))),
    reconciling: sum(results.map((r) => r.reconciling)),
    adjustment: sum(results.map((r) => r.adjustment)),
  }
  /** SUMMARY!N24: ITD breakage less what's booked and passed, before rounding by year. */
  const finalUnrounded = tot.itdBreakage - tot.booked - tot.reconciling
  const glTotal = round2(-sum(gl.map((l) => l.net)))

  // 6. Journal entry: 4065 by issuance year (memo carries the year so next month's GL tags itself), one 2231 offset.
  const je: JeLine[] = results.filter((r) => r.adjustment !== 0).map((r) => ({
    account: 4065, year: r.year, debit: r.adjustment < 0 ? -r.adjustment : 0, credit: r.adjustment > 0 ? r.adjustment : 0, memo: `Online Store Credit Breakage - ${r.year}`,
  }))
  if (tot.adjustment) je.push({ account: 2231, debit: tot.adjustment > 0 ? tot.adjustment : 0, credit: tot.adjustment < 0 ? -tot.adjustment : 0, memo: 'Less: OSC Breakage' })

  // 7. Things to look at before signing.
  const flagged = rows.filter((r) => r.flags?.length || r.via === 'override')
  const flagCounts: Partial<Record<CustomerFlag, number>> = {}
  for (const r of rows) for (const f of r.flags ?? []) flagCounts[f] = (flagCounts[f] ?? 0) + r.customers
  const glNeedsLook = gl.filter((l) => l.tagSource === 'posting')

  return {
    rows, pivot, issued, used, dev, pct, curve, gl, booked, results, tot, finalUnrounded, glTotal, je,
    flagged, flagCounts, glNeedsLook, cohortYears,
    granularity: inp.cohorts.some((r) => !r.category) ? ('customer' as const) : ('category' as const),
  }
}

export type BreakageResult = ReturnType<typeof runBreakage>

/** Category labels the way the workbook pivot shows them. */
export const CATEGORY_LABEL: Record<Category, string> = { Yes: 'Exempt', Partial: 'Partial', Conditional: 'Conditional', No: 'Not exempt', Excluded: 'Excluded' }
export const EXEMPTIONS: Exemption[] = ['Yes', 'Partial', 'Conditional', 'No']
