import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BookOpenCheck, CalendarDays, CheckCircle2, ChevronDown, History, Landmark, LayoutDashboard, Lock, MapPinned, Rows3, Rows4,
  Table2, TriangleRight, Upload, UserSearch, AlertTriangle, type LucideIcon,
} from 'lucide-react'
import logo from '@/assets/lulus-logo.png'
import { Avatar, Button, compactDollars, monthName, setDisplayYear, shortDate, Toaster } from '@/components/ui'
import { useWorkspace } from '@/lib/store'
import { AuditTab } from '@/tabs/AuditTab'
import { CustomersTab } from '@/tabs/CustomersTab'
import { ExemptionsTab } from '@/tabs/ExemptionsTab'
import { GlTab } from '@/tabs/GlTab'
import { JeTab } from '@/tabs/JeTab'
import { OverviewTab } from '@/tabs/OverviewTab'
import { SummaryTab } from '@/tabs/SummaryTab'
import { TrianglesTab } from '@/tabs/TrianglesTab'
import { UploadDrawer } from '@/tabs/UploadDrawer'

export type Tab = 'overview' | 'summary' | 'triangles' | 'exemptions' | 'customers' | 'gl' | 'je' | 'audit'

const TABS: { id: Tab; label: string; icon: LucideIcon; group: 'close' | 'setup' }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'close' },
  { id: 'summary', label: 'Summary', icon: Table2, group: 'close' },
  { id: 'triangles', label: 'Triangles & rates', icon: TriangleRight, group: 'close' },
  { id: 'customers', label: 'Customers', icon: UserSearch, group: 'close' },
  { id: 'gl', label: 'Booked (GL 4065)', icon: Landmark, group: 'close' },
  { id: 'je', label: 'Journal entry', icon: BookOpenCheck, group: 'close' },
  { id: 'exemptions', label: 'State exemptions', icon: MapPinned, group: 'setup' },
  { id: 'audit', label: 'Activity log', icon: History, group: 'setup' },
]

const fromHash = (): Tab => {
  const h = location.hash.slice(1) as Tab
  return TABS.some((t) => t.id === h) ? h : 'overview'
}

export const STATUS = {
  open: { cls: 'bg-sunken text-muted ring-1 ring-inset ring-line', label: 'In progress' },
  prepared: { cls: 'bg-accent-soft text-accent', label: 'Prepared' },
  reviewed: { cls: 'bg-violet-soft text-violet', label: 'Reviewed' },
  approved: { cls: 'bg-ok-soft text-ok', label: 'Approved' },
  locked: { cls: 'bg-ok-soft text-ok', label: 'Locked' },
} as const

type Density = 'comfortable' | 'compact'
const readDensity = (): Density => { try { return localStorage.getItem('osc-breakage:density') === 'compact' ? 'compact' : 'comfortable' } catch { return 'comfortable' } }

export interface AppProps {
  /** Inside the close platform: no Lulus header, strip or footer; the platform drives month and user. */
  embedded?: boolean
  period?: string
  user?: string
}

