# Laporan Penjualan Tanpa Tab Ringkasan Terpisah

## Intent

Menghilangkan duplikasi navigasi antara tab Penjualan dan Ringkasan pada
halaman Laporan. Isi Ringkasan tetap dipertahankan dan digabung ke halaman
Penjualan agar pengguna melihat satu laporan utama yang lengkap.

## Goals

- Android menampilkan tab Penjualan, Penutupan, dan PPN; tidak ada tab Ringkasan
  terpisah.
- Isi metrik Ringkasan (transaksi, produk terjual, HPP, laba kotor, margin,
  pengeluaran, dan laba bersih) tetap tampil di laporan Penjualan.
- Pembayaran, penjualan harian, produk terlaris, stok rendah, kasir,
  pelanggan, dan transaksi tetap tersedia pada laporan Penjualan.
- Web/PWA memakai judul laporan yang tidak menyiratkan halaman Ringkasan
  terpisah dan tetap memakai visual laporan gabungan yang sama.
- Pemilihan periode, cabang, data offline, endpoint, dan perhitungan tidak
  berubah.

## Non-goals

- Tidak mengubah API, skema database, atau rumus laporan.
- Tidak menghapus tab Penutupan atau PPN.
- Tidak mengubah Dashboard Stok, POS, atau halaman laporan pajak.

## Approach

Normalisasi `initialSection: 'ringkasan'` menjadi `penjualan` untuk role yang
memakai laporan penjualan, lalu jadikan `_sales()` sebagai satu renderer
gabungan. Role kasir tetap memakai endpoint ringkasan yang sudah berjalan,
tetapi label navigasinya menjadi Penjualan agar tidak kehilangan akses.

Alternatif menghapus isi Ringkasan ditolak karena kehilangan metrik penting;
mempertahankan dua tab ditolak karena mempertahankan masalah yang dilaporkan.

## Acceptance criteria

- `find.text('Ringkasan')` tidak menemukan tab pada laporan owner/admin.
- Laporan Penjualan tetap menampilkan `Produk terjual`, `Laba kotor`,
  `Persentase keuntungan`, dan `Laba bersih`.
- Web/PWA tidak menampilkan judul `Laporan Ringkasan Toko`.
- Test Android dan frontend membuktikan kontrak ini tanpa perubahan endpoint.
