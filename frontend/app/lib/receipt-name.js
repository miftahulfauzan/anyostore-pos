// Lebar kotak logo kepala nota (px) — CSS .receipt-logo memakai ukuran ini.
export const RECEIPT_LOGO_BOX = 120;

// Lebar rata-rata huruf monospace relatif terhadap font-size (IBM Plex Mono).
const MONO_CHAR_RATIO = 0.6;

/**
 * Font-size agar nama toko di bawah logo **selebar logo** (kotak 120 px).
 * Dipakai halaman resi dan penutupan supaya keduanya identik.
 */
export function storeNameFontSize(name) {
  const length = String(name ?? '').trim().length || 1;
  const size = RECEIPT_LOGO_BOX / (length * MONO_CHAR_RATIO);
  return Math.max(11, Math.min(22, Math.round(size * 10) / 10));
}