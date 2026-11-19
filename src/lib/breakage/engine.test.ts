import { describe, expect, it } from 'vitest'
import { seedWorkspace } from '@/lib/workspace/seed'
import { classify, runBreakage, type EngineInput } from './engine'
import type { CohortRow } from './types'

const input = (patch: Partial<EngineInput> = {}): EngineInput => {
  const ws = seedWorkspace()
  const p = ws.periods['2026-05']
  return { asOfYear: 2026, cohorts: p.cohorts, states: ws.states, overrides: p.overrides, ambassadors: ws.ambassadors, assumptions: p.assumptions, gl: p.gl, glTags: ws.glTags, reconciling: p.reconciling, ...patch }
}

describe('May 2026 ties to the workbook', () => {
  const r = runBreakage(input())
  const year = (y: number) => r.results.find((x) => x.year === y)!

  it('issuance per year (SUMMARY col G), Yes + Conditional + 40% of Partial', () => {
    expect(year(2017).issued).toBeCloseTo(1697936.14, 2)
    expect(year(2022).issued).toBeCloseTo(13319292.33, 2)
    expect(year(2026).issued).toBeCloseTo(5934715.96, 2)
    // The workbook leaves Conditional out of 2025 issuance ('2026-05 Breakage'!T30), the 158,055.90 its own check flags.
    expect(year(2025).issued).toBeCloseTo(16953972.95 + 158055.9, 2)
  })

  it('ITD redemptions (col H) and the triangle (TRENDS)', () => {
    expect(year(2017).redeemed).toBeCloseTo(1646161.26, 2)
    expect(year(2021).redeemed).toBeCloseTo(7683270.57, 2)
    expect(r.tot.redeemed).toBeCloseTo(74081567.11, 1)
    expect(r.dev[2019][7]).toBeCloseTo(8085.32, 2)
    // Periods 1-2 differ slightly from C30:D30 because 2025 issuance now includes Conditional; no year on the curve uses them.
    expect(r.curve[2].used).toBeCloseTo(0.03929470955053564, 12) // E30, avg of 2020-2024
    expect(r.curve[5].used).toBeCloseTo(0.004521391351104987, 12) // H30
    expect(r.curve[6].source).toBe('all') // I30 falls back to all cohorts
    expect(r.curve[10].source).toBe('tail') // M30 = L30*(L30/K30)
    expect(r.curve[10].used).toBeCloseTo(0.00020052380674440672, 12)
  })

  it('expected redemption to go (col J)', () => {
    expect(year(2019).toGoPct).toBeCloseTo(0.003763993886453339, 12)
    expect(year(2020).toGoPct).toBeCloseTo(0.005923776569297198, 12)
    expect(year(2021).toGoPct).toBeCloseTo(0.010445167920402185, 12)
    expect(year(2023).totalPct).toBeCloseTo(0.845, 12)
  })

  it('ITD breakage (col N), GL booked (col C) and the adjustment by year (col R)', () => {
    const n = [49152, 211647, 516979, 629213, 1167913, 1921212, 1807136, 2018841, 2212879, 517660]
    const c = [49671, 214062, 525440, 643657, 1207707.5, 1957575.01, 1841018.75, 2050321.01, 2205655.15, 385673]
    const adj = [-84, -1298, -3674, -5744, -14043, -41, 1064, 9311, 45612, 131987]
    r.results.forEach((x, i) => {
      expect(x.itdBreakage).toBe(n[i])
      expect(x.booked).toBeCloseTo(c[i], 2)
      expect(x.adjustment).toBe(adj[i])
    })
    expect(r.tot.adjustment).toBe(163090) // JE 14760
    expect(r.finalUnrounded).toBeCloseTo(163089.95235754363, 6) // SUMMARY!N24
    expect(r.tot.booked).toBeCloseTo(11080780.42, 2)
  })

  it('the JE balances and nets to the adjustment', () => {
    const dr = r.je.reduce((a, l) => a + l.debit, 0), cr = r.je.reduce((a, l) => a + l.credit, 0)
    expect(dr).toBe(cr)
    expect(r.je.find((l) => l.account === 2231)!.debit).toBe(163090)
  })

  it('GL year tags from the memo agree with the workbook wherever the memo has a year', () => {
    for (const l of r.gl) {
      const m = l.memo.match(/(?<!\d)(20[1-3]\d)(?!\d)/g)
      if (m && !/LTD/.test(l.memo)) expect(l.tag).toBe(Number(m[m.length - 1]))
    }
  })
})

describe('classification', () => {
  const ws = seedWorkspace()
  const rules = new Map(ws.states.map((s) => [s.abbr, s]))
  const a = ws.periods['2026-05'].assumptions
  const row = (p: Partial<CohortRow>): CohortRow => ({ id: 'x', customers: 1, issued: {}, used: {}, gcIssued: {}, gcUsed: {}, ending: 0, ...p })

  it('uses the state table', () => {
    expect(classify(row({ state: 'CA', country: 'US' }), rules, a, {}, new Set()).category).toBe('Yes')
    expect(classify(row({ state: 'NY', country: 'US' }), rules, a, {}, new Set()).category).toBe('No')
    expect(classify(row({ state: 'ID', country: 'US' }), rules, a, {}, new Set()).category).toBe('Conditional')
  })
  it('sends no-state and international customers to Delaware', () => {
    expect(classify(row({ state: null, country: 'US' }), rules, a, {}, new Set())).toMatchObject({ category: 'Partial', effectiveState: 'DE', via: 'no-state' })
    expect(classify(row({ state: 'ON', country: 'CA' }), rules, a, {}, new Set())).toMatchObject({ effectiveState: 'DE', via: 'international' })
    expect(classify(row({ state: 'ON', country: 'CA' }), rules, { ...a, international: 'exclude' }, {}, new Set()).category).toBe('No')
  })
  it('excludes ambassadors and honors overrides', () => {
    expect(classify(row({ customerId: '2968742', state: 'CA' }), rules, a, {}, new Set(['2968742'])).category).toBe('Excluded')
    const o = { x: { state: 'NY', note: 'moved', by: 'L', at: '' } }
    expect(classify(row({ state: 'CA' }), rules, a, o, new Set()).category).toBe('No')
  })
})
