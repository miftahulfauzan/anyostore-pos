import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Toko/gudang aktif owner yang dipakai bersama oleh layar operasional.
class BranchScope {
  static const _key = 'pos_owner_active_branch';
  static final ValueNotifier<int?> active = ValueNotifier(null);

  /// Jumlah pcs di keranjang POS yang belum disimpan. Dipakai pemilih toko
  /// untuk meminta konfirmasi sebelum pindah cabang. Null kalau POS tidak aktif.
  static int Function()? pendingCartCount;

  static int get pendingItems => pendingCartCount?.call() ?? 0;

  /// Ganti cabang aktif. Kalau keranjang POS masih berisi, minta konfirmasi
  /// dulu supaya perpindahan tidak terjadi karena salah tekan.
  /// Mengembalikan true kalau cabang benar-benar diganti.
  static Future<bool> request(BuildContext context, int? branchId) async {
    if (branchId == active.value) return false;
    final pending = pendingItems;
    if (pending > 0) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Pindah toko?'),
          content: Text(
              'Keranjang POS berisi $pending pcs. Draft akan disimpan dan keranjang dikosongkan.'),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Batal'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Simpan & pindah'),
            ),
          ],
        ),
      );
      if (proceed != true) return false;
    }
    await set(branchId);
    return true;
  }

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
