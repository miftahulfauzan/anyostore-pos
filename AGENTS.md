# AGENTS.md — Anyostore POS (pos-pakaian)

Konteks proyek ini otomatis dibaca semua AI agent di awal sesi. Baca sebelum mengerjakan apa pun.

## Ringkasan

Sistem POS + katalog grosir pakaian denim wanita (multi-cabang). Live di `https://anyostore.my.id` (Tencent Cloud Lighthouse, Ubuntu, Docker, Caddy auto-HTTPS). Repo: `https://github.com/miftahulfauzan/anyostore-pos`. Lokasi lokal aktif (workspace Codex): `/Users/anyo/Library/CloudStorage/OneDrive-Personal/pos-pakaian` (satu-satunya repo dengan commit terbaru). `~/Documents/POS_ANYOSTORE` adalah salinan lama yang tertinggal — jangan dipakai untuk kerja baru.

- **Backend**: Express (Node 20), MySQL 8.4, `backend/src/`
- **Frontend**: Next.js 16 App Router (`output: 'standalone'`), React 18, `frontend/app/`
- **Mobile**: Flutter (`mobile/`) — terpisah, CI `continue-on-error`
- **Deploy**: GitHub Actions `deploy.yml` → SSH ke VPS → `docker compose up -d --build`. Build pakai BuildKit cache mount (`--mount=type=cache` di Dockerfile) supaya `npm ci`/`next build` cepat; deploy.yml hanya prune cache >7 hari (`builder prune -f --filter "until=168h"`) + `image prune -f`, BUKAN `builder prune -af` (menghapus semua cache → deploy jadi 8 menit). CI `ci.yml` menjalankan `npm test` (backend) + `npm run build` (frontend).

## Arsitektur Backend

### Struktur

| File | Fungsi |
|------|--------|
| `src/index.js` | Entry point, listen port |
| `src/app.js` | Express setup: helmet, cors, json 6mb, rate limit 600/min, static `/uploads`, mount 18 routers, 404 + error handler |
| `src/config.js` | Validasi env (DB_HOST/USER/PASS/NAME, JWT_SECRET, JWT_REFRESH_SECRET). Throw kalau kurang |
| `src/db.js` | mysql2/promise pool, connectionLimit 10 |
| `src/auth.js` | JWT access 12h + refresh, login password (`/api/auth/login`) & PIN (`/api/auth/login-pin`), `authenticate`, `authorize(roles...)` |
| `src/media-storage.js` | Storage disk/DB (`MEDIA_STORAGE=database`), `persistUploadedFile`, `removeMedia`, `copyMediaFile`, `serveBlob` |
| `src/pricing.js` | Satu-satunya logika tier harga (grosir seri/semi grosir/retail + harga wholesale) — dipakai checkout DAN `POST /api/transactions/preview`. JANGAN duplikasi di frontend |
| `src/stock.js` | Satu-satunya jalur penulisan stok: `adjustStock()` mengubah `warehouse_stocks` + `products.stock` + `product_variants.stock` + `stock_mutations` sekaligus |
| `src/money.js` | Satu definisi pembulatan uang (`Number.EPSILON`) — jangan definisikan `money` sendiri di route |
| `src/local-date.js` | Tanggal lokal WIB (`localDateString`/`localMonthStartString`) — jangan pakai `toISOString().slice(0,10)` untuk "hari ini" |
| `src/netlify.js` | Serverless adapter (TIDAK DIPAKAI, Netlify sudah dihapus) |
| `scripts/migrate.js` | Jalankan migrasi SQL di `migrations/`, track `_migrations` table |
| `scripts/fix-clone-paths.js` | One-off: copy file foto yang di-share antar cabang ke path baru (idempoten) |
| `scripts/merge-warehouses.js` | One-off: sisakan 1 gudang per cabang — gabungkan stok, pindahkan referensi, hapus duplikat (JALANKAN MANUAL, bukan otomatis) |

### Routes (`backend/src/routes/`)

