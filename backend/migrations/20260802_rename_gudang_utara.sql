-- Rename legacy warehouse name "Gudang Utara" to "Gudang Utama".
-- The old import script (scripts/import-screenshot-products.sql) created
-- warehouses named 'Gudang Utara'. This fixes the display name across branches.
UPDATE warehouses
SET name = 'Gudang Utama'
WHERE name LIKE 'Gudang Utara%';
