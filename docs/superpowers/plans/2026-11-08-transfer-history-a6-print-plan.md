# Transfer History A6 Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-transfer A6 thermal print action to the web transfer history with complete audit and product detail.

**Architecture:** Reuse the already-loaded history row and render a temporary client-side print sheet. A final print CSS block hides the application and sizes the sheet to A6 portrait; no API or transfer logic changes are needed.

**Tech Stack:** Next.js/React client page, CSS `@media print`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-08-transfer-history-a6-print-design.md`

## Global Constraints

- Print paper is A6 portrait: `105mm × 148mm`.
- The print sheet includes transfer metadata plus both outgoing and incoming product details.
- Existing transfer, cancellation, filtering, pagination, and on-screen history behavior must remain unchanged.
- No new API endpoint or dependency.

## Review Focus

- A cancelled transfer still prints its cancellation reason and status.
- A cross-store transfer keeps source and destination product/SKU details separate.
- A transfer with no notes does not render an empty note block.
- Long names, SKUs, and notes wrap instead of overflowing the A6 page.
- Print styling hides the app shell but leaves only the selected sheet visible.

### Task 1: Add failing print regression tests

**Files:**
- Create: `frontend/test/transfer-history-a6-print.test.cjs`
- Read: `frontend/app/inventory/transfers/page.js`, `frontend/app/globals.css`

- [x] **Step 1: Write the failing test**

  Assert the history receives an `onPrint` action, the page renders a selected transfer print sheet with complete metadata and both detail sides, and the final print CSS declares A6 dimensions and hides non-print content.

- [x] **Step 2: Run the focused test and verify it fails**

  Run: `node --test frontend/test/transfer-history-a6-print.test.cjs`
  Expected: FAIL because the print action, print sheet, and A6 print CSS do not exist.

### Task 2: Implement the client print sheet

**Files:**
- Modify: `frontend/app/inventory/transfers/page.js`

- [x] **Step 1: Add print state and action wiring**

  Add `printingTransfer` state in `TransferPage`, pass `onPrint` into `TransferHistory`, and expose a `Print rincian` button in each history card. Use an effect to call `window.print()` while the selected sheet is mounted, then clear the state after `afterprint`.

- [x] **Step 2: Render complete A6 print content**

  Add a print-only component with transfer number/date/status/admin, source/destination branch and warehouse, notes/cancellation reason, and separate outgoing/incoming detail lists. Keep the existing screen details unchanged.

- [x] **Step 3: Run the focused test and verify it passes**

  Run: `node --test frontend/test/transfer-history-a6-print.test.cjs`
  Expected: PASS.

### Task 3: Add A6 thermal print styling

**Files:**
- Modify: `frontend/app/globals.css`

- [x] **Step 1: Add screen and print styles**

  Keep the sheet hidden during screen use; in print mode set `@page` to A6 portrait, hide the app shell and other content, make the sheet `105mm` wide with readable compact typography, wrap long values, and preserve page flow for longer product lists.

- [x] **Step 2: Run focused and existing transfer tests**

  Run: `node --test frontend/test/transfer-history-a6-print.test.cjs frontend/test/transfer-history*.test.cjs frontend/test/web-pos-finance-cart-fixes.test.cjs`
  Expected: all selected tests pass.

### Task 4: Full verification, commit, and deploy

- [x] **Step 1: Run full frontend tests**

  Run: `node --test frontend/test/*.test.cjs`
  Expected: zero failures.

- [x] **Step 2: Build frontend and check diff**

  Run: `npm run build -- --webpack` from `frontend/` and `git diff --check`.
  Expected: build exits 0 and diff check is clean.

- [x] **Step 3: Commit and push to main**

  Commit with `feat: add a6 transfer history print` and push `HEAD:main`; wait for CI and Deploy workflows, then verify public `/api/health` and `/version` match the exact SHA.
