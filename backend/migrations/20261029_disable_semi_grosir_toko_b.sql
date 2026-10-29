UPDATE branches
SET semi_grosir_enabled = FALSE
WHERE LOWER(TRIM(name)) = 'toko b'
  AND type = 'toko';
