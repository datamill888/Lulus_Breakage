import type { GlRow } from './types'

/** FNV-1a, 32-bit, base36. Short, deterministic ids for rows that have no key of their own. */
export function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/**
 * Stable GL line ids. Intacct RECORDNO when the row came from a live pull; otherwise a hash of the
 * row's content plus an occurrence counter, so the same export re-uploaded keeps its marks.
 */
export function glLineIds(rows: GlRow[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((r) => {
    if (r.recordNo) return `r${r.recordNo}`
    const key = hash([r.posted, r.jnl, r.doc, r.memo, r.debit.toFixed(2), r.credit.toFixed(2)].join('|'))
    const n = (seen.get(key) ?? 0) + 1
    seen.set(key, n)
    return n === 1 ? key : `${key}-${n}`
  })
}

/** Content checksum for a source load, shown in the audit trail. */
export const checksum = (rows: unknown[]) => hash(JSON.stringify(rows)).padStart(7, '0')
