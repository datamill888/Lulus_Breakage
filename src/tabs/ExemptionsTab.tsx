import { useMemo, useState } from 'react'
import { MapPinned, Search } from 'lucide-react'
import { Button, Chip, ConfirmDialog, Field, HelpTip, inputCls, money, Note, PageIntro, Panel, pct, Seg, TableWrap, useReason, whole } from '@/components/ui'
import { CATEGORY_LABEL, EXEMPTIONS, share } from '@/lib/breakage/engine'
import type { Assumptions, Category, Exemption, StateRule } from '@/lib/breakage/types'
import type { Store } from '@/lib/store'

export const CAT_TONE: Record<Category, 'ok' | 'accent' | 'warn' | 'bad' | 'muted'> = { Yes: 'ok', Partial: 'accent', Conditional: 'warn', No: 'bad', Excluded: 'muted' }
export const CatChip = ({ c }: { c: Category }) => <Chip tone={CAT_TONE[c]}>{CATEGORY_LABEL[c]}</Chip>

export function ExemptionsTab({ s }: { s: Store }) {
  return (
    <>
      <PageIntro icon={MapPinned} title="State exemptions">
        Where the customer lives decides whether unredeemed credit can be taken as breakage or has to be escheated. Exempt states count in full, Partial states at {pct(s.period.assumptions.partialPct, 0)}, Not exempt states not at all.
      </PageIntro>
      <PivotPanel s={s} />
      <RulesPanel s={s} />
      <StateTable s={s} />
    </>
  )
}

