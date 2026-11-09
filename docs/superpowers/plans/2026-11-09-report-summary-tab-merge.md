# Laporan Penjualan Tanpa Tab Ringkasan Terpisah Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge the Android report summary into the Penjualan report and remove the duplicate Ringkasan navigation from Android, web, and PWA.

**Architecture:** Keep the existing report overview endpoint and local/offline merge. Android normalizes the legacy `ringkasan` section to the combined Penjualan renderer; web/PWA only changes the visible report title because its content already uses the shared merged component.

**Tech Stack:** Flutter/Dart widget tests, Next.js/React source-contract tests, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-09-report-summary-tab-merge-design.md`

## Global Constraints

- Do not change API, database schema, or report calculations.
- Preserve Penutupan and PPN tabs.
- Preserve period, branch, offline, and payment behavior.
- Keep the merged dashboard visual hierarchy and denim design system.

## Review Focus

- Legacy `initialSection: 'ringkasan'` must land on the combined Penjualan view.
- Kasir must retain one accessible report tab even though its endpoint remains the existing overview/dashboard contract.
- Empty periods must still use the current empty-state behavior.
- Web and PWA must not reintroduce a Ringkasan-only title or section.

---

### Task 1: Remove duplicate report navigation and merge Android content

**Files:**
- Modify: `mobile/lib/src/reports_page.dart`
- Test: `mobile/test/reports_page_test.dart`

**Interfaces:**
- Consumes existing `ReportsPage.initialSection`, `_sales()`, and `/reports/overview` data.
- Produces one Penjualan renderer for legacy summary and sales report states.

- [ ] Write a failing widget test asserting owner report has no Ringkasan tab, defaults to Penjualan, and keeps summary metrics.
- [ ] Run the focused widget test and verify it fails because the legacy tab/renderer is still present.
- [ ] Normalize the legacy section, remove the duplicate tab, and fold summary rows/cards into `_sales()`; keep kasir access through one Penjualan-labelled tab.
- [ ] Run the focused widget test and verify it passes.

### Task 2: Align web/PWA report naming and source contracts

**Files:**
- Modify: `frontend/app/reports/page.js`
- Test: `frontend/test/web-pos-finance-cart-fixes.test.cjs`

**Interfaces:**
- Consumes the existing `OlseraDashboardSections` report data contract.
- Produces report copy that identifies the combined view as Penjualan rather than a separate Ringkasan page.

- [ ] Add a failing source-contract assertion that the report title is `Laporan Penjualan` and does not use `Laporan Ringkasan Toko`.
- [ ] Run the focused Node test and verify it fails on the current title.
- [ ] Change only the report title copy; keep the shared merged component and detail tables intact.
- [ ] Run the focused Node test and verify it passes.

### Task 3: Regression verification

**Files:**
- No production files.

- [ ] Run Flutter focused reports tests.
- [ ] Run all frontend contract tests and frontend build/lint.
- [ ] Run backend tests to confirm the API contract remains unchanged.
- [ ] Run `git diff --check` and inspect the final diff.
