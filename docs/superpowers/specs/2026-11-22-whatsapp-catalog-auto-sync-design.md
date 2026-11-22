# Sinkron otomatis katalog WhatsApp

## Tujuan

Perubahan harga, stok, nama, dan foto di katalog grosir Anyostore ikut masuk ke katalog WhatsApp tanpa unggah CSV manual. Produk tanpa foto tetap tidak ditampilkan.

## Kondisi sekarang

- Katalog Meta `Anyostore Grosir WhatsApp` berisi 83 item dari file manual, tanpa jadwal.
- API publik web menyediakan data produk dalam JSON berpaginasi; Meta feed memerlukan CSV/TSV/XML dari URL publik.
- Pengaturan Commerce Manager menempatkan sumber manual di prioritas atas untuk beberapa atribut; unggahan terakhir juga menunjukkan konflik sumber pada harga dan visibilitas. Feed live harus menjadi sumber utama untuk atribut yang dikelola web agar harga, judul, merek, stok, foto, tautan, dan visibilitas ikut berubah.
- AG01, AG02, dan CELANA KATUN tidak memiliki foto dan saat ini tersembunyi.

## Pendekatan

1. **Tarik feed terjadwal setiap jam — dipilih.** Web menyediakan feed CSV dari data live, lalu jadwal feed utama Meta menariknya per jam. Perubahan muncul setelah tarikan berikutnya, bukan langsung ketika produk disimpan.
2. **Kirim perubahan saat produk disimpan.** Integrasi Meta API mengirim setiap perubahan dan memerlukan pengelolaan token, retry, dan kegagalan. Ini memberi pembaruan lebih cepat, tetapi lebih banyak bagian yang perlu dipelihara untuk katalog 83 produk.

## Rancangan

- Tambahkan endpoint publik `GET /api/public/whatsapp-catalog.csv` di backend. Endpoint memakai produk aktif dari cabang Gudang Utama yang ditampilkan pada situs grosir.
- Feed mengeluarkan ID produk stabil, harga IDR, stok tersedia, URL produk dan foto, negara asal `ID`, judul produk persis dari web tanpa awalan `Anyostore`, serta merek `Basik`.
- Produk tanpa foto atau harga positif tetap ada dengan visibilitas staging/tersembunyi. Jangan membuat AG01, AG02, dan CELANA KATUN tampil.
- Jadwalkan feed utama yang sudah ada agar Meta menarik URL tersebut setiap jam. Feed memuat daftar produk lengkap agar item baru dan perubahan ikut masuk; item yang sudah tidak aktif di web tidak lagi dipublikasikan.
- Sebelum jadwal diaktifkan, atur feed live menjadi sumber utama untuk atribut yang dikelola web. Verifikasi harga katalog mengikuti web dan ketiga item tanpa foto tetap tersembunyi setelah tarikan pertama.
- Jangan membuat katalog Meta kedua atau menyimpan token Meta di endpoint publik.

## Risiko dan batasan

- Sinkron tidak seketika: jeda normal sampai satu jam, ditambah waktu pemrosesan Meta.
- Endpoint hanya mengekspos informasi produk yang memang sudah tersedia publik di situs grosir.
- Penarikan penuh dapat menghapus item yang tidak lagi tercantum; karena itu feed harus berisi seluruh produk aktif dari cabang yang tepat.

## Cakupan implementasi

Endpoint CSV, verifikasi format/isi pada data live, konfigurasi jadwal feed Meta yang ada, dan verifikasi hasil tarikan. Tidak mengubah nama produk di situs atau alur POS.
