import * as XLSX from 'xlsx'
import { isDomestic, round2 } from '@/lib/breakage/engine'
import type { CohortRow, CustomerFlag, Exemption, GlRow, StateRule } from '@/lib/breakage/types'

type Cell = string | number | Date | null | undefined
export type Grid = Cell[][]

export async function readGrid(file: File, sheet?: string): Promise<Grid> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, dense: true })
  const name = sheet && wb.SheetNames.includes(sheet) ? sheet : wb.SheetNames[0]
  return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })
}

const txt = (c: Cell) => (c == null ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())
const num = (c: Cell) => {
  if (typeof c === 'number') return c
  const s = String(c ?? '').replace(/[$,\s]/g, '')
  const neg = /^\(.*\)$/.test(s)
  const v = Number(s.replace(/[()]/g, '')) || 0
  return neg ? -v : v
}
const iso = (c: Cell): string => {
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  if (typeof c === 'number') return XLSX.SSF.format('yyyy-mm-dd', c)
  const s = txt(c)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : s.slice(0, 10)
}
const norm = (h: Cell) => txt(h).toLowerCase().replace(/^sum of /, '').replace(/\s+/g, ' ')

/** Finds the header row: the first row where `test` passes on the normalized headers. */
function headerRow(grid: Grid, test: (hdr: string[]) => boolean, what: string) {
  for (let r = 0; r < Math.min(grid.length, 40); r++) {
    const hdr = (grid[r] ?? []).map(norm)
    if (test(hdr)) return { row: r, hdr }
  }
  throw new Error(`Could not find the ${what} header row`)
}

// ─── Looker store credit export (Look 5700) ──────────────────────────────────

const RE = {
  issued: /^non-giftcard issued (\d{4})$/,
  used: /^(\d{4}) non-giftcard used in (\d{4})$/,
  gcIssued: /^giftcard issued (\d{4})$/,
  gcUsed: /^(\d{4}) giftcard used in (\d{4})$/,
  ending: /^ending balance(?: (\d{4}))?$/,
}

interface Cols {
  issued: [number, string][]
  used: [number, string, string][]
  gcIssued: [number, string][]
  gcUsed: [number, string][]
  ending: number
}
function amountCols(hdr: string[]): Cols {
  const c: Cols = { issued: [], used: [], gcIssued: [], gcUsed: [], ending: -1 }
  hdr.forEach((h, i) => {
    let m
    if ((m = h.match(RE.issued))) c.issued.push([i, m[1]])
    else if ((m = h.match(RE.used))) c.used.push([i, m[1], m[2]])
    else if ((m = h.match(RE.gcIssued))) c.gcIssued.push([i, m[1]])
    else if ((m = h.match(RE.gcUsed)) && m[1] === m[2]) c.gcUsed.push([i, m[1]])
    else if (RE.ending.test(h) && c.ending < 0) c.ending = i
  })
  return c
}
const blank = (id: string): CohortRow => ({ id, customers: 0, issued: {}, used: {}, gcIssued: {}, gcUsed: {}, ending: 0 })
function addAmounts(row: CohortRow, r: Cell[], c: Cols) {
  const put = (m: Record<string, number>, k: string, v: number) => { if (v) m[k] = round2((m[k] ?? 0) + v) }
  for (const [i, y] of c.issued) put(row.issued, y, num(r[i]))
  for (const [i, y, u] of c.used) put((row.used[y] ??= {}), u, num(r[i]))
  for (const [i, y] of c.gcIssued) put(row.gcIssued, y, num(r[i]))
  for (const [i, y] of c.gcUsed) put(row.gcUsed, y, num(r[i]))
  if (c.ending >= 0) row.ending = round2(row.ending + num(r[c.ending]))
}

export interface AddressEntry { state: string | null; country: string | null; date: string; type: string }

export interface CohortParse {
  rows: CohortRow[]
  customers: number
  granularity: 'customer' | 'category'
  individual: number
  /** Flagged customers beyond the cap, kept summed by state instead of one per row. */
  overflow: number
}

/** Customers kept one per row (searchable, overridable). The rest are summed by state. */
export const INDIVIDUAL_CAP = 5000

/**
 * The Looker export behind the pivots. Two shapes work:
 *  - one row per customer (Customer ID, state, country, then "Non-Giftcard Issued 2017",
 *    "2017 Non-Giftcard Used In 2018"... columns), which the app classifies by state, or
 *  - the workbook pivot itself (Row Labels Yes / Partial / Conditional / No), already classified.
 */
