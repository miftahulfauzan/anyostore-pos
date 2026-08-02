-- Add channel to stock_mutations so warehouse outgoing sales (WA, Shopee,
-- TikTok, reseller) are recorded with their sales channel.
SET @dbname = DATABASE();
SET @tableName = 'stock_mutations';
SET @columnName = 'channel';
SET @addChannel = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @dbname AND COLUMN_NAME = @columnName) > 0,
  'SELECT 1',
  "ALTER TABLE stock_mutations ADD COLUMN channel VARCHAR(30) DEFAULT NULL COMMENT 'Saluran penjualan: wa, shopee, tiktok, reseller, toko' AFTER type"
));
PREPARE stmt FROM @addChannel;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
