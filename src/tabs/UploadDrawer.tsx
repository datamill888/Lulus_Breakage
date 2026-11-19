import { useState, type ReactNode } from 'react'
import { BadgeCheck, CloudDownload, FileSpreadsheet, Landmark, MapPin, RotateCcw, Users, type LucideIcon } from 'lucide-react'
import { Button, Chip, ConfirmDialog, Drawer, stamp } from '@/components/ui'
import { checksum } from '@/lib/breakage/ids'
import { live, liveConfigured } from '@/lib/sources/live'
import { INDIVIDUAL_CAP, parseAddresses, parseCohorts, parseGl, parseIds, readGrid, type AddressEntry } from '@/lib/sources/upload'
import type { Store } from '@/lib/store'
import type { FeedMeta } from '@/lib/workspace/types'

/** Load panel opened from the header. Temporary until live pulls replace the uploads. */
export function UploadDrawer({ s, onClose }: { s: Store; onClose: () => void }) {
  const p = s.period
  const [busy, setBusy] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<{ name: string; map: Map<string, AddressEntry[]> } | null>(null)
  const [resetting, setResetting] = useState(false)
  const ro = s.locked
  const meta = (mode: FeedMeta['mode'], label: string, data: unknown[], extra: Partial<FeedMeta> = {}): FeedMeta => ({ mode, label, rows: data.length, checksum: checksum(data), loadedAt: new Date().toISOString(), loadedBy: s.ws.user, ...extra })
  const run = async (key: string, f: () => Promise<void>) => {
    setBusy(key)
    try { await f() } catch (e) { s.notify(`${(e as Error).message}. Make sure it's the report exactly as exported.`, 'bad') } finally { setBusy(null) }
  }

  const loadCohorts = (file?: File) => file && run('cohorts', async () => {
    const parsed = parseCohorts(await readGrid(file), { states: s.ws.states, ambassadors: s.ws.ambassadors, addresses: addresses?.map })
    s.dispatch({ type: 'loadFeed', kind: 'cohorts', rows: parsed.rows, meta: meta('upload', addresses ? `${file.name} + ${addresses.name}` : file.name, parsed.rows, { customers: parsed.customers, asOf: p.period.monthEnd }) })
    if (parsed.overflow) s.notify(`${parsed.overflow.toLocaleString()} more flagged customers than the ${INDIVIDUAL_CAP.toLocaleString()} kept one by one; they're summed by state with their flags.`, 'bad')
  })
  const loadAddresses = (file?: File) => file && run('addresses', async () => {
    const map = parseAddresses(await readGrid(file), s.ws.states)
    setAddresses({ name: file.name, map })
    s.notify(`${map.size.toLocaleString()} customers' addresses read. Now load the store credit export.`)
  })
  const loadGl = (file?: File) => file && run('gl', async () => {
    const rows = parseGl(await readGrid(file))
    s.dispatch({ type: 'loadFeed', kind: 'gl', rows, meta: meta('upload', file.name, rows) })
  })
  const loadAmb = (file?: File) => file && run('amb', async () => {
    const ids = parseIds(await readGrid(file))
    if (!ids.length) throw new Error('No customer ids found')
    s.dispatch({ type: 'setAmbassadors', ids, label: file.name })
  })
  const pull = (kind: 'cohorts' | 'gl') => run(kind, async () => {
    if (kind === 'cohorts') { const r = await live.cohorts(p.period.monthEnd); s.dispatch({ type: 'loadFeed', kind, rows: r.rows, meta: meta('live', 'Looker (live)', r.rows, { customers: r.customers, asOf: p.period.monthEnd }) }) }
    else { const r = await live.gl(p.period.monthEnd); s.dispatch({ type: 'loadFeed', kind, rows: r, meta: meta('live', 'Intacct (live)', r) }) }
  })

  return (
    <Drawer open wide onClose={onClose} title="Load this month's data" subtitle="Reloading is safe: overrides follow the customer, and GL year tags follow the line.">
      <div className="grid gap-4">
        <Card icon={MapPin} title="Address report" system="Looker · optional, load first" busy={busy === 'addresses'} ro={ro} onFile={loadAddresses}
          status={addresses ? <Chip tone="ok" icon>{addresses.map.size.toLocaleString()} customers</Chip> : <Chip tone="muted">Optional</Chip>}>
          One row per address used, most recent first (or with a date). Places each customer in the state they used last, and flags anyone who moved. Without it, the state on the export is used.
        </Card>
        <Card icon={FileSpreadsheet} title="Store credit by customer" system="Looker · Look 5700" busy={busy === 'cohorts'} ro={ro} onFile={loadCohorts} onPull={() => pull('cohorts')} m={p.feeds.cohorts}>
          Customer ID, state, country, then "Non-Giftcard Issued 2017"… and "2017 Non-Giftcard Used In 2018"… columns, inception to date. A pasted pivot (Yes / Partial / Conditional / No rows) also works.
        </Card>
        <Card icon={Landmark} title="GL 4065 Online Store Credit Breakage" system="Intacct · GL report since 1/1/2016" busy={busy === 'gl'} ro={ro} onFile={loadGl} onPull={() => pull('gl')} m={p.feeds.gl}>
          General Ledger Report as exported. The issuance year comes from the memo ("… - 2024"); lines without one keep the year from the last load.
        </Card>
        <Card icon={Users} title="Ambassador list" system="Looker · Look 5617" busy={busy === 'amb'} ro={ro} onFile={loadAmb}
          status={<Chip tone="ok" icon={BadgeCheck}>{s.ws.ambassadors.length.toLocaleString()} customers</Chip>}>
          Customer ids flagged as ambassadors. Applies the next time the store credit export is loaded.
        </Card>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line pt-4 text-[12.5px] text-muted">
        <span>Start over with the May 2026 workbook as sample data.</span>
        <Button tone="danger" icon={RotateCcw} onClick={() => setResetting(true)}>Reset to sample</Button>
      </div>
      <ConfirmDialog open={resetting} title="Reset everything to the sample?" confirmLabel="Reset" tone="danger" onClose={() => setResetting(false)} onConfirm={() => { s.resetSample(); setResetting(false); onClose() }}>
        <p>Every month, override, sign-off and the activity log in this browser are replaced with the May 2026 workbook. This can't be undone.</p>
      </ConfirmDialog>
    </Drawer>
  )
}

