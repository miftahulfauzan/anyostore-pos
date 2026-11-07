# Pengaturan Skala Font Mobile

## Intent

Menambahkan kontrol ukuran teks global pada aplikasi Android tanpa mengubah baseline visual APK acuan: Plus Jakarta Sans tetap digunakan, pilihan tersimpan di perangkat, dan area sentuh tombol tetap mengikuti desain aplikasi.

## Goals

- Menyediakan enam pilihan skala: `0.4`, `0.6`, `0.8`, `1.0`, `1.2`, dan `1.4`.
- Menggunakan `1.0` sebagai default dan memulihkan pilihan setelah aplikasi dibuka kembali.
- Menerapkan skala ke seluruh halaman melalui `MediaQuery.textScaler`, bukan per halaman.
- Menampilkan pilihan di bagian `Tampilan` pada `SettingsPage` dengan kontrol yang tidak overflow di layar ponsel.
- Menjaga skala teks tetap responsif terhadap lebar layar dan tidak mengecilkan target sentuh minimum.

## Non-goals

- Tidak mengubah font family Plus Jakarta Sans.
- Tidak mengubah ukuran ikon, padding, atau target sentuh secara global.
- Tidak menambah setting ke backend atau menyinkronkan ukuran font antar perangkat.

## Approaches

1. Mengubah `TextTheme` saja: ditolak karena banyak komponen memakai `TextStyle(fontSize: ...)` langsung.
2. Mengubah `MediaQuery.textScaler` tanpa penyimpanan: ditolak karena pilihan hilang saat aplikasi dimuat ulang.
3. Hybrid yang dipilih: controller lokal berbasis `ValueNotifier<double>` + `SharedPreferences`, `MediaQuery.textScaler` di root `MaterialApp`, serta kontrol pilihan di `SettingsPage`. Skala aplikasi dikalikan dengan skala teks sistem Android, lalu dibatasi ke rentang `0.4–1.4`; pada lebar <=340 logical px, nilai efektif di atas `1.2` ditahan di `1.2` agar layout dua kolom dan toolbar tetap usable. Area klik tidak ikut diperkecil.

## Implementation decisions

- File baru `mobile/lib/src/font_scale_controller.dart` memiliki daftar opsi immutable, label, nilai default, `load()`, `set(double)`, dan helper skala efektif berbasis lebar layar.
- Kunci penyimpanan lokal adalah `pos_font_scale`.
- `main.dart` memuat controller sebelum `runApp`, mendengarkan perubahan melalui `ValueListenableBuilder`, lalu memasang `MediaQuery` baru pada builder `MaterialApp` yang menggabungkan pilihan aplikasi dengan skala teks sistem Android.
- `SettingsPage` menampilkan enam `ChoiceChip` dalam `Wrap` agar tetap terbaca pada layar sempit.
- Test unit memverifikasi daftar opsi, default, validasi nilai tersimpan, persistence, dan batas responsif; test widget memverifikasi pilihan tampil dan dapat mengubah notifier.

