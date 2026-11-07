# Desain PWA POS: Keranjang Padat dan Akses Draft

## Intent

Menyamakan pengalaman POS PWA mobile dengan aplikasi Android pada layar sempit: lebih banyak item keranjang terlihat sekaligus, daftar tidak bergeser horizontal, katalog menampilkan tiga produk per baris, diskon mudah ditemukan, dan transaksi dapat ditahan sebagai Draft.

## Goals

- Menampilkan kira-kira 12 baris item pada keranjang mobile dengan jarak yang lebih rapat tanpa menghilangkan keterbacaan.
- Mengunci area daftar keranjang ke scroll vertikal (`pan-y`) dan mencegah overflow horizontal.
- Mengubah katalog POS PWA mobile menjadi tiga kartu produk per baris.
- Mengembalikan akses input diskon pada keranjang PWA.
- Menyediakan aksi Tahan yang menyimpan transaksi melalui endpoint Draft yang sudah ada, lalu mengosongkan keranjang.
- Mempertahankan edit jumlah, ubah harga, hapus item, pembayaran, dan Draft yang sudah berjalan.

## Non-goals

- Tidak mengubah API transaksi hold/resume atau skema database karena backend Draft sudah tersedia.
- Tidak mengubah tampilan keranjang desktop.
- Tidak mengubah alur keranjang aplikasi Android.
- Tidak mengubah logika harga, stok, pembayaran, atau diskon di backend.

## Approach yang dipertimbangkan

1. **Padat + tetap mirip Android (dipilih)** — CSS mobile dipadatkan, katalog menjadi tiga kolom, diskon ditampilkan di area opsi transaksi, dan tombol Tahan memakai API Draft existing. Trade-off: kartu katalog lebih kecil, tetapi masih mempertahankan target sentuh minimum.
2. **Padat maksimal** — semua label dan jarak diperkecil lebih agresif. Trade-off: lebih banyak data terlihat, tetapi keterbacaan dan area sentuh berkurang.
3. **Toolbar cepat** — tombol Diskon dan Tahan selalu terlihat di bawah daftar. Trade-off: akses lebih cepat, tetapi struktur berbeda dari aplikasi Android dan footer menjadi lebih tinggi.

## Keputusan desain

- Keranjang tetap full-screen di mobile.
- Header dan footer tetap fixed; hanya `.pos-cart-scroll` yang boleh scroll vertikal.
- Header kolom disembunyikan di mobile agar satu baris item lebih pendek; struktur nama/harga, qty, total, dan menu tetap dipertahankan.
- Diskon tampil di panel opsi yang dibuka dari aksi keranjang, dengan tombol Diskon tetap terlihat pada menu aksi.
- Tahan transaksi tetap memakai `POST /api/transactions/hold`; Draft dapat dibuka dari ikon Draft di header POS dan di-resume seperti sebelumnya.
- Perubahan hanya pada breakpoint mobile PWA (`max-width: 820px`), sehingga layout desktop tidak ikut berubah.

## Verifikasi

- Tambahkan regression test untuk tiga kolom katalog, scroll vertikal tanpa overflow horizontal, input diskon, dan akses hold.
- Jalankan test frontend terkait POS/PWA dan build frontend webpack.
