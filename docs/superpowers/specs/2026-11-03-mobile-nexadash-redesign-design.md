# Design: Anyostore Mobile Sales Workspace

Tanggal: 2026-11-03  
Status: menunggu persetujuan sebelum implementasi

## Intent

Menyatukan tampilan aplikasi Flutter mobile POS, penjualan, inventori, keuangan,
dan utilitas ke visual yang lebih tenang, tegas, dan mudah dipindai seperti
referensi NexaDash, tanpa menyalin identitas produk tersebut. Pengguna utama
adalah owner, manager, admin, kasir, dan gudang yang membutuhkan keputusan cepat
di layar kecil.

Design read: aplikasi operasional mobile untuk toko denim Indonesia, dengan
bahasa visual analytics yang terang dan rapi, memakai Material 3 Flutter dengan
token Anyostore sendiri.

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1.

Signature: satu fokus biru denim pada tindakan atau metrik utama per layar,
sementara data pendukung tetap datar dan tenang.

## Current state audit

- Token utama ada di `mobile/lib/src/task_ui.dart`, sedangkan theme global ada
  di `mobile/lib/main.dart`.
- Sebagian besar halaman sudah memakai `GlassCard`, tetapi implementasinya
  sebenarnya solid tanpa blur. Nama API dipertahankan agar tidak memaksa edit
  besar di seluruh caller.
- Shell memakai AppBar + drawer kiri + `IndexedStack`. Ini dipertahankan karena
  menjaga state keranjang POS dan halaman yang sudah dibuka.
- Palet source dan ekspektasi test saat ini tidak sepenuhnya sama. Migrasi akan
  menyelaraskan test palette dengan token baru, bukan menambah alias warna baru.
- Logika API, offline queue, branch scope, role permissions, printer, checkout,
  dan status data bukan bagian dari perubahan visual.

## Goals

1. Satu sistem warna, typography, radius, border, dan elevation untuk seluruh
   aplikasi mobile.
2. Dashboard menjadi pusat perhatian dengan satu KPI utama, grafik yang terbaca,
   dan ringkasan operasional yang tidak terasa seperti deretan kartu identik.
3. POS tetap cepat untuk pencarian, pemilihan produk, varian, keranjang, dan
   pembayaran.
4. Drawer, login, filter, form, dialog, empty/loading/error state, dan halaman
   sekunder memakai bahasa visual yang sama.
5. Menjaga touch target minimum 44 px, kontras teks, mode terang/gelap, dan
   perilaku tablet tanpa mengubah alur bisnis.

## Non-goals

- Tidak mengubah backend, database, endpoint, route, atau format payload.
- Tidak mengubah IA, label navigasi utama, izin role, atau aturan branch scope.
- Tidak mengubah logo atau membuat aset brand baru.
- Tidak menambah package font, icon, chart, atau motion.
- Tidak mendesain ulang frontend web Next.js pada fase ini.
- Tidak membuat data contoh menjadi data produk. Angka pada mockup hanya konsep;
  layar aplikasi tetap memakai data API/cache nyata.

## Palette and tokens

Palet ini mengambil kontras terang, putih, dan biru dari referensi, lalu
mempertahankan denim sebagai identitas Anyostore.

| Token | Nilai | Fungsi |
|---|---|---|
| `kTaskBg` | `#F4F6F8` | latar halaman |
| `kTaskSurface` | `#FFFFFF` | panel, kartu, input |
| `kTaskSurfaceMuted` | `#EEF2F6` | area sekunder dan selected-soft |
| `kTaskInk` | `#151821` | teks utama dan ikon penting |
| `kTaskSecondary` | `#5D6878` | teks pendukung |
| `kTaskDark` | `#1E3A5F` | primary denim, tombol utama, active state |
| `kTaskAccent` | `#3D83F6` | garis/fokus grafik dan highlight utama |
| `kTaskBorder` | `#D9E0E8` | border netral |
| `kTaskDarkBg` | `#10151D` | latar dark mode |
| `kTaskDarkSurface` | `#18212C` | surface dark mode |

Hijau, amber, dan merah tetap dipakai hanya sebagai warna semantik untuk stok,
status transaksi, dan error, selalu ditemani label atau ikon.

## Shape, type, and elevation

