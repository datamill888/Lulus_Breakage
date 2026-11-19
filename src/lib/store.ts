import { useCallback, useMemo, useRef, useState } from 'react'
import type { ToastMsg } from '@/components/ui'
import { runBreakage } from './breakage/engine'
import { periodStart } from './breakage/fiscal'
import type { Snapshot } from './breakage/types'
import { ActionError, apply, ROLE_LABEL, type Action } from './workspace/actions'
import { localRepository } from './workspace/repository'
import type { Workspace } from './workspace/types'

function confirmation(a: Action): string {
  switch (a.type) {
    case 'setMethod': return `${a.year} assumption saved`
    case 'setAssumptions': return 'Assumptions saved'
    case 'setState': return 'State exemption saved'
    case 'setOverride': return a.override ? 'Override saved' : 'Override removed'
    case 'tagGl': return a.year ? `Tagged to ${a.year}` : 'Tag removed'
    case 'setReconciling': return 'Reconciling item saved'
    case 'setAmbassadors': return `${a.ids.length.toLocaleString()} ambassadors loaded`
    case 'loadFeed': return `${a.meta.rows.toLocaleString()} rows loaded from ${a.meta.label}`
    case 'setPostedJe': return 'JE number saved'
    case 'signoff': return `Signed off as ${ROLE_LABEL[a.role]}`
    case 'clearSignoff': return 'Sign-off removed'
    case 'lock': return 'Month locked. Next month is ready with these assumptions.'
    case 'reopen': return 'Month reopened'
    default: return ''
  }
}

export function useWorkspace() {
  const [ws, setWs] = useState<Workspace>(() => localRepository.load())
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const nextId = useRef(1)
  const period = ws.periods[ws.current]
  const r = useMemo(() => runBreakage({
    asOfYear: Number(period.period.label.slice(0, 4)),
    cohorts: period.cohorts, states: ws.states, overrides: period.overrides, ambassadors: ws.ambassadors,
    assumptions: period.assumptions, gl: period.gl, glTags: ws.glTags, reconciling: period.reconciling,
  }), [period, ws.states, ws.ambassadors, ws.glTags])
  /** The latest close before this month, for "change since last close". */
  const prior = useMemo(() => [...ws.history].filter((h) => h.period < period.period.label).pop(), [ws.history, period.period.label])

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback((text: string, tone: ToastMsg['tone'] = 'ok') => {
    const id = nextId.current++
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => dismiss(id), tone === 'bad' ? 6000 : 3200)
  }, [dismiss])

  const dispatch = useCallback((a: Action): boolean => {
    let next: Workspace
    try {
      next = apply(ws, a)
    } catch (e) {
      if (e instanceof ActionError) { notify(e.message, 'bad'); return false }
      throw e
    }
    localRepository.save(next)
    setWs(next)
    const msg = confirmation(a)
    if (msg) notify(next.audit.length > ws.audit.length ? `${msg} · logged` : msg)
    return true
  }, [ws, notify])

  const lock = () => {
    const snapshot: Snapshot = {
      period: period.period.label, source: 'locked', at: new Date().toISOString(), adjustment: r.tot.adjustment,
      rows: r.results.map(({ year, issued, redeemed, toGoPct, breakagePct, itdBreakage, booked, adjustment }) => ({ year, issued, redeemed, toGoPct, breakagePct, itdBreakage, booked, adjustment })),
    }
    return dispatch({ type: 'lock', snapshot })
  }

  return {
    ws, period, r, prior,
    start: periodStart(period.period.monthEnd),
    locked: period.status === 'locked',
    dispatch, lock, toasts, dismiss, notify,
    resetSample: () => setWs(localRepository.reset()),
  }
}

export type Store = ReturnType<typeof useWorkspace>
