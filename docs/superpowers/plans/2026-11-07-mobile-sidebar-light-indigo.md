# Mobile Sidebar Light Indigo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the selected Light Indigo visual redesign to the Android drawer without changing its UX.

**Architecture:** Keep all menu construction and callbacks in `MorePage`. Add sidebar-only design tokens in `task_ui.dart`, use them in the `Drawer` shell in `PosPage`, and restyle the existing profile, group, row, utility, and logout widgets in place.

**Tech Stack:** Flutter, Material widgets, existing Anyostore theme tokens, Flutter widget tests.

**Spec:** `docs/superpowers/specs/2026-11-07-mobile-sidebar-light-indigo-design.md`

## Global Constraints

- Preserve menu labels, order, role filtering, expansion behavior, callbacks, and routes.
- Keep portrait mobile layout and existing drawer width behavior.
- Support both light and dark themes.
- Do not add dependencies.

## Review Focus

- Active row remains visually identifiable for owner and warehouse roles.
- Group cards become a flat grouped list without changing expandable behavior.
- Drawer remains readable at 320 px in both themes.
- Logout and offline utilities remain reachable and tappable.
- Existing navigation tests continue to exercise the same callbacks and labels.

### Task 1: Lock the visual contract with tests

**Files:**
- Modify: `mobile/test/shared_shell_visual_test.dart`

- [ ] Add assertions for the Light Indigo drawer surface, soft active-row surface, profile shell, flat group shell, and compact icon treatment.
- [ ] Run the targeted test and observe the expected failure against the current card-based drawer.

### Task 2: Add sidebar tokens and apply the visual redesign

**Files:**
- Modify: `mobile/lib/src/task_ui.dart`
- Modify: `mobile/lib/src/pos_page.dart`
- Modify: `mobile/lib/src/more_page.dart`

- [ ] Add light sidebar background, icon surface, active surface, and divider tokens with dark fallbacks.
- [ ] Apply the drawer background and rounded right edge without changing its width.
- [ ] Replace the visual treatment of profile, utility tiles, group wrappers, rows, dividers, and logout while keeping all callbacks and labels intact.

### Task 3: Verify

**Files:**
- No new files.

- [ ] Run the focused sidebar test and relevant mobile visual tests.
- [ ] Run analyzer on changed files and `git diff --check`.
