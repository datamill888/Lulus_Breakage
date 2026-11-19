import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { Button, Chip, ConfirmDialog, Field, inputCls, money, monthName, Note, PageIntro, Panel, Seg, shortDate, TableWrap, useReason, whole } from '@/components/ui'
import type { GlLine } from '@/lib/breakage/engine'
import type { Store } from '@/lib/store'

const SRC: Record<GlLine['tagSource'], [string, 'ok' | 'muted' | 'violet' | 'warn']> = {
  memo: ['Year in memo', 'ok'], workbook: ['Tagged in workbook', 'muted'], hand: ['Tagged by hand', 'violet'], posting: ['Posting year, check', 'warn'],
}

export function GlTab({ s }: { s: Store }) {
  const [view, setView] = useState<'matrix' | 'lines'>('matrix')
  return (
    <>
      <PageIntro icon={Landmark} title="Booked to GL 4065">
        Breakage already recognized, by issuance year. Every JE line carries the year in its memo, so the app reads it; older lines were tagged in the workbook. This is column C of the Summary.
      </PageIntro>
      <div><Seg value={view} onChange={setView} options={[{ id: 'matrix', label: 'By month and year' }, { id: 'lines', label: 'GL lines', count: s.r.gl.length }]} /></div>
      {view === 'matrix' ? <Matrix s={s} /> : <Lines s={s} />}
    </>
  )
}

/** Booked JE by fiscal month × issuance year (SUMMARY cols T:AB). */
function Matrix({ s }: { s: Store }) {
  const gl = s.r.gl
  const years = s.r.cohortYears
  const months = [...new Set(gl.map((l) => l.period))].sort()
  const recent = months.slice(-8)
  const before = months.slice(0, -8)
  const cell = (ps: string[], y: number) => gl.filter((l) => ps.includes(l.period) && l.tag === y).reduce((a, l) => a - l.net, 0)
  const jes = (p: string) => [...new Set(gl.filter((l) => l.period === p).map((l) => l.txnNo))].join(', ')
  return (
    <Panel flush title="Breakage booked by month">
      <TableWrap>
        <table className="ledger">
          <thead><tr><th className="pin">Year</th>{before.length > 0 && <th className="r">Through {monthName(before.at(-1)!)}</th>}{recent.map((m) => <th key={m} className="r" title={`JE ${jes(m)}`}>{monthName(m).slice(0, 3)} {m.slice(2, 4)}<span className="block font-normal normal-case tracking-normal text-faint">JE {jes(m)}</span></th>)}<th className="r">Booked ITD</th></tr></thead>
          <tbody>
            {years.map((y) => (
              <tr key={y}>
                <td className="pin num font-semibold">{y}</td>
                {before.length > 0 && <td className="num r">{whole(cell(before, y), true)}</td>}
                {recent.map((m) => <td key={m} className="num r">{whole(cell([m], y), true)}</td>)}
                <td className="num r font-semibold">{money(s.r.booked[y] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td className="pin">Total</td>{before.length > 0 && <td className="num r">{whole(gl.filter((l) => before.includes(l.period)).reduce((a, l) => a - l.net, 0))}</td>}{recent.map((m) => <td key={m} className="num r">{whole(gl.filter((l) => l.period === m).reduce((a, l) => a - l.net, 0))}</td>)}<td className="num r">{money(s.r.glTotal)}</td></tr></tfoot>
        </table>
      </TableWrap>
      <Note>Credits to 4065 are positive. Ties to the GL balance of {money(s.r.glTotal)}{Math.abs(s.r.glTotal - s.r.tot.booked) < 0.01 ? '' : ` (by year: ${money(s.r.tot.booked)}; lines outside the issuance years are not counted)`}.</Note>
    </Panel>
  )
}

function Lines({ s }: { s: Store }) {
  const [only, setOnly] = useState(s.r.glNeedsLook.length > 0)
  const [edit, setEdit] = useState<GlLine | null>(null)
  const lines = (only ? s.r.glNeedsLook : s.r.gl).slice().reverse()
  return (
    <Panel flush title="GL 4065 detail" aside={<Seg value={only ? 'check' : 'all'} onChange={(v) => setOnly(v === 'check')} options={[{ id: 'check', label: 'To check', count: s.r.glNeedsLook.length }, { id: 'all', label: 'All' }]} />}>
      <TableWrap>
        <table className="ledger">
          <thead><tr><th className="pin">Posted</th><th>JE</th><th>Memo</th><th className="r">Breakage (Cr)</th><th className="r">Year</th><th>From</th><th /></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="pin num">{shortDate(l.posted)}</td>
                <td className="num text-muted">{l.txnNo}</td>
                <td className="text-[12.5px]">{l.memo}</td>
                <td className="num r">{money(-l.net)}</td>
                <td className="num r font-semibold">{l.tag}</td>
                <td><Chip tone={SRC[l.tagSource][1]}>{SRC[l.tagSource][0]}</Chip></td>
                <td className="r"><Button size="sm" disabled={s.locked} onClick={() => setEdit(l)}>Retag</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {edit && <TagDialog s={s} l={edit} onClose={() => setEdit(null)} />}
    </Panel>
  )
}

function TagDialog({ s, l, onClose }: { s: Store; l: GlLine; onClose: () => void }) {
  const [year, setYear] = useState(String(l.tag ?? ''))
  const { reason, setReason, input } = useReason()
  return (
    <ConfirmDialog open title="Issuance year for this line" confirmLabel="Save" disabled={!reason.trim() || !/^20\d\d$/.test(year)} onClose={onClose}
      onConfirm={() => { if (s.dispatch({ type: 'tagGl', lineId: l.id, year: Number(year), before: l.tag, label: `JE ${l.txnNo} · ${l.memo}`, reason })) { setReason(''); onClose() } }}>
      <p>JE {l.txnNo} · {l.memo} · {money(-l.net)}</p>
      <Field label="Issuance year" htmlFor="tag-y"><input id="tag-y" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className={`num ${inputCls}`} /></Field>
      {input('tag-reason')}
    </ConfirmDialog>
  )
}