| Router | Prefix | Fitur utama |
|--------|--------|-------------|
| `public.js` | `/api/public` | Landing: settings (multi-WA), categories, products (paginasi/search/sort), products/:id (media+variants) |
| `products.js` | `/api/products` | CRUD produk, media (max 10 img + 1 video), varian, wholesale prices, categories CRUD, transform foto |
| `products.js` | `/api/products/:id/media/:mediaId/image-data` | Ganti file foto dengan hasil crop 1200×1600 (modal Ubah Foto Produk) |
| `inventory.js` | `/api/inventory` | Warehouse, mutasi, stock-total (branch/all), barcode search, incoming/outgoing per batch (`batch_number` BATCH-YYYYMMDD-NNN, `warehouse_id`, `transaction_date`) |
| `inventory-control.js` | `/api/inventory-control` | Transfer antar gudang/cabang, opname |
| `transactions.js` | `/api/transactions` | Checkout (idempotency `client_transaction_id`), hold/resume, cancel |
| `printer.js` | `/api/printer` | Struk thermal 58/80mm |
| `customers.js` | `/api/customers` | CRUD pelanggan + price_tier |
| `returns.js` | `/api/returns` | Retur (pending → approve, stok kembali) |
| `returns.js` | `/api/returns` | Retur menyimpan `refund_method` (cash/qris/transfer/debit) untuk laporan & laci kas |
| `cash-drawer.js` | `/api/cash-drawer` | Buka/tutup kas, cash in/out |
| `suppliers.js` | `/api/suppliers` | Supplier per cabang |
| `reports.js` | `/api/reports` | Sales + overview (owner bisa pilih branch via `?branch_id`) |
| `purchase-orders.js` | `/api/purchase-orders` | PO + receive (update stok) |
| `finance.js` | `/api/finance` | Expenses, income, journals, profit-loss |
| `users.js` | `/api/users` | CRUD pegawai, role, PIN, password |
| `settings.js` | `/api/settings` | Branch CRUD (clone katalog), store settings, WA dinamis, logo |
| `dashboard.js` | `/api/dashboard` | Ringkasan harian/mingguan/bulanan |
| `commissions.js` | `/api/commissions` | Komisi staf (per_pcs_customer_tier dll), rules, report, generate |
| `promotions.js` | `/api/promotions` | Promo/diskon + validate |
| `tax.js` | `/api/tax` | Laporan pajak: PPN, Faktur Pajak, PPh23 |

### Auth & Roles

- JWT access 12 jam (payload: `id, role, branch_id`), refresh token 7 hari, hash SHA-256 di DB
- Login/PIN/refresh menyetel **httpOnly cookie** (`pos_access`, `pos_refresh`, SameSite=Strict, Secure di produksi); `authenticate` membaca cookie (Bearer header tetap diterima). Refresh token TIDAK dikembalikan di body respons. Frontend tidak menyimpan JWT di localStorage.
- Roles: `owner`, `manager`, `admin`, `kasir`, `gudang`
- `authorize('owner')` dsb memfilter akses per route
- Owner bisa akses semua cabang (banyak route pakai `req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id`)

## Skema Database (`docs/12-migration.sql` + seluruh `backend/migrations/`, ±50 tabel live; snapshot terkini bisa di-regenerate via `scripts/dump-schema.sh`)

### Tabel inti

| Tabel | Kolom penting |
|-------|--------------|
| `branches` | id, name, address, phone, email, npwp, pricing_tier_enabled, is_active |
| `users` | branch_id, name, role, pin, is_active |
| `categories` | name, slug, sku_prefix, is_active |
| `products` | branch_id, category_id, name, description, sku (UNIQUE global), barcode, price, cost, stock, min_stock, gender, is_active |
| `product_variants` | product_id, size, color, sku, barcode, stock, price, is_active |
| `product_photos` | product_id, variant_id, filename, path, media_type (image/video), is_primary, sort_order, `transform` (scale,x,y) |
| `warehouse_stocks` | warehouse_id, product_id, variant_id, quantity, reserved_quantity |
| `warehouses` | branch_id, name, description, type (utama/cadangan/reject) |
| `transactions` | branch_id, invoice_no, client_transaction_id (UNIQUE), user_id, customer_id, subtotal, discount, grand_total, payment_method, status (completed/cancelled/refunded/pending/held), cancelled_amount |
| `transaction_items` | transaction_id, product_id, variant_id, product_name, quantity, price, original_price, price_override, cost, cancelled_qty |
| `invoice_sequences` | branch_id + business_date (PK), last_number — counter invoice atomik |
| `customers` | name, phone, price_tier (reguler/semi_grosir/grosir_seri) |
| `store_settings` | branch_id + `key` (PK), value — key-value settings |
| `media_files` | `key`, content_type, data (blob, kalau MEDIA_STORAGE=database) |
| `commission_rules` | branch_id (NULL=global), type, per_pcs_customer_tier config |
| `expenses` | branch_id, type (expense/income), amount, status (approved) |

