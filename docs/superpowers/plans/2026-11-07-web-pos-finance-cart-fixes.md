# Web POS, Penutupan, and PWA Cart Fixes

## Goal

Fix owner store context, expose closing finance totals, add a filterable expense-history page, and bring the PWA cart structure closer to Android.

## Tasks

1. Add failing regression coverage for closing branch propagation, closing expense rendering, POS selector mobile layout, finance history routing, expense API filters, and PWA payment-sheet/cart structure.
2. Update `/closing` to use the shared owner branch context and render approved expense/income totals.
3. Extend `/api/finance/expenses` with validated filters, pagination, notes, and branch-aware metadata.
4. Replace `/expenses` redirect with a responsive filterable history page and replace Finance's embedded history table with a link panel.
5. Fix the POS mobile branch selector layout and align the PWA cart's mobile payment flow with Android's separate payment sheet.
6. Run focused tests, backend/frontend test suites, and production frontend build.
7. Commit, push `HEAD:main`, wait for CI/deploy, and verify public `/version`, `/api/health`, and `/pos`.
