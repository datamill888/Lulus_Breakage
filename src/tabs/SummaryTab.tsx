import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, Printer, Table2 } from 'lucide-react'
import { Button, Chip, dollars, Field, HelpTip, inputCls, money, monthName, Note, PageIntro, Panel, pct, Stat, TableWrap, useReason, whole, Amount } from '@/components/ui'
import type { CohortMethod, YearResult } from '@/lib/breakage/types'
import type { Store } from '@/lib/store'
import type { Tab } from '@/App'

export const methodLabel = (m: CohortMethod) => (m.method === 'curve' ? 'Curve + cushion' : m.method === 'toGo' ? `Fixed ${pct(m.pct, 2)} to go` : `Target ${pct(m.pct)} total`)
export const MethodChip = ({ m }: { m: CohortMethod }) => <Chip tone={m.method === 'curve' ? 'accent' : 'violet'} title={m.method === 'curve' ? 'From the average redemption curve' : 'Judgment rate set by hand'}>{methodLabel(m)}</Chip>

export function SummaryTab({ s, go }: { s: Store; go: (t: Tab) => void }) {
  const r = s.r, t = r.tot
  const prior = s.prior
  const prev = new Map(prior?.rows.map((x) => [x.year, x]))
  const asOf = s.period.feeds.cohorts?.asOf ?? s.period.period.monthEnd

  const exportXlsx = () => {
    const head = ['Issuance year', 'Booked per GL 4065', 'Total issuance', 'ITD redemption $', 'ITD redemption %', 'Expected redemption to go %', 'Method', 'Expected total redemption %', 'Expected breakage %', 'Breakage factor', 'ITD breakage $', 'Outstanding balance', 'Reconciling items', `Adjustment ${s.period.period.label}`]
    const row = (x: YearResult) => [x.year, x.booked, x.issued, x.redeemed, x.itdPct, x.toGoPct, methodLabel(x.method), x.totalPct, x.breakagePct, x.factor, x.itdBreakage, x.outstanding, x.reconciling, x.adjustment]
    const sheet = XLSX.utils.aoa_to_sheet([
      [`BREAKAGE RATE BY ISSUANCE YEAR - ${monthName(s.period.period.label)}`], [], head, ...r.results.map(row),
      ['Total', t.booked, t.issued, t.redeemed, null, null, null, null, null, null, t.itdBreakage, t.outstanding, t.reconciling, t.adjustment],
      [], ['Final breakage adjustment', r.finalUnrounded], ['Rounded by year (JE)', t.adjustment],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'SUMMARY')
    XLSX.writeFile(wb, `${s.period.period.label} OSC Breakage Summary.xlsx`)
  }

  return (
    <>
      <PageIntro icon={Table2} title="Breakage by issuance year" action={<span className="no-print flex gap-2"><Button icon={Printer} onClick={() => window.print()}>Print</Button><Button icon={Download} onClick={exportXlsx}>Download .xlsx</Button></span>}>
        Inception to date, by the year the credit was issued. Breakage is recognized in proportion to redemptions: the expected breakage factor times what has been redeemed so far, less what is already booked.
      </PageIntro>
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total issuance (exempt share)" value={<Amount value={t.issued} compact />} sub="Since 2017, excluding gift card conversions" />
        <Stat label="Redeemed to date" value={<Amount value={t.redeemed} compact />} sub={`${pct(t.redeemed / t.issued)} of issuance`} />
        <Stat label="ITD breakage, latest estimate" value={<Amount value={t.itdBreakage} compact />} sub={`Booked so far ${dollars(t.booked)}`} />
        <Stat label="Adjustment this month" value={<Amount value={t.adjustment} compact />} tone={t.adjustment >= s.period.assumptions.expectedRange[0] && t.adjustment <= s.period.assumptions.expectedRange[1] ? 'ok' : 'warn'} sub={prior ? `${monthName(prior.period)}: ${dollars(prior.adjustment)}` : undefined} />
      </div>

      <Panel flush title="Current breakage calculation" aside={<span className="text-[12.5px] text-muted">Whole dollars · outstanding as of {asOf} · download for cents</span>}>
        <TableWrap>
          <table className="ledger">
            <thead>
              <tr>
                <th className="pin">Year</th>
                <th className="r">Booked per GL</th>
                <th className="r">Total issuance</th>
                <th className="r">ITD redeemed</th>
                <th className="r">ITD %</th>
                <th className="r">To go %</th>
                <th>How set</th>
                <th className="r"><span className="inline-flex items-center gap-1">Breakage %<HelpTip text="1 − (ITD % + to go %). Hover a value for the factor: breakage % ÷ (1 − breakage %), the breakage dollars per dollar redeemed." /></span></th>
                <th className="r">ITD breakage</th>
                <th className="r">Outstanding</th>
                <th className="r">Reconciling</th>
                <th className="r">Adjustment</th>
                {prior && <th className="r" title="Change in breakage % since the last close">vs {monthName(prior.period).slice(0, 3)}</th>}
              </tr>
            </thead>
            <tbody>
              {r.results.map((x) => {
                const pv = prev.get(x.year)
                const d = pv ? x.breakagePct - pv.breakagePct : null
                return (
                  <tr key={x.year}>
                    <td className="pin num font-semibold">{x.year}</td>
                    <td className="num r">{whole(x.booked)}</td>
                    <td className="num r">{whole(x.issued)}</td>
                    <td className="num r">{whole(x.redeemed)}</td>
                    <td className="num r">{pct(x.itdPct)}</td>
                    <td className="num r">{pct(x.toGoPct, 2)}</td>
                    <td><button onClick={() => go('triangles')} className="text-left"><MethodChip m={x.method} /></button></td>
                    <td className="num r font-semibold" title={`Expected total redemption ${pct(x.totalPct, 2)} · factor ${x.factor.toFixed(4)}`}>{pct(x.breakagePct)}</td>
                    <td className="num r">{whole(x.itdBreakage)}</td>
                    <td className="num r">{whole(x.outstanding)}</td>
                    <td className="num r text-muted">{whole(x.reconciling, true)}</td>
                    <td className={`num r font-semibold ${x.adjustment < 0 ? 'text-bad' : ''}`}>{whole(x.adjustment)}</td>
                    {prior && <td className="num r text-muted">{d == null ? '—' : Math.abs(d) < 0.00005 ? '0.00%' : `${d > 0 ? '+' : '−'}${(Math.abs(d) * 100).toFixed(2)}%`}</td>}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="pin">Total</td>
                <td className="num r">{whole(t.booked)}</td>
                <td className="num r">{whole(t.issued)}</td>
                <td className="num r">{whole(t.redeemed)}</td>
                <td className="num r">{pct(t.redeemed / t.issued)}</td>
                <td colSpan={3} />
                <td className="num r">{whole(t.itdBreakage)}</td>
                <td className="num r">{whole(t.outstanding)}</td>
                <td className="num r">{whole(t.reconciling, true)}</td>
                <td className="num r">{whole(t.adjustment)}</td>
                {prior && <td />}
              </tr>
            </tfoot>
          </table>
        </TableWrap>
        <Note>
          Issuance counts Exempt and Conditional states in full and {pct(s.period.assumptions.partialPct, 0)} of Partial states; Not exempt states and excluded customers are left out.
          The May workbook left Conditional out of 2025 issuance (its own check shows 158,055.90); it is included here. That changes 2025 issuance and ITD %, not the breakage dollars, because 2025 uses a target rate.
        </Note>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Final breakage adjustment">
          <dl className="grid gap-2 text-[13.5px]">
            {([
              ['ITD breakage, latest estimate', t.itdBreakage],
              ['Actual breakage booked per GL 4065', -t.booked],
              [s.period.reconcilingNote || 'Reconciling items', -t.reconciling],
            ] as [string, number][]).map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="num">{money(v)}</dd></div>)}
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold"><dt>Final breakage adjustment</dt><dd className="num">{money(r.finalUnrounded)}</dd></div>
            <div className="flex justify-between gap-3 text-muted"><dt>Booked rounded by year</dt><dd className="num">{money(t.adjustment)}</dd></div>
          </dl>
        </Panel>
        <ReconcilingEditor s={s} />
      </div>

      <TrendPanel s={s} />
    </>
  )
}

function ReconcilingEditor({ s }: { s: Store }) {
  const years = s.r.results.map((x) => x.year)
  const [year, setYear] = useState(String(years[0]))
  const [amt, setAmt] = useState(s.period.reconciling[year] != null ? s.period.reconciling[year].toFixed(2) : '')
  const { reason, setReason, input } = useReason()
  return (
    <Panel title={<span className="flex items-center gap-2">Reconciling items<HelpTip text="Adjustments treated as booked without a JE, like the 2025 true-up passed as a reconciling item (SUMMARY col U). They carry to next month." /></span>}>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Issuance year" htmlFor="rc-year">
            <select id="rc-year" value={year} disabled={s.locked} onChange={(e) => { setYear(e.target.value); setAmt(s.period.reconciling[e.target.value] != null ? s.period.reconciling[e.target.value].toFixed(2) : '') }} className={inputCls}>
              {years.map((y) => <option key={y} value={y}>{y}{s.period.reconciling[y] ? ` · ${money(s.period.reconciling[y])}` : ''}</option>)}
            </select>
          </Field>
          <Field label="Amount (negative reduces breakage)" htmlFor="rc-amt"><input id="rc-amt" inputMode="decimal" value={amt} disabled={s.locked} onChange={(e) => setAmt(e.target.value)} className={`num ${inputCls}`} /></Field>
        </div>
        {input('rc-reason')}
        <div className="flex justify-end"><Button tone="primary" disabled={s.locked} onClick={() => { if (s.dispatch({ type: 'setReconciling', year: Number(year), amount: Number(amt) || 0, reason })) setReason('') }}>Save</Button></div>
      </div>
    </Panel>
  )
}

/** Breakage % and adjustment by year across closes ("trend of rates per year"). */
function TrendPanel({ s }: { s: Store }) {
  const snaps = [...s.ws.history.filter((h) => h.period !== s.period.period.label)]
  const cols = [...snaps.map((h) => ({ label: monthName(h.period), rows: new Map(h.rows.map((x) => [x.year, x])), adj: h.adjustment, src: h.source })), { label: `${monthName(s.period.period.label)} (now)`, rows: new Map(s.r.results.map((x) => [x.year, x])), adj: s.r.tot.adjustment, src: 'current' as const }]
  const [view, setView] = useState<'breakage' | 'adj' | 'redeemed'>('breakage')
  return (
    <Panel flush title="Trend by close" aside={
      <div className="inline-flex gap-1 rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
        {([['breakage', 'Breakage %'], ['redeemed', 'ITD redeemed %'], ['adj', 'Adjustment']] as const).map(([k, l]) => (
          <button key={k} aria-pressed={view === k} onClick={() => setView(k)} className={`rounded-lg px-3 py-1 text-[12.5px] font-medium ${view === k ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}>{l}</button>
        ))}
      </div>
    }>
      <TableWrap>
        <table className="ledger">
          <thead><tr><th className="pin">Year</th>{cols.map((c) => <th key={c.label} className="r">{c.label}</th>)}</tr></thead>
          <tbody>
            {s.r.results.map((x) => (
              <tr key={x.year}>
                <td className="pin num font-semibold">{x.year}</td>
                {cols.map((c) => {
                  const v = c.rows.get(x.year)
                  return <td key={c.label} className="num r">{!v ? '—' : view === 'breakage' ? pct(v.breakagePct) : view === 'adj' ? whole(v.adjustment) : pct(v.issued ? v.redeemed / v.issued : 0)}</td>
                })}
              </tr>
            ))}
          </tbody>
          {view === 'adj' && <tfoot><tr><td className="pin">Total</td>{cols.map((c) => <td key={c.label} className="num r">{whole(c.adj)}</td>)}</tr></tfoot>}
        </table>
      </TableWrap>
      <Note>February and April come from the hard-coded blocks in the May workbook. Each month locked here adds a column.</Note>
    </Panel>
  )
}
