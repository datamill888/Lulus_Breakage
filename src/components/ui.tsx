import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCircle2, ChevronDown, ChevronUp, HelpCircle, Info, Pencil, X, XCircle, type LucideIcon } from 'lucide-react'
import type { AuditEvent } from '@/lib/workspace/types'

// ─── Formatting ──────────────────────────────────────────────────────────────

export const money = (v: number | null | undefined, blankZero = false) => {
  if (v == null || (blankZero && Math.abs(v) < 0.005)) return '—'
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < -0.004 ? `(${s})` : s
}
export const dollars = (v: number) => `${v < -0.004 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Rounded for big summary figures: $534K, $1.2M. The exact amount goes in the tooltip. */
export const compactDollars = (v: number) => {
  const a = Math.abs(v), sign = v < -0.004 ? '−' : ''
  if (a >= 999_500) return `${sign}$${(a / 1_000_000).toFixed(a >= 9_950_000 ? 0 : 1)}M`
  if (a >= 10_000) return `${sign}$${Math.round(a / 1000)}K`
  return dollars(v)
}

/** 97.0%, or 0.25% for small rates. */
export const pct = (v: number | null | undefined, digits?: number) => {
  if (v == null || !Number.isFinite(v)) return '—'
  const d = digits ?? (Math.abs(v) < 0.01 ? 2 : 1)
  return `${(v * 100).toFixed(d)}%`
}
/** Whole dollars, for amounts the workbook rounds: 163,090 or (84). */
export const whole = (v: number | null | undefined, blankZero = false) => {
  if (v == null || (blankZero && Math.abs(v) < 0.5)) return '—'
  const s = Math.abs(Math.round(v)).toLocaleString('en-US')
  return v <= -0.5 ? `(${s})` : s
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
let displayYear = ''
/** Dates in the open period's year read "Aug 3"; other years add the year ("Nov 5, 2025"). */
export const setDisplayYear = (y: string) => { displayYear = y }

/** Table dates: "Aug 3", or "Nov 5, 2025" outside the period's year. */
export const shortDate = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  const md = `${MON[Number(m) - 1]} ${Number(d)}`
  return y === displayYear ? md : `${md}, ${y}`
}
/** Always with the year, for history and sign-offs: "Aug 3, 2026". */
export const fullDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${MON[Number(m) - 1]} ${Number(d)}, ${y}`
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthName = (label: string) => `${MONTHS[Number(label.slice(5, 7)) - 1]} ${label.slice(0, 4)}`
export const longDate = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

// ─── Motion ──────────────────────────────────────────────────────────────────

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts a number up to its value when it changes. Starts at the target, so the first frame is already right. */
export function useCountUp(target: number, ms = 650) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    const start = from.current
    if (reduced() || start === target) { setV(target); from.current = target; return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setV(start + (target - start) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, ms])
  return v
}

/** Animated amount. `compact` rounds big figures ($534K) and keeps the exact amount on hover. */
export function Amount({ value, className = '', prefix = true, compact = false }: { value: number; className?: string; prefix?: boolean; compact?: boolean }) {
  const v = useCountUp(value)
  const text = compact ? compactDollars(v) : prefix ? dollars(v) : money(v)
  return <span className={`num ${className}`} title={compact ? dollars(value) : undefined}>{text}</span>
}

export function ProgressRing({ done, total, size = 76 }: { done: number; total: number; size?: number }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const k = total ? done / total : 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${done} of ${total} steps done`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={k === 1 ? 'var(--ok)' : 'var(--accent)'} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - k)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 700ms var(--ease), stroke 300ms' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="var(--fg)" style={{ font: '600 17px var(--font-sans)' }}>{done}<tspan fill="var(--muted)" style={{ fontSize: 12, fontWeight: 500 }}>/{total}</tspan></text>
    </svg>
  )
}

// ─── Status ──────────────────────────────────────────────────────────────────

type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'violet' | 'muted'
const TONES: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  accent: 'bg-accent-soft text-accent',
  violet: 'bg-violet-soft text-violet',
  muted: 'bg-sunken text-muted ring-1 ring-inset ring-line',
}
const TONE_ICON: Partial<Record<Tone, LucideIcon>> = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, violet: Pencil }

export function Chip({ tone, children, title, icon = false }: { tone: Tone; children: ReactNode; title?: string; icon?: boolean | LucideIcon }) {
  const I = icon === true ? TONE_ICON[tone] : icon || undefined
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ${TONES[tone]}`}>
      {I && <I size={12} strokeWidth={2.4} aria-hidden />}
      {children}
    </span>
  )
}

