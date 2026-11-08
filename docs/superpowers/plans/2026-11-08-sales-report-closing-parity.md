# Plan: Sales report and closing parity

## Goal

Make the web sales report use the same Android-style visual sections and make web/Android closing numbers deterministic for the same WIB business date and branch.

## Scope

1. Fix the report contract in the backend: use one closing date convention, WIB-safe date filters, shared closing math, and return the daily series needed by the Android-style report.
2. Fix mobile offline report merging so only records in the selected period and branch are merged; cash finance entries affect the cash closing total exactly once.
3. Reuse the existing Android-style web report sections on `/reports`, while keeping detailed report tables available below the visual summary.
4. Add explicit web closing actions for `Lihat PDF` (print-friendly preview) and `Cetak`, without auto-opening the print dialog.

## Verification

- Add regression tests for closing default/date handling, WIB return/movement filters, report series, web parity wiring, and mobile closing date filtering.
- Run targeted backend/frontend tests and the relevant Flutter report tests.
- Run the frontend build and backend test suite before reporting completion.
