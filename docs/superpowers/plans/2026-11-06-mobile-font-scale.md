# Mobile Font Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Menambahkan pengaturan skala teks global yang persisten dengan enam pilihan `0.4`, `0.6`, `0.8`, `1.0`, `1.2`, dan `1.4` pada aplikasi Android.

**Architecture:** `FontScaleController` menjadi sumber nilai tunggal berbasis `ValueNotifier<double>` dan `SharedPreferences`. `main.dart` menerapkan nilai tersebut melalui `MediaQuery.textScaler` pada root `MaterialApp`, sedangkan `SettingsPage` hanya mengubah controller.

**Tech Stack:** Flutter/Dart, Material 3, `SharedPreferences`, `flutter_test`.

**Spec:** `docs/superpowers/specs/2026-11-06-mobile-font-scale-design.md`

## Global Constraints

- Plus Jakarta Sans tetap menjadi font family aplikasi.
- Default skala adalah `1.0`.
- Nilai yang tersedia hanya `0.4`, `0.6`, `0.8`, `1.0`, `1.2`, dan `1.4`.
- Penyimpanan hanya lokal dengan key `pos_font_scale`.
- Area sentuh tombol tidak diperkecil oleh setting font.

## Review Focus

- Nilai preference yang hilang atau tidak valid kembali ke `1.0` — Task 1.
- Nilai tersimpan dipulihkan setelah reload controller — Task 1.
- Skala tetap terpasang pada root saat notifier berubah — Task 2.
- Enam pilihan tetap terbaca pada lebar 320 px — Task 3.
- Perubahan ukuran tidak mengubah font family atau target sentuh — Task 2 dan 3.

### Task 1: FontScaleController

**Files:**
- Create: `mobile/lib/src/font_scale_controller.dart`
- Test: `mobile/test/font_scale_controller_test.dart`

**Interfaces:**
- Produces `FontScaleController.options`, `FontScaleController.scale`, `load()`, `set(double)`, `label(double)`, and `effectiveScale(double, double)`.

- [x] Write tests for the exact six options, default `1.0`, invalid preference fallback, persistence, and narrow-screen cap behavior.
- [x] Run `flutter test test/font_scale_controller_test.dart --no-pub` and confirm the new API fails before implementation.
- [x] Implement the controller with immutable options, validation, local persistence, and the responsive effective-scale helper.
- [x] Re-run the focused test and confirm all assertions pass.

### Task 2: Root integration

**Files:**
- Modify: `mobile/lib/main.dart`
- Test: `mobile/test/font_scale_root_test.dart`

**Interfaces:**
- Consumes `FontScaleController.scale` and `effectiveScale` from Task 1.
- Produces a root `MediaQuery` whose `textScaler` reflects the selected value while preserving Plus Jakarta Sans.

- [x] Write a widget test that changes the controller and verifies the root text scale updates without changing the theme font family.
- [x] Run the focused test and confirm it fails because the root does not yet listen to font scale.
- [x] Load the controller before `runApp`, listen to it beside `ThemeController`, and apply `MediaQuery.textScaler` in `MaterialApp.builder`.
- [x] Re-run the focused test and confirm it passes.

### Task 3: Settings control

**Files:**
- Modify: `mobile/lib/src/settings_page.dart`
- Modify: `mobile/test/redesign_visual_test.dart` or add a focused settings widget test if the existing fake API is insufficient.

**Interfaces:**
- Consumes `FontScaleController.options`, `label`, `scale`, and `set`.
- Produces six compact, accessible choices under the existing `Tampilan` section.

- [x] Add a failing widget assertion for the `Ukuran teks` section and all six labels at a 320 px viewport.
- [x] Run the focused test and confirm the section is absent.
- [x] Add a `Wrap` of `ChoiceChip`s with the six values and persist changes through the controller.
- [x] Re-run the focused test at light/dark themes and 320/390 px widths.

### Task 4: Full verification

- [x] Run `flutter analyze --no-pub` and record any pre-existing lint/info output separately from compile errors.
- [x] Run the focused font-scale tests and the existing mobile visual tests.
- [x] Run the release APK build with a build number greater than `2029` only after the source and tests are green; do not install it automatically until requested.

Verification note: the font-scale tests and six-choice settings tests pass. The broader visual suite still reports three unrelated existing failures (two analytics focal-metric size assertions and one warehouse-menu label assertion); these do not touch the new font-scale code.

