# Dashboard & Laporan bergaya Olsera

## Intent

Membuat dashboard dan laporan Anyostore terasa seperti referensi Olsera pada
mobile dan web: pengguna dapat memahami kondisi toko dalam sekali scroll,
melihat perubahan pendapatan/pengeluaran/retur lewat grafik, lalu turun ke
rincian produk dan kategori tanpa kehilangan filter periode atau cabang.

## Goals

- Mobile (`ReportsPage`, mode dashboard dan laporan ringkasan): header yang
  jelas, pemilih periode, kartu “Sekilas toko”, kartu metrik penjualan, grafik
  pendapatan/pengeluaran/retur, lalu produk/kategori.
- Web (`/dashboard`): ringkasan toko yang lebih terstruktur, grafik tren yang
  menjawab pertanyaan bisnis, distribusi produk, dan transaksi terbaru.
- Menggunakan data nyata dari endpoint yang sudah ada; angka kosong tetap
  ditampilkan sebagai keadaan kosong, bukan angka contoh.
- Menjaga akses owner memilih semua toko atau cabang tertentu.
- Mempertahankan palet Anyostore: denim `#1E3A5F` sebagai struktur/header,
  teal untuk pemasukan/laba, terracotta untuk pengeluaran/retur, dan latar krem.
- Menyediakan loading, error, empty state, serta target sentuh yang nyaman di
  mobile.

## Non-goals

- Tidak mengubah aturan hitung penjualan, retur, laba, atau stok.
- Tidak membuat endpoint baru jika payload yang ada sudah cukup.
- Tidak menambahkan data tiruan, feed aktivitas fiktif, atau grafik yang tidak
  memiliki seri data nyata.
- Tidak mengubah dashboard stok gudang menjadi dashboard penjualan; keduanya
  tetap dipisahkan sesuai role dan alur kerja.

## Chosen approach

Opsi yang dipilih adalah redesign penuh berbasis referensi Olsera dengan
komponen yang tetap dekat dengan struktur proyek saat ini. Mobile memakai
`fl_chart` yang sudah menjadi dependensi untuk grafik; web memakai komponen
SVG/CSS yang sudah dipakai proyek sehingga tidak menambah dependensi chart.

### Mobile composition

```text
Header dashboard / laporan
  periode + lokasi toko/gudang
Sekilas toko
  pelanggan baru · pesanan · pendapatan · pengeluaran · retur · rata-rata
Penjualan
  metrik utama + grafik area/garis + Date/Jam toggle visual
Income
  grafik pemasukan lain
Expense
  grafik pengeluaran
Return
  grafik retur
Kelompok produk
  bar kategori + rincian produk teratas
```

Mode kasir tetap memakai endpoint dashboard kasir yang tersedia dan hanya
menampilkan metrik yang memang dikirim server. Mode owner/manager/admin
menggunakan ringkasan laporan. Filter periode dan lokasi tetap satu sumber
seperti sekarang.

### Web composition

```text
Toolbar: periode + toko aktif + aksi
Sekilas toko: pelanggan baru / pesanan / pendapatan / pengeluaran / retur / rata-rata
Grafik pendapatan
Grafik pengeluaran
Grafik pengembalian
Sumber penjualan
Produk terjual terbanyak
Rincian kelompok/kategori
Transaksi terbaru
```

Grafik web akan memakai seri yang benar-benar tersedia: tren penjualan,
pengeluaran, retur, serta produk/kategori dari payload dashboard atau laporan.

## Visual direction

- Permukaan utama solid krem/putih; glass hanya dipakai untuk satu hero/filter
  penting agar hierarki tetap terbaca.
- Kartu ringkasan memakai label kecil, angka utama, dan divider tipis seperti
  referensi Olsera; tidak semua bagian dijadikan kartu identik.
- Denim menjadi area navigasi/header dan kontrol periode aktif. Teal dan
  terracotta hanya menandai arus uang positif/negatif atau retur.
- Grafik menggunakan grid ringan, label tanggal lokal WIB, tooltip/label yang
  dapat dibaca, dan empty state yang menjelaskan kondisi data.
- Tidak memakai emoji dekoratif; ikon tetap berasal dari sistem ikon Flutter
  dan Lucide web yang sudah digunakan proyek.

## Constraints and verification

- Perubahan harus kompatibel dengan role owner, manager, admin, kasir, dan
  gudang.
- Mobile diuji minimal pada lebar 320 dan 390, light/dark mode.
- Regression test mobile yang sudah ada untuk analytics/dashboard harus tetap
  lolos; tambah assertion untuk “Sekilas toko”, chart sections, dan filter.
- Web dijalankan melalui build/lint yang tersedia serta `git diff --check`.
- Tidak menyatakan selesai sebelum test dan build aktual berhasil.

## Builder calls

- Format angka tetap memakai helper rupiah lokal proyek.
- Sales dan Income dipisah: Sales adalah omzet transaksi, Income adalah
  pemasukan manual.
- Return memakai nominal refund berdasarkan tanggal retur dibuat.
- Toggle Date/Jam tetap ditampilkan sebagai kontrol visual; Jam nonaktif sampai
  endpoint menyediakan data per jam.
- Distribusi produk/kategori memakai jumlah pcs terjual.
- Saat owner melihat semua toko/gudang, produk digabung berdasarkan SKU/nama
  yang sama.
- Elemen Olsera yang belum memiliki aksi/data nyata (hadiah dan verifikasi
  nomor) tidak disalin; drawer, pencarian, dan notifikasi yang sudah ada tetap
  dipakai.
- Jika payload belum punya retur atau kategori pada salah satu mode, tampilkan
  empty state yang jelas dan pertahankan section agar layout konsisten.
- Implementasi dilakukan bertahap: mobile reports dahulu, lalu web dashboard,
  kemudian regression/build/install APK jika perubahan mobile selesai.
