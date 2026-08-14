import 'dart:convert';
import 'dart:math' as math;

import 'api_client.dart';
import 'offline_store.dart';

/// Unduh otomatis detail + varian SEMUA produk untuk cabang tertentu saat
/// app dibuka / koneksi pulih, supaya saat offline varian produk sudah
/// tersedia tanpa harus diklik satu per satu dulu.
class PrefetchService {
  static final Set<int> _running = {};

  static Future<void> prefetchProductVariants(ApiClient api,
      {required int branchId}) async {
    if (_running.contains(branchId)) return;
    _running.add(branchId);
    try {
      final products = await api.products(branchId: branchId);
      final futures = <Future<void>>[];
      for (final p in products) {
        final id = int.tryParse('${p['id']}');
        if (id == null) continue;
        futures.add(() async {
          try {
            final detail = await api.product(id, branchId: branchId);
            await OfflineStore.cacheSet(
                'product-$branchId-$id', jsonEncode(detail));
          } catch (_) {
            // Satu produk gagal: lewati, cache lama tetap dipakai.
          }
        }());
      }
      // Proses paralel 6 per batch supaya tidak membebani server.
      for (var i = 0; i < futures.length; i += 6) {
        await Future.wait(futures.sublist(i, math.min(i + 6, futures.length)));
      }
    } catch (_) {
      // Offline / server error: diam saja, tidak mengganggu aplikasi.
    } finally {
      _running.remove(branchId);
    }
  }
}