### Migrasi (`backend/migrations/`)

22 file: promotions, branch_contact_tax, denim_variant_stock, product_media (variant_id, media_type), sync_variant_colours, media_files, price_tiers, customer_price_tier, transaction_cancellation, branch_pricing_tier, expense_income_type, commission_per_pcs_customer_tier, product_photo_transform, partial_cancel_purchase_received (tambah `partially_cancelled` ke ENUM status transactions + kolom `received_at` di purchase_orders untuk laporan PPN Masukan), photo_transform_percent (konversi pan px→% supaya crop konsisten lintas ukuran box), stock_mutation_channel (kolom `channel` di stock_mutations: wa/shopee/tiktok/reseller/toko untuk penjualan gudang via channel), warehouse_type (kolom `type` di warehouses: utama/cadangan/reject untuk gudang barang reject), rename_gudang_utara (rename nama gudang legacy 'Gudang Utara' → 'Gudang Utama'), branch_type (kolom `type` di branches: toko/gudang — gudang murni stok tanpa POS), sales_channels (tabel `sales_channels` + CRUD di `/api/inventory/channels` untuk saluran penjualan dinamis), branch_type_gudang_names (tandai cabang bernama 'Gudang…'/'Riject' sebagai type gudang supaya dipilih admin gudang), warehouse_names_match_branch (rename gudang mengikuti nama cabang: 'Gudang Anyostore Metro', 'Gudang Toko B', dll), stock_mutation_reference_bigint (ubah `stock_mutations.reference_id` INT → BIGINT karena dipakai menyimpan batch id Date.now() 13 digit).

**Migrasi**: `migrate.js` hanya toleran terhadap error idempotent (duplicate column/entry/already exists, misalnya saat initdb sudah memasang schema lalu migrate.js menjalankan file yang sama). Error lain = kegagalan nyata: file TIDAK ditandai selesai, script exit 1, dan dicoba ulang saat restart/deploy berikutnya. Cari `[migrate] FAILED` di log container backend kalau migrasi baru tidak kelihatan terpasang.

## Alur bisnis penting

### Multi-cabang
- Setiap cabang punya katalog sendiri (`products.branch_id`), produk di-clone saat buat cabang
- SKU clone: `B{branchId}-{sku}` (unik global)
- Clone foto: `copyMediaFile` salin file ke path baru (bukan share path)
- Hapus cabang: soft-delete dulu (`is_active=FALSE`), lalu hard-delete (cascade semua tabel branch_id, `SET FOREIGN_KEY_CHECKS=0`)
- Owner bisa pilih cabang di `/settings`, laporan, stock report

### Transaksi (checkout)
- `client_transaction_id` UUID → idempotency (retry tidak dobel)
- Invoice: `{invoice_prefix}-YYYYMMDD-B{branch}-0001` (prefix dari `store_settings.invoice_prefix`, default `INV`) via `invoice_sequences` + `FOR UPDATE`; PO pakai `order_prefix` (default `PO`)
- Harga otomatis: tier pelanggan → wholesale price → override manual (`price_override` di audit)
- Cancel/retur: `cancelled_qty` di transaction_items, stok dikembalikan, status `partially_cancelled`; refund tunai dicatat ke laci kas (`cash_drawer_movements` type `cash_out`, porsi proporsional dari metode bayar asli) kalau petugas punya laci terbuka

### Komisi
- Rule `per_pcs_customer_tier`: reguler 3000/pcs, semi_grosir 3000/pcs, grosir_seri 1000/pcs
- Rule bisa per-cabang atau global (branch_id NULL)
- Owner bisa hapus rule cabang mana pun

### Media/foto
- Upload: max 10 foto + 1 video per produk
- Foto varian: per-variant photo
- `transform` (zoom/pan): format `scale,xPct,yPct` — **pan dalam persen terhadap box** (`maxPanPct = (scale-1)/2*100`), disimpan di `product_photos.transform`
- **Render transform (WYSIWYG)**: `objectFit: cover` SELALU sebagai basis, lalu `transform: translate(xPct%, yPct%) scale(s)` di atasnya. Jangan pakai `objectFit: none` (basis render berbeda → hasil simpan tidak cocok dengan preview). Pan pakai persen supaya hasil crop konsisten di semua ukuran box (modal, grid admin, landing, detail).
- Konsisten di: modal "Atur" (edit page), grid produk admin, landing page, detail produk.
- `openAdj` harus load transform yang sudah disimpan (parsing `scale,xPct,yPct`), bukan reset ke `1,0,0`.
- Pan di-clamp: `maxPanPct = (scale - 1) / 2 * 100` (persen, berlaku X & Y).
- Grid edit produk: tanpa transform = `contain` (foto utuh); dengan transform = `cover` + transform (WYSIWYG hasil crop). Modal "Atur" punya thumbnail foto utuh di pojok.

