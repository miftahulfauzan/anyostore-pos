# AGENTS.md — Anyostore POS (pos-pakaian)

Konteks proyek ini otomatis dibaca semua AI agent di awal sesi. Baca sebelum mengerjakan apa pun.

## Ringkasan

Sistem POS + katalog grosir pakaian denim wanita (multi-cabang). Live di `https://anyostore.id` (Tencent Cloud Lighthouse, Ubuntu, Docker, Caddy auto-HTTPS). `grosir.anyostore.id` dan `reseller.anyostore.id` melayani katalog publik. Domain lama `.my.id` mengalihkan halaman ke domain baru; `anyostore.my.id/api` dan `/uploads` tetap dilayani untuk aplikasi mobile lama. Repo: `https://github.com/miftahulfauzan/anyostore-pos`. Lokasi lokal aktif (workspace Codex): `/Users/anyo/Library/CloudStorage/OneDrive-Personal/pos-pakaian` (satu-satunya repo dengan commit terbaru). `~/Documents/POS_ANYOSTORE` adalah salinan lama yang tertinggal — jangan dipakai untuk kerja baru.

- **Backend**: Express (Node 20), MySQL 8.4, `backend/src/`
- **Frontend**: Next.js 16 App Router (`output: 'standalone'`), React 18, `frontend/app/`
- **Mobile**: Flutter (`mobile/`) — workflow terpisah di `.github/workflows/mobile.yml`. Push ke `main` hanya memicu workflow ini jika ada perubahan di `mobile/**`; analisis Flutter tetap `continue-on-error`. Build APK berjalan pada push tersebut atau manual (`workflow_dispatch`), tidak pada PR, dan mengunggah artifact `anyostore-pos-apk`. PR tetap menjalankan pemeriksaan mobile.
- **Deploy**: Push ke `main` menjalankan CI web dan workflow mobile secara paralel; deploy web hanya mengikuti CI web yang sukses. `deploy.yml` memverifikasi exact full SHA, lalu mengirim `scripts/deploy/release.sh` melalui SSH ke VPS. Script memakai lock, checkout detached ke SHA target, migrasi one-off, image OCI bertag SHA, health check, refresh Caddy, dan verifikasi HTTPS publik `/api/health` + `/version`. Build memakai BuildKit cache mount (`--mount=type=cache` di Dockerfile) supaya `npm ci`/`next build` cepat; prune hanya cache >7 hari (`builder prune -f --filter "until=168h"`) + `image prune -f`, BUKAN `builder prune -af`.

## Peta dokumen (baca sebelum mengubah area terkait)

`AGENTS.md` ini sengaja ringkas. Detail lengkap ada di `docs/agents/`, isinya utuh dari versi lama:

| File | Isi |
|------|-----|
| `docs/agents/backend.md` | Struktur backend, tabel semua router + fitur, skema & tabel inti, daftar migrasi, aturan migrasi, alur bisnis (multi-cabang, checkout, komisi, media) |
| `docs/agents/web-deploy.md` | Daftar halaman & komponen web, desain landing/detail produk, CI/CD, docker compose produksi |
| `docs/agents/mobile.md` | Android/iOS: design system, navigasi, semua fitur per halaman, catatan teknis, iOS |
| `docs/agents/audit-2026-08-24.md` | Temuan QA menyeluruh + perbaikannya |
| `docs/agents/AGENTS-FULL-2026-11-20.md` | Salinan utuh AGENTS.md sebelum diringkas (rujukan terakhir) |

## Aturan inti (tidak boleh dilanggar)