export function parseCohorts(grid: Grid, ctx: { states: StateRule[]; ambassadors: string[]; addresses?: Map<string, AddressEntry[]> }): CohortParse {
  const { row, hdr } = headerRow(grid, (h) => h.some((x) => RE.issued.test(x) || RE.used.test(x)), 'Looker store credit')
  const c = amountCols(hdr)
  const find = (re: RegExp, not?: RegExp) => hdr.findIndex((h) => re.test(h) && !(not && not.test(h)))
  const idCol = find(/customer (info )?id|^customer$/)
  const body = grid.slice(row + 1).filter((r) => r && r.some((x) => x != null && x !== ''))

  // Pivot paste: categories in the first column, no customer ids.
  if (idCol < 0) {
    const cats: Exemption[] = ['Yes', 'Partial', 'Conditional', 'No']
    const out = new Map<Exemption, CohortRow>()
    for (const r of body) {
      const label = txt(r[0]) as Exemption
      if (!cats.includes(label)) continue // Grand Total, Partial Y / N, (blank)
      const cr = out.get(label) ?? { ...blank(`cat:${label}`), category: label }
      addAmounts(cr, r, c)
      out.set(label, cr)
    }
    if (!out.size) throw new Error('No customer id column and no Yes / Partial / Conditional / No rows')
    return { rows: [...out.values()], customers: 0, granularity: 'category', individual: 0, overflow: 0 }
  }

  const byName = new Map(ctx.states.map((s) => [s.name.toLowerCase(), s.abbr]))
  const codes = new Set(ctx.states.map((s) => s.abbr).filter(Boolean))
  const stateCode = (v: Cell) => {
    const s = txt(v)
    if (!s) return null
    return byName.get(s.toLowerCase()) ?? s.toUpperCase()
  }
  const col = {
    state: find(/(^|\b)(state|province|region)\b/, /bill|ship|exempt/),
    country: find(/country/, /bill|ship/),
    billState: find(/bill.*(state|region)/), shipState: find(/ship.*(state|region)/),
    billCountry: find(/bill.*country/), shipCountry: find(/ship.*country/),
  }
  const at = (r: Cell[], i: number) => (i >= 0 ? txt(r[i]) : '')
  const amb = new Set(ctx.ambassadors)

  interface Cust { id: string; state: string | null; country: string | null; states?: string[]; flags: CustomerFlag[]; r: Cell[] }
  const custs: Cust[] = []
  for (const r of body) {
    const id = txt(r[idCol]).replace(/\.0$/, '')
    if (!id) continue
    const hist = ctx.addresses?.get(id)
    const latest = hist?.[0]
    let state = latest ? latest.state : stateCode(r[col.state] ?? (col.billState >= 0 ? r[col.billState] : r[col.shipState]))
    let country = ((latest ? latest.country : at(r, col.country) || at(r, col.billCountry) || at(r, col.shipCountry)) ?? '').toUpperCase() || null
    if (country === 'USA' || country === 'UNITED STATES') country = 'US'
    if (state === '') state = null
    const flags: CustomerFlag[] = []
    if (amb.has(id)) flags.push('ambassador')
    if (!isDomestic(country)) flags.push('international')
    else if (!state) flags.push('no-state')
    else if (!codes.has(state)) flags.push('unknown-state')
    const bc = at(r, col.billCountry).toUpperCase(), sc = at(r, col.shipCountry).toUpperCase()
    const bs = at(r, col.billState).toUpperCase(), ss = at(r, col.shipState).toUpperCase()
    if ((bc && sc && bc !== sc) || (bs && ss && bs !== ss)) flags.push('split-address')
    const states = hist ? [...new Set(hist.map((h) => h.state ?? '—'))] : undefined
    if (states && states.length > 1) flags.push('moved')
    custs.push({ id, state, country, states, flags, r })
  }
  if (!custs.length) throw new Error('No customer rows under the header')

  // Biggest flagged balances first get their own rows; the rest sum by state, country and flags.
  const flagged = custs.filter((x) => x.flags.length)
  const issuedOf = (x: Cust) => c.issued.reduce((a, [i]) => a + num(x.r[i]), 0)
  const keep = new Set(flagged.sort((a, b) => issuedOf(b) - issuedOf(a)).slice(0, INDIVIDUAL_CAP).map((x) => x.id))
  const out = new Map<string, CohortRow>()
  for (const x of custs) {
    const solo = keep.has(x.id)
    const key = solo ? `cust:${x.id}` : `st:${x.state ?? ''}|${x.country ?? ''}${x.flags.length ? `|${x.flags.join(',')}` : ''}`
    let cr = out.get(key)
    if (!cr) {
      cr = { ...blank(key), state: x.state, country: x.country, ...(solo ? { customerId: x.id, states: x.states } : {}), ...(x.flags.length ? { flags: x.flags } : {}) }
      out.set(key, cr)
    }
    cr.customers += 1
    addAmounts(cr, x.r, c)
  }
  return { rows: [...out.values()], customers: custs.length, granularity: 'customer', individual: keep.size, overflow: flagged.length - keep.size }
}

