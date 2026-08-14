import 'package:flutter/foundation.dart';

/// Status offline global. Banner kuning muncul saat data dipakai dari cache.
class OfflineStatus {
  static final ValueNotifier<bool> offline = ValueNotifier(false);

  /// Naik 1 setiap kali koneksi internet kembali, supaya halaman yang sedang
  /// dibuka (riwayat/laporan/stok) otomatis muat ulang dari server.
  static final ValueNotifier<int> syncTick = ValueNotifier(0);

  /// Dipanggil saat koneksi pulih: matikan banner + beri tahu halaman untuk
  /// me-refresh data dari server.
  static void notifyOnline() {
    offline.value = false;
    syncTick.value++;
  }
}
