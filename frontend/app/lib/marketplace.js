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
    shopee: shopeeSearchUrl(settings?.marketplace_shopee_shop_id, marketplaceKeyword(productName)),
    tiktok: tiktokShopUrl(settings?.marketplace_tiktok_shop_url),
  };
}

/** Tombol di kartu produk hanya tampil bila diaktifkan untuk cabang ini. */
export function showMarketplaceOnCards(settings = {}) {
  return String(settings?.marketplace_show_on_cards ?? '').trim().toLowerCase() === 'true';
}