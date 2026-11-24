# Backend — arsitektur, skema database, alur bisnis

> Dipindahkan utuh dari `AGENTS.md` (2026-11-20) agar AGENTS.md ringkas dan cepat dibaca agent. Isi tidak diubah.

## Arsitektur Backend

### Struktur

| File | Fungsi |
|------|--------|
| `src/index.js` | Entry point, listen port |
| `src/app.js` | Express setup: helmet, cors, json 6mb, rate limit 600/min, static `/uploads`, mount 18 routers, 404 + error handler |
| `src/config.js` | Validasi env (DB_HOST/USER/PASS/NAME, JWT_SECRET, JWT_REFRESH_SECRET). Throw kalau kurang |
| `src/db.js` | mysql2/promise pool, connectionLimit 10 |
| `src/auth.js` | JWT access + refresh 365 hari, login password (`/api/auth/login`) & PIN (`/api/auth/login-pin`), `authenticate`, `authorize(roles...)` |
| `src/media-storage.js` | Storage disk/DB (`MEDIA_STORAGE=database`), `persistUploadedFile`, `removeMedia`, `copyMediaFile`, `serveBlob` |
| `src/pricing.js` | Satu-satunya logika tier harga (grosir seri/semi grosir/retail + harga wholesale) — dipakai checkout DAN `POST /api/transactions/preview`. JANGAN duplikasi di frontend |
| `src/stock.js` | Satu-satunya jalur penulisan stok: `adjustStock()` mengubah `warehouse_stocks` + `products.stock` + `product_variants.stock` + `stock_mutations` sekaligus |
| `src/money.js` | Satu definisi pembulatan uang (`Number.EPSILON`) — jangan definisikan `money` sendiri di route |
| `src/local-date.js` | Tanggal lokal WIB (`localDateString`/`localMonthStartString`) — jangan pakai `toISOString().slice(0,10)` untuk "hari ini" |
| `src/netlify.js` | Serverless adapter (TIDAK DIPAKAI, Netlify sudah dihapus) |
| `scripts/migrate.js` | Jalankan migrasi SQL di `migrations/`, track `_migrations` table |
| `scripts/fix-clone-paths.js` | One-off: copy file foto yang di-share antar cabang ke path baru (idempoten) |
| `scripts/merge-warehouses.js` | One-off: sisakan 1 gudang per cabang — gabungkan stok, pindahkan referensi, hapus duplikat (JALANKAN MANUAL, bukan otomatis) |
| `scripts/sync-catalog-to-branches.js` | One-off: HAPUS (soft) semua produk cabang target lalu SALIN katalog cabang sumber (foto produk+varian via copyMediaFile, stok products/variants/warehouse_stocks dengan mapping gudang utama->utama/reject->reject, harga grosir, varian; SKU baru B<targetId>-; BARCODE DISALIN APA ADANYA (boleh sama di semua cabang — migrasi 20260815_barcode_multi_branch menghapus UNIQUE products.barcode, index tetap); dry-run default, eksekusi `--apply`; riwayat lama aman karena soft-delete) |
| `scripts/sync-product-photos.js` | One-off: **HANYA foto produk** (bukan stok/harga/varian) — sumber → target, `node scripts/sync-product-photos.js --from "Blok B" --to "Gudang Utama" [--apply]`. Pencocokan produk lewat NAMA (normalisasi ketat: lowercase + spasi dirapatkan; tanda hubung & "(Salinan)" harus persis), nama ganda diselesaikan SKU tanpa prefix `B<id>-` lalu dilewati bila masih ambigu. Salin file via `copyMediaFile` (path baru) + `transform`/`is_primary`/`sort_order`; baris foto target lama dihapus dan file lama hanya dibuang bila `COUNT(*) WHERE path = 0`. Batch 50 + `FOR UPDATE`, snapshot stok/harga dicetak sebelum-sesudah sebagai bukti tidak berubah. Dry-run default; foto varian & video tidak disentuh |

