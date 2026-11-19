import { useState } from 'react'
import { ArrowRight, BookOpenCheck, Check, Database, Landmark, Lock, ShieldCheck, TriangleRight, UserSearch, type LucideIcon } from 'lucide-react'
import logo from '@/assets/lulus-logo.png'
import { Amount, Avatar, Button, Chip, compactDollars, ConfirmDialog, dollars, HelpTip, monthName, Panel, ProgressRing, shortDate, stamp, useReason, whole } from '@/components/ui'
import { nextMonthEnd, periodLabel } from '@/lib/breakage/fiscal'
import type { Store } from '@/lib/store'
import { ROLE_LABEL } from '@/lib/workspace/actions'
import type { Role } from '@/lib/workspace/types'
import type { Tab } from '@/App'

interface Step { tab: Tab | 'upload' | 'signoff'; icon: LucideIcon; title: string; detail: string; done: boolean; cta: string }

/** Issuance for closed years should not move. When it does, customers moved state or Looker changed. */
export function issuanceDrift(s: Store) {
  if (!s.prior) return []
  const prev = new Map(s.prior.rows.map((r) => [r.year, r]))
  return s.r.results
    .filter((r) => r.year < Number(s.period.period.label.slice(0, 4)) && prev.has(r.year))
    .map((r) => ({ year: r.year, issued: r.issued - prev.get(r.year)!.issued, redeemed: r.redeemed - prev.get(r.year)!.redeemed }))
    .filter((d) => Math.abs(d.issued) >= 1)
}

