# Redesign Stok Produk (Opsi D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Halaman Stok Produk mobile (seksi `stok` di `InventoryPage`) menjadi halaman fokus ala Opsi D: hero denim (total stok + donut status), 4 chip aksi gudang, filter chip status, cari + urut, daftar flat padat; PillTabs seksi dihapus, Mutasi/Barcode/Riwayat Transfer pindah ke menu ⋮ di hero.

**Architecture:** Semua perubahan di `mobile/lib/src/inventory_page.dart` (file sudah memuat semua seksi — ikuti pola itu), plus satu widget baru `stock_status_donut.dart` (donut CustomPaint) dan `fmtNum` di `format.dart`. Navigasi antarseksi memakai pola yang sudah ada: push `Scaffold`+`AppBar` (transfer/opname/mutasi/barcode) atau push `InventoryPage(initialSection:)` penuh (incoming/outgoing). `InventoryPage` tetap dihosting dua cara: IndexedStack gudang (AppBar bersama PosPage, denim `kTaskDark`) dan push dari drawer (`_scaffold` more_page) — hero memulai gradien dari warna AppBar supaya menyatu di keduanya.

**Tech Stack:** Flutter (mobile/), flutter_test, tanpa dependency baru.

**Spec:** `docs/superpowers/specs/2026-11-22-stok-produk-redesign-design.md`

## Global Constraints

- Foto produk SELALU 1:1 (`UiProductPhoto`, persegi).
- Teks UI minimum `TaskTypography.micro` (11px); hanya token `TaskTypography`, tidak ada fontSize literal.
- Status stok satu sistem: `inventoryStockLevel` + `inventoryStockInk`/`kTaskStock*` (varian gelap sudah ada). Aksen denim; Masuk hijau `0xff2E7E4F`, Keluar oranye `0xffC2410C` (sama dengan `_InOutForm`).
- Tanpa `BackdropFilter` per kartu (hero & list = permukaan solid/`GlassCard(frosted:false)`).
- Radius 12; chip aksi & tombol 48px; ikon 16–20.
- `canManageStockMutations(role)` (owner/gudang) menggerbangi chip Masuk/Keluar & item ⋮ Mutasi; Riwayat Transfer untuk role ≠ kasir.
- Routing lama wajib tetap jalan: drawer Stok Masuk/Keluar/Transfer/Opname/Mutasi/Barcode (`more_page.dart`), tab gudang IndexedStack 0/1/2 (stok, mutasi), `initialSection` semua nilai.
- Setelah tiap task: `cd mobile && flutter analyze --no-pub` dan test terkait hijau; commit.
- Task terakhir wajib: bump `versionCode` (0.2.0+13107 → 0.2.0+13108), build APK release di `/private/tmp/mbuild2` (bukan OneDrive), salin hasil ke `mobile/build/app/outputs/flutter-apk/app-release.apk`. **Tidak build IPA** (permintaan user; catatan aktif mobile.md).
- Test command: `cd mobile && flutter test test/<file>` (DB env tidak perlu untuk test mobile).

## Review Focus

1. **Tab gudang 2 (mutasi) tetap hidup tanpa PillTabs** — `InventoryPage(initialSection:'mutasi', role:'gudang')` harus merender daftar mutasi. → test eksplisit di Task 3.
2. **Kasir kehilangan pintu terlarang** — role `kasir`: chip Masuk/Keluar tidak ada, ⋮ tanpa Mutasi & Riwayat Transfer, Transfer/Opname tetap ada (paritas tab lama). → test Task 3.
3. **Filter chip konsisten dengan data** — jumlah di chip `Menipis · N` == baris yang tampil saat difilter. → test Task 2 (`stock_home_test.dart`).
4. **Stok refresh setelah aksi** — pop dari form Masuk/Opname harus memanggil ulang `stock-total` (stok berubah). → test Task 2 (hitung panggilan API fake).
5. **Summary kosong (0 produk)** — donut ring abu-abu, tidak crash, daftar tampil empty state. → pump dengan summary kosong di Task 2 test.

---

### Task 1: `fmtNum` + widget `StockStatusDonut`

**Files:**
- Modify: `mobile/lib/src/format.dart` (tambah `fmtNum`)
- Create: `mobile/lib/src/stock_status_donut.dart`
- Test: `mobile/test/format_wib_test.dart`, `mobile/test/stock_status_donut_test.dart`

