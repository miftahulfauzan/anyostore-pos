# Receipt Header Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add flexible multiline contact notes to native Android receipt headers, allow invoice-logo removal, and print a smaller logo without changing transaction calculations.

**Architecture:** Reuse the existing `store_settings` key-value table with a new `receipt_contacts` key, expose it through the existing settings API and Android Settings page, and render it through the existing `ReceiptLayout`. Add a dedicated settings DELETE endpoint for `invoice_logo`; the printer continues to consume the same receipt payload and only changes its logo width cap.

**Tech Stack:** Express/Node 20, MySQL key-value settings, Flutter/Dart, ESC/POS over `bluetooth_print_plus`, Node test runner, Flutter test.

**Spec:** `docs/superpowers/specs/2026-11-08-receipt-header-contacts-design.md`

## Global Constraints

- Do not add a database migration; `store_settings` already supports arbitrary keys.
- Keep transaction items, prices, totals, payments, barcode labels, and checkout behavior unchanged.
- Print each contact note as one centered line or wrapped multiline text in the receipt header.
- Invoice logo removal is limited to `invoice_logo`; application logo must remain unaffected.
- Increase Android `versionCode` before producing the release APK.
- Build Android with `flutter build apk --release --split-per-abi`; do not deliver the old universal APK.

## Review Focus

- Empty or whitespace-only contact notes must not add blank receipt lines — covered by the receipt layout test.
- Multiple contact lines and long contact text must wrap within 58 mm/80 mm widths — covered by the receipt layout test.
- A receipt with no logo must print normally — covered by the existing printer-service test and logo-removal flow.
- Deleting an invoice logo must not delete the application logo — covered by the backend route test.
- A compact logo must use the correct width for both printer sizes — covered by the printer-service test.

---

### Task 1: Settings API for contacts and invoice-logo removal

**Files:**
- Modify: `backend/src/routes/settings.js`
- Test: `backend/test/settings-logo.test.js`

**Interfaces:**
- Produces accepted setting key `receipt_contacts`.
- Produces `DELETE /api/settings/logo?key=invoice_logo` for owner/manager/admin, returning `{ success: true, data: { key: 'invoice_logo' } }` after removing the setting and stored media.

- [x] **Step 1: Write failing route-contract tests**
  - Assert `receipt_contacts` is in the allowed settings set or route source.
  - Assert the settings router exposes a DELETE `/logo` route and restricts it to `owner`, `manager`, and `admin`.
  - Assert the route distinguishes `invoice_logo` from `store_logo`.
- [x] **Step 2: Run `node --test test/settings-logo.test.js` and confirm it fails for the missing key/route.**
- [x] **Step 3: Implement the minimal backend behavior**
  - Add `receipt_contacts` to `allowed`.
  - Add `router.delete('/logo', authorize('owner','manager','admin'), ...)`, resolve the branch with `branchId(req)`, validate `key === 'invoice_logo'`, delete the key, and call `removeMedia` only for the prior `/uploads/logos/` path.
- [x] **Step 4: Run the focused test and the backend suite.**
  - Run: `node --test test/settings-logo.test.js`
  - Run: `npm test -- --test-concurrency=1`
- [x] **Step 5: Included in commit `b4d656e` with the receipt implementation.**

### Task 2: Android settings controls and receipt rendering

**Files:**
- Modify: `mobile/lib/src/api_client.dart`
- Modify: `mobile/lib/src/settings_page.dart`
- Modify: `mobile/lib/src/receipt_layout.dart`
- Modify: `mobile/lib/src/printer_service.dart`
- Test: `mobile/test/receipt_layout_test.dart`
- Test: `mobile/test/printer_service_test.dart`

**Interfaces:**
- `ApiClient.deleteInvoiceLogo()` calls `/settings/logo?key=invoice_logo`.
- `receipt_contacts` is loaded/saved as a string by `SettingsPage`.
- `ReceiptLayout.build()` renders `receipt_contacts` after the store phone and before the transaction separator.
- `_receiptLogoMaxWidth()` returns `180` for 58 mm and `260` for 80 mm.

- [x] **Step 1: Write failing Flutter tests**
  - Add a receipt layout test with two WA lines and an Instagram line; assert all lines are present, SKU is absent, and every line fits the printer width.
  - Add a printer-service test with a logo and assert `image.maxWidth` is 180 for 58 mm and 260 for 80 mm.
- [x] **Step 2: Run the focused Flutter tests and confirm the new assertions fail.**
- [x] **Step 3: Implement the minimal Android changes**
  - Add the API helper.
  - Add `_receiptContacts` controller, lifecycle disposal, load/save mapping, a multiline field labeled `Kontak kepala nota`, and `Hapus Logo Invoice` action with refresh and user feedback.
  - Render the new multiline setting in `ReceiptLayout`.
  - Reduce only the receipt-logo width cap; keep barcode label sizing unchanged.
- [x] **Step 4: Run `dart format` and the focused tests.**
  - Run: `dart format lib/src/api_client.dart lib/src/settings_page.dart lib/src/receipt_layout.dart test/receipt_layout_test.dart test/printer_service_test.dart`
  - Run: `flutter test test/receipt_layout_test.dart test/printer_service_test.dart`
- [x] **Step 5: Included in commit `b4d656e` with the receipt implementation.**

### Task 3: Full verification and APK release

**Files:**
- Modify: `mobile/pubspec.yaml`

- [x] **Step 1: Increase `version` from the current build to the next patch build number.**
- [x] **Step 2: Run relevant static/frontend/backend tests and `git diff --check`.**
- [x] **Step 3: Build the release APKs.**
  - Run: `flutter build apk --release --split-per-abi`
- [x] **Step 4: Verify each APK exists, has the new version code, and record SHA-256 hashes.**
- [x] **Step 5: Commit the release metadata and implementation in `b4d656e`.**

## Verification notes

- Backend focused tests: 3/3 passed; full backend suite passed with exit code 0.
- Android focused receipt/API tests: 13/13 passed; targeted analyzer reported no issues; `git diff --check` passed.
- The full Flutter suite still reports 9 existing navigation/visual regression failures in unrelated tests; receipt/API focused tests remain green.
- APKs: arm64 version code 6060, armeabi-v7a 5060, x86_64 8060; package `com.anyostore.pos_pakaian_mobile`.
