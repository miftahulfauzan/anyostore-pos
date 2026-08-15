-- Barcode produk boleh SAMA di semua cabang (unik per cabang, bukan global).
-- UNIQUE constraint 'barcode' dihapus; index biasa idx_products_barcode tetap ada.
ALTER TABLE products DROP INDEX barcode;
