# Desain Kontak Kepala Nota dan Logo Invoice

## Intent

Menambahkan informasi kontak tambahan di kepala struk native Android tanpa mencampurnya dengan salam/header utama, serta memberi kontrol untuk menghapus logo invoice dan mengecilkan ukuran logo saat dicetak.

## Goals

- Menyediakan field multiline `Kontak kepala nota` yang dapat berisi beberapa nomor WhatsApp, Instagram, atau catatan kontak lain.
- Mencetak setiap baris kontak di bawah nomor telepon toko dan sebelum garis pemisah transaksi.
- Menyediakan tombol `Hapus Logo Invoice` di Pengaturan Android.
- Mengecilkan logo invoice menjadi ukuran maksimum yang proporsional untuk printer 58 mm dan 80 mm.
- Mempertahankan format transaksi, harga, pembayaran, dan data produk yang sudah berjalan.

## Non-goals

- Tidak mengubah struktur transaksi atau skema tabel baru.
- Tidak mengubah barcode/label harga produk.
- Tidak mengubah isi struk web pada tahap ini; fokusnya adalah pengaturan dan cetak native Android.

## Approaches

1. Memakai field `Header struk` yang sudah ada. Paling cepat, tetapi salam dan kontak bercampur.
2. Menambah key-value `receipt_contacts` sebagai field multiline khusus. Dipilih karena fleksibel, tidak memerlukan migrasi database, dan tetap rapi bila jumlah kontak bertambah.
3. Membuat field terpisah untuk WhatsApp 1/2/3 dan Instagram. Lebih terstruktur, tetapi kurang fleksibel dan menambah banyak kontrol UI.

## Implementasi yang direncanakan

- Backend settings mengizinkan key `receipt_contacts` dan endpoint penghapusan logo invoice.
- Android Settings memuat, menyimpan, dan menghapus kontak kepala nota; tombol hapus hanya tampil jika logo invoice tersedia.
- `ReceiptLayout` membaca `receipt_contacts` sebagai multiline dan mencetaknya terpusat.
- `PrinterService` menurunkan batas lebar logo dari lebar penuh kertas menjadi ukuran compact.
- Regression test memverifikasi kontak multiline, logo compact, dan penghapusan logo tidak memengaruhi layout struk lainnya.
- Version code APK dinaikkan sebelum build release split-per-ABI.

## Kriteria selesai

- Kontak WA/Instagram yang disimpan tampil di kepala struk Android, satu baris per catatan.
- Logo invoice dapat dihapus dari Pengaturan dan tidak lagi dicetak setelah dihapus.
- Logo yang masih dipakai tampil lebih kecil.
- Test terkait struk dan printer lulus, serta APK release berhasil dibangun.
