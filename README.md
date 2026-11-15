# Anyostore POS

Sistem **Point of Sale + katalog grosir/reseller** untuk toko pakaian denim wanita multi-cabang. Satu backend melayani aplikasi kasir (web dan Android), katalog publik grosir, dan toko online reseller.

**Live:** [`anyostore.my.id`](https://anyostore.my.id) (homepage + aplikasi staf) · [`grosir.anyostore.my.id`](https://grosir.anyostore.my.id) (katalog grosir) · [`reseller.anyostore.my.id`](https://reseller.anyostore.my.id) (katalog reseller)

## Fitur utama

**Penjualan (POS)**
- Kasir web dan Android dengan keranjang, diskon, voucher (termasuk diskon per pcs), pembayaran split, dan cetak struk thermal 58/80 mm.
- Harga otomatis per tier pelanggan (reguler, semi grosir, grosir seri) dan harga grosir per jumlah.
- Tahan/lanjutkan transaksi, pembatalan item, retur sebagian/penuh dengan refund ke metode bayar asli.
- Mode offline di Android: transaksi disimpan lokal dengan nomor sementara `OFF-...`, tersinkron otomatis saat online, dan bisa dicetak tanpa internet.

**Katalog publik**
- Landing grosir dan landing reseller terpisah per subdomain, dengan katalog per cabang, pencarian, filter kategori, ongkir, dan tautan marketplace (Shopee/TikTok).
- Akun pembeli reseller, alamat tersimpan, pesanan dengan status publik berbasis token, serta konversi pesanan reseller menjadi transaksi POS.

**Inventori**
- Multi-gudang per cabang (utama/cadangan/reject), stok masuk/keluar per batch, transfer antar gudang/cabang, opname dengan snapshot dan deteksi konflik, posisi rak per gudang, dashboard stok.
- Semua perubahan stok lewat satu jalur (`adjustStock`) agar `warehouse_stocks`, `products.stock`, `product_variants.stock`, dan `stock_mutations` selalu konsisten.

**Keuangan & laporan**
- Laporan penjualan, produk terlaris, metode bayar, penutupan kas harian, laporan stok, arus kas.
- Pengeluaran/pemasukan, laba rugi, komisi staf, laporan pajak (PPN, faktur pajak, PPh23).
- Backup database (owner) dan audit log aktivitas.

**Struk satu sumber aturan**
- Aturan struk disusun server (`backend/src/receipt-lines.js`), dipakai cetak thermal Android, halaman resi web, dan pratinjau template. Paritas dijaga fixture golden yang diuji di backend dan Flutter.

## Arsitektur

| Lapisan | Teknologi |
|---|---|
| Backend | Node.js 20 (engines `>=20`), Express 4, `mysql2`, JWT httpOnly cookie, `multer`, `helmet`, rate limit. 198 route handler di `backend/src/routes/` |
| Web | Next.js 16 App Router, React 18, Tailwind 4. Middleware multi-host (domain utama, `grosir`, `reseller`) |
| Mobile | Flutter (Android), `sqflite` untuk offline, printer thermal BLE, `fl_chart` |
| Database | MySQL 8.4, `schema.sql` + 61 migrasi bernomor |
| Infrastruktur | Docker Compose di belakang Caddy (auto HTTPS), deploy otomatis via GitHub Actions |

```
backend/    Express API, skrip migrasi, 66 file test
frontend/   Next.js (landing, POS, admin), 73 file test
mobile/     Aplikasi Flutter (Android)
deploy/     Caddyfile
docs/       Dokumentasi fitur, API, alur bisnis, deployment
scripts/    Deploy, backup, maintenance
```

## Menjalankan lokal

Prasyarat: Docker, Node.js 20+, PHP tidak diperlukan. Untuk build Android: Flutter 3.44+.

```bash
cp .env.example .env          # isi DB_*, JWT_SECRET, JWT_REFRESH_SECRET
docker compose up --build      # db + backend + frontend
```

- Web: <http://localhost:3000>
- API health: <http://localhost:3001/api/health>
- Owner pertama: ikuti `docs/10-pengaturan.md`

Skema database hanya dibuat otomatis pada volume baru. Semua perubahan skema produksi **wajib** lewat file migrasi baru di `backend/migrations/` (jangan pernah mengubah migrasi yang sudah dijalankan).

## Perintah penting

```bash
# Backend
cd backend && npm test                 # seluruh test
cd backend && npm run lint

# Web
cd frontend && npm run build           # gate wajib sebelum merge
cd frontend && node --test test/*.test.cjs

# Android
cd mobile && flutter analyze --no-pub
cd mobile && flutter test
```

Build APK dilakukan di luar folder OneDrive (mencegah arsip korup), misalnya:

```bash
rsync -a --exclude build --exclude .dart_tool mobile/ /private/tmp/mbuild2/
cd /private/tmp/mbuild2 && flutter build apk --release --split-per-abi
```

## Deployment

1. Push ke `main` menjalankan CI (test backend serialized, regression web, build frontend, audit dependency) dan workflow Mobile secara terpisah.
2. Setelah CI sukses untuk SHA penuh, `deploy.yml` memverifikasi SHA tersebut lalu menjalankan `scripts/deploy/release.sh` lewat SSH ke VPS: migrasi one-off, build image bertag SHA, health check container, recreate Caddy, dan verifikasi HTTPS publik `/api/health` serta `/version` pada domain utama dan subdomain katalog.
3. Deploy gagal bila salah satu host menyajikan SHA yang berbeda, sehingga rilis setengah jadi tidak tercatat sukses.

## Keamanan

- JWT access/refresh di cookie `httpOnly` + `SameSite=Strict`, refresh token disimpan sebagai hash dengan versi token.
- Rate limit global dan khusus login; otorisasi per role (`owner`, `manager`, `admin`, `kasir`, `gudang`) dan scoping per cabang.
- Helmet + CSP di Caddy, validasi unggahan (MIME + magic bytes), rahasia (API key) tidak dikirim ke klien.
- Hasil audit keamanan terakhir beserta perbaikannya terdokumentasi di `docs/` dan riwayat commit.

## Dokumentasi

- [`AGENTS.md`](AGENTS.md) — konteks proyek lengkap untuk kontributor/agent: arsitektur, aturan, jebakan.
- [`DESIGN.md`](DESIGN.md) — arah desain antarmuka.
- [`docs/`](docs/) — dokumentasi per topik: fitur, tech stack, skema database, endpoint, alur bisnis, printer thermal, deployment, keamanan, testing.

## Lisensi

Repositori internal. Seluruh hak cipta milik pemilik Anyostore.