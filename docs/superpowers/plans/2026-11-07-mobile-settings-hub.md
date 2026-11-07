# Mobile Settings Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ubah halaman Pengaturan Android menjadi hub daftar berkelompok dengan halaman detail per fitur, mengikuti referensi Settings & activity.

**Architecture:** Tambahkan `SettingsHubPage` sebagai entry point dari drawer. Pertahankan `SettingsPage` dan state/API yang sudah ada sebagai renderer detail dengan parameter section, sehingga perubahan visual tidak mengganti kontrak backend atau alur simpan.

**Tech Stack:** Flutter/Dart, Material widgets, existing `GlassCard`, widget tests.

**Spec:** `docs/superpowers/specs/2026-11-07-mobile-settings-hub-design.md`

## Global Constraints

- Palet utama tetap denim `#1E3A5F`, latar krem, dan mode gelap memakai token `task_ui.dart`.
- Tidak mengubah API, role permission, POS, keranjang, atau drawer navigation selain target halaman Pengaturan.
- Target sentuh menu minimal 48dp; tidak ada horizontal overflow pada lebar 320dp.
- APK versionCode harus dinaikkan sebelum build release.

## Review Focus

- Owner vs gudang: menu yang tidak berhak tidak muncul; detail tidak dapat dibuka dari hub.
- Back navigation: detail kembali ke hub tanpa logout atau reset data.
- Narrow viewport: label, subtitle, dan chevron tetap satu layout tanpa RenderFlex overflow.
- Existing settings behavior: category, logo, printer, font scale, backup, dan branch actions tetap reachable.
- Dark mode: divider, ikon, dan teks tetap terbaca.

### Task 1: Lock the hub navigation contract

**Files:**
- Create: `mobile/lib/src/settings_hub_page.dart`
- Modify: `mobile/lib/src/more_page.dart`
- Test: `mobile/test/settings_hub_test.dart`

- [ ] Write failing widget tests for grouped rows, role filtering, and detail navigation.
- [ ] Run the focused test and confirm it fails because `SettingsHubPage` is missing.
- [ ] Implement hub rows and push detail routes with section keys.
- [ ] Run the focused test and confirm it passes at 320dp/390dp and light/dark themes.

### Task 2: Split the existing settings body into detail sections

**Files:**
- Modify: `mobile/lib/src/settings_page.dart`
- Modify: `mobile/test/redesign_visual_test.dart`

- [ ] Add optional section input and failing assertions that each hub destination renders its detail heading.
- [ ] Extract current cards into section builders without changing controller/API behavior.
- [ ] Keep category, logo, printer, display, data, notification, and branch actions in their corresponding detail screens.
- [ ] Run focused settings tests and verify no RenderFlex overflow.

### Task 3: Visual polish and release verification

**Files:**
- Modify: `mobile/lib/src/settings_hub_page.dart`
- Modify: `mobile/pubspec.yaml`

- [ ] Verify icon, divider, spacing, typography, and dark-mode tokens against the spec.
- [ ] Run `dart format`, `flutter analyze` for changed files, focused widget tests, and `git diff --check`.
- [ ] Increment versionCode, build split APK, verify package metadata, and install arm64 APK to the connected device.