- **Harga**: `backend/src/pricing.js` satu-satunya logika tier (grosir seri/semi grosir/retail + wholesale). Dipakai checkout DAN `POST /api/transactions/preview`. Jangan duplikasi di frontend.
- **Stok**: `backend/src/stock.js` → `adjustStock()` satu-satunya jalur tulis stok (warehouse_stocks + products.stock + stock_mutations). Jangan menulis stok langsung dari route.
- **Varian bukan stok**: `product_variants` hanya pembeda gambar (warna/ukuran + foto; SKU/barcode opsional). Stok = satu angka per produk per gudang (`variant_id IS NULL`). Checkout/POS, stok masuk/keluar, transfer, opname tidak memilih varian; harga selalu dari produk. Kolom `product_variants.stock` deprecated (0) — jangan menambah jalur tulis stok dengan `variant_id` terisi.
- **Uang**: `backend/src/money.js` satu definisi pembulatan. **Tanggal**: `backend/src/local-date.js` (`localDateString`) untuk "hari ini" WIB — jangan `toISOString().slice(0,10)`.
- **Status penjualan**: `backend/src/sales-status.js` (`SALES_STATUSES`/`SALES_STATUSES_SQL`) di semua query laporan — jangan tulis literal status.
- **Migrasi**: JANGAN PERNAH mengedit file migrasi yang sudah jalan (`_migrations.content_hash` SHA-256 → deploy FAILED). Perubahan skema = file migrasi baru.
- **Retur**: refund tidak boleh dikurangi ganda (`closing-math.js`), `payments.cancellations` hanya `cancelled_amount`, status retur wajib `approved` dulu sebelum hitung `returned_qty`.
- **Struk**: baris struk hanya dari `backend/src/receipt-lines.js`; paritas Android dijaga fixture golden (`backend/test/fixtures/receipt-lines/`).
- **Media**: clone cabang memakai `copyMediaFile` (path baru), `removeMedia` hanya setelah cek ref-count.
- **Web**: aksi header ikut pola `.header-action-links` (≤820px jadi menu ⋯), tombol utama satu warna denim (`--action-bg`), jangan tambah aturan `button`/`a` global di `globals.css`.
- **Mobile**: setiap perubahan `mobile/**` wajib disusul build artefak sesuai instruksi di `docs/agents/mobile.md` (build di luar OneDrive).

## Pola penting / jebakan