export default function App({ embedded = false, period, user }: AppProps) {
  const s = useWorkspace()
  const [tab, setTab] = useState<Tab>(fromHash)
  const [uploading, setUploading] = useState(false)
  const [density, setDensity] = useState<Density>(readDensity)
  const headerRef = useRef<HTMLElement>(null)
  const footerRef = useRef<HTMLElement>(null)
  setDisplayYear(s.ws.current.slice(0, 4))
  const stale = (['cohorts', 'gl'] as const).filter((k) => !s.period.feeds[k] || s.period.feeds[k]?.carried).length

  useEffect(() => {
    const on = () => setTab(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    document.documentElement.dataset.density = density
    try { localStorage.setItem('osc-breakage:density', density) } catch { /* storage unavailable */ }
  }, [density])
  useEffect(() => { if (period && period !== s.ws.current && s.ws.periods[period]) s.dispatch({ type: 'selectPeriod', period }) }, [period]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (user && user !== s.ws.user) s.dispatch({ type: 'setUser', user }) }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const root = document.documentElement.style
    const set = () => {
      root.setProperty('--sticky-top', `${headerRef.current?.getBoundingClientRect().height ?? 0}px`)
      const f = footerRef.current
      root.setProperty('--sticky-bottom', `${f && getComputedStyle(f).position === 'sticky' ? f.getBoundingClientRect().height : 0}px`)
    }
    set()
    const ro = new ResizeObserver(set)
    for (const el of [headerRef.current, footerRef.current]) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${t}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const adj = s.r.tot.adjustment
  const [lo, hi] = s.period.assumptions.expectedRange
  const inRange = adj >= lo && adj <= hi
  const badge: Partial<Record<Tab, number>> = { customers: s.r.flagged.filter((r) => !r.override).length || undefined, gl: s.r.glNeedsLook.length || undefined }
  const st = STATUS[s.period.status]
  const periods = Object.keys(s.ws.periods).sort().reverse()

  return (
    <div className="min-h-full">
      {!embedded && (
        <div className="gutter no-print bg-cta py-1.5 text-center text-[11px] font-medium uppercase tracking-[0.16em] text-on-cta">
          Month-end close · {monthName(s.ws.current)} · Online store credit breakage, GL 4065 / 2231
        </div>
      )}
      <header ref={headerRef} className="relative z-20 border-b border-line bg-surface/92 backdrop-blur-md md:sticky md:top-[env(safe-area-inset-top,0px)]">
        <div className={`gutter mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-3 ${embedded ? 'pt-3' : 'pt-4'}`}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {embedded ? (
              <div className="leading-tight">
                <span className="eyebrow block text-[10px]">Estimate · GL 4065</span>
                <h1 className="font-display text-[22px] leading-tight">Store Credit Breakage</h1>
              </div>
            ) : (
              <div className="flex items-center gap-3.5">
                <img src={logo} alt="Lulus" className="logo h-9 w-auto" />
                <span className="h-8 w-px bg-line" aria-hidden />
                <div className="leading-tight">
                  <span className="eyebrow block text-[10px]">Finance</span>
                  <h1 className="font-display text-[19px] leading-tight">Store Credit Breakage</h1>
                </div>
              </div>
            )}
            {!period && (
              <>
                <span className="hidden h-8 w-px bg-line sm:block" aria-hidden />
                <label htmlFor="period" className="relative inline-flex items-center gap-2 rounded-full bg-blush py-1.5 pl-3.5 pr-8 ring-1 ring-inset ring-transparent transition-shadow hover:ring-accent">
                  <CalendarDays size={15} className="text-muted" />
                  <span className="grid leading-tight">
                    <span className="text-[13.5px] font-semibold">{monthName(s.ws.current)}</span>
                    <span className="text-[11px] text-muted">{shortDate(s.start)} – {shortDate(s.period.period.monthEnd)}</span>
                  </span>
                  <ChevronDown size={15} className="pointer-events-none absolute right-2.5 text-muted" />
                  <select id="period" aria-label="Fiscal month" value={s.ws.current} onChange={(e) => s.dispatch({ type: 'selectPeriod', period: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0">
                    {periods.map((p) => <option key={p} value={p}>{monthName(p)}</option>)}
                  </select>
                </label>
              </>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${st.cls}`}>{s.locked && <Lock size={12} />}{st.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setUploading(true)} className="relative inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-muted ring-1 ring-inset ring-line transition-colors hover:bg-sunken hover:text-fg">
              <Upload size={16} />Load data
              {stale > 0 && <span className="num absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[10.5px] font-semibold text-on-accent">{stale}</span>}
            </button>
            <button onClick={() => go('summary')} title={`Expected range ${compactDollars(lo)} – ${compactDollars(hi)}`} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${inRange ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
              {inRange ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              Adjustment {compactDollars(adj)}{inRange ? '' : ' · outside range'}
            </button>
            {!user && (
              <label htmlFor="acting-as" className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 ring-1 ring-inset ring-line">
                <Avatar name={s.ws.user} />
                <span className="sr-only">Your name</span>
                <input
                  id="acting-as" key={s.ws.user} defaultValue={s.ws.user} title="Your name, used for sign-offs and the activity log"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== s.ws.user && s.dispatch({ type: 'setUser', user: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="w-28 bg-transparent text-[13px] font-medium focus:outline-none"
                />
              </label>
            )}
          </div>
        </div>
        <TabBar tab={tab} badge={badge} go={go} density={density} setDensity={setDensity} />
      </header>

      <main className="gutter mx-auto grid max-w-[1440px] gap-5 pb-16 pt-6">
        <PrintHeader s={s} />
        {s.locked && tab !== 'overview' && (
          <div className="no-print anim-rise flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ok-soft px-5 py-3 text-[13.5px]">
            <span className="flex items-center gap-2"><Lock size={16} className="text-ok" /><span><span className="font-semibold">{monthName(s.ws.current)} is locked.</span> You can look around, but nothing can be changed.</span></span>
            <Button size="sm" onClick={() => go('overview')}>Reopen…</Button>
          </div>
        )}
        <div key={`${tab}-${s.ws.current}`} className="anim-rise grid gap-5">
          {tab === 'overview' && <OverviewTab s={s} go={go} openUpload={() => setUploading(true)} />}
          {tab === 'summary' && <SummaryTab s={s} go={go} />}
          {tab === 'triangles' && <TrianglesTab s={s} />}
          {tab === 'exemptions' && <ExemptionsTab s={s} />}
          {tab === 'customers' && <CustomersTab s={s} openUpload={() => setUploading(true)} />}
          {tab === 'gl' && <GlTab s={s} />}
          {tab === 'je' && <JeTab s={s} />}
          {tab === 'audit' && <AuditTab s={s} />}
        </div>
      </main>
      {uploading && <UploadDrawer s={s} onClose={() => setUploading(false)} />}
      {!embedded && (
        <footer ref={footerRef} className="gutter z-20 border-t border-line bg-surface md:sticky md:bottom-0">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 py-3 text-[12px] text-muted">
            <span className="flex items-center gap-3"><img src={logo} alt="" className="logo h-5 w-auto opacity-80" /><span>Finance &amp; Accounting · Store Credit Breakage</span></span>
            <span>Every change is logged in the Activity log</span>
          </div>
        </footer>
      )}
      <Toaster toasts={s.toasts} onDismiss={s.dismiss} />
    </div>
  )
}

function PrintHeader({ s }: { s: ReturnType<typeof useWorkspace> }) {
  const p = s.period
  const sign = (x?: { by: string; at: string }) => (x ? `${x.by}, ${new Date(x.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'not yet')
  return (
    <div className="print-only border-b border-line pb-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <img src={logo} alt="Lulus" className="h-7 w-auto" />
          <div className="font-display mt-1 text-[20px]">OSC breakage · GL 4065 · {monthName(s.ws.current)}</div>
          <div className="text-[11px] text-muted">Fiscal {shortDate(s.start)} – {shortDate(p.period.monthEnd)} · Status: {STATUS[p.status].label}</div>
        </div>
        <div className="text-right text-[11px] leading-relaxed">
          <div>Prepared: {sign(p.signoffs.prepared)}</div>
          <div>Reviewed: {sign(p.signoffs.reviewed)}</div>
          <div>Approved: {sign(p.signoffs.approved)}</div>
        </div>
      </div>
    </div>
  )
}

function TabBar({ tab, badge, go, density, setDensity }: { tab: Tab; badge: Partial<Record<Tab, number>>; go: (t: Tab) => void; density: Density; setDensity: (d: Density) => void }) {
  const refs = useRef<Partial<Record<Tab, HTMLAnchorElement | null>>>({})
  const [ind, setInd] = useState({ left: 0, width: 0 })
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[tab]
      if (el) { setInd({ left: el.offsetLeft, width: el.offsetWidth }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [tab])
  return (
    <nav aria-label="Breakage" className="gutter mx-auto max-w-[1440px]">
      <div role="tablist" className="scroll-x relative flex items-center gap-0.5 pt-2">
        <span aria-hidden className="absolute bottom-0 h-[2px] rounded-full bg-fg transition-all duration-300 ease-out" style={{ left: ind.left + 10, width: Math.max(0, ind.width - 20) }} />
        {TABS.map((t, i) => (
          <span key={t.id} className="contents">
            {i > 0 && TABS[i - 1].group !== t.group && <span className="mx-2 h-5 w-px shrink-0 bg-line" aria-hidden />}
            <a
              ref={(el) => { refs.current[t.id] = el }} role="tab" href={`#${t.id}`} aria-selected={tab === t.id}
              onClick={(e) => { e.preventDefault(); go(t.id) }}
              className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${tab === t.id ? 'font-medium text-fg' : 'text-muted hover:text-fg'}`}
            >
              <t.icon size={16} strokeWidth={2} />
              {t.label}
              {!!badge[t.id] && <span className="num inline-flex min-w-5 items-center justify-center rounded-full bg-warn px-1.5 text-[10.5px] font-semibold text-on-accent">{badge[t.id]}</span>}
            </a>
          </span>
        ))}
        <span className="ml-auto hidden shrink-0 items-center gap-1 pl-4 md:flex" role="group" aria-label="Row spacing">
          {(['comfortable', 'compact'] as const).map((d) => {
            const I = d === 'comfortable' ? Rows3 : Rows4
            return (
              <button key={d} onClick={() => setDensity(d)} aria-pressed={density === d} title={d === 'comfortable' ? 'Comfortable rows' : 'Compact rows'} className={`rounded-md p-1.5 transition-colors ${density === d ? 'bg-blush text-accent' : 'text-faint hover:text-fg'}`}>
                <I size={16} />
              </button>
            )
          })}
        </span>
      </div>
    </nav>
  )
}
