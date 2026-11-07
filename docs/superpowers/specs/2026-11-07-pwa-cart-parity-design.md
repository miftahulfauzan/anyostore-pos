# Paritas Keranjang PWA dengan Android

## Intent

Menyamakan keranjang POS PWA pada layar mobile dengan keranjang Android agar kasir mendapat alur yang sama saat membuka, mengubah, menahan, melanjutkan, dan membayar transaksi.

## Goals

- Keranjang mobile PWA dibuka sebagai layar penuh.
- Header memakai denim `#1E3A5F`, tombol kembali di kiri, judul Keranjang, dan menu aksi di kanan.
- Baris item mengikuti Android: nama dan harga/varian di kiri, qty yang dapat diketik langsung, total baris, dan menu titik tiga untuk ubah harga atau hapus.
- Total hanya tampil sekali di tombol pembayaran bawah.
- Diskon, catatan, pelanggan, dan tanggal owner berada di menu opsi yang tersembunyi secara default.
- Draft tersedia dari ikon di header POS dan dapat ditahan atau dilanjutkan dari keranjang.
- Desktop tetap mempertahankan layout katalog dan keranjang dua kolom.
- Empty, loading, error, keyboard focus, dark mode, safe-area, dan breakpoint mobile tetap ditangani.

## Non-goals

- Tidak mengubah API checkout, aturan harga, printer, atau tampilan keranjang Android.
- Tidak mengubah katalog produk, kartu produk, atau halaman POS desktop selain affordance pembuka keranjang dan ikon Draft.
- Tidak membuat komponen lintas Flutter dan React pada pekerjaan ini.

## Approaches

1. **Paritas mobile PWA, desktop dipertahankan**. Dipilih karena memenuhi target visual dan UX Android dengan risiko perubahan paling kecil pada kasir desktop.
2. Penyesuaian CSS saja. Ditolak karena PWA belum memiliki alur Draft, Catatan, dan Tahan yang setara.
3. Komponen lintas Flutter dan React. Ditunda karena membutuhkan refactor lintas platform yang tidak diperlukan untuk hasil saat ini.

## Interaction contract

- Tombol Keranjang pada mobile membuka overlay layar penuh dan mengunci scroll halaman POS.
- Escape, tombol kembali, dan backdrop menutup keranjang tanpa menghapus isi.
- Tombol aksi di header menampilkan atau menyembunyikan Diskon, Catatan, Tahan, dan opsi tambahan.
- Ikon Draft pada header POS membuka daftar transaksi tertahan. Memilih satu draft mengisi ulang item, pelanggan, diskon, catatan, dan tanggal yang relevan.
- Ubah qty melalui input angka langsung. Nilai kurang dari satu dikembalikan ke satu.
- Menu item memiliki dua aksi nyata: Ubah harga dan Hapus item.
- Tombol Tahan memakai `POST /api/transactions/hold`; daftar Draft memakai `GET /api/transactions/pending`; melanjutkan memakai `POST /api/transactions/pending/:id/resume`.
- Pembayaran memakai checkout PWA yang sudah ada, termasuk validasi stok, metode pembayaran, dan prompt cetak.

## Visual direction

- Design Read: POS mobile untuk kasir toko, dengan bahasa visual denim yang padat, fungsional, dan mudah disentuh, ENERGY 1 / RHYTHM 1 / MOTION 1.
- Denim dipakai pada header dan tombol pembayaran karena menjadi identitas navigasi POS dan focal point keranjang.
- Surface putih atau surface dark mode dipakai untuk area kerja agar input dan angka terbaca.
- Shadow hanya dipakai pada overlay keranjang untuk menandai elevasi dari katalog di belakangnya.
- Radius header dan footer mengikuti komponen Android, sementara input dan row memakai radius lebih kecil agar hierarki kontrol tetap jelas.

## Acceptance criteria

- Pada viewport mobile, keranjang menutup seluruh layar dan tidak lagi tampil sebagai panel 3/4.
- Tidak ada total harga duplikat.
- Opsi Diskon dan Catatan tersembunyi saat pertama dibuka.
- Draft, Tahan, lanjut Draft, ubah qty, ubah harga, hapus, pembayaran, tombol kembali, Escape, dan backdrop berfungsi.
- Layout tidak overflow pada lebar mobile sempit, tablet, dan desktop.
- Test frontend, build produksi, dan verifikasi endpoint deploy berhasil.