### Routes (`backend/src/routes/`)

| Router | Prefix | Fitur utama |
|--------|--------|-------------|
| `public.js` | `/api/public` | Landing: settings (multi-WA), categories, products (paginasi/search/sort), products/:id (media+variants) |
| `products.js` | `/api/products` | CRUD produk, media (max 10 img + 1 video), varian, wholesale prices, categories CRUD, transform foto; `POST /:id/copy` = salin produk (nama + " (Salinan)", SKU unik -C/-C2, barcode kosong, varian+wholesale+foto disalin via copyMediaFile, stok 0); POST `/` TIDAK boleh menyentuh req.params.id; PUT wajib deklarasi `oldProducts` (untuk log harga); route `/:id/copy` JANGAN menamai hasil query `res` (menimpa response Express -> 500) — pakai `ins` |
| `products.js` | `/api/products/:id/media/:mediaId/image-data` | Ganti file foto dengan hasil crop 1200×1200 1:1 (modal Ubah Foto Produk) |
| `inventory.js` | `/api/inventory` | Warehouse, mutasi, stock-total (branch/all), stock-by-warehouse + posisi rak, barcode search, incoming/outgoing per batch (`batch_number` BATCH-YYYYMMDD-NNN, `warehouse_id`, `transaction_date`) |
| `inventory-control.js` | `/api/inventory-control` | Transfer antar gudang/cabang, simpan opname dengan snapshot/revision stok, dan riwayat opname beserta detail item |
| `transactions.js` | `/api/transactions` | Checkout (idempotency `client_transaction_id`), hold/resume, cancel, hapus draft (`DELETE /pending/:id`, owner boleh pilih `branch_id`, role lain terkunci ke cabangnya, hanya draft yang belum resumed dan mengembalikan 404 kalau tidak ada baris terhapus) |
| `printer.js` | `/api/printer` | Struk thermal 58/80mm |
| `customers.js` | `/api/customers` | CRUD pelanggan + price_tier + expedition |
| `returns.js` | `/api/returns` | GET /:id mengembalikan detail retur + item (dipakai mobile). Retur AUTO-APPROVE saat dibuat (POST langsung stok kembali + refund kas, tanpa persetujuan; `approve:false` di body bisa memaksa pending); PUT /:id/approve tetap ada untuk legacy. Saat retur disetujui, `transaction_items.returned_qty` diperbarui, `transactions.refunded_amount` diakumulasi, & status transaksi jadi `partially_refunded` (retur sebagian) / `refunded` (semua item diretur). Migrasi 20260815_return_partial_status.sql + 20260815_refunded_amount_column.sql (kolom refunded_amount HARUS di file migrasi terpisah — jangan mengedit file migrasi yang sudah terlanjur jalan!). CATATAN PENTING setelah audit 2026-08-15: (1) PENUTUPAN & LACI KAS: refund retur TIDAK boleh dikurangi ganda — payments.cancellations HANYA `cancelled_amount` (refund sudah lewat `returns` di penutupan & movement cash_out di laci kas); (2) retur WAJIB set status approved DULU sebelum hitung returned_qty/status transaksi (kalau tidak, retur pertama tidak terhitung); (3) dashboard owner 'all' mengirim branch_id=all ke stock-by-category/top-products-out. |
| `returns.js` | `/api/returns` | Retur menyimpan `refund_method` (cash/qris/transfer/debit) untuk laporan & laci kas |
| `cash-drawer.js` | `/api/cash-drawer` | Buka/tutup kas, cash in/out |
| `suppliers.js` | `/api/suppliers` | Supplier per cabang |
| `reports.js` | `/api/reports` | Sales + overview (owner bisa pilih branch via `?branch_id`). `GET /daily-closing` tanpa `?date` memakai hari bisnis WIB saat ini (web `/closing` dan Android ikut membuka tanggal yang sama); klien tetap boleh mengirim tanggal lain untuk mencetak penutupan hari sebelumnya. SEMUA query penjualan menyertakan status `partially_refunded`/`refunded` dan mengurangi `refunded_amount` (refund retur) dari gross/revenue/payment; COGS/produk/komisi pakai `quantity - cancelled_qty - returned_qty` |
| `purchase-orders.js` | `/api/purchase-orders` | PO + receive (update stok) |
| `finance.js` | `/api/finance` | Expenses, income, journals, profit-loss |
| `users.js` | `/api/users` | CRUD pegawai, role, PIN, password |
| `settings.js` | `/api/settings` | Branch CRUD (clone katalog), store settings, WA dinamis, logo |
| `dashboard.js` | `/api/dashboard` | Ringkasan penjualan; data Dashboard Stok terpisah, Owner dapat mengirim `branch_id` untuk satu cabang (tanpa filter = semua cabang), manager/admin tetap cabangnya sendiri, role gudang dibatasi ke cabang tipe gudang |
| `commissions.js` | `/api/commissions` | Komisi staf (per_pcs_customer_tier dll), rules, report, generate |
| `promotions.js` | `/api/promotions` | Promo/diskon + validate |
| `tax.js` | `/api/tax` | Laporan pajak: PPN, Faktur Pajak, PPh23 |
| `reseller.js` | `/api/reseller` | **Pembeli reseller** (publik, cookie `buyer_session`, bukan `pos_access`): register/login/logout/me, alamat tersimpan (multi), `POST /orders` (guest & member; harga dihitung server dari produk/varian, tanpa minimum order), `GET /orders` (riwayat akun), `GET /orders/:token` (status publik via token 32 hex), `GET /orders/lookup?order_no=&phone=`, `GET /payment-info` (rekening + QRIS statis dari setelan) |
| `reseller-admin.js` | `/api/reseller-admin` | Staf (owner/manager/admin): daftar & detail pesanan, `confirm`/`reject`/`mark-paid`/`ship`/`done`, `convert` (buat transaksi POS + potong stok lewat `adjustStock`, hanya setelah `payment_status=paid`), akun pembeli (suspend, reset password sementara), `summary` untuk badge sidebar |

