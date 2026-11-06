# POS Cart Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recompose the Android POS cart UI to match the approved Anyostore denim mockup without changing checkout behavior.

**Architecture:** Keep `_CartSheet` and `_CartLine` in `mobile/lib/src/pos_page.dart`; change layout and styling in place. Existing callbacks remain the source of truth for customer, discount, hold/resume, qty edit, removal, and payment.

**Tech Stack:** Flutter, Material widgets, existing Anyostore task UI tokens, widget tests.

**Spec:** `docs/superpowers/specs/2026-11-06-pos-cart-redesign-design.md`

## Global Constraints

- Keep `applicationId` `com.anyostore.pos_pakaian_mobile`.
- Do not add a backend endpoint or change transaction payloads.
- Keep qty keyboard editing and all existing cart callbacks functional.
- Use denim `#1E3A5F` for the cart header and existing theme tokens for dark mode.

## Review Focus

- Large text at 320px must keep the Pay button reachable.
- Dark mode must keep header, rows, inputs, and footer readable.
- Long product names and large totals must not overflow.
- Collapsed options must preserve customer, discount, hold/resume, and date controls.
- Empty and invalid discount states must keep their current disabled-payment behavior.

### Task 1: Lock cart surface behavior

**Files:**
- Modify: `mobile/test/pos_visual_test.dart`
- Test: existing POS widget tests

- [ ] Add assertions for the denim cart header, compact action labels, aligned total, and sticky `Bayar` action.
- [ ] Run the focused test and confirm it fails against the current cart layout.

### Task 2: Implement the cart layout

**Files:**
- Modify: `mobile/lib/src/pos_page.dart:1723-2165`

- [ ] Replace the current title/options presentation with a denim header, customer row, item table header, compact action tray, and footer summary.
- [ ] Keep `_QtyInput`, callbacks, discount validation, error text, and payment callback unchanged.
- [ ] Keep options collapsed by default and place less-common controls behind the existing options interaction.
- [ ] Run `dart format` and the focused POS tests.

### Task 3: Verify and package

**Files:**
- Modify: `mobile/pubspec.yaml` only if the APK version must increase.

- [ ] Run the focused POS widget tests and cart totals tests.
- [ ] Run Flutter analyze on `pos_page.dart`.
- [ ] Build split APKs and verify the arm64 artifact metadata.
- [ ] Run `git diff --check`.

