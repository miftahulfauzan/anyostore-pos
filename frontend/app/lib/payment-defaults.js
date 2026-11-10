// Metode pembayaran default per toko:
// - toko BASIK  -> Transfer
// - toko Blok B / Toko B -> QRIS
// - toko lain   -> Tunai
export function defaultPaymentMethod(storeName, storeAddress = '') {
  const name = String(storeName || '').toUpperCase();
  const address = String(storeAddress || '').toUpperCase();
  if (name.includes('BASIK')) return 'transfer';
  if (name.includes('BLOK B') || name.includes('TOKO B') || address.includes('BLOK B')) return 'qris';
  return 'cash';
}
