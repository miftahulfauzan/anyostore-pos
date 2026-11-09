# Quality Gates and Documentation Alignment

## Intent

Menutup lima temuan audit tanpa mengubah perilaku bisnis POS: test mobile harus
menguji UI yang benar-benar aktif dan menjadi gate CI, dokumentasi harus sesuai
dengan struktur proyek saat ini, satu design system menjadi sumber visual yang
konsisten, ada smoke E2E untuk render web, dan lint dijalankan pada CI.

## Goals

- Memperbarui enam assertion widget test yang sudah tertinggal dari navigasi dan
  redesign mobile saat ini.
- Menjalankan `flutter test` pada workflow mobile sebagai gate wajib; analisis
  Flutter tetap boleh `continue-on-error` sesuai kebijakan proyek.
- Menambahkan lint backend yang nyata dan memanggil lint frontend yang sudah ada
  dari workflow web.
- Menambahkan Playwright smoke test yang memverifikasi halaman login web dapat
  dirender dan mode Password/PIN dapat berpindah tanpa membutuhkan MySQL atau
  backend produksi.
- Menyamakan angka dokumentasi dan palet `design-system/anyostore/MASTER.md`
  dengan `DESIGN.md`.

## Non-goals

- Tidak mengubah endpoint, skema database, perhitungan transaksi, navigasi
  produksi, atau tampilan aplikasi untuk memperbaiki test yang stale.
- Tidak membuat E2E checkout/penutupan penuh dengan MySQL pada tahap ini.
- Tidak menghapus test lama hanya karena gagal; test disesuaikan dengan kontrak
  UI yang aktif atau fixture yang benar.

## Approach (selected)

Pendekatan terukur: perbaiki test terhadap kontrak UI saat ini, tambahkan smoke
E2E yang terisolasi dengan `webServer` Next.js dan tanpa data bisnis, gunakan
ESLint sebagai lint backend/frontend, lalu pasang semua gate di CI. Pendekatan
E2E penuh dengan backend dan MySQL ditunda karena memperbesar waktu dan sumber
flakiness CI tanpa diperlukan untuk memvalidasi lima temuan ini.

## Decisions

- `tablet_navigation_test.dart` memeriksa item navigasi owner yang aktif
  (`POS`, `Dashboard`, `Riwayat`, `Keuangan`, `Lainnya`), bukan label lama
  `Laporan`.
- `redesign_visual_test.dart` memeriksa ukuran focal metric dan judul grup yang
  dipakai redesign sekarang, bukan angka/font minimum dari desain lama.
- `prefetch_service_test.dart` memberi fixture `variant_count` dan menguji
  batas konkruensi aktual service saat ini (batch tiga produk).
- Mobile workflow tetap melonggarkan `flutter analyze` saja; `flutter test`
  tidak boleh dilonggarkan.
- E2E pertama memakai `@playwright/test` dan `frontend/e2e/` dengan browser
  Chromium di CI.

## Acceptance checks

- Widget tests mobile yang sebelumnya enam gagal menjadi lulus.
- `flutter test`, `flutter analyze lib`, `npm run lint` frontend, lint backend,
  backend test suite, dan Playwright smoke test memiliki command CI yang jelas.
- `docs/README.md` menyebut 49 tabel dan 159 handler/API handler sesuai audit
  source terbaru.
- MASTER design system memakai denim `#1E3A5F` sebagai primary dan tidak lagi
  menyebut palet Luxury/Premium hitam-emas sebagai brand utama.
