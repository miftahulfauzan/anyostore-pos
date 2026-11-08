# PWA Cart Spacing Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stretched whitespace from the mobile PWA cart while preserving quantity editing, totals, payment, and checkout.

**Architecture:** Keep the existing POS cart markup and `quantity(cartId, next)` mutation. Override only the final mobile CSS block to use a start-aligned flex column with fixed product rows; add a small focus scroll helper to the existing numeric QTY input.

**Tech Stack:** Next.js/React, CSS media queries, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-08-pwa-cart-spacing-followup-design.md`

## Global Constraints

- Product rows are fixed at 72–85 px and never distribute free height between items.
- Mobile cart content uses a vertical column and leaves free space only after content.
- Horizontal overflow is hidden; vertical cart scrolling and sticky payment footer remain.
- QTY remains numeric, select-all on focus, and scrolls the focused input into view.
- Native date input remains editable and compact; helper text is hidden.
- No product data, prices, totals, discount math, payment flow, API, or Android changes.

## Review Focus

- Two products in a tall viewport must remain adjacent rather than stretching apart — assert start-aligned flex content and fixed cart rows.
- Twenty products must scroll vertically with no horizontal overflow — assert both axes and fixed row sizing.
- QTY focus while the keyboard opens must request centered scrolling — assert `scrollIntoView` wiring.
- Date helper text must not create extra vertical space — assert it is hidden in the final mobile CSS.
- Narrow mobile widths must retain the subtotal/menu columns — assert 16px content padding and compact QTY width.

### Task 1: Add regression coverage for the screenshot layout

**Files:**
- Create: `frontend/test/pwa-cart-spacing-followup.test.cjs`
- Read: `frontend/app/pos/page.js`, `frontend/app/globals.css`

- [x] **Step 1: Write the failing tests**

  Assert the final mobile override uses `display: flex`, `flex-direction: column`, `justify-content: flex-start`, fixed 72px rows, 16px horizontal scroll padding, 56px QTY width, 42px QTY height, hidden date helper text, and the QTY focus handler requests `scrollIntoView`.

- [x] **Step 2: Run the focused test and verify it fails**

  Run `node --test frontend/test/pwa-cart-spacing-followup.test.cjs`.
  Expected: FAIL because the current override still uses a grid scroll region, 12px padding, 44px QTY width, visible helper text, and no focus scrolling.

### Task 2: Implement compact start-aligned cart layout

**Files:**
- Modify: `frontend/app/globals.css` final mobile POS cart override block

- [x] **Step 1: Implement the minimal mobile layout change**

  Change `.pos-cart-scroll` to a start-aligned flex column with vertical-only overflow, set 16px horizontal padding, prevent the `.cart-lines` grid from stretching its auto tracks, keep rows at 72px, and keep the payment footer sticky with safe-area padding.

- [x] **Step 2: Compact product controls and date**

  Set QTY to 56px × 42px, preserve aligned subtotal/menu columns and thin separators, set the date spacing/input to 40–44px, and hide `.pos-transaction-date small` on mobile.

- [x] **Step 3: Run the focused layout tests**

  Run `node --test frontend/test/pwa-cart-spacing-followup.test.cjs`.
  Expected: all focused layout assertions pass.

### Task 3: Keep focused QTY visible above the keyboard

**Files:**
- Modify: `frontend/app/pos/page.js` QTY `onFocus` handler

- [x] **Step 1: Add the minimal focus scroll helper**

  Preserve select-all behavior and request `scrollIntoView({ block: 'center', inline: 'nearest' })` on the focused input in the next animation frame. Do not add new quantity state or alter the existing `quantity` mutation.

- [x] **Step 2: Run cart regression tests**

  Run `node --test frontend/test/pwa-cart-spacing-followup.test.cjs frontend/test/pwa-cart-compact-interaction.test.cjs frontend/test/pwa-cart-density.test.cjs frontend/test/pwa-cart-parity.test.cjs frontend/test/web-pos-finance-cart-fixes.test.cjs`.
  Expected: all tests pass.

### Task 4: Full verification and handoff

- [x] **Step 1: Run the full frontend suite**

  Run `node --test frontend/test/*.test.cjs`.
  Expected: zero failures.

- [x] **Step 2: Build the frontend**

  Run `npm run build -- --webpack` from `frontend/`.
  Expected: production build succeeds and includes `/pos`.

- [x] **Step 3: Inspect and commit**

  Run `git diff --check` and commit with `fix: tighten pwa cart spacing`.
