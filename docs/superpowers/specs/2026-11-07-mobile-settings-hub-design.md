# Mobile Settings Hub Design

## Intent

Merapikan Pengaturan Android menjadi hub bergaya “Settings & activity”: grup sederhana, baris penuh dengan ikon dan chevron, divider tipis, dan detail fitur pada halaman terpisah. Tujuannya mengurangi rasa penuh dari daftar kartu panjang tanpa mengubah fungsi pengaturan.

## Goals

- Hub Pengaturan dapat dipindai cepat dalam satu layar.
- Grup dan nama menu konsisten: Toko & Invoice, Produk, POS & Printer, Tampilan, Data, dan Cabang.
- Setiap baris membuka detail dengan tombol kembali yang jelas.
- Tema terang tetap krem + denim `#1E3A5F`; tema gelap memakai surface gelap yang sudah ada.
- Semua aksi lama tetap tersedia: simpan identitas, logo, kategori, printer, tampilan, backup, notifikasi, dan cabang.

## Non-goals

- Tidak mengubah API, hak akses, atau alur penyimpanan.
- Tidak mengubah POS, keranjang, drawer, atau halaman pengaturan web.
- Tidak menambah navigasi bawah baru.

## Approaches

1. Accordion satu halaman: ditolak karena masih menyisakan halaman panjang dan tidak mengikuti referensi “Settings & activity”.
2. Hub + detail: dipilih karena hierarki paling jelas, cocok dengan referensi, dan dapat mempertahankan form yang sudah ada sebagai detail tanpa mengubah API.
3. Tab kategori: ditolak karena menyembunyikan pengaturan di balik tab dan kurang mirip referensi.

## Decisions

- `SettingsHubPage` menjadi entry point dari drawer.
- `SettingsPage` tetap menjadi renderer detail yang menerima section key.
- Baris hub memakai target sentuh minimum 48dp, ikon Material yang konsisten, subtitle singkat, dan chevron.
- Section yang tidak relevan untuk role gudang tidak ditampilkan.
- Detail boleh memakai `GlassCard` yang sudah ada; hub tidak memakai kartu besar per menu.

## Success criteria

- Hub menampilkan grup dan baris yang benar pada lebar 320dp dan 390dp tanpa overflow.
- Tap baris membuka halaman detail yang tepat dan tombol kembali mengembalikan hub.
- Test existing untuk kategori, font scale, printer, dan settings tetap lulus.
