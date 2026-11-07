# Desain Keranjang PWA: Baris Statis dan QTY Cepat

## Intent

Membuat keranjang POS PWA lebih padat dan cepat dipakai kasir pada layar
mobile, terutama saat mengubah jumlah barang, tanpa mengubah data produk,
harga, total, diskon, atau alur pembayaran.

## Goals

- Setiap baris produk memiliki tinggi statis yang konsisten, sekitar 72 px,
  dengan jarak antarbaris yang rapat.
- Daftar produk tetap menempel dari atas dan hanya area daftar yang dapat
  discroll; total pcs dan tombol Bayar tetap berada di footer.
- Tanggal transaksi tampil compact satu baris dengan ikon kalender native,
  tetap default ke hari ini dan tetap dapat dipilih melalui date picker.
- Ketukan pada input QTY langsung memakai keyboard numerik dan menyeleksi
  seluruh nilai lama; blur atau Enter menyimpan nilai melalui fungsi quantity
  yang sudah ada.
- Total harga per item, total pcs, dan tombol pembayaran tetap dihitung dari
  state keranjang serta fungsi yang sudah berjalan.

## Non-goals

- Tidak mengubah API transaksi, skema database, harga, stok, diskon, atau
  pembayaran.
- Tidak mengubah keranjang Android.
- Tidak mengganti menu titik tiga, aksi Draft, Diskon, Catatan, atau alur
  checkout.

## Approaches

1. **CSS saja** — cepat, tetapi tidak menyelesaikan auto-select QTY.
2. **CSS + handler QTY ringan (dipilih)** — mengubah layout mobile dan
   menambahkan event fokus/blur/Enter pada input yang sudah ada. Dampak kecil
   dan mempertahankan jalur kalkulasi transaksi.
3. **Refactor komponen baris keranjang** — struktur lebih bersih, tetapi
   perubahan lebih besar tanpa manfaat yang diperlukan untuk kebutuhan ini.

## Keputusan desain

- Override mobile final memakai `grid-template-rows` pada cart sheet dan
  `min-height`/`height` statis pada `.cart-lines article`; footer tetap grid row
  terakhir.
- Area daftar memakai `overflow-y: auto` dan `overflow-x: hidden`.
- Field tanggal memakai wrapper compact dengan input `type="date"`; ikon
  kalender berasal dari kontrol native sehingga date picker tetap konsisten
  di browser mobile.
- Input QTY memakai `inputMode="numeric"`, `enterKeyHint="done"`,
  `onFocus` untuk `select()`, dan `onBlur`/Enter untuk mengirim nilai integer
  positif ke fungsi `quantity` yang sama.
- Tambahkan regression test source/CSS untuk tinggi statis, tanggal compact,
  dan interaksi QTY, lalu jalankan suite frontend serta build produksi.