function PivotPanel({ s }: { s: Store }) {
  const r = s.r, a = s.period.assumptions
  const [view, setView] = useState<'issued' | 'redeemed' | 'gc'>('issued')
  const years = r.cohortYears
  const cats: Category[] = ['Yes', 'Partial', 'Conditional', 'No', 'Excluded']
  const val = (c: Category, y: number) => {
    const b = r.pivot[c]
    if (view === 'issued') return b.issued[y] ?? 0
    if (view === 'redeemed') return Object.values(b.used[y] ?? {}).reduce((p, v) => p + v, 0)
    return b.gcIssued[y] ?? 0
  }
  const tot = (c: Category) => years.reduce((p, y) => p + val(c, y), 0)
  const eligible = (y: number) => cats.reduce((p, c) => p + val(c, y) * share(c, a), 0)
  return (
    <Panel flush title={<span className="flex items-center gap-2">Store credit by exemption<HelpTip text="The workbook's pivot (Row Labels Yes / Partial / Conditional / No), by issuance year. Gift card conversions are shown for reference and are not part of breakage." /></span>}
      aside={<Seg value={view} onChange={setView} options={[{ id: 'issued', label: 'Issued' }, { id: 'redeemed', label: 'Redeemed to date' }, { id: 'gc', label: 'Gift card converted' }]} />}>
      <TableWrap>
        <table className="ledger compact">
          <thead><tr><th className="pin">Exemption</th>{years.map((y) => <th key={y} className="r">{y}</th>)}<th className="r">Total</th><th className="r">Balance</th></tr></thead>
          <tbody>
            {cats.map((c) => (r.pivot[c].rows > 0 || c !== 'Excluded') && (
              <tr key={c}>
                <td className="pin whitespace-nowrap"><CatChip c={c} /> <span className="num text-[12px] text-muted">× {pct(share(c, a), 0)}</span></td>
                {years.map((y) => <td key={y} className="num r">{whole(val(c, y), true)}</td>)}
                <td className="num r font-semibold">{whole(tot(c))}</td>
                <td className="num r text-muted">{whole(r.pivot[c].ending, true)}</td>
              </tr>
            ))}
          </tbody>
          {view !== 'gc' && (
            <tfoot><tr><td className="pin">Breakage base</td>{years.map((y) => <td key={y} className="num r">{whole(eligible(y))}</td>)}<td className="num r">{whole(years.reduce((p, y) => p + eligible(y), 0))}</td><td className="num r">{whole(cats.reduce((p, c) => p + r.pivot[c].ending * share(c, a), 0))}</td></tr></tfoot>
          )}
        </table>
      </TableWrap>
      {r.granularity === 'category' && <Note>This month's data is the workbook pivot, already split by exemption, so state changes below apply once the customer-level Looker export is loaded.</Note>}
    </Panel>
  )
}

function RulesPanel({ s }: { s: Store }) {
  const a = s.period.assumptions
  const [pending, setPending] = useState<{ patch: Partial<Assumptions>; field: string; before: string; after: string } | null>(null)
  const { reason, setReason, input } = useReason()
  const fl = s.r.flagCounts
  const rule = (field: string, label: string, help: string, value: string, options: [string, string][], toPatch: (v: string) => Partial<Assumptions>, count?: number) => (
    <div className="grid gap-2 rounded-2xl border border-line p-4">
      <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">{label}<HelpTip text={help} />{count != null && count > 0 && <Chip tone="warn">{count.toLocaleString()} customers</Chip>}</span>
      <Seg value={value} onChange={(v) => v !== value && setPending({ patch: toPatch(v), field, before: options.find((o) => o[0] === value)![1], after: options.find((o) => o[0] === v)![1] })} options={options.map(([id, l]) => ({ id, label: l }))} />
    </div>
  )
  return (
    <Panel title="Rules for customers the state table can't place">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {rule('No state on file', 'No state on file', 'Unknown owner address: priority rules send it to the state of incorporation, Delaware, which is Partial.', a.noState, [['DE', 'Delaware'], ['exclude', 'Not exempt']], (v) => ({ noState: v as 'DE' | 'exclude' }), fl['no-state'])}
        {rule('Outside the US', 'Address outside the US', 'Foreign owner: goes to Delaware like an unknown address. Choose Not exempt to leave these out of breakage.', a.international, [['DE', 'Delaware'], ['exclude', 'Not exempt']], (v) => ({ international: v as 'DE' | 'exclude' }), fl.international)}
        {rule('Conditional states', 'Conditional states', 'Idaho (≤ $50) and New Hampshire (≤ $250). The workbook counts them as exempt.', a.conditionalCounts ? 'yes' : 'no', [['yes', 'Count as exempt'], ['no', 'Leave out']], (v) => ({ conditionalCounts: v === 'yes' }))}
        {rule('Ambassadors', 'Ambassador credits', 'Credits issued to ambassadors to market with are not customer credits. Driven by customer id (ambassador list in Load data).', a.excludeAmbassadors ? 'yes' : 'no', [['yes', 'Exclude'], ['no', 'Include']], (v) => ({ excludeAmbassadors: v === 'yes' }), fl.ambassador)}
      </div>
      <p className="mt-3 text-[12.5px] text-muted">{s.ws.ambassadors.length.toLocaleString()} customer ids on the ambassador list. The state used is the most recent address on the address report when it's loaded.</p>
      <ConfirmDialog open={!!pending} title={`${pending?.field}: ${pending?.after}?`} confirmLabel="Save" disabled={!reason.trim()} onClose={() => setPending(null)}
        onConfirm={() => { if (pending && s.dispatch({ type: 'setAssumptions', patch: pending.patch, describe: { [pending.field]: [pending.before, pending.after] }, reason })) { setPending(null); setReason('') } }}>
        {input('rule-reason', 'Why? (saved to the activity log)')}
      </ConfirmDialog>
    </Panel>
  )
}

function StateTable({ s }: { s: Store }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<StateRule | null>(null)
  const byState = useMemo(() => {
    const m = new Map<string, { customers: number; issued: number; ending: number }>()
    for (const r of s.r.rows) {
      if (!r.effectiveState || r.via === 'pivot') continue
      const c = m.get(r.effectiveState) ?? { customers: 0, issued: 0, ending: 0 }
      c.customers += r.customers; c.issued += r.issuedTotal; c.ending += r.ending
      m.set(r.effectiveState, c)
    }
    return m
  }, [s.r.rows])
  const rows = s.ws.states.filter((x) => !q || `${x.name} ${x.abbr} ${x.status}`.toLowerCase().includes(q.toLowerCase()))
  const customerLevel = s.r.granularity === 'customer'
  return (
    <Panel flush title="Exemption by state" aside={
      <label htmlFor="st-q" className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><span className="sr-only">Search states</span>
        <input id="st-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search states" className={`${inputCls} w-52 pl-9`} /></label>
    }>
      <TableWrap>
        <table className="ledger">
          <thead><tr><th className="pin">State</th><th>Exemption</th><th>Condition / note</th>{customerLevel && <><th className="r">Customers</th><th className="r">Issued ITD</th><th className="r">Balance</th></>}<th /></tr></thead>
          <tbody>
            {rows.map((x) => {
              const c = byState.get(x.abbr)
              return (
                <tr key={x.name}>
                  <td className="pin"><span className="num mr-2 text-muted">{x.abbr || '—'}</span><span className="font-medium">{x.name}</span></td>
                  <td><CatChip c={x.status} /></td>
                  <td className="max-w-[520px] text-[12.5px] text-muted">{[x.condition, x.partialNote !== x.condition && x.partialNote, x.comment].filter(Boolean).map((t, i) => <span key={i} className="block">{/^https?:/.test(String(t)) ? <a href={String(t)} target="_blank" rel="noreferrer" className="text-accent underline">{String(t).replace(/^https?:\/\//, '').slice(0, 60)}</a> : t}</span>)}</td>
                  {customerLevel && <><td className="num r">{c?.customers.toLocaleString() ?? '—'}</td><td className="num r">{c ? money(c.issued) : '—'}</td><td className="num r">{c ? money(c.ending) : '—'}</td></>}
                  <td className="r">{x.abbr && <Button size="sm" disabled={s.locked} onClick={() => setEdit(x)}>Edit</Button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <Note>From the EY state escheat summary (tab "GC exemptions"), source: ncsl.org gift card statutes. Changes apply to every month that isn't locked and need a note.</Note>
      {edit && <StateDialog s={s} st={edit} onClose={() => setEdit(null)} />}
    </Panel>
  )
}

function StateDialog({ s, st, onClose }: { s: Store; st: StateRule; onClose: () => void }) {
  const [status, setStatus] = useState<Exemption>(st.status)
  const [comment, setComment] = useState(st.comment)
  const { reason, setReason, input } = useReason()
  return (
    <ConfirmDialog open title={`${st.name} exemption`} confirmLabel="Save" disabled={!reason.trim()} onClose={onClose}
      onConfirm={() => { if (s.dispatch({ type: 'setState', abbr: st.abbr, patch: { status, comment }, reason })) { setReason(''); onClose() } }}>
      <Seg value={status} onChange={setStatus} options={EXEMPTIONS.map((e) => ({ id: e, label: CATEGORY_LABEL[e] }))} />
      <Field label="Lulus comment" htmlFor="st-comment"><input id="st-comment" value={comment} onChange={(e) => setComment(e.target.value)} className={inputCls} /></Field>
      {input('st-reason', 'Why? Cite the statute or research')}
    </ConfirmDialog>
  )
}
