// Domain types for the online store credit (OSC) breakage calculation.
// Years are calendar years of issuance ("cohorts"), kept as strings in maps so they serialize cleanly.

export type YearMap = Record<string, number>

/**
 * How a state treats unclaimed store credit (tab "GC exemptions").
 * Yes: exempt from escheat, so breakage can be recognized. No: escheatable, excluded.
 * Partial: only part is exempt (Delaware's "maximum cost" and the 40% states).
 * Conditional: exempt only under a condition (Idaho $50 or less, New Hampshire $250 or less).
 */
export type Exemption = 'Yes' | 'Partial' | 'Conditional' | 'No'

/** Where a credit balance lands for breakage. `Excluded` is set aside on purpose (ambassadors, by hand). */
export type Category = Exemption | 'Excluded'
export const CATEGORIES: Category[] = ['Yes', 'Partial', 'Conditional', 'No', 'Excluded']

export interface StateRule {
  abbr: string
  name: string
  status: Exemption
  /** Statute text for conditional states. */
  condition: string
  /** Partial-exemption wording ("40% exemption", Delaware maximum cost). */
  partialNote: string
  comment: string
}

export type CustomerFlag =
  | 'no-state' // no US state on file: goes to Delaware (state of incorporation) by default
  | 'international' // country is not US
  | 'split-address' // bill-to and ship-to are in different countries or states
  | 'moved' // more than one state in the address history
  | 'ambassador' // on the ambassador list (marketing credits, not customer credits)
  | 'unknown-state' // state code not in the exemption table

/**
 * One row of the Looker store credit export, rolled up. Pre-classified rows (`category`) come from
 * the workbook's pivots; customer exports give `state` and `country` and the app classifies them.
 * Customers that need a look (flags) are kept one per row so they can be searched and overridden;
 * everyone else is summed by state and country.
 */
export interface CohortRow {
  id: string
  category?: Exemption
  customerId?: string
  state?: string | null
  country?: string | null
  /** Address history, most recent first, when the address report was loaded. */
  states?: string[]
  customers: number
  flags?: CustomerFlag[]
  /** Non-gift-card store credit issued, by year. */
  issued: YearMap
  /** Non-gift-card store credit redeemed: issued year → used year → amount. */
  used: Record<string, YearMap>
  /** Gift cards converted to store credit. Shown, not part of the calculation. */
  gcIssued: YearMap
  gcUsed: YearMap
  /** Store credit balance at the as-of date (Looker "Ending Balance"). */
  ending: number
}

/** A line from the Intacct GL report for 4065 Online Store Credit Breakage. */
export interface GlRow {
  posted: string
  docDate: string
  doc: string
  memo: string
  loc: string
  txnNo: string
  jnl: string
  debit: number
  credit: number
  /** Issuance year as tagged in the source workbook. Uploaded rows get it from the memo. */
  year?: number | null
  recordNo?: string
}

export type CohortMethod =
  /** Average redemption curve: remaining development periods up to the horizon, plus the cushion. */
  | { method: 'curve' }
  /** A fixed percentage still to be redeemed (old, nearly run-off years). */
  | { method: 'toGo'; pct: number }
  /** A target total redemption rate; to-go is whatever is left to reach it. */
  | { method: 'target'; pct: number }

export interface Assumptions {
  /** Share of Partial-state credit treated as exempt (40%). */
  partialPct: number
  /** Count Conditional states (Idaho, New Hampshire) as exempt. The workbook does. */
  conditionalCounts: boolean
  /** Customers with no US state, and customers outside the US. */
  noState: 'DE' | 'exclude'
  international: 'DE' | 'exclude'
  excludeAmbassadors: boolean
  curve: {
    /** First cohort in the average ("Avg excl 2018/2019" starts at 2020). */
    avgFrom: number
    /** Fewer cohorts than this at a development period falls back to the all-cohort average. */
    minCohorts: number
    /** Last development period counted in "to go" (8 = year 8 after issuance). */
    horizon: number
    /** Added to curve-based to-go as a cushion (0.25%). */
    cushion: number
  }
  methods: Record<string, CohortMethod>
  /** Sanity range for the month's adjustment. */
  expectedRange: [number, number]
}

/** One issuance year on the Summary. */
export interface YearResult {
  year: number
  age: number
  issued: number
  redeemed: number
  itdPct: number
  toGoPct: number
  /** What the curve alone would say, for comparison with the method used. */
  curveToGoPct: number
  totalPct: number
  breakagePct: number
  factor: number
  itdBreakage: number
  outstanding: number
  booked: number
  reconciling: number
  adjustment: number
  method: CohortMethod
}

/** Saved at lock (and migrated from the workbook for earlier months). */
export interface Snapshot {
  period: string
  source: 'locked' | 'workbook'
  at: string
  rows: Pick<YearResult, 'year' | 'issued' | 'redeemed' | 'toGoPct' | 'breakagePct' | 'itdBreakage' | 'booked' | 'adjustment'>[]
  adjustment: number
}
