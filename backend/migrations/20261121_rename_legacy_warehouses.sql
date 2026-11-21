-- Samakan nama gudang lama dengan nama yang dipakai saat ini.
-- Idempoten: aman dijalankan pada database yang sudah pernah dirapikan manual.
--   Anyostore Metro   -> BASIK (gudang utama cabang BASIK PGMTA)
--   Gudang Rijk ...   -> Gudang Rijek Perbaikan (cabang Gudang Riject Perbaikan)
UPDATE warehouses SET name = 'BASIK'
WHERE TRIM(name) = 'Anyostore Metro';

UPDATE warehouses SET name = 'Gudang Rijek Perbaikan'
WHERE TRIM(name) = 'Gudang Rijk Perbaikan';

UPDATE warehouses SET name = 'Gudang Rijek Perbaikan'
WHERE TRIM(name) = 'Rijk Perbaikan';
