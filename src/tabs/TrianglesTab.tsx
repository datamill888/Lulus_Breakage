import { useState } from 'react'
import { TriangleRight } from 'lucide-react'
import { Button, Chip, ConfirmDialog, dollars, Field, HelpTip, inputCls, money, Note, PageIntro, Panel, pct, Seg, TableWrap, useReason, whole } from '@/components/ui'
import { MAX_PERIOD } from '@/lib/breakage/engine'
import type { CohortMethod, YearResult } from '@/lib/breakage/types'
import type { Store } from '@/lib/store'
import { methodLabel, MethodChip } from './SummaryTab'

type View = 'dollars' | 'pct' | 'cum'

export function TrianglesTab({ s }: { s: Store }) {
  const [view, setView] = useState<View>('pct')
  const r = s.r
  const periods = Array.from({ length: MAX_PERIOD }, (_, i) => i + 1)
  const a = s.period.assumptions
  const cum = (y: number) => r.pct[y].reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], [])
  const cell = (y: number, k: number) => {
    if (k > r.dev[y].length) return null
    if (view === 'dollars') return money(r.dev[y][k - 1], true)
    if (view === 'pct') return pct(r.pct[y][k - 1], 2)
    return pct(cum(y)[k - 1])
  }
  const SRC = { excl: ['accent', `Avg ${a.curve.avgFrom}+`], all: ['muted', 'Avg all years'], tail: ['violet', 'Extrapolated'], none: ['muted', '—'] } as const

  return (
    <>
      <PageIntro icon={TriangleRight} title="Triangles and rates">
        Redemptions by the year they happened, for each issuance year. The average curve below drives "to go" for the years set to the curve; the rest use a rate set by judgment. Every change needs a note.
      </PageIntro>

      <Panel flush title="Redemption triangle" aside={<Seg value={view} onChange={setView} options={[{ id: 'pct', label: '% of issuance' }, { id: 'cum', label: 'Cumulative %' }, { id: 'dollars', label: 'Redemption $' }]} />}>
        <TableWrap>
          <table className="ledger compact">
            <thead>
              <tr>
                <th className="pin">Issued</th>
                <th className="r">Issuance</th>
                {periods.map((k) => <th key={k} className="r" title={`Development year ${k} (year ${k === 1 ? 'of issuance' : `${k} after`})`}>Yr {k}</th>)}
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {r.cohortYears.map((y) => (
                <tr key={y}>
                  <td className="pin num font-semibold">{y}</td>
                  <td className="num r text-muted">{whole(r.issued[y])}</td>
                  {periods.map((k) => {
                    const v = cell(y, k)
                    const latest = k === r.dev[y].length
                    return <td key={k} className={`num r ${v == null ? 'bg-sunken/60' : latest ? 'text-muted' : ''}`} title={latest ? 'Current year, still in progress' : undefined}>{v ?? ''}</td>
                  })}
                  <td className="num r font-semibold">{view === 'dollars' ? whole(r.dev[y].reduce((p, v) => p + v, 0)) : pct(cum(y).at(-1))}</td>
                </tr>
              ))}
            </tbody>
            {view === 'pct' && (
              <tfoot>
                <tr><td className="pin">Avg {a.curve.avgFrom}+</td><td />{r.curve.map((c) => <td key={c.period} className="num r font-normal text-muted">{c.excl == null ? '' : pct(c.excl, 2)}</td>)}<td /></tr>
                <tr><td className="pin">Avg all</td><td />{r.curve.map((c) => <td key={c.period} className="num r font-normal text-muted">{c.all == null ? '' : pct(c.all, 2)}</td>)}<td /></tr>
                <tr><td className="pin">Curve used</td><td />{r.curve.map((c) => <td key={c.period} className="num r" title={SRC[c.source][1]}>{c.source === 'none' ? '' : pct(c.used, 2)}</td>)}<td className="num r">{pct(r.curve.reduce((p, c) => p + c.used, 0))}</td></tr>
              </tfoot>
            )}
          </table>
        </TableWrap>
        <Note>
          Grey figures in the last column of each row are the current, partial year. Each development year averages the issuance years from {a.curve.avgFrom} on when at least {a.curve.minCohorts} have data, then all years, then extrapolates
          (next = last × last ÷ previous). <span className="inline-flex gap-1 align-middle">{(['excl', 'all', 'tail'] as const).map((k) => <Chip key={k} tone={SRC[k][0]}>{SRC[k][1]}</Chip>)}</span>
        </Note>
      </Panel>

      <CurveChart s={s} />
      <AssumptionsPanel s={s} />
      <CurveSettings s={s} />
    </>
  )
}

