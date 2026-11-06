# Mobile Sales Dashboard Implementation Plan

> **For agentic workers:** execute inline; preserve all existing workspace changes.

**Goal:** Combine sales and summary in the mobile Dashboard and make Finance a bottom tab.

**Architecture:** Reuse `ReportsPage` data loading, branch scope, date filters, and offline merge. Add a dashboard presentation mode; keep the detailed report page accessible from More and the warehouse dashboard on its current role-specific path.

**Files:**
- `mobile/lib/src/reports_page.dart`: combined sales/summary presentation mode.
- `mobile/lib/src/app_navigation.dart`, `mobile/lib/src/pos_page.dart`: owner/staff tab order and page mapping.
- `mobile/lib/src/more_page.dart`: detailed reports and stock dashboard entries.
- `mobile/lib/src/finance_page.dart`: refresh on shared branch changes.
- `backend/src/routes/dashboard.js`: skip unrelated sales queries for warehouse role.

## Tasks

- [x] Add a compact combined dashboard view: selected period, sales metrics, daily trend, payment split, top products, and low stock. Preserve existing detailed report tabs and cache behavior.
- [x] Reorder owner/staff navigation to POS, Dashboard, Riwayat, Keuangan, Lainnya. Keep warehouse navigation unchanged; move detailed reports and stock overview into More.
- [x] Refresh Finance when the owner changes shared branch; avoid sales queries in the warehouse dashboard endpoint.
- [x] Review only the touched diff and produce an Android update APK. Do not commit, push, deploy, run tests, or build iOS.

## Review Focus

- Owner branch and date filters apply consistently; “Semua toko/gudang” remains supported.
- Kasir does not gain access to restricted report endpoints.
- Warehouse still sees its existing stock dashboard.
- Existing local changes remain untouched.
