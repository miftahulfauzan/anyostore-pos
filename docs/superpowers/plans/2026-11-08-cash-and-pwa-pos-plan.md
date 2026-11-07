# Cash Closing and PWA POS Compact Cart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make cash closing include approved cash finance entries and make the PWA POS cart/catalog compact, vertically scrollable, discount-accessible, and able to hold transactions as Draft.

**Architecture:** Keep Finance rows and manual `cash_drawer_movements` as separate audit sources, combine them through one cash-flow arithmetic helper, and feed the resulting net adjustment into both daily closing and drawer expected-cash calculations. Apply PWA density changes only in the existing `max-width: 820px` override block; reuse the existing hold/resume API and POS state.

**Tech Stack:** Express/Node.js, MySQL queries, Node test runner, Next.js/React, CSS media queries.

**Spec:** `docs/superpowers/specs/2026-11-08-cash-closing-design.md` and `docs/superpowers/specs/2026-11-08-pwa-pos-compact-cart-design.md`

## Global Constraints

- Only approved Finance rows are included in cash flow.
- Expense is negative; income is positive; manual cash-in is positive and manual cash-out is negative.
- Only Finance rows with `payment_method = 'cash'` affect physical cash.
- Refund/return flows must not be counted twice.
- PWA changes apply only at `max-width: 820px`; desktop and Android behavior remain unchanged.
- The cart scroll region must allow vertical scrolling and prevent horizontal scrolling.
- Existing `/api/transactions/hold`, `/pending`, and `/pending/:id/resume` interfaces remain unchanged.

## Review Focus

- A cash expense of Rp760.000 must make cash-in/out `-Rp760.000` and reduce cash sales by exactly Rp760.000 — covered by `backend/test/closing-math.test.js` and `backend/test/cash-flow.test.js`.
- A cash income must increase cash, while transfer/debit finance entries must not — covered by `backend/test/cash-flow.test.js` and route SQL regression tests.
- A refund/return must not be subtracted twice when cash movements are combined — covered by existing closing refund tests plus the new combined adjustment case.
- A 360px PWA viewport must still render three product columns without horizontal overflow — covered by `frontend/test/pwa-cart-density.test.cjs`.
- Discount and Tahan must remain reachable after compacting the cart — covered by `frontend/test/pwa-cart-density.test.cjs` and existing `pwa-cart-parity.test.cjs`.

### Task 1: Add shared cash-flow arithmetic

**Files:**
- Create: `backend/src/cash-flow.js`
- Test: `backend/test/cash-flow.test.js`

**Interfaces:**
- Produces `cashFlowNet({ manualNet, financeIncome, financeExpense }) -> number`, rounded through the existing `money()` helper.

  - [x] **Step 1: Write the failing tests**

  Add tests for manual cash-in/out plus finance cash income/expense, zero defaults, and the fact that the helper only receives already-filtered cash rows.

  - [x] **Step 2: Run the tests to verify they fail**

  Run `node --test backend/test/cash-flow.test.js`.
  Expected: FAIL because `backend/src/cash-flow.js` does not exist.

  - [x] **Step 3: Implement `cashFlowNet`**

  Return `money(Number(manualNet || 0) + Number(financeIncome || 0) - Number(financeExpense || 0))` and export it from the new module.

  - [x] **Step 4: Run the tests to verify they pass**

  Run `node --test backend/test/cash-flow.test.js`.
  Expected: PASS.

### Task 2: Feed the combined adjustment into daily closing

**Files:**
- Modify: `backend/src/closing-math.js`
- Test: `backend/test/closing-math.test.js`
- Modify: `backend/src/routes/reports.js`
- Test: `backend/test/reports-daily-closing.test.js`

**Interfaces:**
- `buildClosingMethods` accepts optional `financeCashNet` in addition to `movementsNet` and sets cash `cash_in_out` to their rounded sum.
- `GET /api/reports/daily-closing` keeps its response shape and supplies `financeCashNet` from approved cash Finance rows for the requested branch/date.

  - [x] **Step 1: Write the failing unit/regression tests**

  Add a closing-math case with cash sales Rp1.205.000 and `financeCashNet: -760000`, expecting `cash_in_out = -760000`, cash total Rp445.000, and the expected total reduced by Rp760.000. Add a route test asserting the daily-closing query filters `expenses` by `status = 'approved'`, `payment_method = 'cash'`, branch, and report date.

  - [x] **Step 2: Run the tests to verify they fail**

  Run `node --test backend/test/closing-math.test.js backend/test/reports-daily-closing.test.js`.
  Expected: the arithmetic test fails because `financeCashNet` is ignored, and the route test fails because the cash Finance query is absent.

  - [x] **Step 3: Implement the minimal route/math change**

  In `closing-math.js`, combine `movementsNet` and `financeCashNet` only for the cash method. In `reports.js`, add the approved cash Finance aggregate alongside the existing manual movement query, calculate `cashFlowNet`, and pass it to `buildClosingMethods`. Keep summary `expenses`/`income` totals unchanged so non-cash entries remain visible in the summary.

  - [x] **Step 4: Run the tests to verify they pass**

  Run the same targeted command. Expected: PASS.

