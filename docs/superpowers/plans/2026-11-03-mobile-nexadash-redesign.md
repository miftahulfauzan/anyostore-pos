# Anyostore Mobile Sales Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved NexaDash-inspired Anyostore design system consistently across the Flutter mobile application without changing business logic, API contracts, permissions, offline behavior, or navigation semantics.

**Architecture:** Keep the current Flutter shell and page structure. Migrate the shared tokens in `task_ui.dart` and `buildAnyostoreTheme()` first, then update shared shell components and page families so existing callers inherit the new visual language. Add focused widget/contract tests around tokens, contrast, narrow layouts, themes, and existing workflows instead of introducing a new UI framework or dependency.

**Tech Stack:** Flutter/Dart, Material 3, Provider, existing `GlassCard`/`PillTabs` primitives, `fl_chart`, Flutter widget tests, existing APK split-ABI build.

**Spec:** `docs/superpowers/specs/2026-11-03-mobile-nexadash-redesign-design.md`

## Global Constraints

- The mobile app remains light-first with working dark mode; palette values are the exact values in the approved spec.
- Preserve API, database, payloads, role permissions, branch scope, offline queue, printer, checkout, and navigation labels.
- Do not add font, icon, chart, motion, or other dependencies.
- `GlassCard` remains the shared API and is solid by default; `frosted: true` is limited to a single hero surface such as login.
- Keep minimum interactive target size at 44 px and pair semantic colors with text or icons.
- Do not overwrite or reset pre-existing user changes in the dirty worktree; inspect diffs before editing overlapping files.
- The redesign is Flutter mobile only; the Next.js frontend is out of scope.
- Any mockup numbers are not shipped as app data; screens continue to render real API/cache values.

## Review Focus

- **Palette contract drift:** token values, aliases, and the palette test must agree; test in `mobile/test/task_ui_palette_test.dart`.
- **Dark mode contrast:** AppBar, buttons, inputs, cards, status surfaces, and icons must remain readable; test both `Brightness.light` and `Brightness.dark` in shared widget tests.
- **Narrow phones and large text:** the shell, drawer, POS grid, payment sheet, tabs, and inventory cards must not overflow; extend `mobile/test/mobile_redesign_test.dart` and `mobile/test/redesign_workflows_test.dart`.
- **Real data states:** loading, empty, and error views must remain visible and actionable after restyling; cover representative dashboard, inventory, and POS states in `mobile/test/redesign_visual_test.dart`.
- **Preserved workflows:** payment submission, drawer navigation, role filtering, branch selection, and offline actions must continue to behave; keep existing workflow tests green and add only assertions that prove visual changes did not alter behavior.

### Task 1: Establish the shared token and theme contract

**Files:**
- Modify: `mobile/lib/src/task_ui.dart`
- Modify: `mobile/lib/main.dart`
- Modify: `mobile/test/task_ui_palette_test.dart`
- Test: `mobile/test/theme_contract_test.dart`

**Interfaces:**
- Produces the existing token names (`kTaskBg`, `kTaskSurface`, `kTaskInk`, `kTaskDark`, `kTaskSecondary`, `kTaskBorder`, semantic stock tokens) plus the new shared `kTaskSurfaceMuted` and `kTaskAccent` constants.
- Keeps the existing helper functions (`pageBg`, `ink`, `taskSurface`, `taskMuted`, `taskBorder`) and the `GlassCard`, `PillTabs`, `BrandLogo`, and `SoftBlobs` public APIs unchanged.

- [ ] **Step 1: Write the failing token and theme tests.**

  Add assertions for the exact approved light tokens: `#F4F6F8`, `#FFFFFF`, `#EEF2F6`, `#151821`, `#5D6878`, `#1E3A5F`, `#3D83F6`, and `#D9E0E8`; assert that the light primary button has readable text, dark mode has non-identical dark background/surface tokens, and `GlassCard` remains solid without `BackdropFilter` or a default shadow.

- [ ] **Step 2: Run the focused tests to verify the contract fails.**

  Run: `cd mobile && flutter test test/task_ui_palette_test.dart test/theme_contract_test.dart`

  Expected: FAIL because the current source still exposes the old source palette and the new token does not exist.

