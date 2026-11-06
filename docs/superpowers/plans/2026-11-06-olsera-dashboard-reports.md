# Olsera-style Dashboard & Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menata ulang dashboard laporan mobile dan dashboard web agar mengikuti alur Olsera dengan metrik dan grafik nyata dari Anyostore.

**Architecture:** Perluas kontrak `/api/reports/overview` dengan seri pemasukan, pengeluaran, retur, ringkasan toko, dan kelompok produk. Mobile `ReportsPage` memakai payload itu untuk komposisi dashboard scrollable; web `/dashboard` mengambil payload laporan tambahan untuk role toko dan tetap memakai `WarehouseDashboard` untuk role gudang. Tidak ada perhitungan bisnis baru di frontend.

**Tech Stack:** Express + MySQL, Flutter + `fl_chart`, Next.js App Router, CSS/SVG yang sudah ada, test Flutter dan backend regression tests.

**Spec:** `docs/superpowers/specs/2026-11-06-olsera-dashboard-reports-design.md`

## Global Constraints

- Sales dan Income dipisah: Sales adalah omzet transaksi, Income adalah pemasukan manual.
- Return memakai nominal refund berdasarkan tanggal retur dibuat dan hanya status approved.
- Toggle Date/Jam tampil sebagai kontrol visual; Jam nonaktif sampai data per jam tersedia.
- Distribusi produk/kategori memakai jumlah pcs terjual.
- Semua toko/gudang menggabungkan produk berdasarkan SKU/nama yang sama.
- Palet utama: denim `#1E3A5F`, teal untuk pemasukan/laba, terracotta untuk pengeluaran/retur, latar krem.
- Tidak ada angka contoh, feed fiktif, atau kontrol yang tidak punya aksi nyata.
- Dashboard stok gudang tetap terpisah dari dashboard penjualan.

## Review Focus

- Rentang tanpa penjualan/pemasukan/retur: grafik tetap punya empty state yang menjelaskan kondisi.
- Owner `all` versus cabang tunggal: semua query dan label lokasi harus konsisten.
- Retur pending/rejected: tidak boleh masuk nominal atau grafik retur.
- Pelanggan tanpa transaksi dan transaksi tanpa pelanggan: hitungan pelanggan baru tidak boleh mengubah omzet.
- Lebar mobile 320/390 dan mode gelap: label angka, grafik, dan filter tidak boleh overflow atau kehilangan kontras.

### Task 1: Enrich the reports overview contract

**Files:**
- Modify: `backend/src/routes/reports.js` route `GET /overview`
- Test: `backend/test/reports-overview.test.js` (new)
- Reference: `backend/src/sales-status.js`, `backend/src/local-date.js`, `backend/src/money.js`

**Interfaces:**
- Produces `summary.gross_sales`, `summary.income`, `summary.expenses`, `summary.return_amount`, `summary.return_count`, `summary.new_customers`, and `summary.average_transaction`.
- Produces `daily_income`, `daily_expenses`, `daily_returns`, `product_groups`, `sales_sources`.
- Keeps existing keys (`payment_methods`, `products`, `daily_sales`, `price_tiers`, `transactions`, `low_stock`) backward compatible.

- [ ] **Step 1: Write failing route-contract tests** for separate sales/income, approved-only returns, zero-filled daily series, new-customer count, average transaction, category quantities, and owner-all scope.
- [ ] **Step 2: Run the focused backend test** and confirm it fails because the new response keys/calculations are absent.
- [ ] **Step 3: Extend `/overview` queries** using existing `SALES_STATUSES_SQL`; keep `gross_sales` as transaction sales, expose manual income separately, query approved returns by `DATE(created_at)`, count customers created in the date range, and group sold quantity by category/name. Use local date serialization for every daily row.
- [ ] **Step 4: Run the focused route-contract test** and confirm all response assertions pass.
- [ ] **Step 5: Run the existing backend report/integrity test set** to ensure refund and profit semantics remain unchanged.

### Task 2: Build the Olsera-style mobile dashboard composition