### Struk: satu aturan untuk web & Android (2026-11-13)

- `backend/src/receipt-lines.js` adalah **satu-satunya** penyusun baris struk (port 1:1 dari `mobile/lib/src/receipt_layout.dart`). Keluaran: `{ text, bold, alignment }` + `receipt_meta { width, margin, font, inner }`.
- Dipakai oleh: `GET /api/printer/invoice/:id`, `POST /api/transactions` (field `data.receipt`, jadi cetak otomatis tak perlu request tambahan), `POST /api/printer/preview` (pratinjau template di web), dan halaman resi `/receipt/[id]` (render baris apa adanya, bukan HTML kaya lagi).
- Android: `printer_service.printReceipt` memakai `receipt.lines` bila ada; kalau tidak (offline) menyusun lokal dari setelan cabang yang di-cache (`_receiptSettings`) — termasuk cetak transaksi offline bernomor sementara `OFF-<branch>-<ts>`.
- Paritas dijaga fixture golden `backend/test/fixtures/receipt-lines/*.json` (dibaca `backend/test/receipt-lines.test.js` DAN `mobile/test/receipt_lines_golden_test.dart`). Ubah aturan → jalankan `node backend/scripts/generate-receipt-fixtures.js`, tinjau diff, lalu sesuaikan kedua sisi.
- Sejak 2026-11-24 baris produk diberi **nomor urut** (`1. Nama`) dan ringkasan menambah **`Total Qty N pcs`** tepat sebelum Subtotal (dipakai juga oleh `invoice-image.js` dan `invoice_share.dart`). Pemotongan nama panjang hanya boleh dilakukan saat nama melebihi kolom: `substring` Dart melempar `RangeError` bila dipanggil lebih dulu, sedangkan `slice` JS tidak — perbedaan ini pernah membuat cetak struk Android gagal untuk semua produk ber-nama pendek.
- `receipt_contacts` (field mati) sudah dihapus dari UI Android, Setelan Toko, dan daftar `allowed` settings.

