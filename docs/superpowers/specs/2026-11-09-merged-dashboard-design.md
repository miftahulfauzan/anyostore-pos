# Merged Dashboard Design

## Intent

Menggabungkan hierarki visual dashboard “Penjualan” dan “Ringkasan toko” agar
pengguna mendapatkan satu ringkasan yang cepat dipindai, dengan gaya yang sama
di Android native, web desktop, dan PWA mobile.

Visual yang disetujui menjadi acuan: header denim `#1E3A5F`, latar krem
`#F5F1EA`, kartu putih, empat KPI utama, satu kartu Penjualan dengan grafik
interaktif, lalu kartu Produk terlaris dan Stok rendah.

## Goals

- Menampilkan Pendapatan, Pesanan, Produk terjual, dan Laba bersih sebagai KPI
  utama dalam satu kartu Ringkasan toko.
- Menggabungkan grafik penjualan dan ringkasan pembayaran, pengeluaran, serta
  pengembalian dalam satu kartu Penjualan.
- Menjaga aksi “ketuk/klik untuk melihat angka” pada grafik.
- Menjaga filter periode, pemilihan toko owner, data offline, dan endpoint yang
  sudah ada.
- Membuat web dan PWA menggunakan komponen responsif yang sama; Android tetap
  memakai widget native tetapi mengikuti susunan dan label yang sama.
- Menjaga informasi margin keuntungan, produk terlaris, dan stok rendah tetap
  tersedia sebagai informasi pendukung.

## Non-goals

- Tidak mengubah skema database, endpoint, atau rumus laporan.
- Tidak menghapus tab laporan detail Penjualan, Ringkasan, Penutupan, atau PPN.
- Tidak mengubah dashboard stok gudang.
- Tidak menambahkan bottom navigation pada Android.

## Approaches considered

1. **Satu hierarki dashboard bersama (dipilih).** Web/PWA memakai
   `OlseraDashboardSections`; Android memakai `_dashboard()` dengan komponen
   native yang mempertahankan data yang sama. Ini mencegah dua kartu utama yang
   mengulang informasi.
2. **Mempertahankan kartu terpisah lalu hanya mengganti warna.** Ditolak karena
   duplikasi informasi tetap ada dan hierarki visual tidak berubah.
3. **Membuat implementasi desktop, PWA, dan Android terpisah.** Ditolak karena
   mudah menghasilkan drift label, urutan KPI, dan perilaku grafik.

## Decisions

- Label utama memakai Bahasa Indonesia: “Ringkasan toko”, “Penjualan”,
  “Pendapatan”, “Pesanan”, “Produk terjual”, “Laba bersih”.
- KPI desktop dan mobile menggunakan grid responsif; pada layar sempit turun
  menjadi dua kolom, bukan horizontal scroll.
- Grafik penjualan tetap menampilkan tanggal, tombol/aksi angka, dan nilai
  terpilih secara aksesibel.
- Data `payment_methods`, `daily_expenses`, `daily_returns`, `products`, dan
  `low_stock` hanya dipresentasikan ulang; tidak ada fetch baru atau perubahan
  kontrak API.

## Acceptance criteria

- Dashboard web, PWA mobile, dan Android menampilkan satu Ringkasan toko dan
  satu Penjualan; tidak ada kartu Sales terpisah yang mengulang total.
- Empat KPI utama terlihat pada periode dan toko yang aktif.
- Grafik tetap dapat diketuk/klik untuk melihat angka.
- Tampilan tidak menimbulkan overflow horizontal pada lebar mobile.
- Test frontend dan Flutter yang relevan lulus, termasuk mode owner dan kasir.
