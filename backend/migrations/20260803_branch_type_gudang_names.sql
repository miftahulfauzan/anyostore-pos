-- Mark branches whose names clearly indicate a warehouse as type='gudang'.
-- The branch_type migration defaulted everything to 'toko', so warehouse branches
-- like "Gudang Riject" / "Gudang Utama" were not selectable for warehouse staff.
UPDATE branches
SET type = 'gudang'
WHERE is_active = TRUE
  AND (name LIKE '%gudang%' OR name LIKE '%riject%' OR name LIKE '%reject%' OR name LIKE '%Gudang%' OR name LIKE '%Riject%' OR name LIKE '%Reject%');
