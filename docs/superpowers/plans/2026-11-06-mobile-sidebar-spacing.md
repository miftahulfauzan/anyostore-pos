# Mobile Sidebar Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memadatkan jarak antar menu di drawer Android tanpa mengubah desain atau target sentuh.

**Architecture:** Pertahankan `_row` dengan minimum 44 logical px. Kurangi hanya spacer luar, margin vertikal item, dan padding antar grup di `MorePage`; test widget mengukur posisi dan ukuran menu pada viewport ponsel.

**Tech Stack:** Flutter/Dart, `flutter_test`, Material 3.

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-sidebar-spacing-design.md`

## Global Constraints

- Desain, warna, ikon, label, dan urutan menu tetap.
- Target sentuh item interaktif tetap minimal 44 logical px.
- Tidak mengubah expand/collapse behavior.
- Tidak menambah dependency.

## Review Focus

- Item menu dan header grup tidak turun di bawah 44 logical px — test ukuran `_row` dan header expand/collapse.
- Jarak grup yang dirapatkan tidak membuat overlap — test posisi group header.
- Sidebar tetap dapat dirender pada lebar 320 dan 390 px — existing drawer shell tests.

### Task 1: Compact drawer spacing

**Files:**
- Modify: `mobile/lib/src/more_page.dart`
- Test: `mobile/test/shared_shell_visual_test.dart`

**Interfaces:**
- Consumes: existing `_MoreMenuGroup` and `_row` layout.
- Produces: same drawer menu with reduced inter-group whitespace and unchanged minimum row height.

- [x] Write a failing widget assertion that the compact drawer uses the new group gap and keeps a menu row at least 44 px tall.
- [x] Run the focused test and confirm it fails against the current spacing.
- [x] Reduce only spacer/margin/padding values in `MorePage`; keep `_row` minimum height at 44 px.
- [x] Re-run the focused test and the shared drawer tests at 320/390 px.

### Task 2: Verification and APK

- [x] Run `flutter analyze --no-pub` and record only existing lint/info output.
- [x] Run the focused sidebar tests and existing mobile visual regression tests.
- [x] Build a split-per-ABI release APK with a version code higher than 4030; do not install automatically during the build step.

Verification note: the focused drawer test and build pass. The broader suite still reports six unrelated baseline failures (three old navigation assertions and three existing dashboard/warehouse assertions).
