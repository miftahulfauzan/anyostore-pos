# Redesign Halaman Stok Produk (Mobile) — "Ringkasan + Filter Chip" (Opsi D)

Tanggal: 2026-11-22 · Status: menunggu persetujuan pemilik · Sesi mockup: 5 bingkai (referensi + Opsi A–D) ditampilkan di Review pane; pemilik memilih **Opsi D** dengan revisi chip aksi + menu ⋮.

## Intent & mengapa

Halaman Stok Produk (seksi `stok` di `inventory_page.dart`) terasa datar: angka stok terkubur di pill kecil, baris 4 statistik sempit (font 10px), semua kartu terlihat seragam sehingga produk bermasalah tidak menonjol. Pemilik ingin halaman yang langsung menjawab "berapa stok saya dan apa yang perlu dibeli", sekaligus pintu cepat ke aksi gudang.

## Goals

1. **Hero denim menyatu dengan AppBar** (satu blok gradien `#1E3A5F → #2E5D8F`, tanpa pita terpisah):
   - Label `TOTAL STOK` + angka besar (tabular) + `pcs`.
   - Subteks: `128 produk · Gudang BASIK` — **tap = pilih toko/gudang** (menggantikan tombol cabang + dropdown gudang lama; owner saja, non-owner tetap).
   - Donut kecil (±84px) komposisi status Aman/Menipis/Habis + legend mini 3 titik. Mode gelap: varian denim lebih gelap (`#1B3556 → #2E5D8F`), teks legenda putih.
2. **Baris 4 chip aksi** (48px, radius 12): `Masuk` (hijau `#2E7E4F`), `Keluar` (oranye `#C2410C`), `Transfer`, `Opname` (denim) — masing-masing membuka **halaman/form yang sudah ada hari ini** (tidak ditulis ulang; perilaku `initialSection`/push saat ini dipertahankan).
3. **Filter chip**: `Semua · 128` / `Menipis · 4` / `Habis · 2` — denim aktif, filter client-side pada daftar; menggantikan scan manual.
4. **Search + Urut tetap**: field cari penuh + kontrol urut (Nama A-Z/Z-A, Stok terendah/tertinggi) — penempatan ikon urut di baris search.
5. **Daftar flat padat**: satu kartu permukaan, divider halus (indent kiri sejajar teks, bukan tepi kartu) — foto 1:1 (42px, radius 9), nama + `SKU · Gudang`, angka stok kanan (font tebal, tabular) + label status mini berwarna (`AMAN` teal / `MENIPIS` amber / `HABIS` merah — palet `appStockStyle`).
6. **Mutasi, Barcode, Riwayat Transfer → menu ⋮ di AppBar** (popup menu seragam gaya `appDropdownColor`): PillTabs seksi DIHAPUS dari halaman ini. Halaman Stok Produk jadi halaman fokus.

## Non-goals / anti-goals

- Tidak mengubah logika data: endpoint, `_load()`, sort client-side, `BranchScope` tetap.
- Tidak ada `BackdropFilter` per kartu (aturan performa device lama) — hero boleh polos gradien, kartu list `GlassCard(frosted: false)` / permukaan solid.
- Tidak mendesain ulang isi Mutasi/Barcode/Transfer/Opname — hanya cara membukanya.
- Tidak menambah aksen warna baru: tombol/aksi utama denim; status tetap satu sistem (`AppStatusPill` + `appStockStyle`); foto selalu 1:1; tipografi hanya token `TaskTypography`.
- Grid 2 kolom lama (toggle Card/Grid) tidak dipertahankan di halaman ini — daftar flat saja. (Bila di tengah jalan terasa perlu, keputusan itu kembali ke pemilik, bukan builder.)

## Constraints

- Test yang mengetuk chip PillTabs untuk pindah seksi harus ikut diubah: `inventory_submission_test.dart`, `stock_mutation_visibility_test.dart`, `inventory_visual_test.dart` (light/dark 320+390), `mobile_redesign_test.dart`/`redesign_visual_test.dart` bila menyentuh halaman ini.
- Routing `initialSection` dari drawer (incoming/outgoing/transfer/opname/mutasi) wajib tetap berfungsi — bila ≠ `stok`, langsung buka halaman/form tujuan seperti sekarang.
- Donut: implementasi paling ringan (CustomPaint/Stack) — tidak menambah dependency baru (fl_chart sudah ada tapi berat untuk satu donut kecil).
- Aturan repo mobile: setiap perubahan `mobile/**` wajib disusul build APK (rsync ke `/private/tmp/mbuild2`, `flutter build apk --release`, naikkan `versionCode`) + `flutter analyze --no-pub`.
- Update `docs/agents/mobile.md` (catatan Batch 9 tentang PillTabs seksi) setelah implementasi.

## Approaches yang dipertimbangkan (dari sesi mockup)

| Opsi | Bentuk | Trade-off |
|---|---|---|
| A — Angka stok jadi pusat | list, angka besar + bar progres | refactor paling kecil, tapi tetap "daftar polos" |
| B — Katalog foto | grid 2 kolom, chip di foto | paling visual, kepadatan data rendah |
| C — Prioritas restock | kelompok status + strip peringatan | bagus untuk pembelian, jelek untuk cari produk sehat |
| **D — Ringkasan + filter (DIPILIH)** | hero + chip aksi + filter + list padat | kesan dashboard + aksi cepat; refactor paling besar, tapi semua komponennya sudah ada di design system |

## Keputusan dari percakapan

- Mutasi masuk **⋮ saja** (tidak jadi link di hero) — pemilik: "sesuai dengan yang D".
- Chip aksi **4 buah** (Masuk · Keluar · Transfer · Opname) seperti di mockup revisi.

## Dibebaskan ke builder

- Penempatan persis kontrol urut (ikon di field cari vs chip sendiri).
- Detail offset gradien hero & varian gelap (asal tetap keluarga denim).
- Apakah donut memakai `CustomPaint` atau `Stack` — yang termurah saat build.
- Copywriting kecil (label `AMAN` vs `TERSEDIA`, dsb.) asal konsisten satu istilah.