/** Cumulative redemption % by development year, one line per issuance year (older years darker). */
function CurveChart({ s }: { s: Store }) {
  const r = s.r
  const [hover, setHover] = useState<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)
  const years = r.cohortYears
  const maxK = Math.max(...years.map((y) => r.dev[y].length))
  const W = 760, H = 300, L = 44, R = 104, T = 14, B = 30
  const x = (k: number) => L + ((k - 1) / Math.max(1, maxK - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - v) * (H - T - B)
  const series = years.map((yr) => ({ yr, pts: r.pct[yr].reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []) }))
  const color = (i: number) => `color-mix(in oklch, var(--accent) ${Math.round(35 + (65 * (years.length - 1 - i)) / Math.max(1, years.length - 1))}%, var(--surface))`
  return (
    <Panel title="Cumulative redemption by issuance year" aside={<span className="text-[12.5px] text-muted">Hover a year on the chart or in the legend</span>}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulative redemption percentage by development year for each issuance year" onMouseLeave={() => setHover(null)}>
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} /><text x={L - 8} y={y(v)} textAnchor="end" dominantBaseline="central" fill="var(--muted)" style={{ font: '11px var(--font-sans)' }}>{v * 100}%</text></g>
            ))}
            {Array.from({ length: maxK }, (_, i) => i + 1).map((k) => <text key={k} x={x(k)} y={H - 10} textAnchor="middle" fill="var(--muted)" style={{ font: '11px var(--font-sans)' }}>Yr {k}</text>)}
            {hover && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="3 3" />}
            {series.map(({ yr, pts }, i) => {
              const dim = focus != null && focus !== yr
              return (
                <g key={yr} opacity={dim ? 0.15 : 1} style={{ transition: 'opacity 150ms' }}>
                  <polyline fill="none" stroke={color(i)} strokeWidth={focus === yr ? 3 : 2} strokeLinejoin="round" strokeLinecap="round" points={pts.map((v, k) => `${x(k + 1)},${y(v)}`).join(' ')} />
                  <circle cx={x(pts.length)} cy={y(pts.at(-1)!)} r={4} fill={color(i)} stroke="var(--surface)" strokeWidth={2} />
                  {(focus === yr || (focus == null && (i === 0 || i === years.length - 1 || i === years.length - 2))) && (
                    <text x={x(pts.length) + 8} y={y(pts.at(-1)!)} dominantBaseline="central" fill="var(--fg)" style={{ font: '600 11px var(--font-sans)' }}>{yr} · {pct(pts.at(-1))}</text>
                  )}
                </g>
              )
            })}
            {Array.from({ length: maxK }, (_, i) => i + 1).map((k) => (
              <rect key={k} x={x(k) - (W - L - R) / Math.max(1, maxK - 1) / 2} y={T} width={(W - L - R) / Math.max(1, maxK - 1)} height={H - T - B} fill="transparent" onMouseEnter={() => setHover(k)} />
            ))}
          </svg>
          {hover && (
            <div className="pointer-events-none absolute top-2 z-10 grid min-w-44 gap-1 rounded-xl bg-fg px-3 py-2 text-[12px] text-surface shadow-lg" style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 190px))` }}>
              <span className="font-semibold">Development year {hover}</span>
              {series.filter((sr) => sr.pts.length >= hover).map((sr) => (
                <span key={sr.yr} className="flex justify-between gap-4"><span>{sr.yr}</span><span className="num">{pct(sr.pts[hover - 1])}</span></span>
              ))}
            </div>
          )}
        </div>
        <ul className="grid content-start gap-0.5 text-[12.5px]" aria-label="Issuance years">
          {series.map(({ yr, pts }, i) => (
            <li key={yr}>
              <button onMouseEnter={() => setFocus(yr)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(yr)} onBlur={() => setFocus(null)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1 hover:bg-hover">
                <span className="h-[3px] w-4 rounded-full" style={{ background: color(i) }} aria-hidden />
                <span className="num font-medium">{yr}</span>
                <span className="num ml-auto text-muted">{pct(pts.at(-1))} · yr {pts.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

function AssumptionsPanel({ s }: { s: Store }) {
  const [edit, setEdit] = useState<YearResult | null>(null)
  return (
    <Panel flush title={<span className="flex items-center gap-2">Expected redemption by issuance year<HelpTip text="Recent years don't have enough history for the curve, so they use a target total redemption rate. Nearly run-off years use a small fixed amount to go." /></span>}>
      <TableWrap>
        <table className="ledger">
          <thead><tr><th className="pin">Year</th><th className="r">Age</th><th className="r">ITD redeemed</th><th>How set</th><th className="r">To go</th><th className="r">Curve would say</th><th className="r">Breakage %</th><th className="r">ITD breakage</th><th className="r">Adjustment</th><th /></tr></thead>
          <tbody>
            {s.r.results.map((x) => {
              const gap = x.toGoPct - x.curveToGoPct
              return (
                <tr key={x.year}>
                  <td className="pin num font-semibold">{x.year}</td>
                  <td className="num r">{x.age}</td>
                  <td className="num r">{pct(x.itdPct)}</td>
                  <td><MethodChip m={x.method} /></td>
                  <td className="num r">{pct(x.toGoPct, 2)}</td>
                  <td className="num r text-muted" title={x.method.method === 'curve' ? undefined : `${gap >= 0 ? 'More' : 'Less'} conservative than the curve by ${pct(Math.abs(gap), 2)}`}>{pct(x.curveToGoPct, 2)}</td>
                  <td className="num r font-semibold">{pct(x.breakagePct)}</td>
                  <td className="num r">{whole(x.itdBreakage)}</td>
                  <td className="num r">{whole(x.adjustment)}</td>
                  <td className="r"><Button size="sm" disabled={s.locked} onClick={() => setEdit(x)}>Change</Button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <Note>"Curve would say" is the remaining average curve through year {s.period.assumptions.curve.horizon} plus the {pct(s.period.assumptions.curve.cushion, 2)} cushion, shown for every year so the judgment rates can be compared with the data.</Note>
      {edit && <MethodDialog s={s} x={edit} onClose={() => setEdit(null)} />}
    </Panel>
  )
}

function MethodDialog({ s, x, onClose }: { s: Store; x: YearResult; onClose: () => void }) {
  const [kind, setKind] = useState<CohortMethod['method']>(x.method.method)
  const [val, setVal] = useState(x.method.method === 'curve' ? '' : String(+(x.method.pct * 100).toFixed(4)))
  const { reason, setReason, input } = useReason()
  const method: CohortMethod = kind === 'curve' ? { method: 'curve' } : { method: kind, pct: (Number(val) || 0) / 100 }
  const toGo = method.method === 'curve' ? x.curveToGoPct : method.method === 'toGo' ? method.pct : method.pct - x.itdPct
  const brk = 1 - (x.itdPct + toGo)
  const itd = Math.round((brk / (1 - brk)) * x.redeemed)
  const save = () => { if (s.dispatch({ type: 'setMethod', year: x.year, method, before: methodLabel(x.method), after: methodLabel(method), reason })) { setReason(''); onClose() } }
  return (
    <ConfirmDialog open title={`${x.year} expected redemption`} confirmLabel="Save" disabled={!reason.trim() || (kind !== 'curve' && !val)} onClose={onClose} onConfirm={save}>
      <Seg value={kind} onChange={setKind} options={[{ id: 'curve', label: 'Curve' }, { id: 'target', label: 'Target total %' }, { id: 'toGo', label: 'Fixed to go %' }]} />
      {kind !== 'curve' && <Field label={kind === 'target' ? 'Expected total redemption %' : 'Expected redemption still to go %'} htmlFor="m-pct"><input id="m-pct" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} className={`num ${inputCls}`} /></Field>}
      <div className="grid gap-1 rounded-xl bg-sunken p-3 text-[12.5px]">
        <span className="flex justify-between"><span>Breakage %</span><span className="num text-fg">{pct(x.breakagePct)} → {pct(brk)}</span></span>
        <span className="flex justify-between"><span>ITD breakage</span><span className="num text-fg">{whole(x.itdBreakage)} → {whole(itd)}</span></span>
        <span className="flex justify-between"><span>This month's adjustment for {x.year}</span><span className="num text-fg">{dollars(x.adjustment)} → {dollars(itd - x.booked - x.reconciling)}</span></span>
      </div>
      {input('m-reason', 'Why? Reviewer sees this in the activity log')}
    </ConfirmDialog>
  )
}

function CurveSettings({ s }: { s: Store }) {
  const a = s.period.assumptions
  const [v, setV] = useState({ avgFrom: String(a.curve.avgFrom), minCohorts: String(a.curve.minCohorts), horizon: String(a.curve.horizon), cushion: String(a.curve.cushion * 100), partial: String(a.partialPct * 100), lo: String(a.expectedRange[0]), hi: String(a.expectedRange[1]) })
  const { reason, setReason, input } = useReason()
  const save = () => {
    const curve = { avgFrom: Number(v.avgFrom), minCohorts: Number(v.minCohorts), horizon: Number(v.horizon), cushion: Number(v.cushion) / 100 }
    const next = { curve, partialPct: Number(v.partial) / 100, expectedRange: [Number(v.lo), Number(v.hi)] as [number, number] }
    const describe: Record<string, [string, string]> = {}
    const cmp = (k: string, b: unknown, n: unknown) => { if (String(b) !== String(n)) describe[k] = [String(b), String(n)] }
    cmp('Average from', a.curve.avgFrom, curve.avgFrom); cmp('Min years per average', a.curve.minCohorts, curve.minCohorts); cmp('Horizon (years)', a.curve.horizon, curve.horizon)
    cmp('Cushion', pct(a.curve.cushion, 2), pct(curve.cushion, 2)); cmp('Partial exemption', pct(a.partialPct, 0), pct(next.partialPct, 0)); cmp('Expected range', a.expectedRange.join('–'), next.expectedRange.join('–'))
    if (!Object.keys(describe).length) return s.notify('Nothing changed.', 'bad')
    if ([curve.avgFrom, curve.minCohorts, curve.horizon, curve.cushion, next.partialPct, ...next.expectedRange].some((n) => !Number.isFinite(n))) return s.notify('Enter numbers only.', 'bad')
    if (s.dispatch({ type: 'setAssumptions', patch: next, describe, reason })) setReason('')
  }
  const f = (k: keyof typeof v, label: string, hint?: string) => (
    <Field label={label} htmlFor={`cs-${k}`} hint={hint}><input id={`cs-${k}`} inputMode="decimal" value={v[k]} disabled={s.locked} onChange={(e) => setV({ ...v, [k]: e.target.value })} className={`num ${inputCls}`} /></Field>
  )
  return (
    <Panel title="Curve and calculation settings">
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {f('avgFrom', 'Average from year', 'Workbook: 2020')}
          {f('minCohorts', 'Min years per average', 'Else all years')}
          {f('horizon', 'Horizon, dev. year', 'Workbook: 8')}
          {f('cushion', 'Cushion %', 'Workbook: 0.25')}
          {f('partial', 'Partial exemption %', 'Workbook: 40')}
          {f('lo', 'Expected low $', 'Sanity range')}
          {f('hi', 'Expected high $', 'Sanity range')}
        </div>
        <div className="flex flex-wrap items-end gap-3"><div className="min-w-64 flex-1">{input('cs-reason')}</div><Button tone="primary" disabled={s.locked} onClick={save}>Save settings</Button></div>
      </div>
    </Panel>
  )
}
