# Mobile Thermal Receipt Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement task by task.

**Goal:** Make Android native ESC/POS receipts match the approved second photo: centered logo, structured transaction/product/payment blocks, and a reliable feed before cutting.

**Architecture:** Keep text as ESC/POS commands for sharp output. Resolve `invoice_logo` with `store_logo` fallback, send it as a centered image with native width limiting, then print the structured `ReceiptLayout`. Feed four lines explicitly before `cutPaper`.

**Tech Stack:** Flutter/Dart, local Bluetooth ESC/POS plugin, Flutter unit tests.

**Spec:** `docs/superpowers/specs/2026-11-07-mobile-thermal-receipt-design.md`

## Global Constraints

- Support both 58mm and 80mm output.
- Do not change checkout or receipt API data contracts.
- Logo download/decoding failure must fall back to text-only printing.
- Preserve chunked Bluetooth writes already used to prevent truncated payloads.

## Review Focus

- Logo is optional and never prevents printing.
- `print(feedLines: 4)` occurs before `cutPaper`.
- Product and payment rows stay within the selected paper width.
- Existing printer tests and non-receipt print jobs remain green.

### Task 1: Receipt layout contract

**Files:** `mobile/lib/src/receipt_layout.dart`, `mobile/test/receipt_layout_test.dart`

- [ ] Add failing tests for section order, transaction date, product rows, Total/Dibayar/Kembalian, and footer.
- [ ] Run the focused test and confirm the old layout fails the new contract.
- [ ] Implement the photo-two text layout with width-safe pairs and local date formatting.
- [ ] Run the focused layout tests.

### Task 2: Native logo and cutter sequence

**Files:** `mobile/lib/src/printer_service.dart`, local ESC/POS plugin, `mobile/test/printer_service_test.dart`

- [ ] Add failing printer tests for optional logo bytes and feed-before-cut ordering.
- [ ] Run the tests red.
- [ ] Add injectable logo loading, native width limiting, image output, and explicit feed before cut.
- [ ] Run focused printer/layout tests.

### Task 3: Release verification

- [ ] Run focused and full relevant Flutter tests plus `git diff --check`.
- [ ] Bump Android version code and build split-ABI APKs.
- [ ] Install arm64 only if ADB detects the phone.