export const EditedDot = ({ title = 'Changed by hand. Open to see the history.' }: { title?: string }) => (
  <span title={title} aria-label={title} className="inline-flex size-5 items-center justify-center rounded-full bg-violet-soft text-violet"><Pencil size={10} strokeWidth={2.6} /></span>
)

// ─── Layout ──────────────────────────────────────────────────────────────────

export function Panel({ title, aside, children, flush, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    // overflow-clip (not hidden) keeps the rounded corners without breaking sticky table headers.
    <section className={`min-w-0 overflow-clip rounded-2xl border border-line bg-surface shadow-sm ${className}`}>
      {(title || aside) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          {aside}
        </header>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  )
}

/** Title block at the top of each tab: what this page is for, in one sentence, and its main action. */
export function PageIntro({ icon: I, title, children, action }: { icon: LucideIcon; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-blush text-accent"><I size={20} strokeWidth={1.8} /></span>
        <div className="min-w-0">
          <h2 className="font-display text-[28px] leading-tight">{title}</h2>
          <p className="mt-0.5 max-w-[68ch] text-[13.5px] text-muted">{children}</p>
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  )
}

export function Stat({ label, value, sub, tone, help }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad'; help?: string }) {
  const bar = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'bad' ? 'bg-bad' : 'bg-blush'
  return (
    <div className="relative grid gap-1 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <span className={`absolute inset-x-0 top-0 h-[3px] ${bar}`} aria-hidden />
      <span className="flex items-center gap-1 text-[12.5px] font-medium text-muted">{label}{help && <HelpTip text={help} />}</span>
      <span className="text-[22px] font-semibold tracking-tight">{value}</span>
      {sub && <span className="text-[12px] text-muted">{sub}</span>}
    </div>
  )
}

export const Note = ({ children }: { children: ReactNode }) => (
  <p className="flex items-start gap-2 border-t border-line bg-sunken/60 px-5 py-3 text-[12.5px] text-muted"><Info size={14} className="mt-0.5 shrink-0" />{children}</p>
)

/**
 * Wide screens: the page scrolls and column headers stick under the tab bar, totals stick to the
 * bottom. Narrow screens: the table scrolls sideways with the first column pinned.
 */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="table-wrap overflow-x-auto xl:overflow-visible">{children}</div>
}

// ─── Table helpers ───────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc'
export interface Sort<K extends string> { key: K; dir: SortDir }

/** Sorts rows by the chosen column; clicking a header toggles asc → desc → default order. */
export function useSort<T, K extends string>(rows: T[], get: Record<K, (r: T) => string | number | null | undefined>, initial: Sort<K> | null = null) {
  const [sort, setSort] = useState<Sort<K> | null>(initial)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const f = get[sort.key]
    const m = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b)
      if (x == null || x === '') return 1
      if (y == null || y === '') return -1
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * m
    })
  }, [rows, sort, get])
  const toggle = (key: K, firstDir: SortDir = 'asc') => setSort((s) => (!s || s.key !== key ? { key, dir: firstDir } : s.dir === firstDir ? { key, dir: firstDir === 'asc' ? 'desc' : 'asc' } : null))
  return { sorted, sort, toggle }
}

