# Desain Struk Thermal Android

## Intent

Membuat hasil cetak struk Android lebih mirip contoh kedua: logo di tengah, identitas toko, blok informasi transaksi, blok produk dengan nominal rata kanan, total yang menonjol, rincian pembayaran, dan footer yang tidak terpotong.

## Pendekatan yang dipilih

Memakai ESC/POS native yang sudah digunakan aplikasi. Logo invoice diambil dari `invoice_logo` (fallback `store_logo`), diperkecil agar sesuai lebar printer, lalu dikirim melalui perintah `image`. Teks tetap dikirim sebagai baris ESC/POS supaya tajam dan hemat kertas.

## Layout cetak

1. Logo terpusat jika `show_logo` bukan `false`.
2. Nama toko, tagline/ucapan, alamat, dan telepon terpusat.
3. Garis pemisah.
4. Judul `INFORMASI TRANSAKSI`, lalu Invoice, Tanggal, dan Kasir.
5. Garis pemisah dan judul `PRODUK`.
6. Setiap produk: nama + subtotal di kanan, SKU/varian, lalu `qty x harga`.
7. Subtotal, garis total, Total, dan garis pembayaran.
8. Metode bayar, Dibayar, Kembalian.
9. Garis pemisah, catatan/footer, dan ucapan terima kasih.
10. Feed 4 baris sebelum `cutPaper` agar cutter berada di bawah isi terakhir.

## Batasan

- Tetap mendukung printer 58 mm dan 80 mm.
- Tidak mengubah alur checkout, data transaksi, atau format struk web.
- Logo gagal diunduh tidak boleh menggagalkan cetak; struk tetap dicetak tanpa logo.
- Pengiriman Bluetooth tetap memakai paket kecil berurutan agar semua isi sampai ke printer.

## Verifikasi

- Test layout memastikan urutan section, informasi transaksi, item, total, dan pembayaran.
- Test printer memastikan perintah logo, feed sebelum potong, dan seluruh payload dikirim berurutan.
- Build APK release dan uji pemasangan ke perangkat Android jika ADB tersedia.
