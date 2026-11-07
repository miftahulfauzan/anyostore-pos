# PWA Cart Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the mobile PWA POS cart visually and behaviorally match the Android cart while preserving the desktop POS layout.

**Architecture:** Keep the existing React POS state and checkout path. Add the missing web cart states for notes, draft hold/resume, and collapsible options, then render a dedicated mobile full-screen cart mode using the same data and actions. Desktop keeps the existing two-column catalog and cart.

**Tech Stack:** Next.js 16, React 18, CSS in `frontend/app/globals.css`, Node test runner static regression tests.

**Spec:** `docs/superpowers/specs/2026-11-07-pwa-cart-parity-design.md`

## Global Constraints

- Android is the visual and interaction reference.
- Mobile cart opens full-screen and locks the POS page scroll.
- Desktop keeps the catalog plus cart two-column layout.
- Use denim `#1E3A5F` for the cart header and primary payment action.
- Keep existing checkout, pricing preview, stock validation, payment, and receipt behavior.
- Every new control has a real action, accessible name, focus state, and mobile tap target.
- No new dependency.

## Review Focus

- A draft with customer, discount, notes, and multiple items resumes into the same cart state.
- Closing the full-screen cart preserves cart state and does not submit or clear it.
- Keyboard editing of qty and price does not collapse the overlay or create horizontal overflow.
- Empty, loading, and API error states remain actionable in the new draft and cart controls.
- Dark mode and safe-area insets keep the denim header, footer, and inputs readable.

### Task 1: Add web cart behavior and regression tests

**Files:**
- Modify: `frontend/app/pos/page.js`
- Test: `frontend/test/pwa-cart-parity.test.cjs`

**Interfaces:**
- Consumes: existing `cart`, `preview`, `customerId`, `manualDiscount`, checkout state, and `/transactions` API.
- Produces: `notes`, `showCartActions`, `showCartOptions`, draft load/hold helpers, and mobile cart semantics used by Task 2.

- [ ] Write static regression tests first for the Android parity contract: mobile full-screen state hook, Denim header, one footer total, hidden options default, item menu actions, hold/pending/resume endpoints, and draft icon action.
- [ ] Run the focused test and confirm it fails against the current PWA source.
- [ ] Add the minimal React state and handlers: notes, action/options visibility, draft list/resume, hold payload, and customer/date restoration.
- [ ] Replace the always-visible generic customer and discount controls with Android-style conditional option sections, while retaining owner date control and payment validation.
- [ ] Add the POS draft icon and the full-screen cart structure with semantic buttons, labelled fields, and Escape/backdrop close behavior.
- [ ] Run the focused test and confirm it passes.
- [ ] Commit as `feat: align web pos cart with android`.

### Task 2: Match mobile layout and theme behavior

**Files:**
- Modify: `frontend/app/globals.css`
- Test: `frontend/test/pwa-cart-parity.test.cjs`

**Interfaces:**
- Consumes: the mobile cart classes and state structure produced by Task 1.
- Produces: responsive full-screen overlay, header/footer hierarchy, safe-area behavior, keyboard-friendly scrolling, and desktop isolation.

- [ ] Add focused CSS assertions for full viewport height, fixed denim header, scrollable middle region, sticky footer, safe-area padding, 44px controls, and reduced-motion behavior.
- [ ] Run the focused CSS assertions and confirm they fail before the new rules exist.
- [ ] Add a dedicated mobile cart layout at the content breakpoint. Keep the desktop `.cart` sticky aside untouched outside mobile.
- [ ] Add dark-mode selectors for header, surface, borders, input text, and footer, plus a narrow-width rule that prevents horizontal overflow.
- [ ] Run the focused UI test and frontend suite.
- [ ] Commit as `style: mirror android cart layout on mobile web`.

### Task 3: Release verification and deployment

**Files:**
- No additional source files.

- [ ] Run `git diff --check` and the full frontend test suite.
- [ ] Run the production Webpack build if the default Turbopack build is blocked by the known local port restriction.
- [ ] Push the verified commits to `main`.
- [ ] Verify public `/version` matches the pushed SHA and `/api/health` reports success.
- [ ] Record the release SHA and verification results in the plan ledger.
