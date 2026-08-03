# AGENTS.md — Anyostore POS (pos-pakaian)

Konteks proyek ini otomatis dibaca semua AI agent di awal sesi. Baca sebelum mengerjakan apa pun.

## Ringkasan

Sistem POS + katalog grosir pakaian denim wanita (multi-cabang). Live di `https://anyostore.my.id` (Tencent Cloud Lighthouse, Ubuntu, Docker, Caddy auto-HTTPS). Repo: `https://github.com/miftahulfauzan/anyostore-pos`.

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
| `inventory.js` | `/api/inventory` | Warehouse, mutasi, stock-total (branch/all), barcode search, incoming/outgoing per batch (`batch_number` BATCH-YYYYMMDD-NNN, `warehouse_id`, `transaction_date`) |
| `inventory-control.js` | `/api/inventory-control` | Transfer antar gudang/cabang, opname |
| `transactions.js` | `/api/transactions` | Checkout (idempotency `client_transaction_id`), hold/resume, cancel |
| `printer.js` | `/api/printer` | Struk thermal 58/80mm |
| `customers.js` | `/api/customers` | CRUD pelanggan + price_tier |
| `returns.js` | `/api/returns` | Retur (pending → approve, stok kembali) |
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
- Roles: `owner`, `manager`, `admin`, `kasir`, `gudang`
- `authorize('owner')` dsb memfilter akses per route
- Owner bisa akses semua cabang (banyak route pakai `req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id`)

## Skema Database (47 tabel, `docs/12-migration.sql`)

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
1. Push ke `main` → `ci.yml` (test + build) dan `deploy.yml` jalan paralel
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
- **OneDrive** mengubah mode file (100755↔100644) → git tampil "modified" padahal konten sama. Jangan commit mode-change kosong. `git config core.filemode false` bisa membantu.
- **Sidebar AppShell**: `position: fixed`, collapsible (state `pos_sidebar_collapsed` di localStorage), margin konten via class `.app-main.sidebar-collapsed`.
- **Deploy failure umum**: CI `npm test` gagal kalau env DB tidak diset di test file (sudah diset di `backend/test/*.test.js`). Build frontend gagal = syntax error, cek `npm run build` lokal.
- **Media**: `MEDIA_STORAGE=database` atau disk (default). `copyMediaFile` untuk clone cabang (copy file ke path baru). Guard delete: cek ref-count sebelum `removeMedia` (clone share path).
- **Commission**: rule `per_pcs_customer_tier` (reguler 3000, semi 3000, grosir 1000 per pcs). Owner bisa hapus rule cabang manapun.
- **Rate limit**: 600 req/menit per IP global, 20/15 menit untuk login.

## Perintah

```bash
cd frontend && npm run build   # cek build (frontend)
cd backend && npm test         # cek test (backend)
```

## Bahasa

User berbahasa Indonesia. Jawab/terangkan dalam Bahasa Indonesia. Kode, error, command tetap asli.
