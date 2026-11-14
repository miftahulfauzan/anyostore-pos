// Tautan marketplace untuk kartu produk & halaman detail.
//
// Tidak memakai URL listing per produk: pembeli diarahkan ke PENCARIAN di dalam
// toko Shopee, dan (untuk TikTok) ke profil toko. Kata kunci = nama produk.

/** Shopee: pencarian di dalam toko (shop-scoped). */
export function shopeeSearchUrl(shopId, keyword) {
  const id = String(shopId ?? '').replace(/[^0-9]/g, '');
  if (!id) return '';
  const q = String(keyword ?? '').trim();
  return `https://shopee.co.id/shop/${id}/search${q ? `?keyword=${encodeURIComponent(q)}` : ''}`;
}

/** TikTok: profil toko (menerima URL penuh atau username dengan/tanpa @). */
export function tiktokShopUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const handle = raw.replace(/^@+/, '');
  if (!handle) return '';
  return `https://www.tiktok.com/@${handle}`;
}

/**
 * Dua tautan siap pakai untuk satu produk.
 * Kosong berarti tombolnya tidak ditampilkan (setelan belum diisi).
 */
export function marketplaceLinks(settings = {}, productName = '') {
  return {
    shopee: shopeeSearchUrl(settings?.marketplace_shopee_shop_id, productName),
    tiktok: tiktokShopUrl(settings?.marketplace_tiktok_shop_url),
  };
}

/** Tombol di kartu produk hanya tampil bila diaktifkan untuk cabang ini. */
export function showMarketplaceOnCards(settings = {}) {
  return String(settings?.marketplace_show_on_cards ?? '').trim().toLowerCase() === 'true';
}