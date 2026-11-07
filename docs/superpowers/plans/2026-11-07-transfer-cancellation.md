# Transfer Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe “Batalkan Transfer” action that reverses completed stock transfers atomically and exposes the action in web and Android transfer history for owner/gudang only.

**Architecture:** Keep the original `stock_transfers` row and mark it `cancelled`. The backend locks the transfer and items, reverses source and destination balances through `adjustStock()`, records reversal mutations with `reference_type = 'transfer_cancel'`, and stores cancellation metadata in the same transaction. Web and Android call one authenticated endpoint and refresh the existing history list after confirmation.

**Tech Stack:** Express, MySQL 8.4, Node test runner, Next.js/React, Flutter/Dart widget tests.

**Spec:** `docs/superpowers/specs/2026-11-07-transfer-cancellation-design.md`

## Global Constraints

- Only `owner` and `gudang` can cancel transfers; manager, admin, and kasir remain read-only.
- Only `completed` transfers are cancellable; cancelled records are retained for audit and cannot be cancelled twice.
- Stock changes must use the existing `adjustStock()` path and one database transaction.
- Destination stock must be sufficient to reverse the transfer; any failure rolls back both sides.
- Do not delete transfer records, products, variants, or create a second user-visible transfer.
- Add a new migration; never edit an already-applied migration.
- Android remains portrait-only and keeps the existing drawer navigation.

## Review Focus

- A cross-store transfer must reverse destination product/variant IDs, not source IDs — covered by backend movement mapping tests.
- A same-branch transfer must reverse both warehouses without changing catalog identity — covered by backend same-branch movement tests.
- A destination that no longer has enough stock must leave source and destination unchanged — covered by the route transaction/rollback test contract and backend route assertions.
- A repeated cancellation must return conflict and never create another reversal — covered by status/endpoint tests.
- A user outside owner/gudang must see no cancel control and receive authorization denial — covered by backend, web, and Android permission tests.

---

### Task 1: Backend cancellation endpoint and stock reversal

**Files:**
- Create: `backend/src/transfer-cancellation.js`
- Create: `backend/migrations/20261107_transfer_cancellation.sql`
- Create: `backend/test/transfer-cancellation.test.js`
- Modify: `backend/src/permissions.js`
- Modify: `backend/src/routes/inventory-control.js`
- Modify: `backend/schema.sql`

**Interfaces:**
- `TRANSFER_CANCELLATION_ROLES: readonly string[]` contains `owner` and `gudang`.
- `canCancelTransfer(user, transfer): boolean` checks role and gudang scope (source branch, destination branch, or creator).
- `buildTransferCancellationMovements(transfer, items, reason): Array<{side,branchId,warehouseId,productId,variantId,delta,referenceType,referenceId,notes}>` returns source-positive and destination-negative reversal movements using destination mappings when present.
- `POST /api/inventory-control/transfers/:id/cancel` accepts `{reason?: string}` and returns `{success:true,data:{id,status:'cancelled'}}`.

- [ ] **Step 1: Write failing backend tests** for role constants, same-branch reversal mapping, inter-store destination mapping, repeated cancellation status, and the cancel route’s owner/gudang authorization.
- [ ] **Step 2: Run the focused test** with `node --test backend/test/transfer-cancellation.test.js`; verify it fails before implementation.
- [ ] **Step 3: Add the migration and fresh-schema fields** `cancelled_by`, `cancelled_at`, and `cancellation_reason` to `stock_transfers`, preserving existing status values.
- [ ] **Step 4: Implement the pure cancellation policy/movement builder** in `backend/src/transfer-cancellation.js` and export the owner/gudang role list from `backend/src/permissions.js`.
- [ ] **Step 5: Implement the authenticated cancellation route** in `backend/src/routes/inventory-control.js`: lock the transfer/items, enforce scope/status, reverse each movement via `change()`/`adjustStock()`, write an activity log, update cancellation metadata, commit on success, and rollback on every error.
- [ ] **Step 6: Extend transfer history response** with cancellation metadata while keeping original transfer detail mutations unchanged.
- [ ] **Step 7: Run the focused backend tests** and then the complete backend suite; verify all pass.
- [ ] **Step 8: Commit** the backend implementation with `feat: add transfer cancellation endpoint`.

### Task 2: Web transfer history action

**Files:**
- Create: `frontend/test/transfer-cancellation-ui.test.cjs`
- Modify: `frontend/app/inventory/transfers/page.js`

**Interfaces:**
- `TransferHistory` receives `canCancelTransfer` and `onCancel` props.
- The page calls `POST /inventory-control/transfers/:id/cancel` with `{reason}` and reloads the current history filters/page after success.

- [ ] **Step 1: Write failing static UI tests** asserting the button is limited to `completed` rows and owner/gudang, posts the optional reason, and refreshes after success.
- [ ] **Step 2: Run the focused frontend test** with `node --test frontend/test/transfer-cancellation-ui.test.cjs`; verify it fails before implementation.
- [ ] **Step 3: Add the web cancel callback** with confirmation, optional reason prompt, API error handling, and a refresh of the current history page.
- [ ] **Step 4: Render `Batalkan transfer`** on eligible history cards and show cancellation reason when returned by the API; preserve all existing rows/details for cancelled records.
- [ ] **Step 5: Run the focused frontend test and frontend test suite**; verify they pass.
- [ ] **Step 6: Commit** with `feat: add web transfer cancellation action`.

### Task 3: Android transfer history action

**Files:**
- Create: `mobile/test/transfer_history_cancellation_test.dart`
- Modify: `mobile/lib/src/api_client.dart`
- Modify: `mobile/lib/src/more_page.dart`
- Modify: `mobile/lib/src/transfer_history_page.dart`

**Interfaces:**
- `ApiClient.cancelTransfer(int id, {String reason = ''})` posts to `/inventory-control/transfers/:id/cancel`.
- `TransferHistoryPage({required ApiClient api, String? role})` exposes the action only when `role` is `owner` or `gudang` and the row status is `completed`.

- [ ] **Step 1: Write failing widget/API tests** for endpoint payload, owner/gudang button visibility, non-owner hiding, confirmation reason, and history refresh.
- [ ] **Step 2: Run `flutter test mobile/test/transfer_history_cancellation_test.dart`**; verify it fails before implementation.
- [ ] **Step 3: Add `ApiClient.cancelTransfer`** using the existing JSON `post` helper.
- [ ] **Step 4: Add the Android confirmation dialog** with optional reason, error display, cancel action, and reload after a successful cancellation.
- [ ] **Step 5: Pass the authenticated role from both `MorePage` transfer-history entry points** and render the action on eligible cards.
- [ ] **Step 6: Run the focused widget test and `flutter analyze`**; verify no analyzer errors and all focused tests pass.
- [ ] **Step 7: Commit** with `feat: add Android transfer cancellation action`.

### Task 4: Release verification

**Files:**
- Modify: `.superpowers/sdd/2026-11-07-transfer-cancellation/progress.md`

- [ ] **Step 1: Record task progress and test evidence** in the SDD ledger after each task; keep the identity line intact.
- [ ] **Step 2: Run backend, frontend, and focused mobile checks** together and inspect failures rather than masking unrelated regressions.
- [ ] **Step 3: Run the production web build and a release Android compile check** if dependencies/toolchain are available; do not deploy or install without a separate user request.
- [ ] **Step 4: Review the diff** for migration safety, permission scope, atomic rollback, and accidental changes outside transfer cancellation.
- [ ] **Step 5: Commit** the final verification/ledger update with `chore: verify transfer cancellation`.

