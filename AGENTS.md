# AGENTS.md — Anyostore POS (pos-pakaian)

Konteks proyek ini otomatis dibaca semua AI agent di awal sesi. Baca sebelum mengerjakan apa pun.

## Ringkasan

Sistem POS + katalog grosir pakaian denim wanita (multi-cabang). Live di `https://anyostore.my.id` (Tencent Cloud Lighthouse, Ubuntu, Docker, Caddy auto-HTTPS). Repo: `https://github.com/miftahulfauzan/anyostore-pos`.

- **Backend**: Express (Node 20), MySQL 8.4, `backend/src/`
- **Frontend**: Next.js 16 App Router (`output: 'standalone'`), React 18, `frontend/app/`
- **Mobile**: Flutter (`mobile/`) — terpisah, CI `continue-on-error`
- **Deploy**: GitHub Actions `deploy.yml` → SSH ke VPS → `docker compose up -d --build` (selalu `docker builder prune -af` sebelum build supaya cache tidak bengkak 15GB). CI `ci.yml` menjalankan `npm test` (backend) + `npm run build` (frontend).

## Arsitektur Backend

### Struktur

| File | Fungsi |
|------|--------|
| `src/index.js` | Entry point, listen port |
| `src/app.js` | Express setup: helmet, cors, json 6mb, rate limit 600/min, static `/uploads`, mount 18 routers, 404 + error handler |
| `src/config.js` | Validasi env (DB_HOST/USER/PASS/NAME, JWT_SECRET, JWT_REFRESH_SECRET). Throw kalau kurang |
| `src/db.js` | mysql2/promise pool, connectionLimit 10 |
| `src/auth.js` | JWT access 12h + refresh, `authenticate`, `authorize(roles...)` |
| `src/media-storage.js` | Storage disk/DB (`MEDIA_STORAGE=database`), `persistUploadedFile`, `removeMedia`, `copyMediaFile`, `serveBlob` |
| `src/netlify.js` | Serverless adapter (TIDAK DIPAKAI, Netlify sudah dihapus) |
| `scripts/migrate.js` | Jalankan migrasi SQL di `migrations/`, track `_migrations` table |
| `scripts/fix-clone-paths.js` | One-off: copy file foto yang di-share antar cabang ke path baru (idempoten) |

### Routes (`backend/src/routes/`)

| Router | Prefix | Fitur utama |
|--------|--------|-------------|
| `public.js` | `/api/public` | Landing: settings (multi-WA), categories, products (paginasi/search/sort), products/:id (media+variants) |
| `products.js` | `/api/products` | CRUD produk, media (max 10 img + 1 video), varian, wholesale prices, categories CRUD, transform foto |
| `inventory.js` | `/api/inventory` | Warehouse, mutasi, stock-total (branch/all), barcode search |
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
| `warehouses` | branch_id, name, description |
| `transactions` | branch_id, invoice_no, client_transaction_id (UNIQUE), user_id, customer_id, subtotal, discount, grand_total, payment_method, status (completed/cancelled/refunded/pending/held), cancelled_amount |
| `transaction_items` | transaction_id, product_id, variant_id, product_name, quantity, price, original_price, price_override, cost, cancelled_qty |
| `invoice_sequences` | branch_id + business_date (PK), last_number — counter invoice atomik |
| `customers` | name, phone, price_tier (reguler/semi_grosir/grosir_seri) |
| `store_settings` | branch_id + `key` (PK), value — key-value settings |
| `media_files` | `key`, content_type, data (blob, kalau MEDIA_STORAGE=database) |
| `commission_rules` | branch_id (NULL=global), type, per_pcs_customer_tier config |
| `expenses` | branch_id, type (expense/income), amount, status (approved) |

### Migrasi (`backend/migrations/`)

13 file: promotions, branch_contact_tax, denim_variant_stock, product_media (variant_id, media_type), sync_variant_colours, media_files, price_tiers, customer_price_tier, transaction_cancellation, branch_pricing_tier, expense_income_type, commission_per_pcs_customer_tier, product_photo_transform.

**Jebakan**: `migrate.js` pakai INSERT IGNORE toleransi kolom duplikat — bisa sembunyikan error migrasi lain. Kalau migrasi baru gagal, cek log container backend.

## Alur bisnis penting

### Multi-cabang
- Setiap cabang punya katalog sendiri (`products.branch_id`), produk di-clone saat buat cabang
- SKU clone: `B{branchId}-{sku}` (unik global)
- Clone foto: `copyMediaFile` salin file ke path baru (bukan share path)
- Hapus cabang: soft-delete dulu (`is_active=FALSE`), lalu hard-delete (cascade semua tabel branch_id, `SET FOREIGN_KEY_CHECKS=0`)
- Owner bisa pilih cabang di `/settings`, laporan, stock report

### Transaksi (checkout)
- `client_transaction_id` UUID → idempotency (retry tidak dobel)
- Invoice: `INV-YYYYMMDD-B{branch}-0001` via `invoice_sequences` + `FOR UPDATE`
- Harga otomatis: tier pelanggan → wholesale price → override manual (`price_override` di audit)
- Cancel/retur: `cancelled_qty` di transaction_items, stok dikembalikan, status `partially_cancelled`

### Komisi
- Rule `per_pcs_customer_tier`: reguler 3000/pcs, semi_grosir 3000/pcs, grosir_seri 1000/pcs
- Rule bisa per-cabang atau global (branch_id NULL)
- Owner bisa hapus rule cabang mana pun

### Media/foto
- Upload: max 10 foto + 1 video per produk
- Foto varian: per-variant photo
- `transform` (zoom/pan): format `scale,x,y`, disimpan di `product_photos.transform`
- **Render transform (WYSIWYG)**: `objectFit: cover` SELALU sebagai basis, lalu `transform: translate(xpx, ypx) scale(s)` di atasnya. Jangan pakai `objectFit: none` (basis render berbeda → hasil simpan tidak cocok dengan preview).
- Konsisten di: modal "Atur" (edit page), grid produk admin, landing page, detail produk.
- `openAdj` harus load transform yang sudah disimpan (parsing `scale,x,y`), bukan reset ke `1,0,0`.
- Pan di-clamp supaya tepi foto tidak bolong: `max = (boxSize * (s - 1)) / 2`.
- Grid edit produk selalu `contain` (foto utuh), modal "Atur" punya thumbnail foto utuh di pojok.

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
| `/inventory` | `inventory/page.js` | Stok |
| `/inventory/stock` | `inventory/stock/page.js` | Laporan stok (owner pilih toko) |
| `/inventory/movements` | `inventory/movements/page.js` | Riwayat stok (card list) |
| `/inventory/{barcodes,incoming,outgoing,opname}` | ... | Cetak barcode, masuk, keluar, opname |
| `/reports` | `reports/page.js` | Laporan (owner pilih toko) |
| `/reports/tax` | `reports/tax/page.js` | PPN/Faktur/PPh23 |
| `/settings` | `settings/page.js` | Pengaturan + cabang + kategori |
| `/commissions` | `commissions/page.js` | Komisi staf (owner) |
| `/users` | `users/page.js` | Pegawai (owner) |
| `/dashboard` | `dashboard/page.js` | Dasbor |
| `/profile` | `profile/page.js` | Akun |
| `/receipt/[id]` | `receipt/[id]/page.js` | Resi |
| `/operations`, `/finance`, `/customers`, `/expenses`, `/promotions` | ... | Operasional, keuangan, dll |

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
2. `deploy.yml`: SSH ke VPS → `git pull` → `docker builder prune -af` → `docker compose up -d --build` → `docker compose ps`
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