- [ ] **Step 3: Implement the token migration.**

  Replace the shared light/dark constants with the spec values, add `kTaskSurfaceMuted` and `kTaskAccent`, keep semantic stock colors explicit, and update `buildAnyostoreTheme()` so surfaces, text, inputs, buttons, AppBar, dialogs, and focus states derive from the shared tokens. Keep `SoftBlobs` empty and retain solid `GlassCard` behavior.

- [ ] **Step 4: Run the focused tests to verify the token contract passes.**

  Run: `cd mobile && flutter test test/task_ui_palette_test.dart test/theme_contract_test.dart`

  Expected: PASS with no test exceptions.

- [ ] **Step 5: Inspect the diff before moving on.**

  Run: `git diff -- mobile/lib/src/task_ui.dart mobile/lib/main.dart mobile/test/task_ui_palette_test.dart mobile/test/theme_contract_test.dart`

  Confirm that only shared visual tokens and their tests changed, with no API or business logic edits.

### Task 2: Restyle the app shell, AppBar, drawer, login, and account surfaces

**Files:**
- Modify: `mobile/lib/src/pos_page.dart`
- Modify: `mobile/lib/src/more_page.dart`
- Modify: `mobile/lib/src/login_page.dart`
- Modify: `mobile/lib/src/splash_page.dart`
- Modify: `mobile/lib/src/account_switcher_page.dart`
- Modify: `mobile/lib/src/profile_page.dart`
- Modify: `mobile/test/redesign_visual_test.dart`
- Test: `mobile/test/shared_shell_visual_test.dart`

**Interfaces:**
- Consumes the token/theme primitives from Task 1.
- Preserves `PosPage.requestTab`, `IndexedStack`, `MorePage` callbacks, `BranchScope`, `AuthStore`, and all existing drawer actions.

- [ ] **Step 1: Write failing shell assertions.**

  Add widget tests that render the shell at 320 px and 390 px in light and dark themes, assert the drawer exposes the current profile and active branch controls, assert the active navigation row uses the primary token, and assert no shell render exception occurs.

- [ ] **Step 2: Run the focused shell tests to verify the new assertions fail or expose current mismatches.**

  Run: `cd mobile && flutter test test/shared_shell_visual_test.dart test/redesign_visual_test.dart`

  Expected: FAIL on the new token/active-row assertions where the current shell still uses the old styling.

- [ ] **Step 3: Restyle the shell without changing navigation behavior.**

  Update AppBar background, title weight, menu affordance, drawer surface, profile header, branch selector, grouped menu rows, offline tile, login card, splash card, and profile cards. Use one blue active row, solid surfaces, thin borders, controlled radii, and 44 px controls. Remove decorative per-row color variation while retaining semantic offline and logout labels.

- [ ] **Step 4: Run the focused shell tests.**

  Run: `cd mobile && flutter test test/shared_shell_visual_test.dart test/redesign_visual_test.dart`

  Expected: PASS in both brightness modes and at narrow widths.

### Task 3: Restyle dashboard, reports, and finance around the focal metric

**Files:**
- Modify: `mobile/lib/src/dashboard_page.dart`
- Modify: `mobile/lib/src/reports_page.dart`
- Modify: `mobile/lib/src/finance_page.dart`
- Modify: `mobile/test/dashboard_page_test.dart`
- Modify: `mobile/test/redesign_visual_test.dart`
- Test: `mobile/test/analytics_visual_test.dart`

**Interfaces:**
- Consumes existing API response shapes, date filters, `BranchScope`, offline merge behavior, and `fl_chart` data.
- Produces no new API methods or data fields; only widget layout and theme changes.

- [ ] **Step 1: Write failing analytics visual assertions.**

  Add tests for a representative dashboard payload that assert the primary sales/stock metric is present, the trend chart remains present, period and branch filters remain tappable, empty data shows an explanatory action, and loading/error states retain their text and retry behavior.

