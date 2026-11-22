# Drawer "Produk & Inventori" Android — Paritas Struktur Web (Opsi B)

Tanggal: 2026-11-23 · Status: disetujui pemilik (mockup 3 bingkai di Review pane; pilihan: **Opsi B**, "kerjakan sekarang").

## Intent & mengapa

Drawer Android menampilkan 11 item datar dalam grup PRODUK & INVENTORI — pencatatan (Masuk/Keluar/Transfer/Opname), riwayat (3), dan master data tercampur tanpa hirarki; pemilik melaporkan "membingungkan". Sidebar web (`frontend/app/components/AppShell.js`) sudah memisahkan: item utama → subgroup **Mutasi Stok** → subgroup **Riwayat**.

## Goals (Opsi B — subgroup terbuka penuh, tanpa akordeon bersarang)

1. Urutan item utama: **Dashboard Stok** (role≠gudang & viewActivity), **Daftar Produk**, **Stok Produk**, **Cetak Barcode**.
2. Label mini **MUTASI STOK** + baris indent (garis kiri): Stok Masuk, Stok Keluar (hanya `canManageStockMutations`), Transfer Stok, Stok Opname.
3. Label mini **RIWAYAT** + baris indent: Riwayat Transfer (role≠kasir), **Pergerakan Stok** (rename dari "Kartu Stok" — label drawer + judul AppBar halaman `StockMovementsPage`), Riwayat Mutasi.
4. Gating role, target halaman, dan perilaku `_open`/`initialSection` TIDAK berubah — hanya susunan + satu nama.

## Non-goals

- Drawer role **gudang** tidak disentuh (sudah paritas grup web: Utama/Transaksi & Stok/Gudang/Lainnya).
- Web tidak berubah. Halaman tujuan tidak berubah.
- "Pergerakan Stok" memang mirip judul grafik di Dashboard — halaman berbeda, dan nama ini membedakan dari "Riwayat Mutasi" (alasan historis rename Batch 8).

## Approaches

- A: akordeon collapsible persis web — ditolak (nested-expandable di atas grup yang sudah collapsible, ketukan ekstra).
- **B: label mini + indent garis kiri (DIPILIH)** — struktur web terbaca tanpa akordeon; nol ketukan ekstra.

## Constraints

- Token drawer: `kDrawerLabel` (label), `kDrawerBorder` (garis), item tetap 44px radius 10, `TaskTypography`.
- Regresi: test baru `drawer_inventori_test.dart` (struktur + rename + gating kasir + gudang tidak berubah); test lama yang menyebut "Kartu Stok" (tidak ada di test) — cek ulang `mobile_redesign_test`/`shared_shell_visual_test`.
- Perubahan `mobile/**` wajib: `flutter analyze --no-pub`, suite hijau, bump versionCode, build APK di `/private/tmp/mbuild2`, salin ke workspace, **install ke HP** (permintaan pemilik), update `docs/agents/mobile.md`.
