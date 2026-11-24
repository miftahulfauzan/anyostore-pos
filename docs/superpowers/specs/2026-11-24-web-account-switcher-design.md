# Web Account Switcher

Tanggal: 2026-11-24 · Status: disetujui pemilik (2026-11-24).

## Intent & penyebab

Pengguna web yang sudah memiliki sesi valid tetap melihat form ketika membuka `/login`. `LoginPage` tidak memeriksa `/api/auth/me`, sementara `AppStateProvider` mengosongkan sesi UI pada route `/login`. APK sudah menyediakan daftar akun tersimpan dan pindah akun tanpa memasukkan kredensial berulang kali.

## Goals

1. Jika sesi web masih valid, `/login` langsung mengarahkan owner/gudang ke `/dashboard` dan role lain ke `/pos`. Form login tetap tampil untuk sesi yang tidak valid.
2. Tambahkan halaman **Ganti Akun** untuk semua role web, mengikuti alur APK: lihat akun aktif/tersimpan, pindah akun, tambah akun, dan hapus akun tersimpan.
3. Akun hanya disimpan setelah pengguna memilih **Ingat akun ini** (default tidak dicentang). Token tidak disimpan di `localStorage` atau `sessionStorage`.
4. Bedakan **Keluar saja** (akun yang diingat tetap tersedia) dengan **Keluar & hapus akun ini** (sesi dicabut dan akun dihapus dari perangkat), seperti APK.

## Approaches

- Keluar lalu login ulang setiap kali: perubahan lebih kecil dan memakai endpoint logout yang ada, tetapi tidak memenuhi permintaan switcher seperti APK.
- **Switcher dengan sesi tersimpan yang dikelola backend (dipilih pemilik):** satu cookie refresh `HttpOnly` per akun yang diingat; backend memvalidasi dan merotasi sesi saat berpindah. UI hanya menerima metadata akun yang aman.

## Rancangan & batasan

- Gunakan `refresh_tokens` dan `rotateRefresh()` yang sudah ada; hindari migrasi basis data bila struktur sesi saat ini mencukupi.
- Batasi sampai 8 akun tersimpan per browser agar cookie tetap di bawah batas praktis browser/server; jelaskan batas saat pengguna mencoba menambah akun kesembilan.
- Cookie akun tersimpan memakai `HttpOnly`, `Secure` di produksi, `SameSite=Strict`, masa berlaku yang konsisten dengan sesi saat ini, dan `Path=/api/auth`. Jangan kirim token atau password ke browser JavaScript.
- Tambahkan endpoint untuk mendaftar akun tersimpan, membaca metadata akun aktif/tersimpan, beralih ke akun tersimpan, dan mencabut/menghapus akun. Endpoint switch hanya menerima ID akun; backend harus memastikan cookie tersimpan benar-benar milik akun tersebut.
- Refresh sesi aktif harus ikut memperbarui cookie akun tersimpan agar rotasi token tidak membuat pilihan akun kedaluwarsa. Saat berpindah, sesi akun asal yang tidak disimpan dicabut; sesi yang memang disimpan tetap bisa dipilih kembali. Akun tidak valid/dinonaktifkan dikeluarkan dari daftar.
- Tambahkan tautan **Ganti Akun** di navigasi web untuk seluruh role, halaman switcher, checkbox ingat akun di login, serta dialog keluar dengan dua pilihan. Jika akun aktif belum diingat saat **Tambah akun**, tampilkan **Simpan & lanjut**, **Lanjut tanpa menyimpan** (mencabut sesi asal), dan **Batal**.
- Cookie tersimpan hanya dikirim ke endpoint auth; metadata daftar tidak mencakup token. Hapus akun harus mencabut sesi terkait di basis data, bukan hanya menyembunyikan namanya.
- Menghapus akun yang sedang aktif juga mengakhiri sesi aktif tersebut.

## Non-goals

- Tidak menyimpan password atau JWT di penyimpanan browser yang dapat dibaca JavaScript.
- Tidak mengubah sesi mobile, autentikasi reseller, izin role, atau durasi sesi global.
- Tidak menambah pilihan banyak akun pada halaman login saat pengguna belum memiliki sesi aktif; daftar akun tersedia dari aplikasi setelah login, sesuai pola APK.

## Penerimaan

- Sesi valid yang membuka `/login` masuk ke halaman awal role; sesi tidak valid tetap mendapat form login.
- Pengguna dapat mengingat akun secara opt-in, menambahkan akun lain, berpindah berulang kali, menghapus akun tersimpan, dan memilih keluar saja atau keluar sekaligus menghapus akun.
- Cookie sensitif tidak dapat dibaca JavaScript, sesi yang dicabut tidak dapat dipakai untuk kembali masuk, dan data lintas akun tidak terbawa saat berpindah.