- [ ] **Step 2: Run the focused analytics tests.**

  Run: `cd mobile && flutter test test/analytics_visual_test.dart test/dashboard_page_test.dart`

  Expected: FAIL only on new visual contract assertions that are not represented by the current layout.

- [ ] **Step 3: Implement the analytics restyle.**

  Recompose headers and sections so the primary metric leads, charts use the denim/blue accent sparingly, summary blocks follow data weight, and status colors remain semantic. Restyle date/branch filters, skeletons, empty/error messages, category/top-product sections, report tabs, finance summaries, and closing/report cards using the shared surface and border rules.

- [ ] **Step 4: Run the focused analytics tests in both themes.**

  Run: `cd mobile && flutter test test/analytics_visual_test.dart test/dashboard_page_test.dart`

  Expected: PASS with no exceptions and existing date/stock regression assertions intact.

### Task 4: Restyle POS, payment, history, and transaction surfaces

**Files:**
- Modify: `mobile/lib/src/pos_page.dart`
- Modify: `mobile/lib/src/payment_sheet.dart`
- Modify: `mobile/lib/src/history_tab.dart`
- Modify: `mobile/test/redesign_workflows_test.dart`
- Modify: `mobile/test/redesign_visual_test.dart`
- Test: `mobile/test/pos_visual_test.dart`

**Interfaces:**
- Preserves `CartItem`, `cartSubtotal`, `cartTotalPcs`, preview freshness, offline sync, scanner, payment payloads, and transaction callbacks.
- Uses existing `PaymentSheet` result shapes and existing product/photo data.

- [ ] **Step 1: Write failing POS visual assertions.**

  Add tests at 320 px and 390 px for the search field, category controls, product grid, cart summary, primary `Bayar` action, and four payment method labels. Assert all controls remain reachable and the existing payment workflow still returns the same payload.

- [ ] **Step 2: Run the focused POS tests.**

  Run: `cd mobile && flutter test test/pos_visual_test.dart test/redesign_workflows_test.dart`

  Expected: FAIL on new layout/token assertions while workflow tests continue to identify the unchanged payment contract.

- [ ] **Step 3: Restyle POS and payment surfaces.**

  Apply the new search/control treatment, product card hierarchy, branch/warehouse selectors, sticky cart summary, checkout button, payment method selector, amount fields, split-payment rows, and history/receipt cards. Keep product photos and real values intact; do not add mock metrics or change checkout calculations.

- [ ] **Step 4: Run focused POS and payment tests.**

  Run: `cd mobile && flutter test test/pos_visual_test.dart test/redesign_workflows_test.dart`

  Expected: PASS, including cash change, non-cash validation, split payment, and narrow viewport checks.

### Task 5: Restyle inventory, mutations, transfers, products, and stock reports

**Files:**
- Modify: `mobile/lib/src/inventory_page.dart`
- Modify: `mobile/lib/src/stock_movements_page.dart`
- Modify: `mobile/lib/src/mutation_report_page.dart`
- Modify: `mobile/lib/src/transfer_history_page.dart`
- Modify: `mobile/lib/src/products_page.dart`
- Modify: `mobile/lib/src/product_form_page.dart`
- Modify: `mobile/test/inventory_submission_test.dart`
- Modify: `mobile/test/redesign_visual_test.dart`
- Test: `mobile/test/inventory_visual_test.dart`

**Interfaces:**
- Preserves inventory submission, stock adjustment, warehouse selection, transfer, rack position, product media, variant, and permission behavior.
- Consumes the shared tokens and card/control styles from Task 1.

- [ ] **Step 1: Write failing inventory visual assertions.**

  Add tests for 320 px and 390 px in both themes that assert the stock matrix/card view, incoming/outgoing section colors, search/catalog picker, mutation cart, transfer history, product list, and product form remain reachable without overflow or exceptions.

- [ ] **Step 2: Run the focused inventory tests.**

  Run: `cd mobile && flutter test test/inventory_visual_test.dart test/inventory_submission_test.dart`

  Expected: FAIL on new surface/control assertions where current components still use old palette or spacing.

