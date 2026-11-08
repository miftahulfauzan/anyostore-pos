# Android–Web Reporting Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyamakan periode, scope owner, filter, dan print laporan antara backend, web, serta aplikasi Android.

**Architecture:** Backend menjadi sumber perhitungan untuk rentang tanggal dan scope cabang. Web dan Flutter memakai parameter/field yang sama; Android tetap boleh menambahkan antrean offline lokal hanya ketika data server tidak tersedia atau belum tersinkron. Penutupan owner `branch_id=all` diagregasikan di backend.

**Tech Stack:** Node.js/Express/MySQL, Next.js/React, Flutter/Dart, Node `node:test`, Flutter test.

**Spec:** `docs/superpowers/specs/2026-11-09-android-web-parity-design.md`

## Global Constraints

- Gunakan tanggal bisnis WIB dalam format `YYYY-MM-DD`.
- Gunakan `SALES_STATUSES_SQL` untuk seluruh query penjualan.
- `branch_id=all` hanya valid untuk owner dan mencakup semua cabang aktif, termasuk cabang bertipe gudang.
- Dashboard menerima periode default 7 hari bila `start`/`end` tidak dikirim.
- Pagination riwayat transaksi dan keuangan memakai limit 20.
- Jangan mengubah rumus harga, stok, pembayaran, retur, atau status transaksi.
- Jangan menghapus antrean/cache offline; data lokal tetap diberi penanda dan disaring dengan periode/filter aktif.

## Review Focus

- Owner `all` dengan beberapa cabang: dashboard, closing, riwayat, dan finance harus tidak jatuh ke cabang akun.
- Rentang satu hari dan rentang lintas bulan: tanggal awal/akhir harus inklusif dan sama di dua klien.
- Penutupan dengan pengeluaran/pemasukan tunai: print Android harus menampilkan angka yang sama dengan respons backend/web.
- Filter kombinasi kategori, metode, search, dan pagination: query Android harus menghasilkan kontrak yang sama dengan web.
- Data pending offline: tidak boleh mencemari filter cabang/periode/type saat ditampilkan lokal.

### Task 1: Write parity regression tests first

**Files:**
- Create: `frontend/test/android-web-parity.test.cjs`
- Modify: `backend/test/dashboard-route.test.js` (only if existing route contract helpers are the established test location)

**Interfaces:**
- Consumes source contracts from web and Flutter plus backend route behavior.
- Produces executable guards for selected dashboard fields, closing scope, print fields, history/finance query parameters, and 20-row pagination.

- [x] **Step 1: Write failing tests**
  - Assert web and mobile dashboard use selected-period fields.
  - Assert web and mobile closing request the same `branch_id=all` contract and Android print passes `expenses`/`income`.
  - Assert history defaults to current month and limit 20 on both clients.
  - Assert finance filters include `date_from`, `date_to`, `category_id`, `payment_method`, `search`, `page`, and `limit` for both types.

- [x] **Step 2: Run tests to verify red**
  - Run `node --test frontend/test/android-web-parity.test.cjs`.
  - Expected: FAIL because the selected-period contract, all-closing request, Android print fields, and matching filters are not yet present.

### Task 2: Make dashboard period data canonical

**Files:**
- Modify: `backend/src/routes/dashboard.js`
- Modify: `frontend/app/dashboard/page.js`
- Modify: `mobile/lib/src/reports_page.dart`
- Test: `frontend/test/android-web-parity.test.cjs`

**Interfaces:**
- Backend response adds `selected_period`, `selected_summary`, `selected_sales_trend`, `selected_payment_breakdown`, `selected_recent_transactions`, and `selected_stores`.
- Dashboard `start`/`end` values are inclusive; fallback is the last seven WIB dates.

- [x] **Step 1: Add backend selected-period queries** using the existing status, branch, and expense scopes; preserve legacy fields for callers not yet migrated.
- [x] **Step 2: Add selected-period response fields** and normalize date labels with the existing WIB helper.
- [x] **Step 3: Update web dashboard** to use selected fields for kasir cards, trend, recent transactions, and owner store comparison.
- [x] **Step 4: Update Flutter dashboard mode** to map selected fields into the same report model.
- [x] **Step 5: Run the parity test and focused backend/frontend tests**; expected selected-period assertions pass.

