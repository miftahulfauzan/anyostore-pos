# Stok Produk Web/PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Samakan desain Stok Produk web/PWA dengan APK sambil mempertahankan jalur tulis stok.

**Architecture:** Susun ulang `StockReportSection` yang ada. Summary memakai data scope/filter saat ini, tampilan mobile memakai baris APK, dan desktop tetap memakai tabel matriks gudang. Endpoint daftar stok memulai dari produk aktif agar produk tanpa baris saldo tampil sebagai nol. CSS baru dibatasi ke kelas halaman stok.

**Tech Stack:** Next.js 16, React 18, CSS biasa di `frontend/app/globals.css`, Node test runner yang sudah ada.

**Spec:** `docs/superpowers/specs/2026-11-27-stock-product-web-parity-design.md`

## Global Constraints

- Stok tetap satu angka per produk per gudang; varian tidak menjadi pilihan stok.
- Tidak mengubah APK, skema, harga, jalur tulis stok, atau aturan mutasi stok. Bentuk response API tetap sama; produk aktif tanpa baris saldo gudang ikut tampil sebagai nol, dan agregat menandai `total_stock <= 0` sebagai Habis.
- Pakai `SafeImage`, token tipografi, dan kelas CSS khusus; jangan menambah selector global `button`/`a`.
- Pertahankan pagination default 40, kategori, scope role/cabang, ekspor, cetak, dan edit posisi rak.

## Review Focus

- Dataset besar: mode default tetap paginated; status/urut selain nama A–Z hanya memuat lengkap saat diminta.
- Filter kategori/pencarian/scope berubah: request baru harus mengikuti filter aktif dan mereset pagination.
- Stok nol/negatif dan minimum stok: status Habis/Menipis harus konsisten dengan APK.
- Produk aktif tanpa saldo dan tanpa gudang aktif: tetap muncul sebagai Habis tanpa menambah baris stok.
- Mode gelap/cetak: hero dan filter tidak boleh bocor ke hasil cetak atau kehilangan kontras.
- Nama produk/foto panjang atau kosong: baris tetap terbaca dan tidak melebar.

### Task 1: Redesign halaman stok produk

**Files:**
- Modify: `frontend/app/inventory/stock-view.js`
- Create: `frontend/app/inventory/stock-status.mjs` (status produk dengan batas yang sama seperti APK)
- Modify: `frontend/app/globals.css`
- Modify: `frontend/test/stock-customer-reports-polish.test.cjs` (ganti ekspektasi ringkasan lama dengan struktur hero/status yang baru)
- Modify: `backend/src/routes/inventory.js` (samakan agregat Habis dan sertakan produk aktif yang belum memiliki saldo)
- Modify: `backend/test/inventory-rack-position.test.js` (regresi produk tanpa baris saldo)

**Interfaces:**
- Gunakan endpoint `GET /inventory/stock-by-warehouse` dan helper `groupStockRows`/`summarizeStockRows` yang sudah ada.
- Agregat summary backend membedakan Habis `total_stock <= 0` dari Menipis `total_stock > 0 AND total_stock <= min_stock`; response dan jalur tulis stok tetap sama.
- Endpoint daftar memulai dari produk aktif, memakai left join gudang aktif dan baris stok produk (`variant_id IS NULL`); `product_id` selalu berasal dari produk agar tidak hilang saat gudang kosong.
- `StockReportSection` tetap menjadi ekspor default yang dipakai `frontend/app/inventory/page.js`.

- [x] Buat hero total stok + donut status dan filter chip `Semua/Menipis/Habis` dari summary nyata.
- [x] Tambahkan urut nama/stok; muat tanpa pagination hanya saat filter status atau urut non-default aktif, pertahankan pagination untuk default.
- [x] Susun toolbar PWA satu baris; sediakan kategori, urut, dan ekspor melalui panel kontrol yang dapat diakses keyboard.
- [x] Tampilkan baris produk padat pada HP dengan status dan rincian gudang/rak; desktop tetap memakai tabel matriks dan mendapat kolom status.
- [x] Pertahankan loading/error/empty, mode gelap, ekspor CSV, cetak PDF, serta edit lokasi rak.
- [x] Perbarui regresi status, ringkasan cetak, warna cetak, produk tanpa saldo, dan tanggal cetak yang selalu segar.
- [ ] Jalankan build/lint di CI; perintah lokal tidak menghasilkan progres di checkout OneDrive.
- [x] Tinjau diff untuk memastikan commit hanya memuat berkas pekerjaan ini.

### Task 2: Rilis production

**Files:**
- Commit hanya spec, plan, view/CSS stok, regresi frontend/backend, dan perubahan baca/ringkasan stok terkait.

- [x] Stage hanya hunks pekerjaan ini (CSS global memiliki perubahan lokal lain pada checkout sumber).
- [x] Commit perubahan dengan pesan `feat(web): align stock page with mobile`.
- [ ] Push SHA target ke `main`; CI web harus sukses sebelum deploy workflow otomatis berjalan.
- [ ] Tunggu workflow Deploy dan verifikasi public `/api/health` serta `/version` untuk SHA yang sama.
