-- Komisi per pcs berdasarkan tipe pelanggan
ALTER TABLE commission_rules
  MODIFY calculation_type ENUM('percentage_sales','percentage_profit','per_transaction','flat_monthly','per_pcs_customer_tier') NOT NULL;

-- tiers per customer type for per_pcs_customer_tier
ALTER TABLE commission_rules
  ADD COLUMN commission_reguler_per_pcs DECIMAL(12,2) DEFAULT 0 AFTER flat_amount,
  ADD COLUMN commission_semi_grosir_per_pcs DECIMAL(12,2) DEFAULT 0 AFTER commission_reguler_per_pcs,
  ADD COLUMN commission_grosir_seri_per_pcs DECIMAL(12,2) DEFAULT 0 AFTER commission_semi_grosir_per_pcs;

-- untuk audit: simpan breakdown customer tier di records (JSON) jika perlu, tapi cukup hitung live
-- tambah kolom di commission_records untuk qty pcs per tier (opsional, biar report owner detail)
ALTER TABLE commission_records
  ADD COLUMN qty_reguler INT DEFAULT 0 AFTER total_transactions,
  ADD COLUMN qty_semi_grosir INT DEFAULT 0 AFTER qty_reguler,
  ADD COLUMN qty_grosir_seri INT DEFAULT 0 AFTER qty_semi_grosir;