## Frontend

### Pages (`frontend/app/`)

| Route | File | Catatan |
|-------|------|---------|
| `/` | `page.js` | Landing grosir (public) |
| `/produk/[id]` | `produk/[id]/page.js` | Detail produk (public) |
| `/login` | `login/page.js` | Login POS |
| `/pos` | `pos/page.js` | Kasir |
| `/history` | `history/page.js` | Riwayat + retur/batal |
| `/products` | `products/page.js` | Daftar produk |
| `/products/new` | `products/new/page.js` | Tambah produk |
| `/products/[id]/edit` | `products/[id]/edit/page.js` | Edit produk + media + varian |
| `/inventory` | `inventory/page.js` | Stok (tab: Stok Gudang per-gudang / Laporan Stok agregat, kelola gudang) |
| `/inventory/movements` | `inventory/movements/page.js` | Riwayat stok (card list) |
| `/inventory/mutations` | `inventory/mutations/page.js` | Mutasi stok: form transaksi (tanggal, batch/nota, toko, gudang, keterangan) + katalog grid (foto, stok per gudang, warna) + keranjang; dropdown channel untuk keluar |
| `/inventory/transfers` | `inventory/transfers/page.js` | Transfer stok antar gudang/cabang (auto-buat produk di tujuan) |
| `/inventory/{barcodes,opname}` | ... | Cetak barcode, opname |
| `/finance` | `finance/page.js` | Keuangan (tab: Ringkasan Laba Rugi / Pengeluaran / Pemasukan) |
| `/reports` | `reports/page.js` | Laporan (owner pilih toko) |
| `/reports/tax` | `reports/tax/page.js` | PPN/Faktur/PPh23 |
| `/finance` | `finance/page.js` | Keuangan (tab: Ringkasan / Pengeluaran / Pemasukan) |
| `/settings` | `settings/page.js` | Pengaturan + cabang + kategori |
| `/commissions` | `commissions/page.js` | Komisi staf (owner) |
| `/users` | `users/page.js` | Pegawai (owner) |
| `/dashboard` | `dashboard/page.js` | Dasbor |
| `/profile` | `profile/page.js` | Akun |
| `/receipt/[id]` | `receipt/[id]/page.js` | Resi |
| `/operations`, `/customers`, `/promotions` | ... | Operasional, pelanggan, promo |

### Components (`frontend/app/components/`)

- `AppShell.js` — layout sidebar fixed + collapsible (localStorage `pos_sidebar_collapsed`), menu per role
- `SafeImage.js` — img dengan fallback 404 (tidak infinite loop)
- `FloatingWA.js` — tombol WA mengambang multi-admin
- `CategoryManager.js` — CRUD kategori (dipakai di settings)
- `NotificationCenter.js`, `BarcodeLabel.js`

## Desain UI

### Landing page
- Palet: hitam `#1a1a1a`, denim blue `#1e3a5f` (aksen), bg `#fafafa`, muted `#71717a`, border `#e5e7eb`
- Font: DM Sans (700 heading, 400/500 body)
- Liquid glass: `backdrop-filter: blur(16-20px) saturate(150-180%)`, translucent white `rgba(255,255,255,.55)`, radius 12-16px
- Hero slideshow: 2 kolom (teks kiri, gambar kanan), auto-rotate 5 detik, arrow prev/next, dots
- 10 produk random stabil per tanggal (seeded shuffle, prioritas yang punya foto)
- Grid 4 kolom → 3 (900px) → 2 (600px), kartu 3:4, 24/halaman
- Tombol: primary = denim blue + shadow; secondary = outline biru

### Detail produk
- DM Sans + Instrument Serif (hanya di heading)
- SVG icons, tanpa emoji
- Deskripsi full-width di bawah grid
- Foto `objectFit: cover` + transform kalau diatur

## Deploy & CI/CD