function Card({ icon: I, title, system, children, busy, ro, onFile, onPull, m, status }: {
  icon: LucideIcon; title: string; system: string; children: ReactNode; busy: boolean; ro: boolean; onFile: (f?: File) => void; onPull?: () => void; m?: FeedMeta; status?: ReactNode
}) {
  const [over, setOver] = useState(false)
  return (
    <section className="grid content-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><I size={19} /></span>
          <div className="leading-tight"><h3 className="text-[14.5px] font-semibold">{title}</h3><span className="text-[12px] text-muted">{system}</span></div>
        </div>
        {status ?? (m ? m.carried ? <Chip tone="warn">From last month</Chip> : <Chip tone="ok" icon>Loaded</Chip> : <Chip tone="bad">Needed</Chip>)}
      </div>
      <p className="text-[12.5px] text-muted">{children}</p>
      {busy && <div className="grid gap-1.5" role="status" aria-label="Reading the file"><div className="skeleton h-4 w-3/4 rounded" /><div className="skeleton h-4 w-1/2 rounded" /></div>}
      {m && !busy && (
        <p className="rounded-xl bg-sunken px-3 py-2 text-[12px]">
          <span className="font-medium">{m.label}</span><br />
          <span className="text-muted">{m.rows.toLocaleString()} rows{m.customers ? ` · ${m.customers.toLocaleString()} customers` : ''} · #{m.checksum} · {m.loadedBy}, {stamp(m.loadedAt)}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <label
          onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!ro) onFile(e.dataTransfer.files[0]) }}
          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2.5 text-[13px] font-medium transition-colors ${over ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken'} ${ro ? 'pointer-events-none opacity-50' : ''}`}
        >
          <FileSpreadsheet size={15} /> Choose or drop .xlsx / .csv
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" disabled={ro} onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {onPull && <Button icon={CloudDownload} disabled={ro || !liveConfigured()} title={liveConfigured() ? 'Pull straight from the source' : 'Live pulls are not connected yet'} onClick={onPull}>Pull live</Button>}
      </div>
    </section>
  )
}
