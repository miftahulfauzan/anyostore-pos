# Web — halaman, komponen, desain UI, deploy & CI/CD

> Dipindahkan utuh dari `AGENTS.md` (2026-11-20) agar AGENTS.md ringkas dan cepat dibaca agent. Isi tidak diubah.

## Frontend

### Pages (`frontend/app/`)

| Route | File | Catatan |
|-------|------|---------|
| `/` | `page.js` | Landing grosir (public) |
| `/produk/[id]` | `produk/[id]/page.js` | Detail produk (public) |
| `/login` | `login/page.js` | Login POS |
| `/pos` | `pos/page.js` | Kasir |
| `/history` | `history/page.js` | Riwayat + retur/batal |
| `/products` | `products/page.js` | Daftar produk + tombol **Kelola Kategori** (modal `CategoryManager`: tambah/ubah/hapus/urutan) |
| `/products/new` | `products/new/page.js` | Tambah produk |
| `/products/[id]/edit` | `products/[id]/edit/page.js` | Edit produk + media + varian |
| `/inventory` | `inventory/page.js` + `stock-view.js` | Stok per produk/varian dalam matriks gudang (desktop) atau kartu (mobile), foto produk, total/agregat, filter cabang/kategori, dan edit posisi rak per gudang |
| `/inventory/movements` | `inventory/movements/page.js` | Riwayat stok (card list) |
| `/inventory/mutations` | `inventory/mutations/page.js` | Mutasi stok: form transaksi (tanggal, batch/nota, toko, gudang, keterangan) + katalog grid (foto, stok per gudang, warna) + keranjang; dropdown channel untuk keluar |
| `/inventory/transfers` | `inventory/transfers/page.js` | Transfer stok antar gudang/cabang (auto-buat produk di tujuan) |
| `/inventory/{barcodes,opname}` | ... | Cetak barcode, opname dengan snapshot stok/revision agar konflik terdeteksi, serta riwayat opname yang dapat dibuka untuk melihat detail per item; Owner dapat memilih gudang lintas cabang, sementara role lain tetap cabang akun |
| `/inventory/dashboard` | `inventory/dashboard/page.js` + `dashboard/WarehouseDashboard.js` | Dashboard stok terpisah dari dasbor penjualan; Owner dapat melihat agregat atau memilih satu toko/gudang, manager/admin melihat cabang akunnya |
| `/finance` | `finance/page.js` | Keuangan (tab: Ringkasan Laba Rugi / Pengeluaran / Pemasukan) |
| `/reports` | `reports/page.js` | Laporan (owner pilih toko) |
| `/reports/tax` | `reports/tax/page.js` | PPN/Faktur/PPh23 |
| `/finance` | `finance/page.js` | Keuangan (tab: Ringkasan / Pengeluaran / Pemasukan) |
| `/settings` | `settings/page.js` | Pengaturan + cabang + kategori |
| `/commissions` | `commissions/page.js` | Komisi staf (owner) |
| `/users` | `users/page.js` | Pegawai (owner) |
| `/dashboard` | `dashboard/page.js` + `dashboard/OlseraDashboardSections.js` | Dasbor penjualan mengikuti desain dashboard APK (2026-11-22): kartu Ringkasan toko dengan hero Penjualan + tile Pesanan/Produk/Laba, grafik Penjualan + rincian, Produk terlaris berperingkat, Stok rendah berstatus. Web/PWA meniru APK, bukan sebaliknya; role gudang tetap melihat dashboard operasional gudang |
| `/profile` | `profile/page.js` | Akun |
| `/receipt/[id]` | `receipt/[id]/page.js` | Resi |
| `/operations`, `/customers`, `/promotions` | ... | Operasional, pelanggan (termasuk ekspedisi), promo |

### Components (`frontend/app/components/`)

- `AppShell.js` — layout sidebar fixed + collapsible (localStorage `pos_sidebar_collapsed`), menu per role
- `SafeImage.js` — img dengan fallback 404 (tidak infinite loop)
- `FloatingWA.js` — tombol WA mengambang multi-admin
- `CategoryManager.js` — CRUD kategori (dipakai di `/settings` dan modal "Kelola Kategori" di `/products`; prop `embedded` melepas panel+judulnya saat di modal, `onChange` memicu muat ulang daftar produk)
- `NotificationCenter.js`, `BarcodeLabel.js`