export function OverviewTab({ s, go, openUpload }: { s: Store; go: (t: Tab) => void; openUpload: () => void }) {
  const p = s.period, r = s.r
  const [lo, hi] = p.assumptions.expectedRange
  const adj = r.tot.adjustment
  const inRange = adj >= lo && adj <= hi
  const fresh = (k: 'cohorts' | 'gl') => !!p.feeds[k] && !p.feeds[k]?.carried
  const loaded = fresh('cohorts') && fresh('gl')
  const openFlags = r.flagged.filter((x) => !x.override)
  const drift = issuanceDrift(s)

  const steps: Step[] = [
    {
      tab: 'upload', icon: Database, title: 'Load Looker and the GL', cta: 'Load data', done: loaded,
      detail: loaded ? `Store credit export and GL 4065 are in${p.feeds.cohorts?.asOf ? `, Looker as of ${shortDate(p.feeds.cohorts.asOf)}` : ''}.` : [!fresh('cohorts') && 'Looker store credit export', !fresh('gl') && 'GL 4065 detail'].filter(Boolean).join(' and ') + ' still needed for this month.',
    },
    {
      tab: 'customers', icon: UserSearch, title: 'Clear customer exceptions', cta: openFlags.length ? `Review ${openFlags.length}` : 'View',
      done: openFlags.length === 0,
      detail: r.granularity === 'category' ? 'Data is the pivot by exemption, so there are no customers to check. Load the customer-level export to see them.'
        : openFlags.length ? `${openFlags.length} customers with no state, an address outside the US, a move or an ambassador flag.` : 'Every flagged customer has been looked at.',
    },
    {
      tab: 'gl', icon: Landmark, title: 'Tag GL 4065 to issuance years', cta: r.glNeedsLook.length ? `Tag ${r.glNeedsLook.length}` : 'View',
      done: r.glNeedsLook.length === 0,
      detail: r.glNeedsLook.length ? `${r.glNeedsLook.length} lines have no year in the memo and were put in their posting year.` : `All ${r.gl.length} lines carry an issuance year. Booked to date ${dollars(r.tot.booked)}.`,
    },
    {
      tab: 'triangles', icon: TriangleRight, title: 'Review triangles and rates', cta: 'Review',
      done: inRange,
      detail: inRange ? `Adjustment of ${dollars(adj)} is inside the expected ${compactDollars(lo)}–${compactDollars(hi)}.` : `Adjustment of ${dollars(adj)} is outside the expected ${compactDollars(lo)}–${compactDollars(hi)}. Check the rates and the data.`,
    },
    {
      tab: 'je', icon: BookOpenCheck, title: 'Book the journal entry', cta: 'Open JE', done: !!p.postedJe.jeNo,
      detail: p.postedJe.jeNo ? `JE ${p.postedJe.jeNo} for ${dollars(adj)}.` : 'Post the entry by issuance year in Intacct and record the JE number.',
    },
    {
      tab: 'signoff', icon: ShieldCheck, title: 'Sign off and lock', cta: 'Go to sign-off', done: s.locked,
      detail: s.locked ? `Locked by ${p.closing?.lockedBy}.` : p.signoffs.approved ? 'Approved. Ready to lock.' : p.signoffs.reviewed ? 'Reviewed. Waiting on final sign-off.' : p.signoffs.prepared ? 'Prepared. Waiting on the reviewer.' : 'Preparer, reviewer, then final sign-off.',
    },
  ]
  const done = steps.filter((x) => x.done).length
  const next = steps.find((x) => !x.done)
  const open = (st: Step) => {
    if (st.tab === 'upload') return openUpload()
    if (st.tab === 'signoff') return document.getElementById('signoff')?.scrollIntoView({ behavior: 'smooth' })
    go(st.tab)
  }
  const nextLabel = periodLabel(nextMonthEnd(p.period.monthEnd))

  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-blush via-surface to-surface shadow-md">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-32 size-[420px] rounded-full bg-accent-soft blur-3xl" />
        <img src={logo} alt="" aria-hidden className="logo pointer-events-none absolute -bottom-8 right-6 hidden w-[340px] opacity-[0.045] lg:block" />
        <div className="relative grid gap-6 p-6 md:p-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <ProgressRing done={done} total={steps.length} />
              <div>
                <p className="text-[13px] font-medium text-muted">{monthName(p.period.label)} close · {shortDate(s.start)} – {shortDate(p.period.monthEnd)}</p>
                <h2 className="font-display text-[30px] leading-[1.1] md:text-[38px]">
                  {s.locked ? 'This month is closed.' : next ? `Next up: ${next.title.toLowerCase()}.` : 'All done.'}
                </h2>
              </div>
            </div>
            <p className="max-w-[56ch] text-[14px] text-muted">{s.locked ? `Locked and carried into ${monthName(nextLabel)}.` : next?.detail}</p>
            <div className="flex flex-wrap gap-2">
              {s.locked
                ? s.ws.periods[nextLabel] && <Button size="lg" tone="primary" icon={ArrowRight} onClick={() => s.dispatch({ type: 'selectPeriod', period: nextLabel })}>Go to {monthName(nextLabel)}</Button>
                : next && <Button size="lg" tone="primary" icon={ArrowRight} onClick={() => open(next)}>{next.cta}</Button>}
              <Button size="lg" onClick={() => go('summary')}>Open the summary</Button>
            </div>
          </div>
          <AdjustmentCard s={s} inRange={inRange} />
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-[24px]">Close checklist</h3>
          <span className="text-[12.5px] text-muted">{done} of {steps.length} done · about 2.5 hours a close today</span>
        </div>
        <ol className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {steps.map((st, i) => (
            <li key={st.title}>
              <button onClick={() => open(st)} className={`group flex h-full w-full items-start gap-3.5 rounded-2xl border bg-surface p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${st === next ? 'border-fg ring-3 ring-accent-soft' : 'border-line'}`}>
                <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl ${st.done ? 'bg-ok-soft text-ok' : st === next ? 'bg-cta text-on-cta' : 'bg-blush text-accent'}`}>
                  {st.done ? <Check size={19} strokeWidth={2.6} /> : <st.icon size={19} />}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-[11.5px] font-medium text-faint">Step {i + 1}{st.done ? ' · done' : st === next ? ' · next up' : ''}</span>
                  <span className="text-[14px] font-semibold">{st.title}</span>
                  <span className="text-[12.5px] text-muted">{st.detail}</span>
                  <span className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent">{st.cta} <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" /></span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {drift.length > 0 && (
        <Panel title={<span className="flex items-center gap-2">Closed years moved since {monthName(s.prior!.period)}<HelpTip text="Issuance for a past year should not change. When it does, customers moved to a state with a different exemption, or Looker data changed. Large moves are worth a look in Customers." /></span>} flush>
          <table className="ledger">
            <thead><tr><th>Issuance year</th><th className="r">Issuance change</th><th className="r">Redemption change</th><th>Likely cause</th></tr></thead>
            <tbody>
              {drift.map((d) => (
                <tr key={d.year}>
                  <td className="num font-semibold">{d.year}</td>
                  <td className="num r">{whole(d.issued)}</td>
                  <td className="num r">{whole(d.redeemed)}</td>
                  <td className="text-[12.5px] text-muted">{d.issued < 0 ? 'Customers moved to a non-exempt state, or credits reversed' : 'Customers moved into an exempt state, or late postings'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <SignoffPanel s={s} />
    </>
  )
}

function AdjustmentCard({ s, inRange }: { s: Store; inRange: boolean }) {
  const r = s.r, p = s.period
  const [lo, hi] = p.assumptions.expectedRange
  const prior = s.prior
  const rows: [string, number, string?][] = [
    ['ITD breakage, latest estimate', r.tot.itdBreakage],
    ['Less booked to GL 4065', -r.tot.booked],
    ['Less reconciling items', -r.tot.reconciling, p.reconcilingNote],
  ]
  return (
    <div className="grid gap-4 rounded-2xl border border-line bg-surface/90 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="eyebrow">Breakage adjustment · {monthName(p.period.label)}</span>
          <div className="mt-1 text-[38px] font-semibold leading-none tracking-tight"><Amount value={r.tot.adjustment} /></div>
        </div>
        {inRange ? <Chip tone="ok" icon>In range</Chip> : <Chip tone="warn" icon>Outside {compactDollars(lo)}–{compactDollars(hi)}</Chip>}
      </div>
      <dl className="grid gap-1.5 text-[13px]">
        {rows.map(([k, v, hint]) => (
          <div key={k} className="flex items-center justify-between gap-3"><dt className="flex items-center gap-1 text-muted">{k}{hint && <HelpTip text={hint} />}</dt><dd className="num">{dollars(v)}</dd></div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-line pt-1.5 font-semibold"><dt>Adjustment (rounded by year)</dt><dd className="num">{dollars(r.tot.adjustment)}</dd></div>
      </dl>
      {prior && <p className="text-[12.5px] text-muted">{monthName(prior.period)} close: {dollars(prior.adjustment)}{prior.source === 'workbook' ? ' (from the workbook)' : ''}.</p>}
    </div>
  )
}

const ROLES: { role: Role; who: string; what: string }[] = [
  { role: 'prepared', who: 'Linda', what: 'Loads the data, clears exceptions, books the JE' },
  { role: 'reviewed', who: 'Heidi', what: 'Reviews triangles, rates and adjustments' },
  { role: 'approved', who: 'John', what: 'Final sign-off' },
]

function SignoffPanel({ s }: { s: Store }) {
  const p = s.period
  const [clearing, setClearing] = useState<Role | null>(null)
  const [locking, setLocking] = useState(false)
  const [reopening, setReopening] = useState(false)
  const { reason, setReason, input } = useReason()
  const nextRole = ROLES.find((x) => !p.signoffs[x.role])
  return (
    <section id="signoff" className="scroll-mt-40">
      <Panel title="Sign-off" aside={<span className="text-[12.5px] text-muted">Signing as <span className="font-medium text-fg">{s.ws.user}</span>. Change the name in the header to sign as someone else.</span>}>
        <div className="grid gap-4">
          <ol className="grid gap-3 md:grid-cols-3">
            {ROLES.map(({ role, who, what }, i) => {
              const so = p.signoffs[role]
              return (
                <li key={role} className={`grid gap-2 rounded-2xl border p-4 ${so ? 'border-ok/30 bg-ok-soft' : nextRole?.role === role ? 'border-fg' : 'border-line'}`}>
                  <span className="eyebrow">{i + 1} · {ROLE_LABEL[role]}</span>
                  <span className="text-[12.5px] text-muted">Usually {who}. {what}.</span>
                  {so ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[13px]"><Avatar name={so.by} tone="ok" /><span><span className="font-semibold">{so.by}</span><br /><span className="text-[12px] text-muted">{stamp(so.at)}</span></span></span>
                      {!s.locked && <Button size="sm" tone="quiet" onClick={() => setClearing(role)}>Remove</Button>}
                    </div>
                  ) : (
                    <Button tone={nextRole?.role === role ? 'primary' : 'default'} disabled={s.locked || nextRole?.role !== role} onClick={() => s.dispatch({ type: 'signoff', role })}>Sign as {ROLE_LABEL[role]}</Button>
                  )}
                </li>
              )
            })}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="text-[12.5px] text-muted">Changing any number after a sign-off clears all sign-offs. Locking saves this month's summary for the trend and opens next month.</span>
            {s.locked
              ? <Button icon={Lock} onClick={() => setReopening(true)}>Reopen…</Button>
              : <Button tone="success" icon={Lock} disabled={!p.signoffs.approved} onClick={() => setLocking(true)}>Lock {monthName(p.period.label)}</Button>}
          </div>
        </div>
      </Panel>
      <ConfirmDialog open={!!clearing} title={`Remove ${clearing && ROLE_LABEL[clearing]} sign-off?`} confirmLabel="Remove" tone="danger" disabled={!reason.trim()} onClose={() => setClearing(null)} onConfirm={() => { if (clearing && s.dispatch({ type: 'clearSignoff', role: clearing, reason })) { setClearing(null); setReason('') } }}>
        <p>Later sign-offs are removed too.</p>{input('clear-reason', 'Why? (saved to the activity log)')}
      </ConfirmDialog>
      <ConfirmDialog open={locking} title={`Lock ${monthName(p.period.label)}?`} confirmLabel="Lock" tone="success" onClose={() => setLocking(false)} onConfirm={() => { if (s.lock()) setLocking(false) }}>
        <p>Saves the summary by year ({dollars(s.r.tot.adjustment)} adjustment) and opens the next month with the same assumptions, overrides and reconciling items.</p>
      </ConfirmDialog>
      <ConfirmDialog open={reopening} title={`Reopen ${monthName(p.period.label)}?`} confirmLabel="Reopen" disabled={!reason.trim()} onClose={() => setReopening(false)} onConfirm={() => { if (s.dispatch({ type: 'reopen', reason })) { setReopening(false); setReason('') } }}>
        <p>Sign-offs are cleared and everyone signs again.</p>{input('reopen-reason', 'Why? (saved to the activity log)')}
      </ConfirmDialog>
    </section>
  )
}
