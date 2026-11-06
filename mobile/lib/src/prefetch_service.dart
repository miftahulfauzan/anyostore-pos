import 'dart:convert';
import 'dart:math' as math;

import 'api_client.dart';
import 'offline_store.dart';

/// Unduh detail produk bervarian agar pemilihan varian tetap tersedia offline.
class PrefetchService {
  static final Set<int> _running = {};

  static Future<void> prefetchProductVariants(ApiClient api,
      {required int branchId}) async {
    if (_running.contains(branchId)) return;
    _running.add(branchId);
    try {
      final products = await api.products(branchId: branchId);
      final productsWithVariants = products.where((product) {
        return (int.tryParse('${product['variant_count'] ?? 0}') ?? 0) > 0;
      }).toList();
      for (var i = 0; i < productsWithVariants.length; i += 3) {
        final batch = productsWithVariants.sublist(
            i, math.min(i + 3, productsWithVariants.length));
        await Future.wait(batch.map((p) async {
          final id = int.tryParse('${p['id']}');
          if (id == null) return;
          try {
            final detail = await api.product(id, branchId: branchId);
            await OfflineStore.cacheSet(
                'product-$branchId-$id', jsonEncode(detail));
          } catch (_) {
            // Satu produk gagal: lewati, cache lama tetap dipakai.
          }
        }));
      }
    } catch (_) {
      // Offline / server error: diam saja, tidak mengganggu aplikasi.
    } finally {
      _running.remove(branchId);
    }
  }
}
