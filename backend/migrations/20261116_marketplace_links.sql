-- Tautan marketplace per cabang (opsional).
-- Pembeli diarahkan ke pencarian DI DALAM toko Shopee (shop-scoped) memakai nama
-- produk sebagai kata kunci, dan ke profil TikTok toko. Tidak ada URL listing
-- per produk, jadi setelan ini cukup berupa identitas toko.
-- Nilai awal diisi untuk cabang reseller (Anyo Blok B).
INSERT INTO store_settings (branch_id, `key`, `value`) VALUES
  (2, 'marketplace_shopee_shop_id', '5046365'),
  (2, 'marketplace_tiktok_shop_url', 'https://www.tiktok.com/@anyostore'),
  (2, 'marketplace_show_on_cards', 'true')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