### Task 3: Keep cash-drawer expected cash consistent

**Files:**
- Modify: `backend/src/routes/cash-drawer.js`
- Test: `backend/test/cash-drawer-cash-flow.test.js`

**Interfaces:**
- `expectedCash(connection, drawer)` continues returning a rounded number but includes approved cash Finance income/expense created during the drawer interval in the same net adjustment as manual movements.

  - [x] **Step 1: Write the failing route test**

  Mock the drawer queries and assert the expected-cash path queries approved `expenses` with `payment_method = 'cash'`, branch, and the drawer opening/time boundary.

  - [x] **Step 2: Run the test to verify it fails**

  Run `node --test backend/test/cash-drawer-cash-flow.test.js`.
  Expected: FAIL because the expected-cash path has no Finance query.

  - [x] **Step 3: Implement the minimal change**

  Import `cashFlowNet`, query approved cash Finance rows between `opened_at` and the current/closing time, and add that net to opening amount + cash sales + manual movements. Do not create duplicate `cash_drawer_movements` rows.

  - [x] **Step 4: Run the test to verify it passes**

  Run `node --test backend/test/cash-drawer-cash-flow.test.js`.
  Expected: PASS.

### Task 4: Add PWA compact-cart regression tests

**Files:**
- Create: `frontend/test/pwa-cart-density.test.cjs`
- Modify: `frontend/test/pwa-cart-parity.test.cjs` only if assertions need to be made more specific.

**Interfaces:**
- Tests pin the existing POS markup/classes and the final mobile CSS overrides without requiring a browser runtime.

  - [x] **Step 1: Write the failing tests**

  Assert that the mobile catalog uses `repeat(3, minmax(0, 1fr))`, the cart scroll region has `overflow-y: auto`, `overflow-x: hidden`, and `touch-action: pan-y`, compact cart rows use reduced padding, the discount field remains reachable, and `holdCart` still posts to `/transactions/hold`.

  - [x] **Step 2: Run the tests to verify they fail**

  Run `node --test frontend/test/pwa-cart-density.test.cjs`.
  Expected: FAIL on the current two-column and missing horizontal-scroll guards.

### Task 5: Implement compact PWA catalog/cart behavior

**Files:**
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/pos/page.js`

**Interfaces:**
- Existing `holdCart`, `showCartActions`, `showCartOptions`, `manualDiscount`, and `pos-discount-field` remain the source of truth.

  - [x] **Step 1: Implement mobile-only CSS**

  In the final `max-width: 820px` override block, set the catalog to three columns with compact card padding/type, hide the cart column header on mobile, reduce cart row/input/menu sizes to fit roughly 12 rows, and set `overflow-x: hidden`, `touch-action: pan-y`, and `overscroll-behavior-x: none` on the cart scroll region and lines.

  - [x] **Step 2: Make discount access explicit without increasing the default cart height**

  Keep actions/options collapsed by default for the 12-row view, but make the top-right action toggle reveal the Diskon control/options in one tap. Keep the existing input id `pos-manual-discount` and existing validation/preview behavior.

  - [x] **Step 3: Run the PWA regression tests**

  Run `node --test frontend/test/pwa-cart-density.test.cjs frontend/test/pwa-cart-parity.test.cjs frontend/test/web-pos-finance-cart-fixes.test.cjs`.
  Expected: PASS.

### Task 6: Full verification and handoff

**Files:**
- No production files; verify all modified files.

  - [x] **Step 1: Run full backend tests**

  Run `node --test backend/test/*.test.js`.
  Expected: all tests pass; if sandbox blocks the backup route listener, rerun only that test with the approved elevated command and record the result.

  - [x] **Step 2: Run full frontend tests**

  Run `node --test frontend/test/*.test.cjs`.
  Expected: all tests pass.

  - [x] **Step 3: Build the frontend**

  Run `npm run build -- --webpack` from `frontend/`.
  Expected: production build completes and includes `/pos` and `/closing`.

  - [x] **Step 4: Inspect diff and commit**

  Run `git diff --check` and `git status --short`, then commit with `fix: align cash closing and compact pwa cart`.
