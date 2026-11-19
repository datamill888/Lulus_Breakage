import { useState } from 'react'
import * as XLSX from 'xlsx'
import { BookOpenCheck, Check, ClipboardCopy, Download, Printer } from 'lucide-react'
import { Amount, Button, Chip, Field, inputCls, money, Note, PageIntro, Panel, Stat, TableWrap } from '@/components/ui'
import type { Store } from '@/lib/store'

export function JeTab({ s }: { s: Store }) {
  const je = s.r.je
  const [copied, setCopied] = useState(false)
  const [jeNo, setJeNo] = useState(s.period.postedJe.jeNo)
  const dr = je.reduce((a, l) => a + l.debit, 0), cr = je.reduce((a, l) => a + l.credit, 0)
  const memo = `OSC breakage ${s.period.period.label}`
  const exportXlsx = () => {
    const ws = XLSX.utils.aoa_to_sheet([[`OSC breakage JE ${s.period.period.label}`], ['GL', 'Dr.', 'Cr.', 'Memo'], ...je.map((l) => [l.account, l.debit || null, l.credit || null, l.memo]), ['Total', dr, cr]])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'JE')
    XLSX.writeFile(wb, `${s.period.period.label} OSC Breakage JE.xlsx`)
  }
  const copy = async () => {
    const tsv = je.map((l) => [l.account, l.debit || '', l.credit || '', l.memo].join('\t')).join('\n')
    try { await navigator.clipboard.writeText(tsv); setCopied(true); setTimeout(() => setCopied(false), 2000); s.notify('Copied. Paste it into the Intacct JE grid.') } catch { s.notify('Copy was blocked by the browser. Use Download instead.', 'bad') }
  }
  const credits = je.filter((l) => l.account === 4065 && l.credit).reduce((a, l) => a + l.credit, 0)
  const debits = je.filter((l) => l.account === 4065 && l.debit).reduce((a, l) => a + l.debit, 0)
  return (
    <>
      <PageIntro icon={BookOpenCheck} title="Journal entry" action={<span className="no-print flex gap-2"><Button icon={Printer} onClick={() => window.print()}>Print</Button><Button icon={Download} onClick={exportXlsx}>Download .xlsx</Button></span>}>
        One 4065 line per issuance year, with the year at the end of the memo so next month's GL tags itself, and one offset to 2231 Less: OSC Breakage.
      </PageIntro>
      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Net breakage revenue" value={<Amount value={s.r.tot.adjustment} />} sub={s.r.tot.adjustment >= 0 ? 'Credit 4065, debit 2231' : 'Debit 4065, credit 2231'} />
        <Stat label="Years adding breakage" value={<Amount value={credits} />} sub={`${je.filter((l) => l.account === 4065 && l.credit).length} years`} />
        <Stat label="Years giving some back" value={<Amount value={-debits} />} sub={`${je.filter((l) => l.account === 4065 && l.debit).length} years, redemption ran ahead of estimate`} />
      </div>
      <Panel flush title="Entry to post" aside={<Button icon={copied ? Check : ClipboardCopy} onClick={copy}>{copied ? 'Copied' : 'Copy for Intacct'}</Button>}>
        <TableWrap>
          <table className="ledger">
            <thead><tr><th>Account</th><th className="r">Debit</th><th className="r">Credit</th><th>Memo</th></tr></thead>
            <tbody>{je.map((l, i) => <tr key={i}><td className="num font-semibold">{l.account}</td><td className="num r">{money(l.debit, true)}</td><td className="num r">{money(l.credit, true)}</td><td className="text-[12.5px] text-muted">{l.memo}</td></tr>)}</tbody>
            <tfoot><tr><td>Total</td><td className="num r">{money(dr)}</td><td className="num r">{money(cr)}</td><td>{Math.abs(dr - cr) < 0.005 ? <Chip tone="ok" icon>Balanced</Chip> : <Chip tone="bad" icon>Out by {money(dr - cr)}</Chip>}</td></tr></tfoot>
          </table>
        </TableWrap>
        <Note>Amounts are rounded to the dollar by year, like the workbook, so the total can differ from the unrounded final adjustment by a few cents. JE header memo: “{memo}”.</Note>
      </Panel>
      <Panel title="Posted in Intacct">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="JE number" htmlFor="je-no"><input id="je-no" value={jeNo} disabled={s.locked} onChange={(e) => setJeNo(e.target.value)} className={`num ${inputCls} w-40`} /></Field>
          <Button tone="primary" disabled={s.locked || jeNo === s.period.postedJe.jeNo} onClick={() => s.dispatch({ type: 'setPostedJe', jeNo })}>Save</Button>
          <span className="text-[12.5px] text-muted">Next month's GL 4065 load picks the lines up by year from their memos.</span>
        </div>
      </Panel>
    </>
  )
}