- **Next.js 16**: `params` di client component pakai `useParams()` dari `next/navigation`, BUKAN `use(params)` atau `params?.id` (bisa undefined → fetch `/api/products/undefined`).
- **Hydration error #418**: jangan pakai `new Date()` di render awal client component (server UTC vs browser WIB beda). Lazy-init state kosong, isi via `useEffect`.
- **Tanggal grafik stok**: MySQL `DATE(created_at)` diparse mysql2 menjadi `Date` pada tengah malam WIB. Serialisasi JSON langsung menghasilkan tanggal UTC sehari sebelumnya. API dashboard wajib mengubah tanggal itu ke `YYYY-MM-DD` WIB via `localDateString` sebelum mengirim `daily`; grafik memakai `dashboard/stock-movement.cjs` untuk menerima tanggal polos maupun ISO legacy, mengisi hari kosong, dan mempertahankan seluruh rentang. Dashboard gudang/stok memperbarui data setiap 60 detik saat tab terlihat dan saat tab kembali aktif; jangan menghapus data lama selama refresh dalam konteks yang sama. Regression tests backend/frontend menjaga tanggal awal/akhir periode, mutasi kemarin, rentang panjang, dan cleanup timer.
- **SafeImage crash**: setiap file yang merender `<SafeImage>` harus memiliki import `../components/SafeImage` (sesuaikan path). Missing import dapat menghentikan seluruh render halaman stok dengan `ReferenceError` dan memicu error React #418.
- **Foto produk web 1:1**: kartu landing, detail produk, daftar produk, katalog stok, POS, dan grid media admin memakai frame 1:1. Grid edit media memakai `contain` sampai crop disimpan; modal "Ubah Foto Produk" menghasilkan JPEG 1200×1200.
- **CSS globals.css** punya banyak aturan duplikat (JANGAN tambah aturan `button`/`a` global yang menimpa — sudah diperbaiki 2026-08-16: tema blue/purple hanya ubah CSS var + `.app-main a`; sidebar punya guard keterbacaan `.sidebar a/button` sendiri) (`.app-shell`, `.sidebar`, `.app-main`) yang saling override. Saat ubah layout, cek duplikat (terutama yang di `@media`).
- **Aksi header web** (`.header-action-links` di `AppShell`) WAJIB satu gaya: `display:flex` + `gap:8px`, dan `.button-link` maupun `<button>` polos sama-sama `min-height:44px`/`padding:8px 14px`/`font-size:12px`. Sebelum 2026-11-10 blok ini tanpa aturan dasar sehingga tombol tampil inline (menempel) dan `<button>` lebih besar dari link. Pemilih toko (`.branch-switcher-trigger`) dan `.theme-toggle` header juga 44px. Di `@media (max-width:700px)` label boleh `white-space: normal`. Regression test: `frontend/test/header-actions-unified.test.cjs`.
- **Aksi header di HP = menu ⋯** (2026-11-10): `≤820px` daftar `.header-action-links` disembunyikan dan diganti tombol `.header-actions-menu` yang membuka sheet `role="dialog"` berisi aksi yang sama (tutup via backdrop/×/Escape). Desktop tetap menampilkan semua tombol. Jangan menaruh tombol baru di luar pola ini supaya header tetap satu baris. Test: `frontend/test/period-filter-ux.test.cjs`.
- **Filter periode**: preset (`DateRangePresets`, `.dashboard-report-periods`, `.warehouse-dashboard-periods`, `.stock-dashboard-periods`, `.mutation-report-periods`) tampil sebagai **chip 34px satu baris yang bisa digeser** (`flex-wrap:nowrap; overflow-x:auto`) — jangan kembalikan ke grid 2–3 baris. Default periode di web = **Hari ini**. Halaman Laporan/Dasbor/Dashboard Stok/Cashflow/Pajak **tanpa tombol Tampilkan/Terapkan**: tanggal di-debounce 350–400ms lalu langsung diterapkan. Kartu filter memakai `.period-filter` + `.period-filter-toggle` (bisa show/hide, state di `localStorage.pos_period_filter_open`). Test: `frontend/test/period-filter-ux.test.cjs`.
- **Skala tipografi web** (2026-11-11): token `--fs-2xs` (10px), `--fs-xs` (11), `--fs-sm` (12), `--fs-md` (12.5), `--fs-lg` (15), `--fs-xl` (24) di `globals.css`; pada `@media (max-width: 820px)` token dinaikkan (11/11.5/12.5/13/16/26) agar setara aplikasi Android. Pakai token ini untuk komponen baru, jangan menulis `font-size: 11px` langsung. Ukuran cetak (pt) di luar skala ini.
- **Sistem animasi web** (2026-11-16): token di akhir `frontend/app/globals.css` (`--motion-fast/base/slow/draw`, `--ease-standard/emphasized`). Atribut `<html data-motion="full|reduced|off">` diisi `preferencesScript` (`app/components/app-state.cjs`) sebelum paint; pilihan pengguna ada di **Akun Saya → Tampilan** (`pos_motion`, helper `app/lib/motion.js`), dan setelan OS `prefers-reduced-motion` tetap menang. Efek global: transisi `.app-content.m-page` (key `pathname` di `AppShell`), panel `m-fade-up` bertahap (maks 6), baris tabel `m-row-in` (maks 12 baris), submenu sidebar, chip periode `:active`. Angka ringkasan memakai `frontend/app/components/AnimatedValue.js` + `app/lib/count-up.cjs` (520 ms; 120 ms di mode Sederhana; final di mode Nonaktif) — JANGAN dipakai di sel tabel/keranjang POS. Wajib: hanya `transform`/`opacity`, durasi ≤ 400 ms (kecuali grafik), tanpa library animasi (framer-motion/gsap dilarang), dan `@media print` mematikan animasi. Regresi: `frontend/test/motion-system.test.cjs` + `frontend/test/count-up.test.cjs`.
- **Warna tombol web**: semua aksi utama memakai **satu warna denim** (`--action-bg: #1e3a5f`, hover `#16304f`; mode gelap `#2e5d8f`) lewat blok terakhir `globals.css`. Tema (blue/green/purple/…) TIDAK boleh lagi menggeser warna tombol; tombol sekunder/ikon/ghost tetap bergaya sendiri karena memakai selector berkelas (`.secondary`, `.icon-action`, `.theme-toggle`). Tab non-aktif dipaksa putih lewat `.tabs button:not(.active)`. Jangan menambah `background` tombol dengan var tema di halaman baru.
- **Safe area atas PWA**: `appleWebApp.statusBarStyle: 'black-translucent'` + `viewportFit: 'cover'` membuat halaman digambar sampai bawah status bar iOS. Padding atas `.app-main` mobile WAJIB `max(16px, calc(env(safe-area-inset-top, 0px) + 10px))` — jangan diganti angka mati (pernah jadi `16px ... !important` sehingga judul header (Dashboard, dll.) tertutup/ter-blur status bar). Sidebar, `.pos-standalone-header`, dan login sudah memakai `env(safe-area-inset-top)`. Test: `frontend/test/mobile-dashboard-pwa.test.cjs`.
- **Input tanggal di iOS**: `input[type=date]` iOS WebKit menghitung `width:100%` + padding lebih lebar dari kotaknya (WebKit bug 301648) sehingga baris filter meluber. Perbaikannya ada di blok `@supports (-webkit-touch-callout: none)` (`appearance:none`, `min-width:0`, `max-width:100%`, `line-height:1.25`) — jangan dihapus, dan jangan pindahkan keluar `@supports` karena akan mengubah tampilan desktop/Android. Test: `frontend/test/ios-date-input-width.test.cjs`.
- **OneDrive**: repo aktif DI /Users/anyo/Library/CloudStorage/OneDrive-Personal/pos-pakaian (workspace Codex, satu-satunya dengan commit terbaru). ~/Documents/POS_ANYOSTORE adalah salinan lama — jangan dipakai. Catatan dev: .env dev MYSQL_ROOT_PASSWORD=«REDACTED-ada-di-.env», JWT_SECRET=«REDACTED-ada-di-.env», JWT_REFRESH_SECRET=«REDACTED-ada-di-.env»; .env.production hanya ada di VPS/GitHub Secrets, tidak di repo. Git: jika muncul "dubious ownership" di /opt/homebrew/share/flutter, tambahkan `git config --global --add safe.directory /opt/homebrew/share/flutter`; jika flutter "Permission denied" pada cache, perbaiki kepemilikan sekali dengan `sudo chown -R <user>:admin /opt/homebrew/share/flutter`.
- **Sidebar AppShell**: `position: fixed`, collapsible (state `pos_sidebar_collapsed` di localStorage), margin konten via class `.app-main.sidebar-collapsed`.
- **Deploy failure umum**: CI `npm test` gagal kalau env DB tidak diset di test file (sudah diset di `backend/test/*.test.js`). Build frontend gagal = syntax error, cek `npm run build` lokal.
- **Varian bukan stok** (2026-11-17): `product_variants` hanya pembeda gambar (warna/ukuran + foto; SKU/barcode opsional untuk label). Stok = satu angka per produk per gudang (`warehouse_stocks.variant_id IS NULL`, total di `products.stock`). `adjustStock` selalu menulis baris produk dan **tidak** lagi mengubah `product_variants.stock` (kolom dibiarkan 0, deprecated). Checkout/POS (web & Android), stok masuk/keluar, transfer, dan opname tidak memilih varian; harga selalu dari produk (harga khusus varian diabaikan); barcode varian dipindai → produk. Migrasi `20261117_variant_stock_to_product.sql`, audit/konsolidasi `scripts/consolidate-variant-stock.js` (dry-run default, `--apply`) dan `scripts/reconcile-stock.js`. Regresi: `backend/test/variant-stock-product-level.test.js`, `frontend/test/variant-image-only.test.cjs`. Jangan menambah jalur tulis stok baru dengan `variant_id` terisi.
- **Media**: `MEDIA_STORAGE=database` atau disk (default). `copyMediaFile` untuk clone cabang (copy file ke path baru). Guard delete: cek ref-count sebelum `removeMedia` (clone share path).
- **Commission**: rule `per_pcs_customer_tier` (reguler 3000, semi 3000, grosir 1000 per pcs). Owner bisa hapus rule cabang manapun.
- **Rate limit**: 600 req/menit per IP global, 20/15 menit untuk login.

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
