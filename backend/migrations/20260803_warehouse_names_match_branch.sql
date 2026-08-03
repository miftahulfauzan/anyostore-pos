-- Rename warehouses to match their branch name so each location is unambiguous.
-- Rule: if branch already starts with "Gudang", use branch name as-is;
-- otherwise prefix with "Gudang ".
-- Examples: Anyostore Metro -> Gudang Anyostore Metro; Toko B -> Gudang Toko B;
--           Gudang Utama -> Gudang Utama; Gudang Riject -> Gudang Riject.
UPDATE warehouses w
JOIN branches b ON b.id = w.branch_id
SET w.name = IF(b.name LIKE 'Gudang%', b.name, CONCAT('Gudang ', b.name))
WHERE w.is_active = TRUE AND b.is_active = TRUE;
