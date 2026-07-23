-- Customer default price tier (hybrid: default dari pelanggan, tapi Reguler tetap auto-deteksi qty)
ALTER TABLE customers
  ADD COLUMN price_tier ENUM('reguler','semi_grosir','grosir_seri') NOT NULL DEFAULT 'reguler' AFTER membership_tier;