Semua pemakaian `SafeImage` wajib mengimpor komponen tersebut secara eksplisit. `stock-view.js` pernah menyebabkan halaman stok gagal render (`ReferenceError: SafeImage is not defined`, yang dapat muncul sebagai React error #418); regression test frontend menjaga import ini tetap ada.

## Desain UI

### Landing page
- Palet: hitam `#1a1a1a`, denim blue `#1e3a5f` (aksen), bg `#fafafa`, muted `#71717a`, border `#e5e7eb`
- Font: DM Sans (700 heading, 400/500 body)
- Liquid glass: `backdrop-filter: blur(16-20px) saturate(150-180%)`, translucent white `rgba(255,255,255,.55)`, radius 12-16px
- Hero slideshow: 2 kolom (teks kiri, gambar kanan), auto-rotate 5 detik, arrow prev/next, dots
- 10 produk random stabil per tanggal (seeded shuffle, prioritas yang punya foto)
- Grid 4 kolom → 3 (900px) → 2 (600px), kartu foto 1:1, 24/halaman
- Tombol: primary = denim blue + shadow; secondary = outline biru

### Detail produk
- DM Sans + Instrument Serif (hanya di heading)
- SVG icons, tanpa emoji
- Deskripsi full-width di bawah grid
- Foto `objectFit: cover` + transform kalau diatur

## Deploy & CI/CD

### Workflow
1. Push ke `main` menjalankan `.github/workflows/ci.yml` untuk web. `.github/workflows/mobile.yml` hanya dipicu push `main` yang mengubah `mobile/**`, atau manual; PR tetap menjalankan analisis mobile tanpa APK. CI web menjalankan backend test serialized (`npm test -- --test-concurrency=1`), audit, regression/release tests, dan frontend build. Job analyzer mobile boleh `continue-on-error`; APK diunggah sebagai artifact dan tidak menjadi bagian dari gate deploy web.
2. Setelah CI web sukses, `.github/workflows/deploy.yml` memverifikasi CI untuk exact full 40-character SHA. Deploy kemudian mengirim `scripts/deploy/release.sh` melalui SSH; script memperoleh lock, memastikan checkout VPS bersih, fetch `origin/main`, memastikan SHA ada di history, checkout detached ke SHA, menjalankan migrasi one-off, build dengan tag SHA, merecreate backend/frontend, menghapus lalu membuat ulang Caddy, memvalidasi konfigurasi Caddy serta endpoint loopback, menunggu health `running healthy` dengan revision yang sama, lalu memverifikasi HTTPS publik `/api/health` dan `/version`. Deploy otomatis tidak menerima release lama yang sudah terlewati; retry/rollback harus memakai workflow manual dengan SHA penuh. Caddy produksi berjalan dengan host network dan meneruskan ke port loopback stabil `127.0.0.1:3001` (backend) serta `127.0.0.1:3000` (frontend); kedua port hanya bind ke loopback host agar routing tidak bergantung pada alias DNS Docker yang bisa stale setelah container diganti.
3. Jika verifikasi lokal VPS berhasil tetapi verifikasi publik gagal, cek image/revision container, nama container live, dan routing Caddy sebelum retry. Jangan menganggap deploy selesai hanya karena `docker compose up` sukses.
4. Caddy handle HTTPS otomatis (Let's Encrypt).

### Docker compose production
- `db` (mysql:8.4, initdb.d = semua migration), `backend`, `frontend`, `caddy`
- Backend/frontend live memakai nama tetap `anyostore-backend-live` dan `anyostore-frontend-live`; image aplikasi ditag dengan exact `RELEASE_SHA` dan label OCI `org.opencontainers.image.revision` yang sama. Jangan menyimpulkan release dari nama project Compose lama (`anyostore-pos-backend-1`/`anyostore-pos-frontend-1`) saja.
- Backend entrypoint: `node scripts/migrate.js || true; node scripts/fix-clone-paths.js || true; node src/index.js`
- Frontend build arg: `NEXT_PUBLIC_API_URL=/api`
- Caddy route: `/api/*` dan `/uploads/*` → `127.0.0.1:3001`, sisanya → `127.0.0.1:3000`; Caddy memakai `network_mode: host`, sedangkan backend/frontend hanya bind ke loopback host.
