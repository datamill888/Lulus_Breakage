import { describe, expect, it } from 'vitest'
import { runBreakage } from '@/lib/breakage/engine'
import { parseAddresses, parseCohorts, parseGl } from '@/lib/sources/upload'
import { apply, ActionError } from './actions'
import { seedWorkspace } from './seed'

const at = (ws: ReturnType<typeof seedWorkspace>, user: string) => ({ ...ws, user })

describe('sign-off and lock', () => {
  it('runs preparer → reviewer → approver with different people, then locks and opens June', () => {
    let ws = seedWorkspace()
    ws = apply(ws, { type: 'signoff', role: 'prepared' })
    expect(() => apply(ws, { type: 'signoff', role: 'reviewed' })).toThrow(ActionError) // same person
    ws = apply(at(ws, 'Heidi'), { type: 'signoff', role: 'reviewed' })
    expect(() => apply(at(ws, 'Linda'), { type: 'signoff', role: 'approved' })).toThrow(ActionError)
    ws = apply(at(ws, 'John'), { type: 'signoff', role: 'approved' })
    ws = apply(ws, { type: 'lock', snapshot: { period: '2026-05', source: 'locked', at: '', rows: [], adjustment: 163090 } })
    expect(ws.periods['2026-05'].status).toBe('locked')
    expect(ws.periods['2026-06'].assumptions).toEqual(ws.periods['2026-05'].assumptions)
    expect(ws.periods['2026-06'].feeds.cohorts?.carried).toBe(true)
    expect(ws.history.at(-1)?.period).toBe('2026-05')
    expect(() => apply(ws, { type: 'setPostedJe', jeNo: '1' })).toThrow(/locked/)
  })

  it('a rate change needs a reason and clears sign-offs', () => {
    let ws = apply(seedWorkspace(), { type: 'signoff', role: 'prepared' })
    expect(() => apply(ws, { type: 'setMethod', year: 2025, method: { method: 'target', pct: 0.8 }, before: '', after: '', reason: '' })).toThrow(/reason/)
    ws = apply(ws, { type: 'setMethod', year: 2025, method: { method: 'target', pct: 0.8 }, before: 'a', after: 'b', reason: 'Heidi review' })
    expect(ws.periods['2026-05'].signoffs).toEqual({})
    expect(ws.audit.some((e) => e.action === 'Changed redemption assumption')).toBe(true)
  })
})

describe('Looker customer export', () => {
  const ws = seedWorkspace()
  const grid = [
    ['Customer ID', 'State', 'Country', 'Non-Giftcard Issued 2024', 'Non-Giftcard Issued 2025', '2024 Non-Giftcard Used In 2024', '2024 Non-Giftcard Used In 2025', '2025 Non-Giftcard Used In 2025', 'Ending Balance 2026'],
    ['1', 'CA', 'US', 100, 0, 50, 10, 0, 40],
    ['2', 'California', 'US', 200, 0, 100, 0, 0, 100],
    ['3', 'NY', 'US', 0, 300, 0, 0, 100, 200],
    ['4', '', 'US', 100, 0, 0, 0, 0, 100],
    ['5', 'ON', 'CA', 100, 0, 0, 0, 0, 100],
    ['2968742', 'TX', 'US', 500, 0, 0, 0, 0, 500],
  ]
  const addr = parseAddresses([['Customer ID', 'State', 'Country', 'Date'], ['1', 'NY', 'US', '2026-04-01'], ['1', 'CA', 'US', '2024-01-01']], ws.states)

  it('rolls customers up by state, keeps flagged ones individually, and classifies them', () => {
    const p = parseCohorts(grid, { states: ws.states, ambassadors: ws.ambassadors })
    expect(p.customers).toBe(6)
    expect(p.rows.find((r) => r.id === 'st:CA|US')?.customers).toBe(2) // "California" matched by name
    expect(p.rows.find((r) => r.id === 'cust:4')?.flags).toEqual(['no-state'])
    expect(p.rows.find((r) => r.id === 'cust:5')?.flags).toEqual(['international'])
    expect(p.rows.find((r) => r.id === 'cust:2968742')?.flags).toContain('ambassador')
    const s = ws.periods['2026-05']
    const r = runBreakage({ asOfYear: 2026, cohorts: p.rows, states: ws.states, overrides: {}, ambassadors: ws.ambassadors, assumptions: s.assumptions, gl: [], glTags: {}, reconciling: {} })
    // CA 300 + DE 40% of (100 no-state + 100 international) = 380; NY and the ambassador are out.
    expect(r.issued[2024]).toBe(380)
    expect(r.issued[2025] ?? 0).toBe(0)
  })

  it('uses the most recent address and flags moves', () => {
    const p = parseCohorts(grid, { states: ws.states, ambassadors: [], addresses: addr })
    const c1 = p.rows.find((r) => r.id === 'cust:1')!
    expect(c1.state).toBe('NY')
    expect(c1.states).toEqual(['NY', 'CA'])
    expect(c1.flags).toContain('moved')
  })

  it('reads a pasted pivot', () => {
    const p = parseCohorts([['Row Labels', 'Sum of Non-Giftcard Issued 2017'], ['Yes', 10], ['Partial', 5], ['Grand Total', 15], ['Partial Y', 2]], { states: ws.states, ambassadors: [] })
    expect(p.granularity).toBe('category')
    expect(p.rows.map((r) => r.id)).toEqual(['cat:Yes', 'cat:Partial'])
  })
})

describe('GL 4065 report', () => {
  it('skips balance-forward lines and keeps prior year tags on reload', () => {
    const grid = [
      ['Posted dt.', 'Doc dt.', 'Doc', 'Memo/Description', 'Department', 'Location', 'Txn No', 'JNL', 'Debit', 'Credit'],
      ['4065 - Online Store Credit Breakage (Balance forward As of 01/01/2016)', null, null, null, null, null, null, null, null, null],
      [new Date('2025-12-28'), new Date('2025-12-28'), '', 'OSC Breakage LTD adj', '', '10', '14048', 'GJ', null, 50136],
      [new Date('2026-05-31'), new Date('2026-05-31'), '', 'Online Store Credit Breakage - 2026', '', '10', '14760', 'GJ', null, 131987],
    ]
    const rows = parseGl(grid)
    expect(rows).toHaveLength(2)
    const ws = apply(seedWorkspace(), { type: 'loadFeed', kind: 'gl', rows, meta: { mode: 'upload', label: 'x', rows: 2, checksum: '', loadedAt: '', loadedBy: '' } })
    const gl = ws.periods['2026-05'].gl
    expect(gl[0].year).toBe(2017) // same line as the workbook's 2017 LTD adj
    expect(gl[1].year ?? null).toBe(null) // year comes from the memo
  })
})