/**
 * Looker address report: one row per address used, most recent first (or with a date column).
 * Used to place each customer in the state they most recently used, and to see who moved.
 */
export function parseAddresses(grid: Grid, states: StateRule[]): Map<string, AddressEntry[]> {
  const { row, hdr } = headerRow(grid, (h) => h.some((x) => /customer (info )?id/.test(x)) && h.some((x) => /state|region/.test(x)), 'address report')
  const f = (re: RegExp) => hdr.findIndex((h) => re.test(h))
  const c = { id: f(/customer (info )?id/), state: f(/state|region/), country: f(/country/), date: f(/date|last used|created|updated/), type: f(/type/) }
  const byName = new Map(states.map((s) => [s.name.toLowerCase(), s.abbr]))
  const out = new Map<string, AddressEntry[]>()
  grid.slice(row + 1).forEach((r) => {
    const id = txt(r[c.id]).replace(/\.0$/, '')
    if (!id) return
    const st = txt(r[c.state])
    const e: AddressEntry = {
      state: st ? byName.get(st.toLowerCase()) ?? st.toUpperCase() : null,
      country: c.country >= 0 ? txt(r[c.country]).toUpperCase() || null : null,
      date: c.date >= 0 ? iso(r[c.date]) : '',
      type: c.type >= 0 ? txt(r[c.type]) : '',
    }
    const list = out.get(id) ?? []
    list.push(e)
    out.set(id, list)
  })
  // File order is "most recent first"; a date column, when there is one, decides instead.
  for (const list of out.values()) if (list.some((e) => e.date)) list.sort((a, b) => b.date.localeCompare(a.date))
  return out
}

// ─── Intacct GL 4065 ─────────────────────────────────────────────────────────

/** Intacct General Ledger Report for 4065 Online Store Credit Breakage, inception to date. */
export function parseGl(grid: Grid): GlRow[] {
  const { row, hdr } = headerRow(grid, (h) => ['posted dt.', 'jnl', 'debit', 'credit'].every((n) => h.some((x) => x.startsWith(n))), 'GL report')
  const f = (n: string) => hdr.findIndex((h) => h === n || h.startsWith(n))
  const c = { posted: f('posted dt.'), docDate: f('doc dt.'), doc: hdr.findIndex((h) => h === 'doc'), memo: f('memo'), loc: f('location'), txn: f('txn no'), jnl: f('jnl'), dr: f('debit'), cr: f('credit'), rec: f('recordno') }
  const out: GlRow[] = []
  for (const r of grid.slice(row + 1)) {
    const jnl = txt(r[c.jnl])
    if (!jnl || !iso(r[c.posted]).match(/^\d{4}-/)) continue // balance forward and totals
    out.push({
      posted: iso(r[c.posted]), docDate: c.docDate >= 0 ? iso(r[c.docDate]) : '', doc: c.doc >= 0 ? txt(r[c.doc]) : '', memo: txt(r[c.memo]),
      loc: c.loc >= 0 ? txt(r[c.loc]) : '', txnNo: c.txn >= 0 ? txt(r[c.txn]) : '', jnl, debit: round2(num(r[c.dr])), credit: round2(num(r[c.cr])),
      ...(c.rec >= 0 && txt(r[c.rec]) ? { recordNo: txt(r[c.rec]) } : {}),
    })
  }
  if (!out.length) throw new Error('No GL lines under the header')
  return out
}

/** A list of customer ids (ambassador Look 5617). Takes the first id-looking column. */
export function parseIds(grid: Grid): string[] {
  const { row, hdr } = headerRow(grid, (h) => h.some((x) => /customer (info )?id/.test(x)), 'customer id')
  const cols = hdr.map((h, i) => (/customer (info )?id/.test(h) ? i : -1)).filter((i) => i >= 0)
  const ids = new Set<string>()
  for (const r of grid.slice(row + 1)) for (const i of cols) { const v = txt(r[i]).replace(/\.0$/, ''); if (/^\d+$/.test(v)) ids.add(v) }
  return [...ids].sort()
}
