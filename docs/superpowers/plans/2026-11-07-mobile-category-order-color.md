# Mobile Category Order and Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist category order and colors, expose them through the category/product APIs, and let the Android app edit and use them.

**Architecture:** Add one nullable category color column and a strict server-side validator. Extend the existing category client with reorder and color-aware methods. Put the preset palette/fallback logic in a small shared mobile helper so Settings and POS use the same visual rules.

**Tech Stack:** Express, MySQL migrations, Flutter/Dart, Flutter widget tests, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-07-mobile-category-order-color-design.md`

## Global Constraints

- Do not edit an already-run migration; add `backend/migrations/20261107_category_color.sql`.
- Keep category permissions on the existing owner/manager/admin/gudang authorization path.
- Keep old categories with null colors functional through a POS fallback color.
- Do not change cart or checkout behavior.
- Keep touch targets at least 44dp and show an explicit loading/error state for async saves.
- Preserve the existing mobile app versioning and split-ABI release workflow.

## Review Focus

- Invalid or blank color input must be rejected/normalized by the backend without SQL injection risk — cover in the backend color validator test.
- A failed reorder must restore the previous mobile order — cover in the category settings widget test.
- A failed color update must restore the previous color — cover in the category settings widget test.
- Categories with no stored color must still render the existing fallback accent — cover in the POS visual test.
- Server-provided category order must beat alphabetical order in POS — cover in the POS visual test.

---

### Task 1: Category color contract and migration

**Files:**
- Create: `backend/migrations/20261107_category_color.sql`
- Create: `backend/src/category-color.js`
- Create: `backend/test/category-color.test.js`
- Modify: `backend/src/routes/products.js`
- Modify: `backend/schema.sql`

**Interfaces:**
- Produces `normalizeCategoryColor(value)` returning uppercase `#RRGGBB` or `null`, throwing a 400-style error for invalid values.
- Category APIs expose and accept `color`.

- [ ] **Step 1: Write the failing validator tests** for null/blank, lowercase valid hex, and invalid values.
- [ ] **Step 2: Run `node --test backend/test/category-color.test.js` and verify the missing helper fails.**
- [ ] **Step 3: Implement the validator, additive migration, and route/schema fields.**
- [ ] **Step 4: Run the validator test and the relevant backend test suite; verify valid input is normalized and invalid input returns the intended 400 path.**

### Task 2: Mobile category API and shared visual tokens

**Files:**
- Create: `mobile/lib/src/category_visuals.dart`
- Modify: `mobile/lib/src/api_client.dart`
- Modify: `mobile/test/settings_category_test.dart`

**Interfaces:**
- Produces `categoryColorPresets`, `categoryColorFor({name, storedHex})`, and `categoryColorHex(Color)` helpers.
- Produces `ApiClient.reorderCategories(List<int>)`, and color-aware `createCategory`/`updateCategory` methods.

- [ ] **Step 1: Add failing unit/widget expectations for preset parsing and the new fake API signatures.**
- [ ] **Step 2: Run the focused Flutter test and verify it fails because the shared helper/API methods do not exist.**
- [ ] **Step 3: Implement the shared palette/fallback helpers and the API methods, including JSON PATCH.**
- [ ] **Step 4: Run the focused Flutter tests and verify they pass.**

### Task 3: Settings drag-and-drop and color editor

**Files:**
- Modify: `mobile/lib/src/category_settings_card.dart`
- Test: `mobile/test/settings_category_test.dart`

**Interfaces:**
- Consumes `ApiClient.reorderCategories`, color-aware category CRUD, and shared visual helpers from Task 2.
- Produces a compact reorderable category list with a palette button and preset swatches.

- [ ] **Step 1: Add failing widget tests for dragging category rows and selecting a color; assert API calls and visible order/color.**
- [ ] **Step 2: Run the settings test and verify the new interactions fail.**
- [ ] **Step 3: Implement optimistic reorder/color saves with rollback, loading guard, semantic swatch labels, and compact touch-safe controls.**
- [ ] **Step 4: Run `flutter test test/settings_category_test.dart --no-pub` and verify all settings tests pass.**

### Task 4: POS consumes server order and color

**Files:**
- Modify: `mobile/lib/src/pos_page.dart`
- Test: `mobile/test/pos_visual_test.dart`

**Interfaces:**
- Consumes `category_color` and `category_sort_order` product fields from the API.
- Uses Task 2's shared fallback helper when fields are absent.

- [ ] **Step 1: Add failing POS tests for server order, stored color, and null-color fallback.**
- [ ] **Step 2: Run the POS visual test and verify the new assertions fail.**
- [ ] **Step 3: Implement category metadata collection/sorting and replace the private color heuristic with the shared helper.**
- [ ] **Step 4: Run the focused POS/settings tests and verify they pass without changing cart behavior.**

### Task 5: Release verification

**Files:**
- Modify: `mobile/pubspec.yaml`
- Create/modify: plan ledger under `.superpowers/sdd/`

- [ ] **Step 1: Run `git diff --check`, backend tests, focused Flutter tests, and analyzer.**
- [ ] **Step 2: Bump the Android version code by one and build split-ABI release APKs.**
- [ ] **Step 3: Verify the APK output names and, if the phone is connected, install only the new arm64 artifact.**
- [ ] **Step 4: Record any unrelated existing failures without claiming them as regressions.**
