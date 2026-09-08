# Audit Anyostore POS — 8 September 2026

## Kesimpulan

Ada 17 kelompok temuan yang perlu ditindaklanjuti: 7 prioritas tinggi (P1) dan 10 prioritas menengah (P2). Masalah terpenting menyangkut keutuhan stok/riwayat, pencabutan akses akun, kelengkapan backup, dan verifikasi deploy. Perbaikan tampilan saja belum menyelesaikan masalah tersebut.

P1 berarti sebaiknya diperbaiki lebih dahulu karena berpotensi mengubah/menghilangkan data, mempertahankan akses yang sudah dicabut, atau meloloskan rilis bermasalah. P2 berarti alur kerja, ketepatan informasi, atau pemeliharaan perlu diperbaiki. Prioritas ini bukan pernyataan bahwa insiden sudah terjadi di produksi.

## Lingkup dan bukti pemeriksaan

- Basis audit: GitHub `main`, commit `1b76d5e82ee8f88aa2338c513c694fd4545b0a3b`, diverifikasi melalui remote Git.
- Kode commit tersebut diperiksa di salinan terpisah `/private/tmp/pos-pakaian-list-fix`. Folder kerja utama belum berada pada commit yang sama; lihat A17.
- Pemeriksaan mendalam: produk, stok opname, transfer, batas akses cabang, autentikasi, backup, frontend katalog/sidebar, dan CI/deploy. Dashboard Flutter diperiksa secara statis.
- Tes backend: **65 lulus**. Menggunakan dependensi backend yang telah tersedia di workspace; bukan instalasi bersih di container produksi.
- Tes helper frontend: **10 lulus**. Tes ini belum membuktikan posisi elemen CSS maupun alur browser end-to-end.
- Lint frontend: **0 error, 21 warning**. Mayoritas warning terkait gambar; warning tidak otomatis berarti bug atau pelanggaran aksesibilitas.
- Build produksi frontend: **berhasil**.
- Enam simulasi lokal menggunakan mock, tanpa koneksi database, mengonfirmasi perilaku autentikasi, penghapusan riwayat, penghapusan parsial, backup terpotong, opname dengan stok lama, dan parsing tanggal UTC/WIB. Satu pemeriksaan shell juga membuktikan `unhealthy` cocok dengan pola `*healthy*` pada deploy.
- Belum dilakukan: pemeriksaan database/log/container VPS, transaksi produksi, restore backup nyata, audit CVE dependency terbaru, pengujian browser semua halaman/ukuran layar/role, dan build Android.
- Tidak ada kode aplikasi atau data produksi yang diubah. Audit hanya menghasilkan dokumen ini; tidak melakukan commit, push, atau deploy.

Semua tautan sumber di bawah menunjuk ke commit yang diaudit, bukan ke `main` yang dapat berubah. Panduan `security-review` digunakan untuk menyusun pemeriksaan akses, input, dan operasi sensitif; hasil audit tetap didasarkan pada kode dan pengujian yang disebutkan.

## P1 — Prioritas tinggi

### A01. Menonaktifkan akun belum langsung mencabut akses sesi lama

**Bukti:** `authenticate()` memverifikasi tanda tangan JWT lalu memakai role/cabang di dalam token tanpa mengecek status akun terkini. Token berlaku 365 hari. Endpoint nonaktifkan akun hanya mengubah `users.is_active`; perubahan password/role juga tidak membatalkan access token lama. Pemeriksaan akun aktif baru dilakukan pada refresh.

**Dampak:** akun yang sudah dinonaktifkan, atau diturunkan hak aksesnya, masih dapat memakai access token lama. Simulasi lokal mengonfirmasi middleware tidak membaca status pengguna dari database.

**Saran:** tambahkan sesi server-side atau versi token yang bisa dicabut, dan validasi status/izin terkini. Pengguna tetap dapat mempertahankan sesi panjang sesuai kebutuhan; mencabut akses tidak harus berarti membuat semua pengguna sering login ulang.

