# POS Product Card Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padatkan kartu produk POS menjadi dua baris informasi dan kembalikan menu titik tiga keranjang ke tampilan tanpa box tanpa mengurangi keterbacaan atau area tap.

**Architecture:** Pertahankan `_ProductCard`, `_CartLine`, dan grid yang ada di `pos_page.dart`. Ubah hanya komposisi footer kartu, tinggi footer grid, dan dekorasi pembungkus `PopupMenuButton`; data produk serta callback harga/hapus tetap sama.

**Tech Stack:** Flutter/Dart, widget tests, Material `PopupMenuButton`, `GlassCard`.

**Spec:** `docs/superpowers/specs/2026-11-06-pos-product-card-density-design.md`

## Global Constraints

- Gunakan grid POS yang sudah ada dan jangan mengubah alur checkout.
- Kartu menampilkan tepat dua baris: nama; harga di kiri dan angka stok di kanan.
- Menu titik tiga tetap memiliki area tap minimal 44 px tanpa background atau border kotak.
- Verifikasi pada lebar 320 dan 390 px dalam tema terang dan gelap.

## Review Focus

- Nama panjang: tetap satu baris dengan ellipsis dan tidak mendorong harga/stok ke baris ketiga; test pada kartu katalog.
- Stok nol/negatif: tetap berupa angka dan tidak mengembalikan label “Stok”; test dengan data produk fixture.
- Text scale besar: footer dan grid tidak overflow; test existing large-text case.
- Popup menu: opsi tetap terbaca setelah box visual dihapus; test tooltip dan dua label menu.
- Tema terang/gelap: warna teks tetap terbaca; test existing brightness matrix.

### Task 1: Lock the compact product-card and cart-menu behavior

**Files:**
- Modify: `mobile/test/pos_visual_test.dart`

**Interfaces:**
- Consumes: Existing POS fixture and `showPosSurface` helper.
- Produces: Regression assertions for compact card content and unboxed cart action.

- [ ] **Step 1: Write the failing assertions**

  Update the product-card assertions to find the numeric stock text (`24`) instead of `Stok 24`, assert the old label is absent, and assert the stock is right-aligned with the price row. Add an assertion that the cart line action has no colored container decoration while its tooltip and popup labels remain available.

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `flutter test test/pos_visual_test.dart --no-pub`
  Expected: FAIL because the current card still renders `Stok 24` and the action still has a visible box.

### Task 2: Implement the compact product card

**Files:**
- Modify: `mobile/lib/src/pos_page.dart:1320-1520`

**Interfaces:**
- Consumes: Existing product map fields `name`, `price`, and `stock`.
- Produces: `_ProductCard` with a two-row footer and a grid extent sized to that footer.

- [ ] **Step 1: Replace the footer content**

  Keep the product photo square. Render the product name as a one-line ellipsized `Text`, then render one `Row` with the formatted price on the left and the numeric stock on the right. Remove the variant-count and “Stok” label from this card only.

- [ ] **Step 2: Reduce and scale the footer extent**

  Replace the previous three-content-line height assumptions with a compact height derived from the two rows and vertical padding, still multiplying by the active text scale so large-font layouts do not overflow.

- [ ] **Step 3: Run the focused test to verify it passes**

  Run: `flutter test test/pos_visual_test.dart --no-pub`
  Expected: PASS with no RenderFlex overflow and no unexpected test exceptions.

### Task 3: Restore the unboxed cart action appearance

**Files:**
- Modify: `mobile/lib/src/pos_page.dart:2280-2365`
- Test: `mobile/test/pos_visual_test.dart`

**Interfaces:**
- Consumes: Existing `_CartLine.onEditPrice`, `_CartLine.onRemove`, tooltip, and popup item styles.
- Produces: Transparent visual wrapper with a 44 px tap target and readable popup menu.

- [ ] **Step 1: Remove only the decorative container**

  Keep `PopupMenuButton<String>` and its explicit `color`, icon, tooltip, and menu item text/icon styles. Remove the visible fill and border while retaining a 44×44 hit area through sizing/padding that does not constrain popup menu width.

- [ ] **Step 2: Run the focused test to verify it passes**

  Run: `flutter test test/pos_visual_test.dart --no-pub`
  Expected: PASS; tooltip, “Ubah harga”, and “Hapus item” remain findable and no popup overflow occurs.

### Task 4: Final verification

**Files:**
- Verify: `mobile/lib/src/pos_page.dart`, `mobile/test/pos_visual_test.dart`

- [ ] **Step 1: Format and check the diff**

  Run: `dart format lib/src/pos_page.dart test/pos_visual_test.dart` and `git diff --check`.

- [ ] **Step 2: Run the focused visual suite**

  Run: `flutter test test/pos_visual_test.dart --no-pub`
  Expected: all tests pass for 320/390 px and light/dark themes.

- [ ] **Step 3: Run the full mobile test suite**

  Run: `flutter test --no-pub`
  Expected: no regressions outside POS visual coverage.