**Files:**
- Modify: `mobile/lib/src/reports_page.dart` (`_buildBody`, `_dashboard`, dashboard section widgets)
- Modify: `mobile/test/analytics_visual_test.dart`
- Modify: `mobile/test/dashboard_page_test.dart` only if shared dashboard fixtures need the new payload keys

**Interfaces:**
- Consumes the enriched `reportOverview` payload from Task 1.
- Keeps `ReportsPage(dashboardMode: true)` as the entry point used by navigation.
- Keeps `DashboardPage` as the separate stock dashboard.

- [ ] **Step 1: Add failing visual assertions** for `Sekilas toko`, sales/income/expense/return section keys, disabled Jam toggle, category/product bars, owner location label, and empty-series messaging at 320 and 390 in light/dark mode.
- [ ] **Step 2: Run the focused Flutter analytics tests** and verify the new assertions fail against the current card/list layout.
- [ ] **Step 3: Replace the dashboard-mode composition** with header context, compact period/location filter, “Sekilas toko” rows, a prominent sales metric, then chart cards for income/expense/return and product groups. Keep the existing loading/error/empty states and real refresh behavior.
- [ ] **Step 4: Implement reusable Flutter sections** for line/area chart, date/hour toggle (Jam disabled with explanatory tooltip), metric row, and horizontal category bars using `fl_chart` and the denim/teal/terracotta palette. Preserve accessibility labels and 44px touch targets.
- [ ] **Step 5: Run the focused visual tests** at widths 320/390 and both brightness modes; fix overflow, clipped labels, and contrast failures.

### Task 3: Apply the dashboard composition to the web

**Files:**
- Modify: `frontend/app/dashboard/page.js`
- Modify: `frontend/app/globals.css`
- Create or modify: `frontend/app/dashboard/OlseraDashboardSections.js` if extracting the report sections keeps `page.js` readable
- Test/build: existing frontend build and relevant dashboard regression tests if present

**Interfaces:**
- Consumes `/api/dashboard` for navigation/stock role behavior and `/api/reports/overview` for the sales dashboard payload.
- Preserves owner branch selection, warehouse role dashboard, links to `/history`, `/finance`, `/pos`, and existing refresh behavior.

- [ ] **Step 1: Add a web regression fixture/assertion** for sales summary, separate income, approved returns, daily series, product groups, and empty sections.
- [ ] **Step 2: Run the focused web check** and confirm the new structure is not yet present.
- [ ] **Step 3: Fetch/merge the report payload for non-gudang dashboard roles** with the current dashboard response, guarding stale requests and preserving 401/refresh behavior.
- [ ] **Step 4: Render the reference order**: toolbar, “Sekilas toko”, sales/income/expense/return charts, POS source, product/category bars, and recent transactions. Use real values only; show a useful empty state when a series is empty.
- [ ] **Step 5: Add responsive CSS** for desktop, tablet, and narrow mobile widths; use the denim header/control state, solid surfaces, limited shadows, and accessible focus/contrast states.
- [ ] **Step 6: Run the frontend build and existing tests** and correct hydration, syntax, responsive, or stale-request regressions.

### Task 4: Full verification and mobile release

**Files:**
- Verify: `backend/src/routes/reports.js`, `mobile/lib/src/reports_page.dart`, `frontend/app/dashboard/page.js`, `frontend/app/globals.css`
- Verify: `docs/superpowers/specs/2026-11-06-olsera-dashboard-reports-design.md`

- [ ] **Step 1: Run backend targeted tests plus the full backend test command.**
- [ ] **Step 2: Run Flutter analytics/dashboard regression tests and the full relevant mobile test set.**
- [ ] **Step 3: Run `git diff --check`, frontend build, and mobile static/build checks.**
- [ ] **Step 4: Build `flutter build apk --release --split-per-abi` with the existing Android application ID and install the arm64 APK to the connected device when requested/available.**
- [ ] **Step 5: Report the actual test/build/install results and link the generated APK without claiming unverified deployment.**
