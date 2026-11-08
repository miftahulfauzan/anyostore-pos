# Desain Print Rincian Riwayat Transfer Stok

## Tujuan

Pengguna dapat mencetak rincian satu transfer stok dari halaman Riwayat Transfer web ke kertas termal ukuran A6 portrait (`105mm × 148mm`). Print harus memuat informasi yang cukup untuk audit fisik barang, bukan hanya ringkasan jumlah.

## Cakupan

- Tambahkan aksi **Print rincian** pada setiap kartu transfer.
- Tampilkan print sheet khusus berisi nomor transfer, tanggal, status, admin, lokasi asal, lokasi tujuan, keterangan, alasan pembatalan bila ada, serta rincian produk.
- Rincian produk mencakup nama, SKU, varian, jumlah, dan saldo stok sebelum/sesudah untuk mutasi keluar dan masuk.
- Gunakan dialog print browser dengan `@page { size: A6 portrait; }`.

## Batasan

- Tidak menambah endpoint atau mengubah data transfer; API riwayat sudah mengembalikan `details.from` dan `details.to` lengkap.
- Tidak mengubah proses transfer, pembatalan, filter, pagination, atau tampilan layar selain tombol print.
- Print hanya mencetak transfer yang dipilih; halaman riwayat dan kartu lain disembunyikan pada mode print.

## Pendekatan yang dipilih

Pendekatan yang dipilih adalah print sheet client-side dari row yang sudah dimuat. Alternatif route print khusus akan menambah endpoint dan state loading, sedangkan export PDF menambah dependensi serta kompleksitas printer. Print sheet client-side paling cepat, tetap memakai data yang sedang terlihat, dan mendukung browser/thermal driver yang menerima ukuran A6.

## Format print

Header terpusat, metadata transfer dua kolom, route asal → tujuan, catatan/audit status, lalu dua bagian rincian: **Barang keluar** dan **Barang masuk**. Setiap baris menjaga nama/SKU/varian, qty, dan stok sebelum → sesudah agar produk antarcabang yang memiliki SKU tujuan berbeda tetap terbaca apa adanya.