### Workflow
1. Push ke `main` → `ci.yml` (test + build) dan `deploy.yml` jalan otomatis (bisa juga dipicu manual via Actions → Run workflow)
2. `deploy.yml`: SSH ke VPS → `git pull` → `image prune -f` + `builder prune -f --filter "until=168h"` → `docker compose up -d --build` → `docker compose ps` → cek log backend: kalau ada `[migrate] FAILED`/`[migrate] fatal`, deploy **gagal** (backend tetap start karena entrypoint pakai `|| true`, tapi error tidak disembunyikan lagi)
3. Caddy handle HTTPS otomatis (Let's Encrypt)

### Docker compose production
- `db` (mysql:8.4, initdb.d = semua migration), `backend`, `frontend`, `caddy`
- Backend entrypoint: `node scripts/migrate.js || true; node scripts/fix-clone-paths.js || true; node src/index.js`
- Frontend build arg: `NEXT_PUBLIC_API_URL=/api`
- Caddy route: `/api/*` dan `/uploads/*` → backend, sisanya → frontend

## Pola penting / jebakan

- **Next.js 16**: `params` di client component pakai `useParams()` dari `next/navigation`, BUKAN `use(params)` atau `params?.id` (bisa undefined → fetch `/api/products/undefined`).
- **Hydration error #418**: jangan pakai `new Date()` di render awal client component (server UTC vs browser WIB beda). Lazy-init state kosong, isi via `useEffect`.
- **CSS globals.css** punya banyak aturan duplikat (`.app-shell`, `.sidebar`, `.app-main`) yang saling override. Saat ubah layout, cek duplikat (terutama yang di `@media`).
- **OneDrive** (folder lama) sudah DITINGGALKAN karena membuat .git korup/stall (push timeout, mmap failed). Semua kerja sekarang di /Users/anyo/Documents/POS_ANYOSTORE. Kalau ada salinan OneDrive lama, jangan dipakai. .env dev: MYSQL_ROOT_PASSWORD=pos_dev_mysql_2026, JWT_SECRET=pos_dev_access_secret_change_before_production, JWT_REFRESH_SECRET=pos_dev_refresh_secret_change_before_production. .env.production hanya ada di VPS/GitHub Secrets, tidak di repo.
- **Sidebar AppShell**: `position: fixed`, collapsible (state `pos_sidebar_collapsed` di localStorage), margin konten via class `.app-main.sidebar-collapsed`.
- **Deploy failure umum**: CI `npm test` gagal kalau env DB tidak diset di test file (sudah diset di `backend/test/*.test.js`). Build frontend gagal = syntax error, cek `npm run build` lokal.
- **Media**: `MEDIA_STORAGE=database` atau disk (default). `copyMediaFile` untuk clone cabang (copy file ke path baru). Guard delete: cek ref-count sebelum `removeMedia` (clone share path).
- **Commission**: rule `per_pcs_customer_tier` (reguler 3000, semi 3000, grosir 1000 per pcs). Owner bisa hapus rule cabang manapun.
- **Rate limit**: 600 req/menit per IP global, 20/15 menit untuk login.

## Mobile UI/Desain & Fitur Terbaru (Agustus 2026)

Aplikasi Android (Flutter, folder mobile/) sudah melalui banyak perubahan. Dokumentasi ini agar AI berikutnya langsung paham tanpa menebak.

### Design system (file kunci: mobile/lib/src/task_ui.dart)
- Warna: latar krem #F5F1EA, biru denim #1E3A5F (aksen utama), #2E5D8F / #5A8BBF / #7FA8CF (variasi denim), abu #8A857C, border #E7E0D6. JANGAN pakai oranye/hijau tua/ink #1c1c1c sebagai aksen.
- Liquid glass: komponen GlassCard (frosted: blur + gradien putih transparan + border tipis). Kartu utama di semua halaman memakai GlassCard, bukan Card polos.
- PillTabs - tab pil: 2 menu -> satu baris dibagi 2, 3 menu -> dibagi 3, 4+ -> bisa di-slide samping (otomatis: tabs.length <= 3 pakai Row Expanded).
- GlassNavBar - bottom nav Liquid Glass MELAYANG & TRANSPARAN, STATIS (tanpa animasi apa pun — Entrance/specular sweep/AnimatedSwitcher dihapus; rim chromatic dispersion statis): pil kaca mengambang margin 14 (radius 28), BackdropFilter blur 24 + saturasi. TIDAK ada FAB & TIDAK ada badge — 5 item sebaris senada, urutan: POS (keranjang, paling kiri), Riwayat, Stok, Laporan, Lainnya; mapping slot = index tab langsung (0..4). Item aktif: pil solid kTaskDark + ikon/teks putih tebal; nonaktif: ikon/teks #403C36 (kontras tinggi, POS jelas terbaca). Navbar dipasang sebagai OVERLAY di body PosPage (Positioned bottom, BUKAN bottomNavigationBar) sehingga area di luar pil transparan & konten mengalir di belakangnya. Konsekuensi: tiap tab bottom padding ~104 (Kasir: grid padding bawah 178+bottomPad + tombol Keranjang di-Positioned bottom 98+bottomPad, dan tombol hanya muncul kalau keranjang TIDAK kosong). PosPage.requestTab dipakai halaman lain untuk pindah tab. Widget test: test/glass_nav_bar_test.dart.
- Header utama POS DIHAPUS TOTAL (tidak ada AppBar di pos_page.dart) — logout pindah ke tombol "Keluar" paling bawah di halaman Lainnya (MorePage). Semua AppBar halaman lain otomatis centerTitle: true.
- Stok (inventory_page.dart): ringkasan Produk/Stok/Stok rendah/Habis jadi 1 baris dibagi 4 (_StatCell, font kecil seragam 9/13 + FittedBox scaleDown), bukan lagi Wrap Chip.
- SoftBlobs - blob dekoratif denim di latar halaman.
- BrandLogo - logo toko dari store_settings.store_logo (cache SharedPreferences kunci pos_store_logo), fallback ikon keranjang.
- UI responsif: main.dart membungkus app dengan skala berbasis design 390x844 (Transform.scale, clamp 0.8-1.35) supaya di HP kecil UI mengecil. Area di luar area desain diisi warna tema (ColoredBox, bukan hitam) + SystemChrome edge-to-edge dengan status bar transparan (ikon gelap) — supaya TIDAK ada garis hitam di HP rasio layar lebih tinggi.

### Halaman & fitur mobile
- Splash (splash_page.dart): tampil sebentar lalu otomatis ke Login (tanpa tombol/tagline).
- Login: field Email / Username (backend terima username ATAU email), Password/PIN, tombol Login.
- POS/Kasir (pos_page.dart) — sheet keranjang (_CartSheet jadi StatefulWidget) FOKUS DAFTAR BARANG: pelanggan, kode promo, Tahan & Ambil Tahan dipindah ke bagian "Opsi" yang tertutup default (tombol Opsi/Tutup Opsi; chip pelanggan/promo muncul bila sudah dipilih). Nama produk ditampilkan PENUH (tanpa ellipsis). Info: "Total pcs: N pcs" menggantikan Subtotal + baris Total. Sheet dibungkus DraggableScrollableSheet (initial 55%, bisa ditarik sampai full screen 100%, ListView pakai scrollController dari drag). Sheet pakai StatefulBuilder + `_sheetRefresh` (StateSetter): showModalBottomSheet TIDAK rebuild otomatis saat setState halaman, jadi setiap mutasi (qty, hapus item, pelanggan, promo, ubah harga) & hasil preview memanggil `_sheetRefresh?.call(() {})` supaya daftar/total langsung ter-update (fix: tombol hapus tidak menghilangkan item). — Tahan/Lanjut transaksi:
  - Tombol Tahan (di sheet keranjang) -> POST /api/transactions/hold (item disimpan + nama/varian/foto), keranjang dikosongkan.
  - Tombol Ambil Tahan -> GET /api/transactions/pending, pilih dari dialog -> POST /api/transactions/pending/:id/resume, keranjang di-restore, preview dihitung ulang.
  - Backend hold/pending/resume menghormati branch_id (owner bisa pilih toko/gudang); kasir/manager tetap pakai cabangnya sendiri.
- POS/Kasir (pos_page.dart):
  - Grid produk 3 kolom; kartu: nama kiri + harga kanan satu baris, font kecil, varian/stok di bawah.
  - Header accordion _PosHeaderRow: Toko/Gudang di kiri & Cari di kanan satu baris; klik salah satu -> memanjang menutup yang lain; dropdown Gudang muncul saat Toko/Gudang terekspansi.
  - Owner bisa pilih Toko/Gudang tujuan input (_posBranchId); ganti cabang -> keranjang dikosongkan & data di-reload.
  - Qty keranjang bisa diketik keyboard (_QtyInput) + tombol -/+; nama+harga satu baris.
  - Pemilih varian (variant_picker.dart): qty juga bisa diketik (_QtyField).
  - Transaksi offline: saat gagal jaringan (SocketException/Timeout/ClientException) -> simpan ke OfflineStore (sqflite anyostore_offline.db), nomor sementara OFF-<branch>-<ts>, harga ikut HP, stok negatif diizinkan, auto-sync via syncOfflineTransactions() saat app dibuka + halaman Antrean Offline (menu Lainnya). Backend menerima offline:true + offline_invoice_no di POST /api/transactions (skip tier/promo, total ikut klien); nomor resmi dibuat server saat sync, nomor sementara tersimpan di kolom transactions.offline_invoice_no dan tetap bisa dicari di Riwayat.
- Riwayat: kartu glass, status chip, filter Rentang/Status/Cari satu gaya dengan Laporan; kartu transaksi menampilkan "Kasir: <nama>" (dari kolom cashier di list transaksi); field Cari punya ikon scan barcode (BarcodeScannerPage) yang langsung mengisi nomor invoice/barcode lalu memuat hasil (buat retur cepat).
- Dashboard (dashboard_page.dart): mengikuti wireframe POS Dashboard Overview - pill rentang Hari ini/7 Hari/Bulan Ini, 4 kartu stat (Penjualan, Pengeluaran, Laba Bersih, Margin), grafik batang Penjualan 7 Hari (ketuk batang -> tooltip nilai), Transaksi Terakhir, tombol Mulai Kasir. Untuk OWNER: kartu "Semua Toko" — ranking cabang (badge 1-3) per penjualan pada rentang terpilih + laba + jumlah transaksi + komisi per cabang (dari GET /api/commissions/all-branches) + banner Total Komisi.
- Laporan: Ringkasan/Penjualan/Penutupan/PPN; Cetak Penutupan (struk thermal via printer tersimpan); kartu diberi jarak antar-kartu. Tombol Export (share_plus) menghasilkan file CSV laporan berjalan dan bisa langsung dibagikan (WA/email/Drive).
- Keuangan: kartu LABA RUGI HARI INI (blok gelap denim, angka besar di tengah, Pendapatan/Pengeluaran/Pemasukan sejajar).
- Pengaturan:
  - Kartu Ganti Logo Aplikasi (key store_logo) & Logo Toko/Kepala Invoice (key invoice_logo) via POST /api/settings/logo-data (body: content_type, filename, data_url, key).
  - Printer Thermal multi-per toko: PrinterService menyimpan per branch (prefiks pos_saved_printer_name-<branchId> / pos_saved_printer_addr-<branchId>); pos_page memanggil PrinterService.setActiveBranch saat ganti cabang. Pilih printer sekali -> semua cetak (struk, barcode, penutupan) langsung pakai tanpa scan ulang; ada Uji Cetak & Hapus.
  - Tampilan (mode gelap): ThemeController (pos_theme_mode di SharedPreferences) dengan pilihan Terang/Gelap/Sistem; main.dart membungkus MaterialApp dengan ValueListenableBuilder<ThemeMode> + _buildTheme(brightness) untuk darkTheme.
  - Backup Data: tombol Backup Sekarang -> GET /api/backup (owner), file JSON disimpan di app documents (path_provider) lalu bisa di-Bagikan (share_plus -> Google Drive/email/WA). Toggle "Backup otomatis harian" (pos_auto_backup): saat app dibuka, backup otomatis bila >24 jam sejak terakhir (BackupService.shouldAutoBackup/runBackup).
  - Notifikasi: toggle "Notifikasi stok menipis" (pos_notify_low_stock, default ON). NotificationService (flutter_local_notifications + timezone Asia/Jakarta): cek stok rendah dari reportOverview low_stock saat app dibuka; pengingat harian 09.00 WIB (zonedSchedule matchDateTimeComponents.time). Android butuh coreLibraryDesugaringEnabled + desugar_jdk_libs di android/app/build.gradle.kts dan permission POST_NOTIFICATIONS/RECEIVE_BOOT_COMPLETED/SCHEDULE_EXACT_ALARM + receiver ScheduledNotification(Boot)Receiver di AndroidManifest.
- Komisi: tab Saya/Aturan/Catatan/Laporan; migrasi menambah aturan default global "Komisi per pcs (default)" (Reguler 3000, Semi 3000, Grosir Seri 1000 per pcs, branch_id NULL) kalau belum ada; perhitungan live dari transaksi per pegawai.
- Menu Lainnya: grup menu (UTAMA/AKUN & TOKO/PRODUK & INVENTORI/TRANSAKSI & KEUANGAN/MANAJEMEN), tile Jenis Pelanggan (buka CustomersPage), Antrean Offline dengan badge jumlah, Riwayat Aktivitas (ActivityLogPage) dengan filter chip Semua/Transaksi/Stok/Retur/Produk (query ?action= prefix di /api/activity-logs).
- Daftar Produk (products_page.dart): tiap kartu punya tombol cetak label harga (printPriceLabel di PrinterService: nama, varian, harga besar 2x, sku, barcode opsional) — label rak 40x30, cetak via printer tersimpan tanpa scan ulang.
- Opname (inventory_page.dart): item yang sudah masuk daftar bisa di-edit stok fisiknya dengan ketuk kartu (dialog input keyboard numeric), selain dihapus.

### Mobile teknis
- File baru: lib/src/theme_controller.dart (ThemeMode + SharedPreferences), lib/src/notification_service.dart (notif lokal & jadwal harian), lib/src/backup_service.dart (backup JSON ke dokumen + cek jadwal + cek stok rendah). Main.dart memanggil NotificationService.init() + cek stok + auto-backup + jadwal pengingat saat app dibuka (hanya kalau sudah login).
- ApiClient._request membungkus error jaringan (TimeoutException/SocketException/http.ClientException) menjadi ApiException(isNetwork: true) dengan pesan ramah — SEMUA halaman cukup catch `on ApiException`. Deteksi offline di pos_page memakai `e is ApiException && e.isNetwork` (atau tipe mentah) supaya mode offline tetap jalan.
- Dependensi baru di pubspec.yaml: share_plus, flutter_local_notifications, timezone, path_provider.
- Build APK: JANGAN build di folder OneDrive (APK korup ZIP_BAD). Rsync mobile/ ke /private/tmp/mbuild2, build di sana, copy hasilnya. Gradle butuh ANDROID_HOME=/opt/homebrew/share/android-commandlinetools dan JAVA_HOME=/opt/homebrew/opt/openjdk@17 (di mesin ini). CI job android-apk (ci.yml) membangun APK & upload artifact.

### Backend tambahan
- transactions.js: mode offline (harga/total ikut HP, allow_negative_stock, offline_invoice_no), search riwayat mencakup offline_invoice_no; hold/pending/resume menerima branch_id (owner); list transaksi mengembalikan u.name AS cashier.
- dashboard.js: untuk owner, array `stores` berisi metrik per cabang: today/7d/month sales, expenses, transactions + jumlah produk.
- commissions.js: helper computeBranchReport dipakai /report dan endpoint baru /all-branches (owner) — ringkasan komisi per cabang + total untuk rentang start/end.
- activity-logs.js: dukung filter ?action=<prefix> (mis. transaction_, stock_, return_, product_).
- products.js: log product_update / product_price_update (harga lama -> baru) ke activity_logs; inventory-control.js: log stock_opname (jumlah item + selisih).
- settings.js: /logo-data menerima key (store_logo | invoice_logo).
- users.js + auth.js: login pakai email ATAU username; CRUD pegawai punya field username (unik, 3-50, lowercase).
- Migrasi baru: 20260812_user_username.sql, 20260812_offline_transaction_sync.sql, 20260812_default_commission_rules.sql.

### Web
- Web sengaja tetap desain lama (hanya login web yang pernah diubah lalu di-revert; fokus pengembangan di Android). Backend yang sama membuat web otomatis mendukung login username/email dan fitur backend lainnya.

## Perintah

```bash
cd frontend && npm run build   # cek build (frontend)
cd backend && npm test         # cek test (backend)
cd mobile && flutter analyze --no-pub  # cek analyzer mobile
# Build APK (hindari OneDrive): rsync ke /private/tmp/mbuild2 lalu:
cd /private/tmp/mbuild2 && flutter build apk --release
# Install & debug:
adb install -r build/app/outputs/flutter-apk/app-release.apk && adb logcat
cd backend && node scripts/reconcile-stock.js [--fix]  # audit/perbaiki selisih stok (jalankan di container backend)
cd backend && node scripts/audit-payments.js           # audit konsistensi pembayaran (read-only)
```

## Bahasa

User berbahasa Indonesia. Jawab/terangkan dalam Bahasa Indonesia. Kode, error, command tetap asli.
