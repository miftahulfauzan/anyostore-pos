/// Metode pembayaran default per toko:
/// - BASIK          -> Transfer
/// - Blok B / Toko B -> QRIS
/// - toko lain      -> Tunai
String defaultPaymentMethod(String? storeName, [String storeAddress = '']) {
  final name = (storeName ?? '').toUpperCase();
  final address = storeAddress.toUpperCase();
  if (name.contains('BASIK')) return 'transfer';
  if (name.contains('BLOK B') || name.contains('TOKO B') || address.contains('BLOK B')) {
    return 'qris';
  }
  return 'cash';
}
