-- Diskon per pcs: potongan nominal dikali jumlah barang (mis. Rp1.000/pcs).
ALTER TABLE promotions
  MODIFY COLUMN discount_type ENUM('percentage', 'nominal', 'per_pcs') NOT NULL DEFAULT 'percentage';
