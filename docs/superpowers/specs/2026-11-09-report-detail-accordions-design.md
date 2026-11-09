# Laporan Detail Accordion Web dan Android

## Intent

Menata seluruh rincian laporan ke dalam lima menu accordion yang ringkas dan
konsisten di web/PWA serta Android, tanpa menghapus Ringkasan toko yang sudah
menjadi bagian utama dashboard laporan.

## Goals

- Mempertahankan Ringkasan toko sebagai blok pertama laporan gabungan.
- Menyediakan lima grup detail: Transaksi, Produk, Pembayaran, Retur, dan
  Analisis periode.
- Menampilkan semua dataset laporan yang sudah dikirim API, bukan hanya
  transaksi dan produk.
- Menyediakan ikon, hit-area yang aman, state expanded/collapsed, dan empty
  state yang jelas.
- Menyediakan aksi per grup: Lihat PDF/export dan Cetak.
- Menjaga endpoint, filter periode/cabang, rumus, dan data transaksi tetap
  sama.

## Non-goals

- Tidak mengubah API, database, atau perhitungan laporan.
- Tidak menghapus tab Penutupan/PPN atau Dashboard Stok.
- Tidak mengganti visual Ringkasan toko yang sudah disetujui.

## Information architecture

1. Ringkasan toko — selalu terlihat.
2. Penjualan — tetap menjadi bagian dashboard gabungan.
3. Laporan detail:
   - Transaksi: ringkasan diskon/pembatalan/refund, daftar transaksi, daftar
     pembatalan.
   - Produk: produk terjual, kategori, stok perlu perhatian, tier harga.
   - Pembayaran: metode pembayaran, kasir, pelanggan terbaik.
   - Retur: ringkasan retur dan daftar retur.
   - Analisis periode: penjualan harian, per jam pencatatan, perbandingan
     antar toko bila owner melihat semua cabang, serta tautan laporan stok.

## Interaction

- Satu grup dapat dibuka pada satu waktu pada mobile agar halaman tetap
  compact; desktop boleh mempertahankan grup yang dibuka saat filter berubah.
- Tombol header accordion memiliki `aria-expanded` dan label yang jelas.
- Tombol Lihat PDF membuka preview/export yang sudah kompatibel dengan
  platform. Tombol Cetak memakai print flow yang sudah ada dan tidak mengubah
  data.
- Dataset kosong tetap menampilkan judul grup dan empty state, bukan
  menghilangkan grup.

## Visual direction

- Ikon outline konsisten dari Lucide (web) dan Material Icons (Android),
  bukan emoji.
- Aksen denim `#1E3A5F`, permukaan terang/krem, border tipis, dan tombol
  aksi sekunder agar Ringkasan toko tetap menjadi fokus utama.
- Tabel desktop boleh overflow secara horizontal di dalam container; mobile
  memakai kartu/baris compact sehingga tidak memaksa halaman scroll mendatar.

## Acceptance criteria

- Web dan Android menampilkan kelima grup dengan ikon dan action buttons.
- Semua field `transactions`, `cancellations`, `products`, `categories`,
  `payment_methods`, `cashiers`, `customers`, `low_stock`, `return_summary`,
  `returns`, `daily_sales`, `hourly_sales`, `branch_comparison`, dan
  `price_tiers` tetap dapat ditemukan pada laporan.
- Ringkasan toko tetap terlihat sebelum Laporan detail.
- Test regression mencakup toggle accordion, dataset coverage, dan action
  export/print.