**Interfaces:**
- Produces: `String fmtNum(num value)` — pemisah ribuan titik, tanpa desimal (`fmtNum(1248) == '1.248'`, `fmtNum(0) == '0'`).
- Produces: `StockStatusDonut({required int good, required int low, required int empty, double size = 84, double stroke = 9})` — widget publik + `static List<double> StockStatusDonut.fractions({required int good, required int low, required int empty})` (murni, total 1 saat ada data, semua 0 saat kosong).

- [ ] **Step 1: Test gagal — fmtNum & fractions**

Di `format_wib_test.dart` tambah: `expect(fmtNum(1248), '1.248'); expect(fmtNum(0), '0'); expect(fmtNum(999), '999');`
File baru `stock_status_donut_test.dart`: fractions `[122,4,2]` → panjang 3, jumlah ≈ 1; `[0,0,0]` → semua 0; pump `StockStatusDonut(good:122, low:4, empty:2)` → `find.byType(CustomPaint)` ada, `Semantics` label memuat `'122 aman'` & `'4 menipis'` & `'2 habis'`, `tester.takeException()` null; pump `[0,0,0]` tanpa exception.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd mobile && flutter test test/format_wib_test.dart test/stock_status_donut_test.dart`
Expected: FAIL — `fmtNum` tidak ada, import `stock_status_donut.dart` error.

- [ ] **Step 3: Implementasi**

`fmtNum`: pola sama dengan `fmtRp` (regex/list ribuan) tanpa prefix. `StockStatusDonut`: `CustomPaint` dengan `_DonutPainter` — ring latar `Colors.white.withValues(alpha:.16)`, tiga arc mulai -90°: good `0xff6EE7B7`, low `0xffFBBF24`, empty `0xffF87171`, `strokeCap: round`… gunakan `StrokeCap` sesuai Flutter versi (lihat pemakaian `withValues` di file lain). Warna segmen sama untuk light/dark (di atas denim). Semantics label: `'Status stok: $good aman, $low menipis, $empty habis'`.

- [ ] **Step 4: Test hijau**

Run: `cd mobile && flutter test test/format_wib_test.dart test/stock_status_donut_test.dart && flutter analyze --no-pub`

- [ ] **Step 5: Commit**

`git add mobile/lib/src/format.dart mobile/lib/src/stock_status_donut.dart mobile/test/format_wib_test.dart mobile/test/stock_status_donut_test.dart && git commit -m "feat(mobile): fmtNum + StockStatusDonut untuk redesign stok produk"`

---

### Task 2: `_StockSection` redesign (hero + chip aksi + filter + daftar flat)

PillTabs seksi **masih tetap** di task ini (dihapus di Task 3) supaya navigasi lama tidak putus di tengah jalan.

**Files:**
- Modify: `mobile/lib/src/inventory_page.dart` (kelas `_StockSection`/`_StockSectionState` + widget pendukung)
- Test: `mobile/test/stock_home_test.dart` (baru), `mobile/test/inventory_visual_test.dart` (update test 'stock cards, grid, search and warehouse controls')

**Interfaces:**
- Consumes: `StockStatusDonut`, `fmtNum` (Task 1).
- Produces: `_StockSection` mendapat field `final String? role;` (dipass `widget.role` dari `InventoryPage.build`); filter internal `enum _StockFilter { semua, menipis, habis }`; hero sub-line punya tooltip `'Pilih gudang'`.

**Struktur build `_StockSectionState` (mengganti toolbar + stat cells + grid):**
`Column` → `_StockSummaryHero` → baris 4 `_StockActionChip` → baris 3 `_FilterChip` → baris `_searchField` (tanpa chip gudang/akordeon) + `_SortMenuButton` → `Expanded` (loading/error/empty/list).

- [ ] **Step 1: Test gagal — `stock_home_test.dart`**

Fake API (tiru `InventoryApi` di `inventory_submission_test.dart`): `get('/inventory/stock-total')` → 4 produk (1 aman stok 24/min 10, 1 menipis 8/min 10, 1 habis 0/min 5, 1 aman 45/min 15) + `summary {total_products: 4, total_stock: 77, low_stock: 1, out_of_stock: 1}`; `get('/inventory/warehouses')` → 2 gudang; `branches()`. Counter panggilan `stock-total`.
Test: (a) hero tampil — `find.text('TOTAL STOK')`, `find.text('77')`, `find.text('4')`, `find.byType(StockStatusDonut)`; (b) chip `Transfer`/`Opname`/`Masuk`/`Keluar` tampil & `Masuk` dibuka → `find.text('Simpan stok masuk')`, pop, `stock-total` terpanggil ≥ 2 (refresh); (c) tap `find.textContaining('Menipis')` → baris tersisa 1 (`find.text('Kulot Denim Premium')` ada, `find.text('Denim Highwaist Bells')` findsNothing) & chip label `'Menipis · 1'`; (d) tap `find.byTooltip('Pilih gudang')` → sheet memuat `'Gudang B'`, pilih → `stock-total` terpanggil lagi; (e) baris `find.text('Denim Highwaist Bells')` tampil dengan angka `24` dan label `AMAN`; (f) summary kosong (fake kedua) → tanpa exception + `AppEmptyState`/teks 'Belum ada produk'.

- [ ] **Step 2: Jalankan — pastikan gagal**

Run: `cd mobile && flutter test test/stock_home_test.dart` → FAIL (hero/TOTAL STOK tidak ada).

- [ ] **Step 3: Implementasi `_StockSection`**

- `_StockSummaryHero` (private, stateless): `Container` gradien `LinearGradient(alignment 0xA0/0.9, kTaskDark → 0xff2E5D8F; dark: 0xff1B3556 → 0xff2E5D8F)`, radius 12, padding 14; isi: baris atas `[Expanded Column('TOTAL STOK' micro w800 putih70 ls .12; fmtNum(total_stock) displayCompact w800 putih + ' pcs' micro; sub-line InkWell tooltip 'Pilih gudang': '${fmtNum(total_products)} produk · $_selectedWarehouseName' + chevron), Stack(donut + teks tengah)]`; kebab `PopupMenuButton` putih `Positioned` kanan-atas (item: `Mutasi` jika `canManageStockMutations(role)`, `Cetak Barcode`, `Riwayat Transfer` jika role ≠ 'kasir'); baris legenda 3 titik (warna segmen donut) + label micro putih80. Nilai dari `_summary` (`total_stock`,`total_products`,`low_stock`,`out_of_stock`, default 0).
- Handler ⋮: `Mutasi` → push `Scaffold(pageBg, AppBar('Mutasi Stok'), body: _MutasiSection(api, branchId: _activeBranchId))`; `Cetak Barcode` → push sama dengan `_BarcodeSection(api)`; `Riwayat Transfer` → push `TransferHistoryPage(api: widget.api, role: widget.role)`; semua `then((_) => _load())`.
- `_StockActionChip` (private): 48px, radius 12, permukaan `taskSurface` + border, `Column` ikon 16 + label micro w800; Masuk `Icons.move_to_inbox_outlined` hijau `0xff2E7E4F`, Keluar `Icons.outbox_outlined` `0xffC2410C`, Transfer `Icons.swap_horiz` `kTaskDark`, Opname `Icons.fact_check_outlined` `kTaskDark` (ikon & label ikut warna chip). Masuk/Keluar hanya bila `canManageStockMutations(widget.role)`. Handler: Masuk/Keluar → `Navigator.push(InventoryPage(api, branchId: _activeBranchId, role, initialSection: 'incoming'/'outgoing'))` lalu `_load()`; Transfer/Opname → push `Scaffold(pageBg, AppBar('Transfer stok'/'Opname'), body: _TransferSection/_OpnameSection)` lalu `_load()` (salin dari `_selectSection` yang lama).
- `_FilterChip` (private): pill 999, aktif `kTaskDark` teks putih, nonaktif `taskSurface`+border+ink; label `'Semua · N'`/`'Menipis · N'`/`'Habis · N'` (N dari summary; font secondary w700). onTap → `setState(_filter)`.
- Daftar: `GlassCard(radius: 12, padding: EdgeInsets.zero)` berisi `ListView` (atau `Column` dalam `SingleChildScrollView`) baris: `InkWell` → `_openProductEditor(r)`; `[ClipRRect(9) UiProductPhoto 42×1:1] + 10 + [Expanded: nama label w700 ellipsis 1 baris; meta micro muted '${sku} · ${branch_name}'] + [Column end: angka cardTitle w800 + tabular figures; label micro w800 AMAN/MENIPIS/HABIS warna inventoryStockInk]`; `Divider(height:1, indent:64)` antarbaris. Baris = `_sorted` difilter `_filter` (menipis: `0 < stock <= min`; habis: `stock <= 0`).
- `_pickWarehouse()`: bottom sheet `SafeArea`+`ListView` gaya `_pickBranch` — judul 'Pilih Gudang', `ListTile(warehouse, onTap pop(id))`, `'Semua gudang'` bila `widget.canViewAllWarehouses` (pop `''`); hasil → `setState(_warehouseId)` + `_load()`. Hero sub-line onTap → owner: `_pickBranch()`; selainnya bila `_warehouses.isNotEmpty`: `_pickWarehouse()`.
- Hapus dari state: `_grid`, `_searchOpen`, `_openSearch`, `_closeSearch`, `_searchFocus`, `_stockToolbar`, cabang grid di build; hapus kelas mati: `_StatCell`, `_StockEditBadge`, `_ViewModeButton`/`_ViewToggle`, `_WarehouseMenuButton`, `_BranchIconButton` (cek pemakaian dulu dengan grep; hanya hapus yang tak terpakai lagi).
- Update `inventory_visual_test.dart` test 'stock cards, grid, search and warehouse controls': hapus asersi grid toggle (`byIcon(Icons.grid_view_outlined)`), ganti: hero `find.text('TOTAL STOK')`, tap `byTooltip('Pilih gudang')` → `find.text('Gudang B')`, pilih, `find.text('Denim')` masih tampil, `expectSolidCards`, `takeException` null. (Nama test boleh direname jadi 'stock hero, filter, search and warehouse controls $variant'.)

- [ ] **Step 4: Test hijau**

Run: `cd mobile && flutter test test/stock_home_test.dart test/inventory_visual_test.dart && flutter analyze --no-pub`

- [ ] **Step 5: Commit**

`git add mobile/lib/src/inventory_page.dart mobile/test/stock_home_test.dart mobile/test/inventory_visual_test.dart && git commit -m "feat(mobile): redesign seksi Stok Produk — hero ringkasan, chip aksi, filter, daftar flat"`

---

### Task 3: Hapus PillTabs seksi — navigasi via `initialSection` saja

**Files:**
- Modify: `mobile/lib/src/inventory_page.dart` (hapus `_inventorySections`, `_inventorySectionsForRole`, `_selectSection`, `_InventorySectionSelector`, state `_section`), `mobile/lib/src/pos_page.dart` TIDAK diubah, `mobile/lib/src/more_page.dart` TIDAK diubah.
- Test: `mobile/test/inventory_submission_test.dart`, `mobile/test/stock_mutation_visibility_test.dart`, `mobile/test/stock_home_test.dart` (tambah kasus role)

**Interfaces:**
- Consumes: chip aksi + ⋮ dari Task 2 (sudah bisa membuka semua seksi).
- Produces: `InventoryPage.build` merender langsung `initialSection` (guard mutasi tetap: `mutasi` + `!canManageMutations` → `'stok'`). Tidak ada lagi API pindah seksi.

- [ ] **Step 1: Update test (gagal dulu karena selector masih ada tapi perilaku baru ditest)**

- `inventory_submission_test.dart`: helper `openSection(tester, api, section)` — `mutasi`/`barcode` → buka kebab (tap `find.byTooltip('Opsi lain')`… beri tooltip/semantics kebab `'Opsi inventori'` di Task 2 supaya test stabil) lalu tap item teks; `transfer`/`opname` → tap chip; `stok` → default. Rewrite test 'inventory section tabs open every stock operation' → 'stock page actions and tools open every stock operation': chip Transfer → `find.text('Dari lokasi')`; kebab berisi 'Mutasi' & 'Cetak Barcode'; chip Opname → `find.text('Tambah Produk')`.
- `stock_mutation_visibility_test.dart`: role `admin` → buka kebab, `expect(find.text('Mutasi'), findsNothing)` (setelah sheet terbuka); owner & gudang → kebab ada 'Mutasi', tap → halaman mutasi (`find.text` khas list mutasi / AppBar 'Mutasi Stok').
- `stock_home_test.dart`: role `kasir` → chip Masuk/Keluar `findsNothing`, Transfer/Opname ada; kebab tanpa 'Riwayat Transfer' & tanpa 'Mutasi'.
- Tambah: `testWidgets('mutasi initial section renders directly for gudang')` — pump `InventoryPage(initialSection: 'mutasi', role: 'gudang')` → konten mutasi tampil, tidak ada chip seksi.

- [ ] **Step 2: Jalankan → gagal**

Run: `cd mobile && flutter test test/inventory_submission_test.dart test/stock_mutation_visibility_test.dart test/stock_home_test.dart`

- [ ] **Step 3: Implementasi**

- `_StockSummaryHero` kebab: pastikan `tooltip: 'Opsi inventori'` (Semantics label sama) — ditambahkan di task ini bila belum.
- Hapus `_section`/`_selectSection`/selector; build jadi switch langsung di atas `widget.initialSection` (dengan guard mutasi) — `'incoming'`/`'outgoing'` → `_InOutForm`; `'mutasi'`/`'transfer'`/`'opname'`/`'barcode'` → seksi terkait (tanpa `SoftBlobs`, pola lama); `_` → `Stack(SoftBlobs, _StockSection(role: widget.role))`.
- Grep sisa pemakaian: `_inventorySections`, `PillTabs` di inventory — pastikan bersih.

- [ ] **Step 4: Test hijau + full suite**

Run: `cd mobile && flutter test && flutter analyze --no-pub`

- [ ] **Step 5: Commit**

`git add mobile/lib/src/inventory_page.dart mobile/test/inventory_submission_test.dart mobile/test/stock_mutation_visibility_test.dart mobile/test/stock_home_test.dart && git commit -m "refactor(mobile): hapus selector seksi inventori — navigasi via chip aksi & menu opsional"`

---

### Task 4: Docs, versionCode, build APK

**Files:**
- Modify: `mobile/pubspec.yaml` (version), `docs/agents/mobile.md` (catatan batch), `AGENTS.md` hanya bila ada baris yang jadi salah.
- Build: APK di `/private/tmp/mbuild2` → salin ke `mobile/build/app/outputs/flutter-apk/app-release.apk`.

- [ ] **Step 1: Bump version** — `pubspec.yaml`: `version: 0.2.0+13108`.

- [ ] **Step 2: Update `docs/agents/mobile.md`** — di bagian "Status aktif", tambah poin batch: Stok Produk Opsi D (hero total+donut `stock_status_donut.dart`, chip aksi Masuk/Keluar/Transfer/Opname, filter chip, daftar flat divider, ⋮ = Mutasi/Barcode/Riwayat Transfer, PillTabs seksi & toggle grid DIHAPUS, `fmtNum` di format.dart). Perbarui kalimat Batch 9 tentang "selector seksi = satu baris PillTabs" agar tidak menyesatkan.

- [ ] **Step 3: Verifikasi penuh**

Run: `cd mobile && flutter analyze --no-pub && flutter test`
Expected: analyze 0 issue, semua test PASS.

- [ ] **Step 4: Build APK (di luar OneDrive)**

```bash
rsync -a --delete --exclude build mobile/ /private/tmp/mbuild2/
cd /private/tmp/mbuild2 && ANDROID_HOME=/opt/homebrew/share/android-commandlinetools JAVA_HOME=/opt/homebrew/opt/openjdk@17 flutter build apk --release
mkdir -p "<repo>/mobile/build/app/outputs/flutter-apk" && cp /private/tmp/mbuild2/build/app/outputs/flutter-apk/app-release.apk "<repo>/mobile/build/app/outputs/flutter-apk/app-release.apk"
```
Expected: `app-release.apk` baru ada (cek `ls -la` + tanggal).

- [ ] **Step 5: Commit**

`git add mobile/pubspec.yaml docs/agents/mobile.md && git commit -m "chore(mobile): v0.2.0+13108 — APK redesign Stok Produk + docs"`
(APK di `build/` tidak di-commit; pastikan `.gitignore` sudah menutup `mobile/build`.)
