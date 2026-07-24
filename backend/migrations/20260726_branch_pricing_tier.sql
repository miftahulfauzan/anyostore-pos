ALTER TABLE branches ADD COLUMN pricing_tier_enabled BOOLEAN DEFAULT TRUE;

-- Anyostore Metro menggunakan 1 harga (tanpa tier grosir/semi).
-- Toko B tetap menggunakan tier grosir/semi.
UPDATE branches SET pricing_tier_enabled = FALSE WHERE LOWER(name) LIKE '%metro%';
