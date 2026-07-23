-- Price tiers: Semi Grosir & Grosir Seri + manual price override audit
ALTER TABLE transactions
  ADD COLUMN price_tier ENUM('retail','semi_grosir','grosir_seri') NOT NULL DEFAULT 'retail' AFTER status;

ALTER TABLE transaction_items
  ADD COLUMN original_price DECIMAL(12,2) NULL AFTER price,
  ADD COLUMN price_override TINYINT(1) NOT NULL DEFAULT 0 AFTER original_price,
  ADD COLUMN overridden_by INT NULL AFTER price_override,
  ADD CONSTRAINT fk_items_overridden_by FOREIGN KEY (overridden_by) REFERENCES users(id);
