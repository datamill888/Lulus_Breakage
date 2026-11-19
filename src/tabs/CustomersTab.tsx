import { useMemo, useState } from 'react'
import { Search, Upload, UserSearch } from 'lucide-react'
import { Button, Chip, Drawer, EditedDot, EmptyState, Field, History, inputCls, money, Note, PageIntro, Panel, rowProps, Seg, SortTh, TableWrap, useReason, useSort } from '@/components/ui'
import { CATEGORY_LABEL, type ClassifiedRow } from '@/lib/breakage/engine'
import { CATEGORIES } from '@/lib/breakage/types'
import type { Category, CustomerFlag } from '@/lib/breakage/types'
import type { Store } from '@/lib/store'
import { CatChip } from './ExemptionsTab'

export const FLAG_LABEL: Record<CustomerFlag, string> = {
  'no-state': 'No state', international: 'Outside US', 'split-address': 'Bill-to ≠ ship-to', moved: 'Moved', ambassador: 'Ambassador', 'unknown-state': 'Unknown state',
}
const VIA: Record<ClassifiedRow['via'], string> = {
  override: 'Set by hand', pivot: 'From the pivot', ambassador: 'Ambassador list', international: 'Outside US rule', 'no-state': 'No-state rule', 'unknown-state': 'State not in table', state: 'State table',
}

type Filter = 'open' | 'all' | CustomerFlag | 'override'