Sumber: [authenticate](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/auth.js#L155), [umur token](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/auth.js#L52), [nonaktifkan akun](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/users.js#L147).

### A02. Hapus produk dapat menghapus riwayat barang masuk/keluar

**Bukti:** pemeriksaan `hasHistory` menghitung penjualan, PO, opname, transfer, retur, dan supplier, tetapi tidak menghitung `stock_mutations`. Jika hitungan tersebut nol, route menghapus `stock_mutations`, `warehouse_stocks`, dan produk. Import histori lama menyimpan riwayat langsung di `stock_mutations`.

**Dampak:** produk yang hanya memiliki histori import atau mutasi masuk/keluar bisa dianggap tidak memiliki riwayat. Menghapusnya juga menghilangkan histori dan saldo gudangnya. Tidak ada pemeriksaan stok harus nol pada jalur tersebut.

**Saran:** jadikan arsip/nonaktif sebagai default untuk produk dengan stok atau riwayat apa pun. Sebelum hard-delete, hitung seluruh referensi stok/transaksi dan tampilkan dampaknya dalam konfirmasi. Riwayat tidak boleh ikut dibuang hanya untuk membersihkan katalog.

Sumber: [pemeriksaan dan hard-delete](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L715), [bulk-delete](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L665), [import histori](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/scripts/import-inventory-backup.js#L63).

### A03. Penghapusan tidak atomik dan kegagalan massal kurang jelas

**Bukti:** rangkaian penghapusan memakai `db.execute()` terpisah tanpa transaction. File media dihapus sebelum seluruh perubahan database berhasil. Pada bulk-delete, error per produk ditangkap dan hanya ID dimasukkan ke `failed`; respons tetap `success: true` dan frontend hanya menampilkan pesan umum.

**Dampak:** kegagalan di tengah dapat meninggalkan produk tetapi stok/riwayat/fotonya sudah terhapus. Simulasi error saat hapus varian membuktikan query hapus stok dan mutasi sudah dijalankan sebelumnya, tanpa rollback. Pesan “Tidak ada produk yang terhapus” tidak menjelaskan dampak parsial maupun sebabnya.

**Saran:** satu transaksi database per operasi yang disepakati, rollback pada kegagalan, dan bersihkan media setelah commit dengan pemeriksaan referensi. Respons massal perlu memisahkan berhasil/diarsipkan/gagal beserta alasan; frontend jangan mengosongkan pilihan produk gagal tanpa penjelasan.

Sumber: [bulk-delete](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L680), [delete tunggal](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L734), [pesan frontend](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/products/page.js#L107).

### A04. Opname dapat menimpa pergerakan stok yang terjadi setelah form dibuka

**Bukti:** form mengisi semua `physical_stock` dari stok sistem saat load, lalu mengirim semua baris ketika disimpan, termasuk yang tidak diedit atau tersembunyi oleh pencarian. Backend menghitung selisih terhadap saldo terbaru, tanpa membedakan baris yang benar-benar dihitung pengguna.

**Contoh terverifikasi dengan mock:** form memuat stok 10; transaksi lain mengurangi stok menjadi 8; pengguna hanya mengedit produk lain; simpan tetap mengirim 10 untuk produk ini, sehingga backend menambah 2.

**Dampak:** saldo menjadi tidak sesuai meskipun transaksi sebelumnya valid. Input yang dikosongkan juga berubah menjadi nol melalui `Number('')`.

**Saran:** gunakan status “sudah dihitung” per baris, bukan otomatis menganggap semua produk sudah dihitung. Kirim hanya baris yang dikonfirmasi; bedakan kosong dari nol. Simpan versi/waktu snapshot dan minta rekonsiliasi jika ada mutasi setelah penghitungan. Saat pindah gudang, hentikan respons lama dan nonaktifkan simpan sampai data baru siap.

Sumber: [inisialisasi](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/inventory/opname/page.js#L19), [payload seluruh baris](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/inventory/opname/page.js#L49), [perhitungan selisih](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L655).

### A05. Transfer antarcabang mengabaikan ukuran varian

**Bukti:** route mengambil varian sumber hanya `id,color,price`, mencari varian tujuan dengan `color` saja dan `LIMIT 1`, lalu membuat varian baru dengan `size = null`. Produk di aplikasi mendukung kombinasi ukuran dan warna, termasuk ukuran tanpa warna. Selain itu, `stock_transfer_items` menyimpan product ID sumber bersama variant ID tujuan.

**Dampak:** warna sama dengan ukuran S/M bisa masuk ke ukuran yang keliru. Varian warna NULL tidak cocok dengan perbandingan SQL `color=?` berparameter NULL, sehingga dapat dibuat lagi tanpa ukuran. Pasangan product/variant pada rincian transfer juga tidak konsisten.

**Saran:** petakan produk dan varian sumber–tujuan secara eksplisit; cocokkan kombinasi ukuran+warna dengan penanganan NULL yang benar. Simpan identitas sumber dan tujuan secara konsisten. Tambahkan tes dua ukuran dengan warna sama dan varian ukuran saja.

Sumber: [pencocokan varian](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L534), [rincian transfer](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L585), [dukungan ukuran/warna](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L77).

### A06. Backup bukan salinan lengkap meskipun UI menyebut “seluruh data”

**Bukti:** setiap tabel dibatasi 10.000 baris. Tabel yang gagal dibaca dilewati. Metadata `truncated_tables` ada di respons API tetapi tidak di JSON yang diunduh dan tidak diperiksa frontend. Tidak ada transaksi snapshot konsisten lintas tabel. Volume media disk juga tidak termasuk file JSON ini.

**Dampak:** pemilik dapat menyimpan backup yang kehilangan sebagian transaksi atau referensi penting tanpa peringatan. Memulihkan JSON database saja juga tidak memulihkan foto pada penyimpanan disk.

**Saran:** export lengkap secara streaming/bertahap dari snapshot konsisten, sertakan manifest jumlah baris dan error, serta arsip media sesuai mode penyimpanannya. Jika tidak lengkap, jangan tampilkan “backup selesai” tanpa peringatan. Tambahkan prosedur restore tervalidasi dan uji restore di database terpisah. Route backup sekarang hanya menyediakan download; pemulihan end-to-end belum terbukti.

Sumber: [batas dan error backup](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/backup.js#L15), [download frontend](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/settings/page.js#L134), [klaim seluruh data](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/settings/page.js#L286), [volume uploads](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/docker-compose.production.yml#L63).

### A07. Deploy dapat melaporkan sukses tanpa layanan sehat

**Bukti:**

- CI dan deploy sama-sama dipicu `push main`, tanpa ketergantungan yang menunggu CI lulus.
- Pola shell `*healthy*` juga cocok dengan `unhealthy`; ini berhasil direproduksi lokal.
- Setelah timeout loop, workflow tidak mewajibkan health backend/frontend sukses.
- Bila `git pull` sudah berhasil tetapi build gagal, menjalankan ulang deploy pada commit yang sama dihentikan dengan pesan “Tidak ada commit baru”.
- Tidak ada penguncian concurrency rilis; checkout VPS mengikuti `main` saat pull, bukan selalu SHA pemicu workflow.

**Dampak:** tanda hijau deploy belum membuktikan versi yang benar sudah sehat, dan percobaan ulang dapat gagal meskipun justru dibutuhkan.

**Saran:** gate deploy pada CI sukses untuk SHA yang sama, serialkan rilis, periksa status health dengan nilai tepat, verifikasi endpoint frontend/backend, izinkan redeploy commit yang sama, dan siapkan rollback teruji. Migrasi gagal perlu menggagalkan startup/rilis secara tegas.

Sumber: [workflow deploy](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/.github/workflows/deploy.yml#L3), [retry commit sama](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/.github/workflows/deploy.yml#L32), [health check](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/.github/workflows/deploy.yml#L58), [CI](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/.github/workflows/ci.yml#L3).

## P2 — Alur kerja, frontend, dan pemeliharaan

### A08. Hak baca dan hak aksi produk berbeda, tetapi UI tidak menjelaskannya

Akun gudang dapat membaca katalog gudang lain, sedangkan edit/salin tetap memakai cabang akun. Hapus lintas cabang diberi pengecualian berdasarkan dua ejaan nama “Gudang Riject Perbaikan”, bukan konfigurasi izin berbasis ID. Tombol aksi tetap tampil. Pada mode Semua Gudang, delete/copy tidak mengirim cabang produk; respons daftar juga tidak menyertakan `branch_id` per produk.

**Dampak:** produk terlihat tetapi aksi memberi “Produk tidak ditemukan”; mengganti nama cabang dapat mengubah izin hapus secara tidak sengaja. Ini cukup untuk menjelaskan salah satu kelas error yang dilaporkan pengguna, tetapi permintaan produksi tertentu belum dilacak.

**Saran:** tetapkan matriks hak akses per role/cabang; jangan otomatis memperluas izin. Server mengembalikan cabang dan kemampuan aksi per produk, frontend mengikuti izin itu dengan alasan yang jelas. Error izin sebaiknya dibedakan dari produk benar-benar tidak ada.

Sumber: [helper cabang](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L23), [pengecualian nama gudang](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L52), [scope aksi frontend](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/products/page.js#L71), [kolom respons](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/products.js#L264).

### A09. Transfer yang dapat dibuat akun gudang belum tentu terlihat di riwayatnya

Role gudang boleh mentransfer antar cabang, tetapi query riwayat non-owner hanya menerima transfer yang asal atau tujuannya berada pada cabang akun. Contoh: akun Gudang Utama mentransfer Rak Riject → Riject Perbaikan; riwayat tersebut tidak memenuhi filter cabang akun.

**Saran:** selaraskan izin transaksi dengan izin melihat bukti transaksi. Minimal pengguna dapat melihat transfer yang ia buat, sesuai kebijakan akses yang disepakati; filter gudang dan cabang harus konsisten di API dan UI.

Sumber: [filter riwayat](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L67), [pemilihan sumber lintas cabang](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L395), [role transfer](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/transfer-rules.js#L1).

### A10. Pencocokan nama produk transfer belum konsisten

Helper menyamakan tanda hubung, underscore, spasi ganda, dan huruf besar/kecil. Namun query SQL sebelumnya sudah membatasi kandidat berdasarkan nama trim+lowercase saja. Nama `AB07-BORDIR` dan `AB07 BORDIR` tidak lolos filter awal yang sama. Bila fallback SKU juga tidak cocok, transfer bisa membuat produk baru atau menemui konflik SKU.

**Saran:** gunakan kunci identitas produk induk lintas cabang. Untuk kompatibilitas data lama, terapkan satu normalisasi yang sama dari pencarian kandidat hingga pemetaan akhir, lalu tinjau kandidat ambigu; jangan hanya mengandalkan kemiripan nama.

Sumber: [prefilter SQL](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L439), [normalisasi helper](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/transfer-rules.js#L5).

### A11. Transfer belum terlindungi dari pengiriman ulang transaksi yang sama

Frontend tidak mengirim ID permintaan stabil, dan kedua endpoint transfer membuat record baru setiap permintaan. Bila commit sukses tetapi respons putus, pengguna yang mencoba lagi bisa membuat transfer kedua. Tombol disabled selama request tidak menyelesaikan kondisi tersebut.

**Saran:** gunakan ID idempotensi per transfer dengan unique constraint, simpan hasil atomik, dan kembalikan hasil transfer awal pada retry. Ini risiko dari kode, bukan kesimpulan bahwa transfer ganda pada screenshot pasti terjadi karena retry.

Sumber: [request frontend](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/inventory/transfers/page.js#L313), [insert transfer](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/routes/inventory-control.js#L412).

### A12. Konfigurasi tanggal berisiko menampilkan waktu tujuh jam lebih maju

MySQL produksi memakai `+07:00`, sedangkan konfigurasi mysql2 tidak menetapkan `timezone` dan container backend tidak menetapkan TZ. Driver memakai zona lokal proses. Parsing DATETIME WIB sebagai UTC lalu menampilkannya di browser WIB menghasilkan selisih +7 jam. Simulasi parser driver dalam proses UTC mengonfirmasi pergeseran itu; timezone container live belum diperiksa.

**Dampak:** waktu tampilan dan nomor transfer berbasis tanggal dapat berpindah ke hari berikutnya. Ini konsisten dengan pola screenshot lama, tetapi belum membuktikan konfigurasi VPS aktual.

**Saran:** tetapkan kontrak penyimpanan/parsing waktu secara eksplisit; audit data lama sebelum mengonversinya. Bedakan tanggal bisnis tanpa waktu dengan timestamp ber-offset. Uji sekitar pergantian hari WIB.

Sumber: [timezone database](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/docker-compose.production.yml#L6), [config driver](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/config.js#L11), [format frontend](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/inventory/transfers/page.js#L21), [nomor transfer](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/backend/src/transfer-history.js#L3).

### A13. Beberapa kontrol frontend tidak konsisten dengan hasilnya

- Menghapus isi kolom jumlah transfer untuk mengetik ulang langsung membuang barang dari keranjang: `Number('')` menjadi 0 dan `flatMap` menghapus baris.
- Mengganti cabang katalog menjalankan `load('')` tanpa menghapus teks pencarian. Kotak masih menampilkan kata kunci, tetapi hasil diambil tanpa filter itu.
- Default `branchId` kosong tidak punya option pasangan pada select akun gudang; option pertama “Semua Gudang” dapat terlihat, sementara request tanpa `branch_id` memuat cabang akun.
- Katalog hanya mengambil 500 produk dan mengabaikan `totalPages`. Jika jumlah melampaui batas, daftar tidak menyediakan navigasi menuju sisanya.

**Saran:** simpan input jumlah sebagai string sementara, validasi saat blur/submit, dan gunakan tombol hapus tersendiri. Satukan state pencarian/sort/cabang dengan parameter request dan nilai select yang valid. Gunakan pagination dan jumlah hasil sebenarnya.

Sumber: [jumlah transfer](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/inventory/transfers/page.js#L307), [load katalog](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/products/page.js#L27), [efek pergantian cabang](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/products/page.js#L64), [select gudang](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/products/page.js#L147).

### A14. Sidebar ikon saja kehilangan nama aksesibel

Pada desktop collapsed, teks menu dan Keluar disembunyikan dengan `display: none`. Ikonnya `aria-hidden`, sedangkan link/tombol tersebut tidak memiliki `aria-label` pengganti. Akibatnya kontrol tidak memiliki nama yang memadai untuk pembaca layar; pengguna awam juga tidak memperoleh tooltip nama menu.

**Saran:** tambahkan accessible name yang tetap ada pada mode collapsed dan tooltip saat hover/fokus; pertahankan fokus keyboard yang jelas. Jangan mengembalikan teks terpotong hanya untuk memberi label.

Sumber: [link sidebar](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/components/AppShell.js#L259), [aturan icon rail](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/globals.css#L2108).

### A15. State sidebar/tema diinisialisasi ulang pada tiap halaman

`AppShell` digunakan di masing-masing page, bukan satu layout persisten. Nilai awal collapsed adalah false dan tema light; preferensi baru dibaca lewat effect. Role/settings juga diminta ulang saat mount. Kode sudah menyembunyikan menu role yang belum diketahui, tetapi perubahan lebar/tema awal masih berpotensi terlihat sebelum state tersimpan diterapkan.

**Saran:** tempatkan shell dan sesi pada shared layout/provider, dan sediakan nilai awal preferensi yang konsisten dengan render awal. Kurangi override sidebar berulang di CSS. Lakukan pengukuran visual saat navigasi, refresh, dan jaringan lambat; audit ini belum mengukur flicker pada browser live.

Sumber: [state awal dan effect](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/components/AppShell.js#L115), [root layout](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/frontend/app/layout.js#L38).

### A16. Dashboard Android masih menampilkan data dummy

Kode menetapkan angka kategori, top produk, persentase aman/hampir/kosong, dan grafik harian buatan. Pada kegagalan API, dummy dibiarkan tampil; hasil kategori/top-produk kosong juga tidak selalu menggantikan nilai awal. Ini bertentangan dengan kebutuhan laporan memakai data nyata.

**Saran:** loading memakai skeleton tanpa angka bisnis, respons kosong menampilkan keadaan kosong, dan error memakai pesan gagal/retry. Jika memakai cache, tandai tanggal pembaruannya. Jangan mengganti kegagalan API dengan angka contoh.

Sumber: [nilai awal dummy](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/mobile/lib/src/dashboard_page.dart#L60), [grafik buatan](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/mobile/lib/src/dashboard_page.dart#L138), [fallback](https://github.com/miftahulfauzan/anyostore-pos/blob/1b76d5e82ee8f88aa2338c513c694fd4545b0a3b/mobile/lib/src/dashboard_page.dart#L223).

### A17. Folder kerja utama berbeda dari versi terbaru GitHub

Saat diperiksa, folder kerja utama berada pada `b933220`, sementara GitHub main berada pada `1b76d5e`. Tracking lokal origin/main masih `1bd00ee`; tulisan ahead/behind lokal tidak mencerminkan seluruh pembaruan remote saat ini. Working tree awal bersih; tidak ada reset/pull/rebase selama audit.

**Dampak:** perbaikan berikutnya dapat dibuat dari basis lama atau tampak hilang ketika build berasal dari folder/commit berbeda.

**Saran:** rekonsiliasi cabang lokal dengan remote secara terencana, pertahankan commit lokal yang belum masuk, dan gunakan satu checkout utama yang jelas. Tampilkan SHA build di aplikasi dan log deploy agar versi browser, repository, dan VPS dapat dicocokkan. Jangan hard-reset hanya untuk menyamakan versi.

## Hal yang sudah membaik dan tidak perlu dianggap masih rusak berdasarkan screenshot lama

- Commit yang diaudit sudah memisahkan checkbox mode Daftar ke kolom di luar thumbnail; grid tetap overlay. Tes helper penempatan lulus, tetapi belum ada uji visual browser untuk seluruh breakpoint.
- Stock opname sudah mempunyai pencarian nama/SKU. Kekurangannya sekarang ada pada keamanan state/input dan payload, bukan ketiadaan search.
- Transfer sudah mempunyai tab riwayat dan informasi asal/tujuan. Masalah yang tersisa antara lain scope akses, identitas varian, dan waktu.
- Sidebar memakai Next Link dan menahan render menu sampai role diketahui. Masalah re-inisialisasi state tidak sama dengan menampilkan menu admin lama.

## Urutan perbaikan yang disarankan

1. **Keamanan dan data:** A01–A06; siapkan backup yang benar-benar lengkap sebelum pekerjaan pembersihan stok/katalog atau migrasi.
2. **Rilis terverifikasi:** A07 dan A17; pastikan commit yang diuji adalah commit yang dibangun/dijalankan.
3. **Alur lintas gudang:** A08–A12; sepakati izin role/cabang dan pemetaan katalog, lalu uji stok sumber/tujuan serta riwayatnya.
4. **Frontend dan laporan:** A13–A16; rapikan input, filter, aksesibilitas, stabilitas sidebar, dan hapus fallback angka dummy.

Jangan menggabungkan perubahan skema, pembersihan produk, perubahan izin, dan redesign tanpa checkpoint. Kriteria selesai perlu berupa tes skenario bisnis, bukan hanya build sukses.

## Uji penerimaan sebelum menyatakan perbaikan selesai

- Nonaktifkan akun uji dan ubah rolenya: sesi lama harus mengikuti keputusan izin terbaru.
- Produk dengan histori masuk/keluar tetap dapat ditelusuri setelah diarsipkan; simulasi kegagalan hapus tidak meninggalkan data parsial.
- Opname satu produk tidak mengubah produk lain yang mengalami transaksi setelah form dibuka; kosong tidak berarti nol.
- Transfer variasi warna+ukuran dan ukuran saja masuk ke varian yang benar; retry ID yang sama tidak menggandakan mutasi.
- Akun Gudang Utama dapat melihat bukti transfer yang diizinkan untuk dibuatnya. Tombol aksi katalog konsisten dengan izin server.
- Backup tabel dengan lebih dari 10.000 baris dan media dapat direstore serta diverifikasi jumlah/referensinya pada database terpisah.
- Pergantian hari WIB memberikan waktu dan nomor transaksi yang sesuai, termasuk proses backend berzona UTC.
- Browser: mode grid/list, sidebar lebar/ikon, role owner/admin/gudang, light/dark, keyboard, dan lebar 360/390/768/1024/1440 px; simulasi jaringan lambat serta API gagal/kosong.
- Deploy ulang commit yang sama dapat berhasil, `unhealthy` menggagalkan rilis, dan kegagalan CI mencegah deploy.

Tes helper yang saat ini lulus belum mencakup keseluruhan skenario ini. Tidak ada klaim coverage persentase atau jaminan bebas bug dari audit ini.