- [ ] **Step 3: Restyle the inventory family.**

  Replace ad hoc colors with shared tokens, keep green/amber incoming/outgoing as semantic accents, simplify stock cards, make catalog/photo areas clean white surfaces, and ensure filters, tables/matrices, dialogs, and edit controls keep 44 px targets and explicit labels.

- [ ] **Step 4: Run focused inventory tests.**

  Run: `cd mobile && flutter test test/inventory_visual_test.dart test/inventory_submission_test.dart`

  Expected: PASS with existing mutation and transfer behavior unchanged.

### Task 6: Restyle business and utility pages

**Files:**
- Modify: `mobile/lib/src/customers_page.dart`
- Modify: `mobile/lib/src/commissions_page.dart`
- Modify: `mobile/lib/src/cash_drawer_page.dart`
- Modify: `mobile/lib/src/promotions_page.dart`
- Modify: `mobile/lib/src/settings_page.dart`
- Modify: `mobile/lib/src/users_page.dart`
- Modify: `mobile/lib/src/link_page_settings.dart`
- Modify: `mobile/lib/src/offline_queue_page.dart`
- Modify: `mobile/lib/src/activity_log_page.dart`
- Modify: `mobile/lib/src/barcode_scanner_page.dart`
- Modify: `mobile/lib/src/ui_kit.dart`
- Test: `mobile/test/utility_pages_visual_test.dart`

**Interfaces:**
- Preserves each existing API call, form field, permission boundary, printer setting, backup action, offline queue action, and navigation destination.
- Uses the same token and component contract as Tasks 1-5.

- [ ] **Step 1: Write failing shared-page assertions.**

  Render representative customer, commission, cash drawer, settings, offline, and profile screens in both themes; assert labels, primary actions, empty/loading/error states, and no overflow at 320 px.

- [ ] **Step 2: Run the focused utility tests.**

  Run: `cd mobile && flutter test test/utility_pages_visual_test.dart`

  Expected: FAIL on newly introduced visual contract assertions only.

- [ ] **Step 3: Apply shared visual treatment.**

  Remove one-off hard-coded surface/border colors, align form/dialog/card styling, retain semantic states, and avoid adding new decorative UI. Keep page-specific hierarchy where it carries real workflow meaning.

- [ ] **Step 4: Run the focused utility tests.**

  Run: `cd mobile && flutter test test/utility_pages_visual_test.dart`

  Expected: PASS in both themes and narrow layout.

### Task 7: Full regression, visual capture, and APK verification

**Files:**
- Modify: `mobile/test/redesign_visual_test.dart`
- Modify: `mobile/test/mobile_redesign_test.dart`
- Modify: `mobile/test/tablet_navigation_test.dart`
- Modify: `mobile/test/goldens/` only if intentional output changes are reviewed
- Modify: documentation only if verification commands or known limitations change

**Interfaces:**
- Consumes all visual and workflow changes from Tasks 1-6.
- Produces verified mobile artifacts only; no IPA build.

- [ ] **Step 1: Run static analysis.**

  Run: `cd mobile && flutter analyze`

  Expected: no new analyzer errors or warnings caused by the redesign.

- [ ] **Step 2: Run the complete mobile test suite.**

  Run: `cd mobile && flutter test`

  Expected: all tests pass, including offline, inventory, payment, navigation, and existing regression tests.

- [ ] **Step 3: Capture representative light/dark screenshots if the existing harness is available.**

  Run: `cd mobile && CAPTURE_MOBILE_UI=1 flutter test test/redesign_visual_test.dart`

  Review dashboard, inventory, payment, settings, and drawer captures for hierarchy, contrast, spacing, and unintended overflow. Update goldens only after visual inspection.

- [ ] **Step 4: Build the requested release APK variants.**

  Run: `cd mobile && flutter build apk --release --split-per-abi`

  Expected: arm64, armeabi-v7a, and x86_64 APKs are generated. Do not present an old universal APK as the new result.

- [ ] **Step 5: Verify the final diff and report scope.**

  Run: `git diff --stat` and `git status --short`

  Confirm only intended Flutter UI/tests/docs changes are included, pre-existing backend/web/mobile changes remain untouched, and the final report lists any verification that could not be performed.
