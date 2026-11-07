# POS Product Card Density Design

## Intent

Merapikan kartu produk POS pada layar ponsel agar informasi utama terlihat dalam dua baris dan ruang kosong di bawah stok tidak terbuang.

## Goals

- Baris pertama kartu menampilkan nama produk.
- Baris kedua menampilkan harga di kiri dan angka stok saja di kanan.
- Tinggi footer kartu mengikuti dua baris tersebut dan tetap aman pada ukuran font besar.
- Menu titik tiga pada item keranjang kembali tanpa kotak dekoratif, tetapi tetap memiliki area tap yang mudah digunakan dan popup opsi yang terbaca.

## Non-goals

- Tidak mengubah grid produk, sumber data, jumlah default, atau alur checkout.
- Tidak mengubah tindakan “Ubah harga” dan “Hapus item”.
- Tidak mengubah ikon chevron pada header keranjang.

## Approaches

1. Mengganti seluruh grid dan komponen kartu: ditolak karena berisiko mengubah perilaku POS yang sudah stabil.
2. Menyesuaikan footer `_ProductCard` dan pembungkus aksi `_CartLine`: dipilih karena perubahan kecil, menjaga data dan interaksi yang ada, serta langsung mengatasi ruang kosong dan box titik tiga.

## Constraints and decisions

- Implementasi tetap di `mobile/lib/src/pos_page.dart` mengikuti komponen yang sudah ada.
- Kartu memakai dua baris konten tetap; nama dibatasi satu baris agar harga dan stok tidak terdorong ke baris ketiga.
- Stok hanya berupa angka karena konteksnya sudah jelas sebagai kartu stok.
- Area tap menu tetap minimal 44 px, tetapi visualnya transparan tanpa border atau background kotak.
- Verifikasi mencakup lebar 320 dan 390 px, tema terang/gelap, serta menu popup.

## Success criteria

- Test visual menemukan angka stok tanpa label `Stok` dan tidak menemukan label varian/stok lama pada kartu.
- Selisih bawah kartu setelah angka stok tidak lebih dari 16 px pada viewport uji.
- Test visual menemukan tooltip titik tiga, “Ubah harga”, dan “Hapus item”; tidak ada RenderFlex overflow.