### Auth & Roles

- JWT access & refresh token 365 HARI (praktis tanpa batas — user minta tidak ada auto-logout; logout hanya lewat tombol Keluar), hash SHA-256 di DB
- Login/PIN/refresh menyetel **httpOnly cookie** (`pos_access`, `pos_refresh`, SameSite=Strict, Secure di produksi); `authenticate` membaca cookie (Bearer header tetap diterima). Refresh token TIDAK dikembalikan di body respons. Frontend tidak menyimpan JWT di localStorage.
- **Akun tersimpan web (2026-11-24, "Ganti Akun")**: setiap akun yang diingat menyimpan satu refresh token di cookie `pos_saved_<userId>` (`HttpOnly`, `SameSite=Strict`, `Path=/api/auth`, umur 365 hari, `Secure` di produksi). **Family sesinya TERPISAH** dari sesi aktif (`sid` berbeda) — ini wajib: `authenticate()` menganggap sesi hidup selama ada baris `refresh_tokens` hidup pada `session_id` yang sama, jadi bila akun tersimpan berbagi family dengan sesi aktif, "Keluar saja" mustahil membedakan keduanya dan access token aktif tetap sah setelah logout. Maksimal **8 akun tersimpan per browser**; akun kesembilan tetap bisa login tetapi tidak disimpan (`account_saved: false`).
- Endpoint akun (semua `authenticate`): `GET /api/auth/accounts` → `{ active, active_saved, accounts }` (hanya metadata aman: id, name, username, email, role, branch_id — **tidak pernah token**); `POST /api/auth/accounts/remember`; `POST /api/auth/accounts/switch` (body `{user_id}`; memutar family akun tujuan, mempertahankan sesi asal bila diingat dan mencabut bila tidak, agar tidak ada sesi hantu); `DELETE /api/auth/accounts/:userId` (menghapus akun aktif sekaligus mengakhiri sesi aktif).
- **Login web tidak lagi mengembalikan `accessToken`/`refreshToken`** di body (hanya `?mobile=1` yang mengembalikan keduanya untuk APK). `POST /api/auth/refresh` web juga hanya menyetel cookie. `remember_account: true` menyimpan akun aktif dan mengembalikan `account_saved`.
- **Logout** default & `preserve_saved: true` hanya mencabut family sesi aktif sehingga akun tersimpan tetap bisa dipilih kembali ("Keluar saja"); `remove_saved: true` ikut mencabut family tersimpan ("Keluar & hapus akun ini"). `authenticate()` menyimpan `req.user.sid` agar pencabutan family aktif bekerja untuk klien Bearer maupun cookie.
- Roles: `owner`, `manager`, `admin`, `kasir`, `gudang`
- `authorize('owner')` dsb memfilter akses per route
- Owner bisa akses semua cabang (banyak route pakai `req.user.role === 'owner' ? (Number(req.query.branch_id) || req.user.branch_id) : req.user.branch_id`)

## Skema Database (`backend/schema.sql` + seluruh `backend/migrations/`, ±50 tabel live; snapshot terkini bisa di-regenerate via `scripts/dump-schema.sh`)

