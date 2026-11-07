# PWA Cart Compact Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile PWA cart compact, fixed-row, date-compact, and fast for numeric quantity edits without changing transaction calculations.

**Architecture:** Keep the existing POS cart state and `quantity(cartId, next)` mutation as the single source of truth. Add only mobile CSS overrides and small input event handlers in `frontend/app/pos/page.js`; no API or data model changes.

**Tech Stack:** Next.js/React, CSS media queries, Node test runner, existing POS source regression tests.

**Spec:** `docs/superpowers/specs/2026-11-08-pwa-cart-compact-interaction-design.md`

## Global Constraints

- Every product row uses a fixed height around 72 px with consistent 8–12 px spacing.
- The cart list scrolls vertically and prevents horizontal scrolling; total pcs and Bayar stay in the sticky footer.
- The date remains today by default and stays editable through the native date picker.
- QTY uses `inputMode="numeric"`, selects the old value on focus, and commits on blur or Enter.
- Do not change product data, prices, totals, discount math, payment flow, API contracts, or Android UI.

## Review Focus

- One to three products must remain grouped at the top rather than distributing across the sheet — test the fixed row rule and list container.
- Many products must scroll without moving the footer or causing horizontal overflow — test both overflow axes and sticky grid rows.
- Empty or invalid QTY edits must not create zero/NaN quantity — preserve the existing positive fallback through the `quantity` handler.
- Enter/blur must commit exactly once through the existing quantity path — assert the source handler wiring, not a duplicate calculation.
- The date must remain a native editable control and fit in one compact row — assert its compact class and `type="date"` markup.

### Task 1: Add cart compactness and interaction regression tests

**Files:**
- Create: `frontend/test/pwa-cart-compact-interaction.test.cjs`
- Read: `frontend/app/pos/page.js`, `frontend/app/globals.css`

**Interfaces:**
- Tests pin final mobile CSS selectors and POS markup/handler wiring without changing runtime interfaces.

- [x] **Step 1: Write the failing tests**

  Assert the final mobile override has fixed row height/min-height, a fixed grid row for the cart sheet, vertical-only scrolling, compact date styling, and a numeric QTY input with focus select plus blur/Enter handlers.

- [x] **Step 2: Run the focused test and verify it fails**

  Run `node --test frontend/test/pwa-cart-compact-interaction.test.cjs`.
  Expected: FAIL because the current rows are padding-driven, date styling is tall, and QTY has no auto-select/commit handlers.

### Task 2: Implement fixed-row mobile cart and compact date

**Files:**
- Modify: `frontend/app/globals.css` final mobile POS override block
- Modify: `frontend/app/pos/page.js` transaction-date markup only

**Interfaces:**
- Keeps `.pos-cart-scroll`, `.cart-lines article`, `.pos-cart-footer`, and `quantity(cartId, next)` names unchanged.

- [x] **Step 1: Implement the minimal CSS change**

  Set the mobile cart sheet to `grid-template-rows: auto minmax(0, 1fr) auto`; set each cart row to a fixed `height`/`min-height` of about 72 px with `padding: 8px 0`; keep list gaps consistent and preserve vertical-only overflow. Add compact date wrapper/input rules with 44–48 px height, single-line layout, and calendar affordance.

- [x] **Step 2: Render the existing date control in the compact wrapper**

  Keep `type="date"`, `value={transactionDate}`, `max={localDateString()}`, and the existing change handler. Do not change owner-only visibility or transaction payload behavior.

### Task 3: Implement fast numeric QTY editing

**Files:**
- Modify: `frontend/app/pos/page.js` quantity input in the cart row

**Interfaces:**
- Uses the existing `quantity(cartId, next)` function; no new pricing or total function.

- [x] **Step 1: Add focus selection and numeric keyboard attributes**

  Add `inputMode="numeric"`, `pattern="[0-9]*"`, and `enterKeyHint="done"`; on focus call `event.currentTarget.select()` so the old quantity is replaced by the next typed value.

- [x] **Step 2: Commit on blur and Enter**

  Keep the controlled value bound to `item.quantity`; on blur pass a positive integer fallback to `quantity`. On Enter prevent form submission, blur the field, and let the blur path commit once.

- [x] **Step 3: Run focused and existing POS tests**

  Run `node --test frontend/test/pwa-cart-compact-interaction.test.cjs frontend/test/pwa-cart-density.test.cjs frontend/test/pwa-cart-parity.test.cjs frontend/test/web-pos-finance-cart-fixes.test.cjs`.
  Expected: all tests pass.

### Task 4: Full verification and handoff

**Files:**
- No additional production files.

- [x] **Step 1: Run the full frontend test suite**

  Run `node --test frontend/test/*.test.cjs`.
  Expected: zero failures.

- [x] **Step 2: Build the frontend**

  Run `npm run build -- --webpack` from `frontend/`.
  Expected: production build succeeds and includes `/pos`.

- [x] **Step 3: Inspect and commit**

  Run `git diff --check` and `git status --short`, then commit with `fix: compact pwa cart quantity editing`.
