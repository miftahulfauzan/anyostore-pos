import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Toko/gudang aktif yang dipilih owner di halaman Lainnya.
/// Semua halaman di bawah Lainnya otomatis memakai cabang ini.
class BranchScope {
  static const _key = 'pos_owner_active_branch';
  static final ValueNotifier<int?> active = ValueNotifier(null);

  static Future<void> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      active.value = prefs.getInt(_key);
    } catch (_) {}
  }

  static Future<void> set(int? branchId) async {
    active.value = branchId;
    try {
      final prefs = await SharedPreferences.getInstance();
      if (branchId == null) {
        await prefs.remove(_key);
      } else {
        await prefs.setInt(_key, branchId);
      }
    } catch (_) {}
  }
}
