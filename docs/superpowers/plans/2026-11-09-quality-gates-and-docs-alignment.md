# Quality Gates and Documentation Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the current mobile/web quality gates truthful and enforceable, add one isolated web E2E smoke test, and align stale project documentation with the active denim design system.

**Architecture:** Keep production behavior unchanged. Update stale tests to assert the current Flutter navigation/redesign contracts, add CI commands around the existing mobile/web/backend jobs, and isolate the first E2E test to the static login shell so it does not require MySQL or production API data. Use ESLint in both Node packages with narrowly scoped backend rules that catch syntax/undefined/unreachable defects without forcing a broad style rewrite.

**Tech Stack:** Flutter 3.44.6, Dart, GitHub Actions, Node.js 22, ESLint 9 flat config, Next.js 16, @playwright/test, Markdown/YAML.

**Spec:** docs/superpowers/specs/2026-11-09-quality-gates-and-docs-alignment-design.md

## Global Constraints

- Do not change POS, transaction, stock, closing, or authentication runtime behavior.
- Preserve mobile workflow scope: automatic APK workflow remains limited to main pushes that change mobile/**; pull requests still run mobile checks.
- Keep Flutter analysis continue-on-error; flutter test must be a required mobile check.
- E2E must not require production credentials, MySQL, or a live backend.
- Use #1E3A5F as the Anyostore primary design color and do not reintroduce the black/gold Luxury palette.
- Keep existing Node 20+ / Node 22 CI floors and Flutter 3.44.6.

## Review Focus

- Current owner navigation labels differ from the retired bottom-navigation test — pin the active labels and selected index in tablet_navigation_test.dart.
- The redesign focal metric is intentionally compact at the current narrow viewport — assert the supported readable size, not the retired 28px minimum.
- Warehouse menu group titles are user-facing mapped labels, not raw internal group keys — assert rendered titles.
- Prefetch only fetches products with variant_count > 0 and batches three requests — make the fixture and concurrency assertion reflect that contract.
- CI must fail on Flutter test, backend lint/test, frontend lint, and E2E failures while preserving the documented exception for Flutter analysis.

### Task 1: Align mobile regression tests and make Flutter tests a CI gate

**Files:**
- Modify: mobile/test/tablet_navigation_test.dart
- Modify: mobile/test/redesign_visual_test.dart
- Modify: mobile/test/prefetch_service_test.dart
- Modify: .github/workflows/mobile.yml
- Test: the three modified test files plus the full flutter test command

**Interfaces:**
- Consumes the active AppNavigation.forRole, MorePage group-title mapping, analytics focal metric, and PrefetchService behavior.
- Produces a mobile workflow where flutter test is required and only flutter analyze lib remains allowed to fail.

- [x] **Step 1: Update the failing assertions/fixtures**
  - Replace the retired Laporan bottom-nav expectation with the current owner labels and selected index.
  - Assert the current warehouse-facing group titles (Transaksi & Stok and Gudang) and preserve the checks that sales-management entries stay hidden.
  - Change the focal metric threshold to the current compact supported size.
  - Add variant_count: 1 to the prefetch fixture and assert the actual batch peak of three.
- [x] **Step 2: Run the affected tests**
  - Run flutter test test/tablet_navigation_test.dart test/redesign_visual_test.dart test/prefetch_service_test.dart.
  - Expected: all affected tests pass with no assertion failures.
- [x] **Step 3: Update .github/workflows/mobile.yml**
  - Remove job-level continue-on-error from the mobile check job.
  - Keep dart format required, keep flutter analyze lib step-level continue-on-error: true, and add required flutter test after dependencies are installed.
- [x] **Step 4: Run the full mobile suite**
  - Run flutter test from mobile.
  - Expected: zero failures.

### Task 2: Add backend/frontend lint gates

**Files:**
- Create: backend/eslint.config.mjs
- Modify: backend/package.json
- Modify: backend/package-lock.json
- Modify: .github/workflows/ci.yml
- Test: local backend lint and frontend lint commands

**Interfaces:**
- Produces npm run lint in backend and invokes both package lint commands from CI.
- Backend lint covers src/**/*.js, scripts/**/*.js, and test/**/*.js with syntax/undefined/unreachable correctness rules and an intentional low-noise warning policy for legacy unused variables.

