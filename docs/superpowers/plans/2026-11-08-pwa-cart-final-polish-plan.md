# PWA Cart Final Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quiet routine PWA POS notices, densify cart rows to 64px, add the Basik/Metro first-add default, and force the cart sheet to fill the mobile viewport.

**Architecture:** Preserve the POS cart state and checkout logic. Add a pure `defaultCartQuantity` helper, a compact POS-only notification guard, and final mobile CSS overrides.

**Tech Stack:** Next.js/React, CSS media queries, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-08-pwa-cart-final-polish-design.md`

## Global Constraints

- Routine loading/success notices are hidden only on compact `/pos`; error notices remain visible.
- Every mobile cart product row is exactly 64px high and the cart scrolls vertically.
- Basik/Metro first add is 4 pcs; existing item taps increment by 1; all other stores first add is 1.
- The open cart uses the full viewport and safe-area-aware footer.
- No product, price, total, discount, payment, checkout, API, or Android behavior changes.

## Review Focus

- A failed POS request on mobile must still show an error — assert only loading/success are suppressed.
- A store name with Basik/Metro in mixed case must get 4, while a similar non-target store gets 1 — test the pure helper.
- An existing cart item in Basik/Metro must increment by 1 rather than reset or add 4 — preserve source wiring.
- A 64px row must still fit the quantity/menu controls — assert row and control dimensions together.
- The cart must cover the viewport instead of inheriting panel sizing — assert fixed positioning, 100vw, 100dvh, and zero radius.

### Task 1: Add failing regression tests

**Files:**
- Create: `frontend/test/pwa-cart-final-polish.test.cjs`
- Read: `frontend/app/components/NotificationCenter.js`, `frontend/app/pos/page.js`, `frontend/app/globals.css`

- [x] **Step 1: Write the failing tests**

  Test routine notification suppression guard, Basik/Metro quantity helper behavior, first-add helper wiring, 64px mobile rows, and full-screen cart CSS.

- [x] **Step 2: Run the focused test and verify it fails**

  Run `node --test frontend/test/pwa-cart-final-polish.test.cjs`.
  Expected: FAIL because current rows are 72px, the helper/guard do not exist, and the stronger full-screen selectors are absent.

### Task 2: Implement behavior changes

**Files:**
- Create: `frontend/app/pos/cart-defaults.cjs`
- Modify: `frontend/app/pos/page.js`
- Modify: `frontend/app/components/NotificationCenter.js`

- [x] **Step 1: Add and use `defaultCartQuantity(storeName)`**

  Return 4 for case-insensitive Basik/Metro store names and 1 otherwise. Use it only for a newly created cart item; keep existing-item increment behavior at `+ 1`.

- [x] **Step 2: Suppress routine notices only on compact POS**

  Guard `loading` and `success` in the shared notification `show` path when the pathname is `/pos` and the viewport matches `max-width: 820px`. Preserve error/info behavior and inline message hiding.

### Task 3: Implement 64px/full-screen mobile cart CSS

**Files:**
- Modify: `frontend/app/globals.css` final mobile POS cart override block

- [x] **Step 1: Set fixed row and control dimensions**

  Set `.cart-lines` auto rows and each article to 64px; keep compact vertical gaps, aligned subtotal/menu columns, and controls within the row.

- [x] **Step 2: Force viewport-sized sheet**

  Set the open cart to fixed `top/right/bottom/left: 0`, `width: 100vw`, `height/min-height: 100dvh`, zero border/radius, and preserve the sticky safe-area footer.

- [x] **Step 3: Run focused cart tests**

  Run `node --test frontend/test/pwa-cart-final-polish.test.cjs frontend/test/pwa-cart-spacing-followup.test.cjs frontend/test/pwa-cart-compact-interaction.test.cjs frontend/test/pwa-cart-density.test.cjs frontend/test/pwa-cart-parity.test.cjs frontend/test/web-pos-finance-cart-fixes.test.cjs`.
  Expected: all pass.

### Task 4: Full verification and handoff

- [x] **Step 1: Run full frontend tests**

  Run `node --test frontend/test/*.test.cjs`.
  Expected: zero failures.

- [x] **Step 2: Build frontend**

  Run `npm run build -- --webpack` from `frontend/`.
  Expected: production build succeeds.

- [x] **Step 3: Inspect and commit**

  Run `git diff --check` and commit with `fix: polish pwa cart defaults and fullscreen`.
