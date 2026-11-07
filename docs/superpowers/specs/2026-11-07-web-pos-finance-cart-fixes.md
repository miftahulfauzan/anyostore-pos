# Web POS, Penutupan, and PWA Cart Fixes

## Context

The web closing page currently falls back to the account branch because it does not read the shared owner branch context. The POS branch selector is rendered as one item inside a compact mobile navigation grid, so its label and hit area are clipped. Finance history is embedded in one unfiltered table, while the API only returns the latest 100 rows. The PWA cart also keeps payment controls inside the cart body, unlike the Android flow where payment opens as a separate sheet.

## Decisions

1. Reuse `useAppSession().activeBranchId` as the only owner branch context. Closing will pass `branch_id` to the existing daily-closing endpoint and will require one selected branch before loading.
2. Render the existing backend closing totals for approved expenses and income in the web receipt; do not change cash math.
3. Make the POS mobile branch selector a full-width row with a full-width trigger. Keep the current desktop header unchanged.
4. Add server-side filters and pagination to `GET /api/finance/expenses`, then build `/expenses` as the dedicated expense-history page. Finance keeps entry/category forms and links to the history page instead of duplicating the table.
5. Keep PWA checkout behavior and state, but present the payment controls in a mobile payment dialog opened from the cart footer. The cart body matches Android's visible order: header, item table, owner date, optional action/options area, pcs summary, and Bayar.

## Acceptance criteria

- Owner closing for Blok B requests and displays Blok B, not the account default store.
- Closing summary shows Pengeluaran and Pemasukan.
- Owner POS selector is fully readable and clickable on a phone-sized viewport.
- `/expenses` can filter by date range, category, method, search, and owner branch, and supports paging.
- Finance page links to the dedicated history page and does not render the old unfiltered history table.
- PWA mobile cart has Android-style structure and payment controls are not shown in the cart body until payment is opened.
- Existing desktop POS, checkout payload, and non-owner branch rules remain intact.
