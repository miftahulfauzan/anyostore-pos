-- Default komisi global: per pcs per tier (Reguler 3000, Semi Grosir 3000, Grosir Seri 1000).
-- Hanya dibuat sekali kalau belum ada aturan global aktif sejenis.
INSERT INTO commission_rules
  (name, description, branch_id, applies_to, role, calculation_type,
   commission_reguler_per_pcs, commission_semi_grosir_per_pcs, commission_grosir_seri_per_pcs,
   is_active, start_date)
SELECT
  'Komisi per pcs (default)', 'Reguler 3000, Semi Grosir 3000, Grosir Seri 1000 per pcs',
  NULL, 'all', NULL, 'per_pcs_customer_tier', 3000, 3000, 1000, 1, CURDATE()
WHERE NOT EXISTS (
  SELECT 1 FROM commission_rules
  WHERE branch_id IS NULL AND calculation_type = 'per_pcs_customer_tier' AND is_active = 1
);
