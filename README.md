# OSC Breakage (GL 4065 / 2231)

Monthly online store credit breakage estimate, built to replace
`YYYY-MM OSC Breakage Analysis - BREAKAGE RATES BY YEAR.xlsx`. Same stack and look as the Prepaid
Inventory app (Vite, React 19, TypeScript, Tailwind v4, SheetJS), one tabbed section that can drop
into the close app.

```bash
npm install
npm run dev            # http://localhost:5173, loads the May 2026 workbook as sample data
npm test               # engine + workflow tests; May 2026 ties to the workbook (163,090)
npm run build:preview  # single-file dist-preview/index.html for sharing
```

Embedded: `<BreakageSection period="2026-05" user={session.user.name} />` (preview with `?embedded`).

## How the calculation works

1. **Looker store credit export** (Look 5700, inception to date): per customer, non-gift-card credit
   issued by year and redeemed by issued year × used year. Gift card conversions are shown, not used.
2. **Exemption by state.** The customer's state (most recent address, when the address report is
   loaded) is looked up in the state table (tab "GC exemptions"): Exempt counts 100%, Partial 40%,
   Conditional 100% (workbook practice), Not exempt 0%. No state on file or an address outside the
   US goes to Delaware (state of incorporation, Partial) by default; either can be set to Not
   exempt. Ambassador customer ids are excluded. Any customer can be set by hand, with a note.
3. **Triangle.** Redemptions by development year as a % of issuance. The curve averages issuance
   years from 2020 on when at least 2 have data, then all years, then extrapolates
   (next = last × last ÷ previous), exactly as TRENDS rows 28–31.
4. **Expected redemption to go** per issuance year: curve through development year 8 plus a 0.25%
   cushion (2019–2021), a fixed amount to go (2017 0.15%, 2018 0.25%), or a target total
   (2022 85%, 2023 84.5%, 2024 83.5%, 2025–2026 82.5%). Changes need a reason and clear sign-offs.
5. **Breakage** = 1 − (ITD % + to go %); factor = breakage ÷ (1 − breakage); ITD breakage =
   ROUND(factor × ITD redemptions). Adjustment by year = ITD breakage − booked per GL 4065 −
   reconciling items (the 2025 true-up passed, SUMMARY col U).
6. **JE**: one 4065 line per issuance year (memo ends in the year, so the next GL load tags itself),
   one 2231 offset.

## Tabs

| Tab | Replaces | |
| --- | --- | --- |
| Overview | — | Checklist, adjustment vs expected range ($150–180K), closed years whose issuance moved since last close (relocations), sign-off Linda → Heidi → John, lock |
| Summary | SUMMARY | By year: booked, issuance, ITD redemption, rates, ITD breakage, outstanding, adjustment; reconciling items; trend of rates across closes |
| Triangles & rates | TRENDS | Triangle ($, %, cumulative), averages, chart, per-year method with what the curve alone would say, curve settings |
| Customers | (new) | No state, outside US, bill-to ≠ ship-to, moved, ambassador, unknown state; address history; override |
| Booked (GL 4065) | GLR 4065, SUMMARY T:AB | Booked by fiscal month × issuance year; line tags (memo, workbook, hand) |
| Journal entry | — | Entry by year, copy for Intacct, .xlsx, JE number |
| State exemptions | GC exemptions, pivots | Pivot by exemption, rules for unplaced customers, state table (edit with note) |
| Activity log | — | Every change with before/after and reason; CSV export |

## May 2026 check (`src/lib/breakage/engine.test.ts`)

Every year's ITD breakage, booked amount and adjustment match SUMMARY to the dollar; total
163,090 (JE 14760), unrounded 163,089.95. Differences from the workbook, on purpose:

- **2025 issuance includes Conditional states** (+158,055.90). The workbook's T30 left them out
  (its own check X32 shows the gap) while 2025 redemptions included them. No dollar impact this
  month because 2025 uses a target rate, but it moved the year-1/2 curve averages slightly.
- The "% of issue" cells in rows 35–44 of the breakage tab use the wrong denominators in a few
  places (U36, S37, Q38…). They aren't used downstream; the app computes them from the triangle.

## Not done yet / open questions

- **Sample data is the pivot by exemption**, not customer detail, so Customers is empty until the
  customer-level Looker export is loaded. Column names the parser expects are in `src/lib/sources/upload.ts`.
- International customers default to Delaware. If the policy is "not applicable to breakage",
  switch the rule to Not exempt on State exemptions.
- Cash vs non-cash (refund vs goodwill / return incentive) and the OSC liability roll-forward (top of
  the breakage tab, broken links in this copy) are not built yet.
- Live pulls: `src/lib/sources/live.ts` defines the Looker / Intacct endpoint (`VITE_BREAKAGE_PULL_URL`).
- Storage is this browser's localStorage. Customers with flags are kept one per row (up to 5,000);
  everyone else is summed by state, so the full export never has to be stored.