/** Clickable column header. Numbers sort largest first on the first click. */
export function SortTh<K extends string>({ k, sort, toggle, children, right, numeric, className = '' }: {
  k: K; sort: Sort<K> | null; toggle: (k: K, d?: SortDir) => void; children: ReactNode; right?: boolean; numeric?: boolean; className?: string
}) {
  const active = sort?.key === k
  const I = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`${right ? 'r' : ''} ${className}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggle(k, numeric ? 'desc' : 'asc')} className={`group inline-flex items-center gap-1 uppercase tracking-[inherit] ${active ? 'text-fg' : 'hover:text-fg'} ${right ? 'flex-row-reverse' : ''}`}>
        {children}
        <I size={12} className={active ? 'text-accent' : 'opacity-0 transition-opacity group-hover:opacity-60'} />
      </button>
    </th>
  )
}

/** Makes a table row open on click or Enter, and keyboard-focusable. */
export function rowProps(open: () => void, flash = false) {
  return {
    tabIndex: 0,
    className: `cursor-pointer ${flash ? 'flash' : ''}`,
    onClick: (e: React.MouseEvent) => { if (!(e.target as HTMLElement).closest('input,button,a,select')) open() },
    onKeyDown: (e: ReactKeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) open() },
  }
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid gap-2.5 p-5" aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton h-9 rounded-lg" style={{ opacity: 1 - i * 0.12 }} />)}
    </div>
  )
}

/** Closes a popover on Escape. */
export function useEscapeToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, close])
}

export function EmptyState({ icon: I, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-sunken text-muted"><I size={22} /></span>
      <h3 className="font-display text-[19px]">{title}</h3>
      {children && <p className="max-w-[48ch] text-[13px] text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Plain-English explanation on hover or focus. */
export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" aria-label={text} className="inline-flex text-faint hover:text-accent focus-visible:text-accent"><HelpCircle size={14} /></button>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg bg-fg px-3 py-2 text-[12px] font-normal normal-case leading-snug tracking-normal text-surface opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-sunken p-1 ring-1 ring-inset ring-line">
      {options.map((o) => (
        <button
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200 ${value === o.id ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
        >
          {o.label}{o.count != null && <span className={`num ml-1.5 rounded-full px-1.5 text-[11px] ${value === o.id ? 'bg-accent-soft text-accent' : 'text-faint'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Button({ children, onClick, tone = 'default', disabled, title, type = 'button', icon: I, size = 'md' }: {
  children?: ReactNode; onClick?: () => void; tone?: 'default' | 'primary' | 'quiet' | 'danger' | 'success'; disabled?: boolean; title?: string; type?: 'button' | 'submit'; icon?: LucideIcon; size?: 'sm' | 'md' | 'lg'
}) {
  const cls = {
    primary: 'bg-cta text-on-cta shadow-sm hover:bg-cta-hover',
    success: 'bg-ok text-on-accent shadow-sm hover:opacity-90',
    quiet: 'text-muted hover:bg-sunken hover:text-fg',
    danger: 'text-bad ring-1 ring-inset ring-bad/30 hover:bg-bad-soft',
    default: 'bg-surface text-fg ring-1 ring-inset ring-line shadow-sm hover:bg-sunken',
  }[tone]
  const sz = { sm: 'px-2.5 py-1 text-[12px] gap-1', md: 'px-3.5 py-1.5 text-[13px] gap-1.5', lg: 'px-5 py-2.5 text-[14px] gap-2' }[size]
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${sz} ${cls}`}>
      {I && <I size={size === 'lg' ? 17 : 15} strokeWidth={2.2} aria-hidden />}
      {children}
    </button>
  )
}

export const inputCls = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] shadow-sm transition-colors placeholder:text-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent-soft disabled:opacity-60'

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="grid gap-1.5 text-[12.5px]">
      <span className="font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

// ─── Overlays ────────────────────────────────────────────────────────────────

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, onClose])
}

/** Side panel for editing one record, with its history underneath. */
export interface DrawerNav { index: number; total: number; prev: () => void; next: () => void }

/** Previous / next through the list the drawer was opened from. */
export function useDrawerNav(ids: string[], openId: string | null, setOpenId: (id: string) => void): DrawerNav | undefined {
  const i = openId ? ids.indexOf(openId) : -1
  if (i < 0) return undefined
  return {
    index: i, total: ids.length,
    prev: () => i > 0 && setOpenId(ids[i - 1]),
    next: () => i < ids.length - 1 && setOpenId(ids[i + 1]),
  }
}

export function Drawer({ open, title, subtitle, onClose, children, wide, nav }: { open: boolean; title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; nav?: DrawerNav }) {
  useEscape(open, onClose)
  useEffect(() => {
    if (!open || !nav) return
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input,textarea,select,[contenteditable]') || e.metaKey || e.ctrlKey) return
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); nav.next() }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); nav.prev() }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [open, nav])
  if (!open) return null
  // Portal to <body>: an animated ancestor (transform) would otherwise trap position:fixed.
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="Close" className="anim-fade absolute inset-0 bg-fg/25 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`anim-slide relative flex h-full w-full ${wide ? 'max-w-[680px]' : 'max-w-[500px]'} flex-col bg-surface shadow-lg`} style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>
        <header className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] leading-tight">{title}</h2>
            {subtitle && <div className="mt-1 text-[12.5px] text-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {nav && (
              <>
                <span className="num mr-1 text-[12px] text-muted" title="Use J and K (or the arrow keys) to move">{nav.index + 1} of {nav.total}</span>
                <button onClick={nav.prev} disabled={nav.index === 0} aria-label="Previous (K)" title="Previous (K)" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-fg disabled:opacity-30"><ChevronUp size={18} /></button>
                <button onClick={nav.next} disabled={nav.index === nav.total - 1} aria-label="Next (J)" title="Next (J)" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-fg disabled:opacity-30"><ChevronDown size={18} /></button>
                <span className="mx-1 h-5 w-px bg-line" aria-hidden />
              </>
            )}
            <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-sunken hover:text-fg"><X size={18} /></button>
          </div>
        </header>
        <div key={nav?.index} className="anim-fade grid flex-1 content-start gap-6 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

/** In-page confirmation (the viewer has no window.confirm). */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = 'primary', onConfirm, onClose, disabled }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; tone?: 'primary' | 'danger' | 'success'; onConfirm: () => void; onClose: () => void; disabled?: boolean
}) {
  useEscape(open, onClose)
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-label={title}>
      <button aria-label="Cancel" className="anim-fade absolute inset-0 bg-fg/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="anim-pop relative grid w-full max-w-[460px] gap-4 rounded-2xl bg-surface p-6 shadow-lg">
        <h2 className="font-display text-[22px] leading-tight">{title}</h2>
        <div className="grid gap-3 text-[13.5px] text-muted">{children}</div>
        <div className="flex justify-end gap-2 pt-1">
          <Button tone="quiet" onClick={onClose}>Cancel</Button>
          <Button tone={tone} disabled={disabled} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export interface ToastMsg { id: number; text: string; tone: 'ok' | 'bad' }

export function Toaster({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ paddingBottom: 'calc(20px + var(--sticky-bottom, 0px) + env(safe-area-inset-bottom, 0px))' }}>
      {toasts.map((t) => (
        <div key={t.id} className="anim-pop pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-xl bg-fg px-4 py-3 text-[13px] text-surface shadow-lg">
          {t.tone === 'ok' ? <Check size={16} className="shrink-0 text-ok" strokeWidth={3} /> : <AlertTriangle size={16} className="shrink-0 text-warn" />}
          <span>{t.text}</span>
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss" className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"><X size={14} /></button>
        </div>
      ))}
    </div>
  )
}

export function History({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <p className="rounded-xl bg-sunken px-4 py-3 text-[12.5px] text-muted">No changes yet. Everything is as it came from Looker and Intacct.</p>
  return (
    <ol className="relative grid gap-4 pl-5 before:absolute before:inset-y-1 before:left-[5px] before:w-px before:bg-line">
      {[...events].reverse().map((e) => (
        <li key={e.id} className="relative grid gap-0.5 text-[12.5px]">
          <span className="absolute -left-5 top-1 size-[11px] rounded-full border-2 border-surface bg-accent" aria-hidden />
          <span className="font-medium">{e.action}{e.field && <span className="font-normal text-muted"> · {e.field}</span>}</span>
          {(e.before || e.after) && <span className="num text-[12px]"><span className="text-faint line-through">{e.before ?? '—'}</span> → <span>{e.after ?? '—'}</span></span>}
          {e.reason && <span className="text-muted">“{e.reason}”</span>}
          <span className="text-[11.5px] text-faint">{e.user} · {stamp(e.at)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Inline reason box used before audited changes. */
export function useReason() {
  const [reason, setReason] = useState('')
  return { reason, setReason, input: (id: string, placeholder = 'Add a short note (saved to the activity log)') => (
    <input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} className={inputCls} />
  ) }
}

export function Avatar({ name, tone = 'accent' }: { name: string; tone?: 'accent' | 'ok' | 'violet' }) {
  const initials = name.split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
  const cls = { accent: 'bg-blush text-accent', ok: 'bg-ok-soft text-ok', violet: 'bg-violet-soft text-violet' }[tone]
  return <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${cls}`}>{initials || '?'}</span>
}
