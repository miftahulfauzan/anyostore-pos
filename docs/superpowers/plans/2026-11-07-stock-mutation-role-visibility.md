# Stock Mutation Role Visibility Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement task by task.

**Goal:** Show Stok Masuk and Stok Keluar only to owner and admin gudang in the web and Android apps, with matching direct-access/API guards.

**Architecture:** Reuse the existing role model (`owner`, `gudang`, `manager`, `admin`, `kasir`). Centralize the allowed-role predicate where practical, filter web/Android navigation, and protect mutation write endpoints with the same policy. Shared read catalog/target endpoints remain available for transfer/history flows.

**Tech Stack:** Express, Next.js client components, Flutter/Dart, Node/Flutter tests.

**Spec:** `docs/superpowers/specs/2026-11-07-stock-mutation-role-visibility-design.md`

## Global Constraints

- Allowed roles are exactly `owner` and `gudang`.
- Keep transfer, opname, and mutation history behavior unchanged.
- Do not change stock or transaction payloads.
- Preserve the existing drawer and AppShell UX for allowed roles.

## Review Focus

- No stale shortcut or selector exposes the input pages to manager/admin/kasir.
- Direct web page access and API calls cannot bypass the UI filter.
- Owner and gudang retain their current branch/warehouse behavior.

### Task 1: Backend authorization

**Files:** `backend/src/routes/inventory.js`, backend authorization test

- [ ] Add failing tests for allowed and denied roles on incoming/outgoing write endpoints and channel management.
- [ ] Run the focused backend test and confirm the current broad authorization fails it.
- [ ] Restrict only incoming/outgoing write and channel-management endpoints to owner/gudang; preserve shared read endpoints.
- [ ] Run the focused backend tests.

### Task 2: Web navigation and direct access

**Files:** `frontend/app/components/AppShell.js`, mutation page, incoming/outgoing wrappers, frontend regression test

- [ ] Add failing static tests for menu role lists and direct-page guard.
- [ ] Run them red.
- [ ] Filter menu entries and redirect/deny unauthorized page renders.
- [ ] Run frontend focused tests.

### Task 3: Android navigation and selector

**Files:** `mobile/lib/src/inventory_page.dart`, `mobile/lib/src/more_page.dart`, `mobile/lib/src/pos_page.dart`, Android tests

- [ ] Add failing widget tests for the four role cases.
- [ ] Run them red.
- [ ] Hide incoming/outgoing from non-allowed drawer/selector/shortcut paths and guard initial sections.
- [ ] Run focused Android tests.

### Task 4: Integrated release verification

- [ ] Run backend/frontend/mobile relevant suites and `git diff --check`.
- [ ] Build the new split-ABI APK after the receipt and role changes.
- [ ] Install the arm64 artifact only when the phone is connected.
