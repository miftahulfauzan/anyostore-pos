// Tautan marketplace untuk kartu produk & halaman detail.
//
// Tidak memakai URL listing per produk: pembeli diarahkan ke PENCARIAN di dalam
// toko Shopee, dan (untuk TikTok) ke profil toko. Kata kunci = nama produk.

/**
 * Kata kunci pencarian Shopee dari nama produk.
 *
 * Aturan (dipakai kartu & detail, satu sumber):
 * 1. ambil token pertama (sebelum spasi)
 * 2. ROK-03 / ROK-02 -> "ROK" (kategori, bukan nomor model)
 * 3. B-05 -> "B05" (tanda hubung antara huruf dan angka dihapus)
 * 4. AB83-Stripe / AT77-BLAZE -> "AB83" / "AT77" (akhiran kata dibuang)
 * 5. nama tanpa kode (mis. "CELANA KATUN") -> nama penuh
 */
export function marketplaceKeyword(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  const first = raw.split(/\s+/)[0];
  if (/^rok/i.test(first)) return 'ROK';
  const letterDigit = first.match(/^([A-Za-z]+)-(\d+)$/);
  if (letterDigit) return `${letterDigit[1]}${letterDigit[2]}`;
  const codeWithWord = first.match(/^([A-Za-z]+\d+)-[A-Za-z].*$/);
  if (codeWithWord) return codeWithWord[1];
  if (!/\d/.test(first)) return raw;
  return first;
}

/** Shopee: pencarian di dalam toko (shop-scoped). */
/**
 * Tautan pencarian Shopee untuk satu produk.
 *
 * Bentuk baku (dikonfirmasi pemilik toko dari pencarian nyata di Shopee):
 *   https://shopee.co.id/mall/search?keyword=<kode>&shop=<shopId>
 * Parameter /mall/search + shop membatasi hasil ke toko tersebut.
 *
 * Bentuk lain sudah dicoba dan TIDAK memfilter: /shop/<id>/search,
 * /search?shopid=, /search?shopId=&page_type=search_store.
 *
 * `template` (setelan marketplace_shopee_search_url) tetap menang bila diisi,
 * sehingga bentuk ini bisa diubah tanpa deploy seandainya Shopee berubah lagi.
 */
export function shopeeSearchUrl(shopId, keyword, template = '') {
  const q = String(keyword ?? '').trim();
  const raw = String(template ?? '').trim();
  if (raw.includes('{keyword}')) return raw.replace(/\{keyword\}/g, encodeURIComponent(q));
  if (raw && /^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    if (q) url.searchParams.set('keyword', q);
    return url.toString();
  }
  const id = String(shopId ?? '').replace(/[^0-9]/g, '');
  if (!id) return '';
  const params = new URLSearchParams();
  if (q) params.set('keyword', q);
  params.set('shop', id);
  return `https://shopee.co.id/mall/search?${params.toString()}`;
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
    shopee: shopeeSearchUrl(
      settings?.marketplace_shopee_shop_id,
      marketplaceKeyword(productName),
      settings?.marketplace_shopee_search_url,
    ),
    tiktok: tiktokShopUrl(settings?.marketplace_tiktok_shop_url),
  };
}

/** Tombol di kartu produk hanya tampil bila diaktifkan untuk cabang ini. */
export function showMarketplaceOnCards(settings = {}) {
  return String(settings?.marketplace_show_on_cards ?? '').trim().toLowerCase() === 'true';
}