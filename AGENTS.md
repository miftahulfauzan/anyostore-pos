# AGENTS.md — Anyostore POS (pos-pakaian)

Konteks proyek ini otomatis dibaca semua AI agent di awal sesi. Baca sebelum mengerjakan apa pun.

## Ringkasan

Sistem POS + katalog grosir pakaian denim wanita (multi-cabang). Live di `https://anyostore.my.id` (Tencent Cloud Lighthouse, Ubuntu, Docker, Caddy auto-HTTPS). Repo: `https://github.com/miftahulfauzan/anyostore-pos`.

- **Backend**: Express (Node 20), MySQL 8.4, `backend/src/`
- **Frontend**: Next.js 16 App Router (`output: 'standalone'`), React 18, `frontend/app/`
- **Deploy**: GitHub Actions `deploy.yml` → SSH ke VPS → `docker compose up -d --build` (selalu `docker builder prune -af` sebelum build supaya cache tidak bengkak 15GB). CI `ci.yml` menjalankan `npm test` (backend) + `npm run build` (frontend).

## Fitur utama yang sudah dibangun

- **Landing page** (`frontend/app/page.js`): e-commerce minimalis. Palet: hitam `#1a1a1a` + denim blue `#1e3a5f` (aksen), bg `#fafafa`. Font DM Sans (700 heading). Style liquid glass (`backdrop-filter: blur + saturate`). Hero slideshow (10 produk acak stabil per tanggal, prioritas yang punya foto). Grid produk 4 kolom, 24/halaman, kartu 3:4 `objectFit: cover`. Search + filter kategori + sort. Category chips scrollable. Tombol utama = denim blue + shadow, tombol sekunder = outline biru. WA picker modal. Judul tab: "Anyostore Grosir PGMTA".
- **Detail produk** (`frontend/app/produk/[id]/page.js`): clean minimal, DM Sans + Instrument Serif, SVG icons (tanpa emoji), deskripsi full-width di bawah grid, WA buttons seragam denim blue. Pakai `useParams()` (bukan `use(params)` — Next 16 client component).
- **Edit produk** (`frontend/app/products/[id]/edit/page.js`): multi-upload foto (`multiple`), drag reorder, varian, harga grosir, deskripsi textarea. Fitur **"Atur"** zoom/pan foto: modal 3:4 dengan thumbnail foto utuh di pojok (area besar = hasil di kartu). Transform disimpan `scale,x,y` ke `product_photos.transform`. Grid edit selalu `contain` (foto utuh). Setelah simpan → redirect `/products`.
- **Tambah produk**: deskripsi textarea ditambahkan.
- **Daftar produk** (`frontend/app/products/page.js`): tombol Hapus (soft-delete kalau ada transaksi, hard-delete kalau tidak), grid 3:4 cover.
- **Settings** (`frontend/app/settings/page.js`): CRUD kategori (CategoryManager), WA dinamis (list add/remove, simpan `whatsapp_numbers` JSON), hard-delete cabang (cascade 32 tabel, pakai `SET FOREIGN_KEY_CHECKS=0`), branch selector.
- **Laporan** (`/reports`): owner bisa pilih toko. Tax report (`/reports/tax`): PPN/Faktur Pajak/PPh23. Laporan stok (`/inventory/stock`): total stok, owner pilih toko/`all`.
- **Riwayat transaksi** (`/history`): retur/batal pakai layout POS cart (+/− buttons). Riwayat stok (`/inventory/movements`): card list (bukan tabel).
- **POS** (`/pos`): cart line dengan edit harga inline di samping tombol +/−.

## Pola penting / jebakan

- **Next.js 16**: `params` di client component pakai `useParams()` dari `next/navigation`, BUKAN `use(params)` atau `params?.id` (bisa undefined → fetch `/api/products/undefined`).
- **Hydration error #418**: jangan pakai `new Date()` di render awal client component (server UTC vs browser WIB beda). Lazy-init state kosong, isi via `useEffect`.
- **CSS globals.css** punya banyak aturan duplikat (`.app-shell`, `.sidebar`, `.app-main`) yang saling override. Saat ubah layout, cek duplikat.
- **OneDrive** mengubah mode file (100755↔100644) → git tampil "modified" padahal konten sama. Jangan commit mode-change kosong. Git ignore: `git config core.filemode false` bisa membantu.
- **Sidebar AppShell**: `position: fixed`, collapsible (state `pos_sidebar_collapsed` di localStorage), margin konten via class `.app-main.sidebar-collapsed`.
- **Deploy failure umum**: CI `npm test` gagal kalau env DB tidak diset di test file (sudah diset di `backend/test/*.test.js`). Build frontend gagal = syntax error, cek `npm run build` lokal.
- **Media**: `MEDIA_STORAGE=database` atau disk (default). `copyMediaFile` untuk clone cabang (copy file ke path baru). Guard delete: cek ref-count sebelum `removeMedia` (clone share path).
- **Commission**: rule `per_pcs_customer_tier` (reguler 3000, semi 3000, grosir 1000 per pcs). Owner bisa hapus rule cabang manapun.

## Perintah

```bash
cd frontend && npm run build   # cek build (frontend)
cd backend && npm test         # cek test (backend)
```

## Bahasa

User berbahasa Indonesia. Jawab/terangkan dalam Bahasa Indonesia. Kode, error, command tetap asli.
