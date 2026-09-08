-- Preserve the existing exception once; later renames must not change permission.
UPDATE branches SET warehouse_catalog_delete_enabled=TRUE
WHERE is_active=TRUE AND type='gudang'
  AND LOWER(TRIM(name)) IN ('gudang riject perbaikan', 'gudang rijk perbaikan');
