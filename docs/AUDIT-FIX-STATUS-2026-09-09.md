# Status Perbaikan Audit Anyostore POS — 9 September 2026

Dokumen ini melengkapi audit historis pada `AUDIT-PROJECT-2026-09-08.md`. Audit awal tidak diubah agar bukti dan tanggal pemeriksaannya tetap jelas.

## Sudah diperbaiki

- **Sesi dan hak akses:** access token kini terikat ke sesi server, status user/role/cabang dibaca ulang, logout dan perubahan kredensial mencabut sesi sesuai kebijakan.
- **Hapus produk:** operasi atomik per produk, stok aktif ditolak, produk yang memiliki histori diarsipkan, dan `stock_mutations` tidak pernah dihapus. Media dibersihkan setelah commit dengan pemeriksaan referensi.
- **Opname:** hanya item yang benar-benar dihitung yang dikirim; nilai kosong berbeda dari nol; snapshot quantity dan revision diverifikasi untuk mencegah overwrite setelah ada transaksi baru.
- **Transfer:** validasi ID/jumlah diperketat, pemetaan varian memakai warna dan ukuran, identitas produk tujuan disimpan, pencocokan nama dinormalisasi, dan retry memakai idempotency UUID.
- **Riwayat transfer:** akun gudang tetap dapat melihat transfer lintas cabang yang dibuatnya.
- **Backup/restore:** backup streaming memuat tabel dan media lengkap dengan manifest, hash, pemeriksaan referensi, redaksi API key, dan restore hanya boleh ke database lokal terisolasi yang dikonfirmasi.
- **Frontend:** state sesi/sidebar/tema dipusatkan untuk mencegah flicker, sidebar collapsed tetap memiliki accessible name dan tooltip, mode daftar menempatkan checkbox di luar foto, katalog memakai pagination dan izin aksi per produk, serta pesan kegagalan bulk delete mempertahankan item yang gagal.
- **Mobile:** dashboard tidak lagi menampilkan angka dummy saat loading/error/kosong; opname memiliki pencarian dan snapshot guard; transfer memiliki retry idempoten dan validasi input.
- **Deploy:** CI harus lulus untuk SHA yang sama, deploy diserialkan, migration/build/health endpoint diverifikasi, `unhealthy` tidak dianggap sehat, dan redeploy SHA yang sama diperbolehkan.

## Verifikasi lokal

- Backend: **129/129 test lulus**.
- Frontend helper: **20/20 test lulus**.
- Frontend lint: **0 error**, 21 warning lama terkait optimasi `<img>`, navigasi internal, dan font.
- Frontend production build: **berhasil dengan Webpack**. Turbopack lokal gagal membuka port internal karena pembatasan OS, bukan karena error kompilasi.
- Flutter test: **21/21 lulus**.
- Flutter analyze: **tidak ada issue**.
- Android release APK: **berhasil dibuat**.
- iOS: **archive berhasil** dengan `--no-codesign`; IPA final memerlukan sertifikat/provisioning Apple.
- Deploy/release tests: **55/55 lulus**.

## Batasan sebelum rilis produksi

Perubahan ini belum dipush atau dideploy dari workspace ini. Sebelum rilis, jalankan migrasi melalui pipeline terverifikasi, lakukan backup produksi, dan uji satu transfer/opname pada akun uji. Untuk iOS, lakukan build IPA signed pada mesin yang memiliki sertifikat Apple.