- [x] **Step 1: Add the backend lint dependency and script**
  - Add ESLint 9 as a backend dev dependency and the lint script to backend package scripts.
- [x] **Step 2: Add the backend flat config**
  - Configure CommonJS globals and ignore generated/runtime directories.
  - Enable parser/correctness rules compatible with the current backend style; do not require a wholesale formatting rewrite.
- [x] **Step 3: Run backend lint and fix only actionable lint errors**
  - Run npm run lint from backend.
  - Expected: exit 0 with no errors; warnings are allowed only where explicitly configured.
- [x] **Step 4: Add frontend lint to CI and retain the existing backend test/audit order**
  - Run npm run lint in the frontend job after npm ci and before build.
  - Run npm run lint in the backend job after npm ci and before tests.
- [x] **Step 5: Validate both package lint commands locally**
  - Run backend npm run lint and frontend npm run lint.

### Task 3: Add an isolated Playwright web smoke test

**Files:**
- Modify: frontend/package.json
- Modify: frontend/package-lock.json
- Create: frontend/playwright.config.js
- Create: frontend/e2e/login-smoke.spec.js
- Modify: .github/workflows/ci.yml
- Test: npm run e2e from frontend

**Interfaces:**
- Produces an e2e npm script using playwright test and a Playwright config that starts Next dev on a local port.
- The smoke test covers the login page render and Password to PIN mode switch using no backend request.

- [x] **Step 1: Add the Playwright dependency/config and smoke test**
  - Add @playwright/test as a frontend dev dependency.
  - Configure baseURL and a local webServer using npm run dev -- --hostname 127.0.0.1 --port 3100.
  - Assert the login heading, username/password fields, and PIN-mode switch.
- [x] **Step 2: Install Chromium and run the smoke test locally**
  - Run npx playwright install chromium once if needed, then npm run e2e.
  - Expected: the smoke test passes.
- [x] **Step 3: Add the E2E CI steps**
  - Install Chromium in the frontend job and run npm run e2e before the production build.

### Task 4: Align documentation and design-system source of truth

**Files:**
- Modify: docs/README.md
- Modify: design-system/anyostore/MASTER.md
- Test: existing docs/workflow checks plus a source-level consistency check if needed

**Interfaces:**
- Documentation states 49 database tables and 159 API handlers/endpoints according to the current audit baseline.
- MASTER design tokens and component examples use the denim palette from DESIGN.md and no longer describe Anyostore as a black/gold Luxury/Premium brand.

- [x] **Step 1: Update the stale README counts and descriptions**
  - Replace 47 with 49 and 167 with 159 only in the affected metadata/TOC descriptions.
- [x] **Step 2: Replace the stale MASTER palette and brand direction**
  - Align primary, secondary, accent, background, text, typography, button, input-focus, and style guidance with DESIGN.md.
  - Preserve useful spacing/shadow/accessibility rules that do not conflict.
- [x] **Step 3: Run Markdown/source consistency checks**
  - Search for the old black/gold tokens and stale count strings in the targeted files.
  - Expected: no stale references remain in docs/README.md or design-system/anyostore/MASTER.md.

### Task 5: Full verification and handoff

**Files:**
- Test: mobile, backend, frontend, E2E, workflow YAML, and production build commands

- [x] **Step 1: Run full backend validation**
  - npm run lint, npm test -- --test-concurrency=1, and npm audit --omit=dev from backend.
- [x] **Step 2: Run full frontend validation**
  - npm run lint, existing Node regression tests, npm run e2e, and npm run build from frontend.
- [x] **Step 3: Run full mobile validation**
  - dart format --set-exit-if-changed lib, flutter analyze lib, and flutter test from mobile.
- [x] **Step 4: Run workflow/config tests and inspect the final diff**
  - Run node --test scripts/deploy/test/*.test.cjs and git diff --check.
  - Confirm the worktree contains only the intended test/CI/docs/config changes.
- [x] **Step 5: Report exact results and any remaining non-blocking warnings**