- Body dan angka memakai sans platform yang sudah ada: Roboto pada Android dan
  CupertinoSystemText pada iOS. Tidak ada dependency font baru.
- Heading menggunakan weight 700/800 dan line-height rapat. Angka KPI memakai
  weight 800, bukan font display baru, agar tetap terbaca pada layar kecil.
- Radius: 12 px untuk input dan control, 16 px untuk card, 20 px untuk hero
  surface atau drawer header. Tombol boleh 14 px, bukan pill global.
- Border 1 px menjadi pemisah utama. Shadow hanya untuk drawer, bottom sheet,
  dan satu focal card yang benar-benar berada di atas konten.
- `GlassCard` tetap menjadi API bersama, tetapi default-nya solid putih dengan
  border. `frosted: true` hanya dipertahankan untuk hero tunggal seperti login.

## Component direction

### App shell and drawer

- AppBar terang, tinggi ringkas, judul kiri/center sesuai pola existing, tombol
  menu tetap mudah ditemukan.
- Drawer putih dengan profil, toko aktif, menu grup, dan satu active row berwarna
  biru muda. Tidak setiap menu diberi card atau warna sendiri.
- Offline indicator tetap terlihat dan tidak bergantung pada warna saja.

### Dashboard and reports

- Urutan visual: periode/lokasi, KPI utama, tren yang menjawab pertanyaan nyata,
  ringkasan stok, lalu aktivitas atau produk teratas.
- Grafik memakai satu garis biru dan area ringan seperlunya. Judul grafik
  menyebut pertanyaan/data yang ditampilkan.
- Kartu ringkasan tidak dipaksa berjumlah empat; ukuran mengikuti bobot data.

### POS and inventory

- Search field dan selector branch/gudang menjadi control utama dengan border
  jelas dan focus state denim.
- Grid produk memakai surface putih, foto produk nyata dari API, dan aksi tambah
  yang mudah disentuh.
- Keranjang memakai satu surface fokus di bagian bawah. Tombol `Bayar` menjadi
  primary action yang konsisten.
- Warna hijau untuk stok masuk dan amber untuk stok keluar tetap semantik, tidak
  dijadikan identitas halaman.

### Forms, dialogs, and states

- Form field selalu memiliki label terlihat, placeholder hanya sebagai contoh.
- Loading memakai skeleton atau progress yang menjelaskan konteks.
- Empty state menjelaskan penyebab dan tindakan berikutnya.
- Error state menyebut kegagalan dan menyediakan retry yang benar-benar bekerja.
- Dialog dan bottom sheet mengikuti surface, radius, padding, dan focus color
  yang sama.

## Approaches considered

1. **Token-first shared migration, chosen.** Mengubah token dan komponen bersama
   terlebih dahulu, kemudian audit caller. Ini paling konsisten dan paling kecil
   risikonya karena sebagian besar halaman sudah memakai `task_ui.dart`.
2. **Page-by-page rebuild.** Memberi kebebasan komposisi lebih besar, tetapi
   berisiko menghasilkan variasi warna, radius, dan state antarhalaman.
3. **Core-screen-only redesign.** Lebih cepat untuk validasi, tetapi tidak
   memenuhi tujuan perubahan menyeluruh.

## Rollout

1. Token, `ThemeData`, `GlassCard`, `PillTabs`, button/input, dan shared shell.
2. Login, splash, AppBar, drawer, profile, branch selector, dan offline tile.
3. Dashboard, Reports, POS, payment sheet, History, dan Finance.
4. Inventory, mutation, transfer, products, customers, commissions, settings,
   dan halaman utilitas.
5. Reconcile tests, run analyzer/test suite, build APK split ABI, lalu audit
   light/dark, loading/empty/error, tablet, dan touch target.

## Verification contract

- Tidak ada perubahan pada API atau business logic.
- Test palette dan widget shared UI harus menyatakan token yang disetujui.
- `flutter analyze` dan `flutter test` harus dijalankan.
- Build terbaru menggunakan `flutter build apk --release --split-per-abi`.
- Laporan akhir harus menyebut hasil test, build, dan area yang belum diverifikasi.

## Decision needed

Persetujuan dokumen ini diperlukan sebelum implementasi. Perubahan warna pada
test yang saat ini mengharapkan palet lama dianggap bagian dari migrasi token,
bukan perubahan perilaku aplikasi.
