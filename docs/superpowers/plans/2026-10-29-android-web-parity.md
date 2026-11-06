# Android Web Parity Implementation Plan

> **For agentic workers:** execute the tasks inline; preserve all existing workspace changes.

**Goal:** Bring the Android Flutter app in line with the recent web POS, finance, and reporting behavior, then build an Android APK.

**Architecture:** Reuse existing Flutter pages and `ApiClient` contracts. Keep server pricing authoritative, send transaction business dates and discounts through existing API fields, and preserve offline queue behavior. Do not change iOS project settings or produce an IPA.

**Tech Stack:** Flutter/Dart, existing Express API, Android Gradle.

**Spec:** `docs/mobile-redesign.md`, recent web changes in `frontend/app/` and `backend/src/routes/`.

## Global Constraints
- Keep the existing local Flutter redesign and unrelated changes intact.
- Preserve server-calculated tier pricing, payment reconciliation, owner-only date editing, and offline transactions.
- Build Android APK only; no IPA/iOS archive.
- Do not run tests in this task.

## Review Focus
- Manual discount must match server preview, checkout, and offline totals.
- Split payment amounts must sum exactly to the amount due.
- Business date changes must not alter actual record timestamp.
- Owner branch scope must not leak data between branches.
- Finance description and notes must remain optional and offline-safe.

### Task 1: POS and transaction history
- Update `mobile/lib/src/pos_page.dart` for manual transaction discount and owner business-date selection; send matching preview/checkout/offline payloads.
- Update `mobile/lib/src/payment_sheet.dart` so selecting multiple methods creates one amount input per selected method and validates the exact total.
- Update `mobile/lib/src/api_client.dart` and `mobile/lib/src/history_tab.dart` to show business date and let owners edit it through `PUT /transactions/:id/date`.

### Task 2: Finance and reports
- Update `mobile/lib/src/finance_page.dart` to show only income/expense workflows, remove the summary block, and allow an optional description plus optional notes.
- Update `mobile/lib/src/reports_page.dart` to expose available report detail: daily sales, payment methods, products, cashier/customer summaries, and transactions, including discounts/refunds where returned by the API.
- Preserve selected-branch filtering and offline cache behavior.

### Task 3: Android artifact
- Run an Android release APK build using a temporary build directory outside OneDrive.
- Report build result and APK path; do not commit, push, deploy, or build IPA unless separately requested.
