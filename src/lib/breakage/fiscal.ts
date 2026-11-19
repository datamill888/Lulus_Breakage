// 5-4-4 fiscal calendar helpers. Dates are ISO yyyy-mm-dd strings, handled in UTC.

const DAY = 86_400_000

export const toDate = (iso: string) => new Date(iso + 'T00:00:00Z')
export const toIso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => toIso(new Date(toDate(iso).getTime() + n * DAY))
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY)

/**
 * Prior fiscal month end. Port of Procedures!G2:
 *   =G1-7*(5-ROUNDUP(MOD(MONTH(G1-45)/3,1),0))
 * Five weeks back when the month 45 days earlier is a quarter-end month (the first
 * month of each quarter is the five-week one), otherwise four.
 */
export function priorMonthEnd(monthEnd: string): string {
  const m = toDate(addDays(monthEnd, -45)).getUTCMonth() + 1
  const weeks = m % 3 === 0 ? 5 : 4
  return addDays(monthEnd, -7 * weeks)
}

/** First day (Monday) of the fiscal month. Port of '6. Receipts per Schedule'!G3. */
export const periodStart = (monthEnd: string) => addDays(priorMonthEnd(monthEnd), 1)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/**
 * The calendar month a fiscal month is named for. A fiscal month can end in the next calendar
 * month (fiscal Oct 2026 ends Sun Nov 1), so name it by its middle, like '9. Reconciliation'!H3
 * does with the average posting date.
 */
const midMonth = (monthEnd: string) => toDate(addDays(monthEnd, -14))

/** Three-letter fiscal month label used in the schedule's "Fiscal Month Added to GL" column. */
export const monthLabel = (monthEnd: string) => MONTHS[midMonth(monthEnd).getUTCMonth()]

/** Next fiscal month end: the four- or five-week step whose prior month end is `monthEnd`. */
export function nextMonthEnd(monthEnd: string): string {
  for (const weeks of [4, 5]) {
    const cand = addDays(monthEnd, 7 * weeks)
    if (priorMonthEnd(cand) === monthEnd) return cand
  }
  return addDays(monthEnd, 28)
}

/** "2026-08" style label for the fiscal month that ends on `monthEnd`. */
export const periodLabel = (monthEnd: string) => toIso(midMonth(monthEnd)).slice(0, 7)
