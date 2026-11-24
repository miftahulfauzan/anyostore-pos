-- Hapus fitur loyalitas poin (belum dipakai: tidak ada jalur earn/redeem di
-- kode, hanya setelan dan kolom yang tidak pernah diisi).
--
-- Aman dijalankan pada DB lama (kolom/tabel ada) maupun DB baru yang dimigrasi
-- ulang: semua langkah dijaga kondisi, mengikuti pola migrasi kondisional lain.

-- 1. Setelan cabang yang sudah tidak dipakai.
DELETE FROM store_settings
WHERE `key` IN ('loyalty_enabled', 'loyalty_points_rate', 'loyalty_points_value');

-- 2. Kolom poin di tabel pelanggan.
SET @dbname = DATABASE();
SET @tableName = 'customers';
SET @columnName = 'loyalty_points';
SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'ALTER TABLE customers DROP COLUMN loyalty_points',
  'SELECT 1'
));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Tabel riwayat poin (tidak punya penulis; isinya kosong).
DROP TABLE IF EXISTS loyalty_points;