# Role Visibility: Stok Masuk/Keluar

## Intent

Mutasi stok masuk dan stok keluar adalah operasi gudang. Menu dan halaman inputnya hanya boleh terlihat oleh owner dan admin gudang (`gudang`) di web serta Android. Manager, admin toko, dan kasir tidak mendapat entry point untuk operasi tersebut.

## Behavior

- Web sidebar menampilkan Stok Masuk dan Stok Keluar hanya untuk `owner` atau `gudang`.
- Android drawer, selector inventori, dan shortcut POS tidak menampilkan/membuka operasi tersebut untuk role lain.
- Direct navigation ke halaman input tetap ditolak/diarahkan kembali; penyembunyian menu bukan satu-satunya guard.
- Endpoint penyimpanan mutasi masuk/keluar dan kelola channel menerima hanya `owner` dan `gudang`. Endpoint baca katalog/target tetap dapat dipakai role lain karena juga dipakai oleh transfer stok dan riwayat mutasi.
- Riwayat mutasi dan operasi inventori lain tidak berubah oleh fitur ini.
- Owner tetap dapat memilih cabang/gudang dengan alur yang sudah ada; admin gudang tetap mengikuti scope gudang yang sudah ada.

## Non-goals

- Tidak mengubah stok, payload transaksi, transfer, opname, atau laporan riwayat.
- Tidak menghapus data atau permission role lain untuk membaca riwayat yang sudah tersedia.

## Verification

- Web static regression test memastikan menu dan guard memakai role `owner`/`gudang`.
- Backend authorization test memastikan role toko menerima 403 untuk endpoint mutasi dan role yang diizinkan tidak ditolak oleh middleware.
- Android widget test memastikan selector/shortcut mutasi tidak ada untuk role non-allowed dan ada untuk owner/gudang.
