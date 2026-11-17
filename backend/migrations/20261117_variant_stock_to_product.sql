-- ============================================================
-- Varian = pembeda gambar; stok hanya di PRODUK.
--
-- Sebelumnya warehouse_stocks menyimpan saldo per (gudang, produk, varian) dan
-- product_variants.stock ikut diubah. Mulai versi ini saldo selalu ditulis pada
-- baris variant_id = NULL; kolom product_variants.stock dibiarkan (deprecated)
-- dan diisi 0.
--
-- Migrasi ini:
--   1. memastikan setiap pasangan (gudang, produk) yang punya baris varian
--      memiliki baris produk (variant_id NULL);
--   2. memindahkan posisi rak dari baris varian bila baris produk belum punya;
--   3. menjumlahkan qty varian ke baris produk;
--   4. menghapus baris stok per varian;
--   5. menolkan product_variants.stock;
--   6. menyamakan products.stock dengan total gudang.
--
-- Aman dijalankan ulang: bila tidak ada baris varian, semua langkah no-op.
-- Script manual untuk audit/eksekusi lokal:
--   node scripts/consolidate-variant-stock.js [--apply]
-- ============================================================

INSERT IGNORE INTO warehouse_stocks (warehouse_id, product_id, variant_id, quantity, reserved_quantity, revision)
SELECT DISTINCT warehouse_id, product_id, NULL, 0, 0, 0
FROM warehouse_stocks
WHERE variant_id IS NOT NULL;

UPDATE warehouse_stocks target
JOIN (
  SELECT warehouse_id, product_id, MAX(rack_position) AS rack_position
  FROM warehouse_stocks
  WHERE variant_id IS NOT NULL AND rack_position IS NOT NULL AND rack_position <> ''
  GROUP BY warehouse_id, product_id
) source
  ON source.warehouse_id = target.warehouse_id
 AND source.product_id = target.product_id
SET target.rack_position = source.rack_position
WHERE target.variant_id IS NULL
  AND (target.rack_position IS NULL OR target.rack_position = '');

UPDATE warehouse_stocks target
JOIN (
  SELECT warehouse_id, product_id, SUM(quantity) AS quantity
  FROM warehouse_stocks
  WHERE variant_id IS NOT NULL
  GROUP BY warehouse_id, product_id
) source
  ON source.warehouse_id = target.warehouse_id
 AND source.product_id = target.product_id
SET target.quantity = target.quantity + source.quantity
WHERE target.variant_id IS NULL;

DELETE FROM warehouse_stocks WHERE variant_id IS NOT NULL;

UPDATE product_variants SET stock = 0 WHERE stock <> 0;

UPDATE products p
JOIN (
  SELECT product_id, SUM(quantity) AS total
  FROM warehouse_stocks
  GROUP BY product_id
) w ON w.product_id = p.id
SET p.stock = w.total
WHERE p.stock <> w.total;