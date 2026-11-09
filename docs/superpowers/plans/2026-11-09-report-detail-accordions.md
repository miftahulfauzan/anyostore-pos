# Laporan Detail Accordion Web dan Android Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Group every existing report dataset into the approved five-section accordion design on web/PWA and Android, while preserving Ringkasan toko and existing calculations.

**Architecture:** Keep `/api/reports/overview` unchanged. Extract the web detail tables into a client accordion component with scoped print/PDF preview. Add a reusable Flutter detail accordion that consumes the same report map and delegates export/thermal print through existing platform services.

**Tech Stack:** Next.js/React, Lucide icons, CSS print rules, Flutter Material widgets, `share_plus`, existing thermal printer service, Node contract tests, Flutter widget tests.

**Spec:** `docs/superpowers/specs/2026-11-09-report-detail-accordions-design.md`

## Global constraints

- Do not change API, schema, report calculations, filter behavior, or Ringkasan toko.
- Keep touch targets at least 44px/48dp and provide `aria`/tooltip labels for icon actions.
- Keep data visible in an empty group via an explicit empty state.
- Use TDD: add failing contract/widget tests before production code.

### Task 1: Web accordion and scoped print/export

**Files:**
- Add: `frontend/app/reports/ReportDetailAccordions.js`
- Modify: `frontend/app/reports/page.js`
- Modify: `frontend/app/globals.css`
- Add: `frontend/test/report-detail-accordion.test.cjs`

- [ ] Add failing source tests for five groups, icons, all report fields, summary retention, and PDF/print actions.
- [ ] Implement the client accordion and move existing detail table content into its five groups without changing render values.
- [ ] Add a scoped print target so each group can be printed/saved as PDF without printing unrelated groups.
- [ ] Add responsive styles and empty states.
- [ ] Run focused Node test, then all frontend tests, lint, and build.

### Task 2: Android detail accordion and export/print actions

**Files:**
- Modify: `mobile/lib/src/reports_page.dart`
- Modify: `mobile/test/reports_page_test.dart`

- [ ] Add failing widget tests for five groups, icons/actions, and all dataset labels.
- [ ] Implement grouped details after the existing `_dashboard()` output, preserving the current dashboard cards and trend chart.
- [ ] Reuse `_export()` for report export and `printNow` for thermal print with a compact report payload; keep empty groups visible.
- [ ] Run focused Flutter tests and analyzer.

### Task 3: Cross-platform verification and release

- [ ] Run frontend tests/lint/build and Flutter tests/analyze.
- [ ] Run `git diff --check` and inspect the diff for accidental data/logic changes.
- [ ] Bump mobile versionCode, build split APK, and retain the three ABI artifacts.
- [ ] Commit, push, wait for CI, deploy web, and verify `/api/health` and `/version`.