### Aturan migrasi (PENTING)
- JANGAN PERNAH mengedit file migrasi yang sudah pernah dijalankan — selalu buat file migrasi BARU. `migrate.js` sekarang menyimpan SHA-256 isi file di `_migrations.content_hash`; kalau file yang sudah terpasang isinya berubah, migrasi `FAILED` saat deploy (bukan diam-diam skip). Migrasi lama tanpa hash hanya di-skip dengan peringatan.
- Skema dasar di `backend/schema.sql` HANYA dieksekusi saat database baru dibuat (docker-entrypoint-initdb). Semua perubahan produksi wajib lewat migrasi.
- Status penjualan terpusat di `backend/src/sales-status.js` (`SALES_STATUSES` + `SALES_STATUSES_SQL`) — SEMUA query laporan wajib pakai konstanta ini, jangan menulis literal status.
- Logika rincian metode bayar penutupan dipisah di `backend/src/closing-math.js` (unit test `test/closing-math.test.js` — regression refund dobel).

### Tabel inti

| Tabel | Kolom penting |
|-------|--------------|
| `branches` | id, name, address, phone, email, npwp, pricing_tier_enabled, is_active |
| `reseller_accounts` | email (UNIQUE), password_hash, customer_id, branch_id, status active/suspended — akun pembeli situs reseller, terpisah dari `users` |
| `reseller_orders` | order_no `RS-YYYYMMDD-B<branch>-NNNN`, public_token (32 hex, dipakai halaman status tanpa login), status new/confirmed/paid/shipped/done/rejected/cancelled, payment_status, shipping_cost, tracking_no, transaction_id (diisi saat konversi), client_order_id (idempotensi) |
| `reseller_order_items` | order_id, product_id, variant_id, product_name, sku, price, quantity, subtotal |
| `customer_addresses` | account_id, recipient, phone, address, city, postal_code, is_default (multi alamat pembeli) |
| `users` | branch_id, name, role, pin, is_active |
| `categories` | name, slug, sku_prefix, is_active |
| `products` | branch_id, category_id, name, description, sku (UNIQUE global), barcode, price, cost, stock, min_stock, gender, is_active |
| `product_variants` | product_id, size, color, sku, barcode, price, is_active — **stock deprecated (selalu 0)**, harga mengikuti produk |
| `product_photos` | product_id, variant_id, filename, path, media_type (image/video), is_primary, sort_order, `transform` (scale,x,y) |
| `warehouse_stocks` | warehouse_id, product_id, variant_id, quantity, reserved_quantity, `rack_position` (VARCHAR(100), nullable) |
| `warehouses` | branch_id, name, description, type (utama/cadangan/reject) |
| `stock_opnames` | warehouse_id, branch_id, opname_date, total_items, total_selisih, status, notes, created_by |
| `stock_opname_items` | opname_id, product_id, variant_id, system_stock, physical_stock, selisih, notes |
| `transactions` | branch_id, invoice_no, client_transaction_id (UNIQUE), user_id, customer_id, subtotal, discount, grand_total, payment_method, status (completed/cancelled/refunded/pending/held/partially_cancelled/**partially_refunded**), cancelled_amount, **refunded_amount** |
| `transaction_items` | transaction_id, product_id, variant_id, product_name, quantity, price, original_price, price_override, cost, cancelled_qty, **returned_qty** |
| `invoice_sequences` | branch_id + business_date (PK), last_number — counter invoice atomik |
| `customers` | name, phone, address, expedition (ekspedisi langganan, mis. JNE/J&T), price_tier (reguler/semi_grosir/grosir_seri) |
| `store_settings` | branch_id + `key` (PK), value — key-value settings |
| `media_files` | `key`, content_type, data (blob, kalau MEDIA_STORAGE=database) |
| `commission_rules` | branch_id (NULL=global), type, per_pcs_customer_tier config |
| `expenses` | branch_id, type (expense/income), amount, status (approved) |

### Migrasi (`backend/migrations/`)

43 file saat ini: seluruh migrasi katalog, media, harga, cabang, mutasi, retur, komisi, foto, channel, dan tipe gudang yang sudah tercantum di bawah, ditambah migrasi terbaru `20260812_*` (username, transaksi offline, default commission rules), `20260909_auth_refresh_sessions.sql`, `20260909_auth_user_token_version.sql`, `20260909_inventory_safety.sql`, `20260909_transfer_destination_identity.sql`, `20260909_warehouse_catalog_permission.sql`, `20260909_warehouse_catalog_permission_seed.sql`, dan `20260924_warehouse_stock_rack_position.sql` (menambah `warehouse_stocks.rack_position` untuk posisi rak per gudang dan produk/varian). Migrasi lama mencakup promotions, branch_contact_tax, denim_variant_stock, product_media (variant_id, media_type), sync_variant_colours, media_files, price_tiers, customer_price_tier, transaction_cancellation, branch_pricing_tier, expense_income_type, commission_per_pcs_customer_tier, product_photo_transform, partial_cancel_purchase_received (tambah `partially_cancelled` ke ENUM status transactions + kolom `received_at` di purchase_orders untuk laporan PPN Masukan), photo_transform_percent (konversi pan px→% supaya crop konsisten lintas ukuran box), stock_mutation_channel (kolom `channel` di `stock_mutations`: wa/shopee/tiktok/reseller/toko untuk penjualan gudang via channel), warehouse_type (kolom `type` di `warehouses`: utama/cadangan/reject untuk gudang barang reject), rename_gudang_utara (rename nama gudang legacy 'Gudang Utara' → 'Gudang Utama'), branch_type (kolom `type` di `branches`: toko/gudang — gudang murni stok tanpa POS), sales_channels (tabel `sales_channels` + CRUD di `/api/inventory/channels` untuk saluran penjualan dinamis), branch_type_gudang_names (tandai cabang bernama 'Gudang…'/'Riject' sebagai type gudang supaya dipilih admin gudang), warehouse_names_match_branch (rename gudang mengikuti nama cabang: 'Gudang Anyostore Metro', 'Gudang Toko B', dll), stock_mutation_reference_bigint (ubah `stock_mutations.reference_id` INT → BIGINT karena dipakai menyimpan batch id Date.now() 13 digit).

**Migrasi**: `migrate.js` hanya toleran terhadap error idempotent (duplicate column/entry/already exists, misalnya saat initdb sudah memasang schema lalu migrate.js menjalankan file yang sama). Error lain = kegagalan nyata: file TIDAK ditandai selesai, script exit 1, dan dicoba ulang saat restart/deploy berikutnya. Cari `[migrate] FAILED` di log container backend kalau migrasi baru tidak kelihatan terpasang.

## Alur bisnis penting

### Multi-cabang
- Setiap cabang punya katalog sendiri (`products.branch_id`), produk di-clone saat buat cabang
- SKU clone: `B{branchId}-{sku}` (unik global)
- Clone foto: `copyMediaFile` salin file ke path baru (bukan share path)
- Hapus cabang: soft-delete dulu (`is_active=FALSE`), lalu hard-delete (cascade semua tabel branch_id, `SET FOREIGN_KEY_CHECKS=0`)
- Owner bisa pilih cabang di `/settings`, laporan, stock report; **route tulis produk** (tambah/edit/hapus/salin/upload foto) memakai helper writableBranchId(req) di products.js: owner memilih cabang via branch_id (body/query), role lain tetap cabangnya sendiri (fix: owner tidak bisa simpan edit produk di toko/gudang terpilih karena PUT/multipart lama terkunci ke branch akun).

### Transaksi (checkout)
- `client_transaction_id` UUID → idempotency (retry tidak dobel)
- Invoice: `{invoice_prefix}-YYYYMMDD-B{branch}-0001` (prefix dari `store_settings.invoice_prefix`, default `INV`) via `invoice_sequences` + `FOR UPDATE`; PO pakai `order_prefix` (default `PO`)
- Harga otomatis: tier pelanggan → wholesale price → override manual (`price_override` di audit); **harga varian 0/NULL = ikut harga produk** (`basePrice = variant && variant.price > 0 ? variant.price : product.price` di preview & checkout) supaya produk dengan harga varian belum diisi tidak pernah jadi Rp0.
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