export function CustomersTab({ s, openUpload }: { s: Store; openUpload: () => void }) {
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const rows = s.r.rows.filter((r) => r.customerId || r.flags?.length || r.override)
  const shown = useMemo(() => rows.filter((r) => {
    if (filter === 'open' && !(r.flags?.length && !r.override)) return false
    if (filter === 'override' && !r.override) return false
    if (filter !== 'open' && filter !== 'all' && filter !== 'override' && !r.flags?.includes(filter)) return false
    if (q && !`${r.customerId ?? ''} ${r.state ?? ''} ${r.country ?? ''} ${r.effectiveState ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  }), [rows, filter, q])
  const { sorted, sort, toggle } = useSort(shown, { id: (r) => r.customerId ?? r.id, state: (r) => r.effectiveState, issued: (r) => r.issuedTotal, ending: (r) => r.ending, cat: (r) => r.category })

  if (s.r.granularity === 'category') {
    return (
      <>
        <PageIntro icon={UserSearch} title="Customers">Customer-level checks: who has no state, lives outside the US, moved, or is an ambassador. Look a customer up and set their exemption by hand, with a note.</PageIntro>
        <Panel><EmptyState icon={UserSearch} title="No customer detail this month" action={<Button tone="primary" icon={Upload} onClick={openUpload}>Load the Looker export</Button>}>
          The data loaded is the pivot by exemption from the workbook. Load the customer-level Looker export (and the address report, most recent address first) to see each customer's state, history and flags.
        </EmptyState></Panel>
      </>
    )
  }

  const count = (f: Filter) => f === 'open' ? rows.filter((r) => r.flags?.length && !r.override).length : f === 'all' ? rows.length : f === 'override' ? rows.filter((r) => r.override).length : rows.filter((r) => r.flags?.includes(f)).length
  const opts: Filter[] = ['open', 'no-state', 'international', 'split-address', 'moved', 'ambassador', 'unknown-state', 'override', 'all']
  const open = sorted.find((r) => r.id === openId)
  return (
    <>
      <PageIntro icon={UserSearch} title="Customers">
        Customers kept one by one because something about their address needs a look. Everyone else is summed by state. Open a customer to see their address history and set their exemption by hand.
      </PageIntro>
      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <Seg value={filter} onChange={setFilter} options={opts.filter((f) => f === 'open' || f === 'all' || count(f) > 0).map((f) => ({ id: f, label: f === 'open' ? 'To review' : f === 'all' ? 'All' : f === 'override' ? 'Set by hand' : FLAG_LABEL[f], count: count(f) }))} />
          <label htmlFor="cu-q" className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><span className="sr-only">Search</span>
            <input id="cu-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer id or state" className={`${inputCls} w-56 pl-9`} /></label>
        </div>
        {!sorted.length ? <EmptyState icon={UserSearch} title="Nothing here">No customers match.</EmptyState> : (
          <TableWrap>
            <table className="ledger">
              <thead><tr>
                <SortTh k="id" sort={sort} toggle={toggle} className="pin">Customer</SortTh>
                <th>Flags</th><th>On file</th>
                <SortTh k="state" sort={sort} toggle={toggle}>Counted in</SortTh>
                <SortTh k="cat" sort={sort} toggle={toggle}>Exemption</SortTh>
                <SortTh k="issued" sort={sort} toggle={toggle} right numeric>Issued ITD</SortTh>
                <SortTh k="ending" sort={sort} toggle={toggle} right numeric>Balance</SortTh>
              </tr></thead>
              <tbody>
                {sorted.slice(0, 500).map((r) => (
                  <tr key={r.id} {...rowProps(() => setOpenId(r.id))}>
                    <td className="pin num font-medium">{r.customerId ?? <span className="text-muted">{r.customers.toLocaleString()} customers</span>}</td>
                    <td><span className="flex flex-wrap gap-1">{r.flags?.map((f) => <Chip key={f} tone="warn">{FLAG_LABEL[f]}</Chip>)}</span></td>
                    <td className="num text-[12.5px] text-muted">{[r.state, r.country].filter(Boolean).join(' · ') || '—'}{r.states && r.states.length > 1 && <span className="block">was {r.states.slice(1, 3).join(', ')}</span>}</td>
                    <td className="num">{r.effectiveState ?? '—'}</td>
                    <td><span className="flex items-center gap-1.5"><CatChip c={r.category} />{r.override && <EditedDot />}</span></td>
                    <td className="num r">{money(r.issuedTotal)}</td>
                    <td className="num r">{money(r.ending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
        {sorted.length > 500 && <Note>Showing the first 500 of {sorted.length.toLocaleString()}. Search or sort to narrow it down.</Note>}
      </Panel>
      {open && <CustomerDrawer s={s} r={open} onClose={() => setOpenId(null)} />}
    </>
  )
}

function CustomerDrawer({ s, r, onClose }: { s: Store; r: ClassifiedRow; onClose: () => void }) {
  const [cat, setCat] = useState<Category | ''>(r.override?.category ?? '')
  const [state, setState] = useState(r.override?.state ?? '')
  const { reason, setReason, input } = useReason()
  const label = r.customerId ? `Customer ${r.customerId}` : r.id
  const save = (clear = false) => {
    const override = clear ? null : { ...(cat ? { category: cat } : {}), ...(state.trim() ? { state: state.trim().toUpperCase() } : {}), note: reason }
    if (!clear && !cat && !state.trim()) return s.notify('Pick an exemption or a state.', 'bad')
    if (s.dispatch({ type: 'setOverride', rowId: r.id, label, override, reason })) { setReason(''); if (clear) { setCat(''); setState('') } }
  }
  const years = Object.keys(r.issued).sort()
  return (
    <Drawer open onClose={onClose} title={label} subtitle={<span className="flex flex-wrap items-center gap-2"><CatChip c={r.category} />{VIA[r.via]}{r.effectiveState && ` · counted in ${r.effectiveState}`}</span>}>
      <section className="grid gap-2">
        <span className="eyebrow">Address</span>
        <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-[13px]">
          <dt className="text-muted">State on file</dt><dd className="num">{r.state ?? '—'}</dd>
          <dt className="text-muted">Country</dt><dd className="num">{r.country ?? '—'}</dd>
          {r.states && <><dt className="text-muted">History</dt><dd className="num">{r.states.join(' ← ')}</dd></>}
          <dt className="text-muted">Flags</dt><dd className="flex flex-wrap gap-1">{r.flags?.map((f) => <Chip key={f} tone="warn">{FLAG_LABEL[f]}</Chip>) ?? '—'}</dd>
        </dl>
        <p className="text-[12.5px] text-muted">For cash vs non-cash or a relocation, look the customer up in Admin (Looker) and read the notes in Kustomer.</p>
      </section>
      <section className="grid gap-2">
        <span className="eyebrow">Store credit by issuance year</span>
        <table className="ledger compact"><thead><tr><th>Year</th><th className="r">Issued</th><th className="r">Redeemed</th></tr></thead>
          <tbody>{years.map((y) => <tr key={y}><td className="num">{y}</td><td className="num r">{money(r.issued[y])}</td><td className="num r">{money(Object.values(r.used[y] ?? {}).reduce((a, b) => a + b, 0))}</td></tr>)}</tbody>
          <tfoot><tr><td>Total</td><td className="num r">{money(r.issuedTotal)}</td><td className="num r">{money(r.redeemedTotal)}</td></tr></tfoot>
        </table>
      </section>
      <section className="grid gap-3">
        <span className="eyebrow">Set by hand</span>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Exemption" htmlFor="ov-cat">
            <select id="ov-cat" value={cat} disabled={s.locked} onChange={(e) => setCat(e.target.value as Category | '')} className={inputCls}>
              <option value="">From state</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </Field>
          <Field label="Or use state" htmlFor="ov-st" hint="e.g. the state they moved to"><input id="ov-st" value={state} maxLength={2} disabled={s.locked} onChange={(e) => setState(e.target.value)} className={`num ${inputCls}`} /></Field>
        </div>
        {input('ov-reason', 'What did you find? (saved to the activity log)')}
        <div className="flex justify-end gap-2">{r.override && <Button tone="danger" disabled={s.locked} onClick={() => save(true)}>Remove override</Button>}<Button tone="primary" disabled={s.locked} onClick={() => save()}>Save</Button></div>
      </section>
      <section className="grid gap-2"><span className="eyebrow">History</span><History events={s.ws.audit.filter((e) => e.entity === 'customer' && e.entityId === r.id)} /></section>
    </Drawer>
  )
}