### Task 3: Unify owner closing scope and Android print content

**Files:**
- Modify: `backend/src/routes/reports.js`
- Modify: `frontend/app/closing/page.js`
- Modify: `mobile/lib/src/api_client.dart`
- Modify: `mobile/lib/src/reports_page.dart`
- Modify: `mobile/lib/src/printer_service.dart`
- Modify: `mobile/test/printer_service_test.dart`
- Test: `backend/test/reports-route.test.js` or the existing daily-closing route test file

**Interfaces:**
- `GET /api/reports/daily-closing?date=YYYY-MM-DD&branch_id=all` returns one aggregate closing object for owner.
- `ApiClient.reportDailyClosing({required date, int? branchId, bool allBranches = false})` sends `branch_id=all` when requested.
- `PrinterService.printClosing` prints summary rows for `expenses` and `income`.

- [x] **Step 1: Add a failing backend test** for owner `branch_id=all` aggregation and its expenses/income totals.
- [x] **Step 2: Implement backend aggregate closing** by reusing the existing per-branch closing math and summing methods, totals, expenses, income, and expected cash.
- [x] **Step 3: Update web closing** to load/render aggregate scope instead of blocking owner `all`; PDF preview must preserve the same query.
- [x] **Step 4: Update Android closing** to call the aggregate endpoint and pass expenses/income to the printer; keep aggregate print disabled if no branch-specific store header exists.
- [x] **Step 5: Add printer regression assertions** for the two new rows and run backend/mobile focused tests.

### Task 4: Align history filters

**Files:**
- Modify: `frontend/app/history/page.js`
- Modify: `mobile/lib/src/history_tab.dart`
- Modify: `mobile/lib/src/api_client.dart` only if a query signature needs parity
- Test: `frontend/test/android-web-parity.test.cjs`

**Interfaces:**
- Both clients use the same preset keys/semantics: today, yesterday, last 7 days, last 30 days, this month, previous month, and all/custom where supported.
- Both send `date_from`, `date_to`, `status`, `search`, `page`, and `limit=20` to `/transactions`.

- [x] **Step 1: Change Android history default and page size** to current month and 20.
- [x] **Step 2: Align preset labels/ranges and custom date behavior** with the web period helper.
- [x] **Step 3: Keep owner scope from `BranchScope.active` and filter pending offline rows by the selected range/status/search.
- [x] **Step 4: Run parity and history widget/API tests.

### Task 5: Align finance filters for expenses and income

**Files:**
- Modify: `frontend/app/expenses/page.js`
- Modify: `frontend/app/finance/page.js`
- Modify: `mobile/lib/src/api_client.dart`
- Modify: `mobile/lib/src/finance_page.dart`
- Test: `frontend/test/android-web-parity.test.cjs`
- Test: `mobile/test/finance_api_test.dart` (create if no suitable existing API test)

**Interfaces:**
- `/finance/expenses` query contract is `{type,date_from,date_to,category_id,payment_method,search,page,limit,branch_id}`.
- Both clients default to current month, use limit 20, and expose category/method/search/date filters for both expense and income.

- [x] **Step 1: Add a failing Dart API contract test** for `expensesPage` query construction.
- [x] **Step 2: Add `ApiClient.expensesPage`** without breaking the existing `expenses` method callers.
- [x] **Step 3: Add Android filter state, controls, pagination, cache keys, and offline filtering** for both tabs.
- [x] **Step 4: Add web type switching and apply the same filters to income as well as expense; keep finance entry links intact.
- [x] **Step 5: Run Dart API/widget tests and frontend tests.

### Task 6: Full verification and handoff

**Files:**
- Modify: none unless verification exposes a regression.

- [x] **Step 1: Run `git diff --check`.
- [x] **Step 2: Run backend tests: `cd backend && npm test -- --test-concurrency=1`.
- [x] **Step 3: Run frontend tests/build: `cd frontend && npm test` and `npm run build`.
- [x] **Step 4: Run focused Flutter tests and `flutter analyze` for changed Dart files.
- [x] **Step 5: Review the final diff against every goal and report any pre-existing failures explicitly; do not claim deploy/build/install unless separately requested.
