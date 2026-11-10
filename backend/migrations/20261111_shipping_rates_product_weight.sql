-- Berat produk (gram) dipakai untuk menghitung ongkir di landing page.
ALTER TABLE products ADD COLUMN weight_gram INT NOT NULL DEFAULT 0;

-- Tarif ongkir manual per cabang (dipakai landing; mis. Blok B).
-- cost = tarif flat per pengiriman; cost_per_kg > 0 membuat tarif dihitung
-- dari berat total (dibulatkan ke atas per kg).
CREATE TABLE IF NOT EXISTS shipping_rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  branch_id INT NOT NULL,
  area VARCHAR(120) NOT NULL,
  cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_per_kg DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_shipping_area (branch_id, area),
  KEY idx_shipping_branch (branch_id, is_active)
);
