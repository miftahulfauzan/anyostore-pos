# Merged Dashboard Implementation Plan

> **Execution note:** gunakan `executing-plans` dan kerjakan task secara
> berurutan. Setiap task harus diverifikasi sebelum lanjut.

## Goal

Menerapkan dashboard gabungan yang disetujui pada web/PWA dan Android tanpa
mengubah data atau logika laporan.

## Task 1 — Contract tests untuk hierarki baru

**Files:**

- Modify: `frontend/test/dashboard-olsera-contract.test.cjs`
- Modify: `mobile/test/analytics_visual_test.dart`

Tambahkan assertion yang memaksa satu struktur Ringkasan toko + Penjualan,
empat KPI, kartu produk/stok, dan tidak adanya struktur Sales/Expense/Return
terpisah pada dashboard. Jalankan test terkait dan pastikan gagal sebelum
implementasi.

## Task 2 — Implementasi web dan PWA

**Files:**

- Modify: `frontend/app/dashboard/OlseraDashboardSections.js`
- Modify: `frontend/app/dashboard/page.js`
- Modify: `frontend/app/globals.css`

Bangun satu komponen responsif yang menerima data report/fallback yang sudah
ada. Pertahankan chart toggle, period controls, owner branch scope, dan kartu
transaksi terbaru. Gunakan CSS grid dua kolom yang turun menjadi satu/two-column
mobile tanpa overflow.

Verifikasi dengan test contract, lint, dan build frontend.

## Task 3 — Implementasi Android native

**Files:**

- Modify: `mobile/lib/src/reports_page.dart`

Ubah hanya `_dashboard()` agar owner, admin, manager, dan kasir memakai
hierarki gabungan: KPI ringkasan, kartu Penjualan dengan trend tap, lalu produk
terlaris/stok rendah. Pertahankan offline merge, filter, data pembayaran, dan
halaman detail report non-dashboard.

Verifikasi dengan `dart format`, `flutter analyze`, dan test widget analytics.

## Task 4 — Review dan regression check

Jalankan test frontend dashboard/PWA, test Flutter report, lint, analyze, dan
build frontend. Audit diff agar tidak ada endpoint atau rumus yang berubah.

## Ledger

Catat status setiap task di
`.superpowers/sdd/2026-11-09-merged-dashboard/progress.md`.
