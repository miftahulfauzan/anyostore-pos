# Stok Masuk/Keluar Quick-Operations Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the mobile Stok Masuk and Stok Keluar screens so product selection and cart work are the primary actions while warehouse/date metadata stays compact and visible.

**Architecture:** Keep one shared `_InOutForm` and `_CatalogPicker` flow, changing layout rather than duplicating incoming/outgoing screens. Use a compact metadata strip, a 3-column catalog, an expandable cart bottom panel, and a sticky save action; preserve existing APIs, item editing, semantic colors, and validation.

**Tech Stack:** Flutter, Material widgets, existing `GlassCard`/`UiTaskBody`, `CachedNetworkImage`-backed product media, Flutter widget tests.

**Spec:** User-approved “operasional cepat” concept in the conversation on 2026-11-05.

## Global Constraints

- Keep the denim header `#1E3A5F` and existing Plus Jakarta Sans theme.
- Incoming remains green (`kTaskTeal`); outgoing remains orange (`kTaskTerracotta`).
- Preserve editable quantities, incoming purchase cost, batch, notes, warehouse, date, channel, and existing submit payloads.
- Keep the 3-column product grid and avoid adding dependencies.
- The date label must not be clipped when metadata details are expanded.

## Review Focus

- Empty cart: save remains disabled/validated and the compact cart does not consume the catalog area.
- Long warehouse/product names: metadata and cards ellipsize without hiding the date or action controls.
- Incoming vs outgoing: only the semantic accent, channel field, and cost field differ.
- Keyboard and small phone widths: search, cart, and sticky save remain reachable.
- Existing cart edits/deletes: selected items retain quantity and cost editing behavior.

### Task 1: Compact shared form shell

**Files:**
- Modify: `mobile/lib/src/inventory_page.dart`
- Test: `mobile/test/inventory_visual_test.dart`

- [ ] Add failing widget assertions for compact metadata, visible date, 3-column catalog, cart panel, and sticky save action.
- [ ] Run the focused inventory visual test and confirm the new layout assertions fail before implementation.
- [ ] Replace the large metadata/banner stack with a compact context strip while preserving all fields in the expandable details panel.
- [ ] Keep the shared `_CatalogPicker` as the product-selection route and keep its incoming/outgoing accent behavior.
- [ ] Run focused inventory tests and then the related submission tests.

### Task 2: Cart interaction and layout regression

**Files:**
- Modify: `mobile/lib/src/inventory_page.dart`
- Test: `mobile/test/inventory_submission_test.dart`

- [ ] Add/adjust tests for opening the cart, editing quantity/cost, deleting an item, and returning selected items to the form.
- [ ] Run the tests red if a behavior is missing.
- [ ] Implement the compact cart panel/bottom-sheet presentation without changing the existing selected-item data contract.
- [ ] Run the focused submission and visual tests.

### Task 3: Verification and APK handoff

- [ ] Run the combined opname, inventory, transfer, and analytics tests.
- [ ] Run `git diff --check`.
- [ ] Build split-per-ABI release APKs.
- [ ] Install the arm64 APK on the connected Android device and report the artifact path.
