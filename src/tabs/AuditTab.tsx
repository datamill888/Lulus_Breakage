import { useState } from 'react'
import { BookOpenCheck, Database, Download, History, Landmark, MapPinned, Scale, Search, ShieldCheck, SlidersHorizontal, UserSearch, Users, type LucideIcon } from 'lucide-react'
import { Avatar, Button, EmptyState, inputCls, money, monthName, PageIntro, Panel, Seg } from '@/components/ui'
import type { Store } from '@/lib/store'
import type { AuditEntity, AuditEvent } from '@/lib/workspace/types'

const ENTITY: Record<AuditEntity, { label: string; icon: LucideIcon }> = {
  assumption: { label: 'Assumption', icon: SlidersHorizontal },
  state: { label: 'State exemption', icon: MapPinned },
  customer: { label: 'Customer', icon: UserSearch },
  gl_line: { label: 'GL line', icon: Landmark },
  reconciling: { label: 'Reconciling item', icon: Scale },
  ambassador: { label: 'Ambassadors', icon: Users },
  feed: { label: 'Data', icon: Database },
  period: { label: 'Month', icon: ShieldCheck },
  je: { label: 'Journal entry', icon: BookOpenCheck },
}

/** Activity wording for people: "Edited GL line" reads as "edited a payment". */
const plain = (action: string) => {
  const a = action
  return a.charAt(0).toLowerCase() + a.slice(1)
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function AuditTab({ s }: { s: Store }) {
  const [scope, setScope] = useState<'period' | 'all'>('period')
  const [entity, setEntity] = useState<AuditEntity | 'any'>('any')
  const [q, setQ] = useState('')
  const lineById = new Map(s.r.gl.map((l) => [l.id, l]))
  const rowById = new Map(s.r.rows.map((r) => [r.id, r]))
  const describe = (e: AuditEvent) => {
    if (e.entity === 'gl_line') { const l = lineById.get(e.entityId); return l ? `${l.memo} · $${money(-l.net)}` : '' }
    if (e.entity === 'customer') { const r = rowById.get(e.entityId); return r ? (r.customerId ? `Customer ${r.customerId}` : r.id) : e.entityId }
    if (e.entity === 'period') return monthName(e.entityId)
    return ''
  }

  const events = [...s.ws.audit].reverse().filter((e) => {
    if (scope === 'period' && e.period !== s.ws.current && e.entity !== 'state' && e.entity !== 'ambassador') return false
    if (entity !== 'any' && e.entity !== entity) return false
    if (q && !`${e.action} ${e.user} ${e.field} ${e.before} ${e.after} ${e.reason} ${describe(e)}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })
  const groups: [string, AuditEvent[]][] = []
  for (const e of events) {
    const d = day(e.at)
    if (groups.at(-1)?.[0] !== d) groups.push([d, []])
    groups.at(-1)![1].push(e)
  }

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [['When', 'User', 'Month', 'Type', 'Record', 'Action', 'Field', 'Before', 'After', 'Note'], ...events.map((e) => [e.at, e.user, e.period, ENTITY[e.entity].label, describe(e), e.action, e.field, e.before, e.after, e.reason])]
      .map((r) => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `osc-breakage-activity-${s.ws.current}.csv`
    a.click()
  }

  return (
    <>
      <PageIntro icon={History} title="Activity log" action={<Button icon={Download} onClick={exportCsv}>Download for audit</Button>}>
        Every change anyone made, with the old and new value and their note. Nothing here can be edited or deleted.
      </PageIntro>
      <Panel flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Seg value={scope} onChange={setScope} options={[{ id: 'period', label: monthName(s.ws.current) }, { id: 'all', label: 'All months' }]} />
            <select id="audit-entity" aria-label="Type of change" value={entity} onChange={(e) => setEntity(e.target.value as AuditEntity | 'any')} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] shadow-sm focus:border-accent focus:outline-none">
              <option value="any">Everything</option>
              {(Object.keys(ENTITY) as AuditEntity[]).map((k) => <option key={k} value={k}>{ENTITY[k].label}</option>)}
            </select>
          </div>
          <label htmlFor="audit-search" className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <span className="sr-only">Search</span>
            <input id="audit-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, years, notes" className={`${inputCls} w-60 max-w-full pl-9`} />
          </label>
        </div>
        {!events.length ? <EmptyState icon={History} title="No activity yet">Changes show up here as soon as they're made.</EmptyState> : (
          <div className="px-5 pb-4">
            {groups.map(([d, evs]) => (
              <section key={d}>
                <h3 className="sticky top-[var(--sticky-top,0px)] z-[1] bg-surface/95 py-3 text-[12px] font-semibold uppercase tracking-wider text-muted backdrop-blur">{d}</h3>
                <ol className="grid gap-1">
                  {evs.map((e) => {
                    const E = ENTITY[e.entity]
                    const what = describe(e)
                    return (
                      <li key={e.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-hover">
                        <Avatar name={e.user} />
                        <div className="min-w-0 text-[13px]">
                          <p><span className="font-semibold">{e.user}</span> <span className="text-muted">·</span> {plain(e.action)}{e.field && <span className="text-muted"> ({e.field})</span>}</p>
                          {what && <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><E.icon size={13} />{what}</p>}
                          {(e.before || e.after) && <p className="num mt-0.5 text-[12.5px]">{e.before && e.before !== '—' && <><span className="text-faint line-through">{e.before}</span> <span className="text-faint">→</span> </>}{e.after ?? 'cleared'}</p>}
                          {e.reason && <p className="mt-1 inline-block rounded-lg bg-sunken px-2.5 py-1 text-[12.5px] text-fg">“{e.reason}”</p>}
                        </div>
                        <span className="num whitespace-nowrap pt-0.5 text-[12px] text-faint">{time(e.at)}</span>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </>
  )
}
