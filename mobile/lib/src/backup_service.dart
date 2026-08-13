import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'notification_service.dart';

/// Backup otomatis: unduh snapshot DB dari server, simpan file JSON lokal,
/// lalu bisa dibagikan (Google Drive / email / WA).
class BackupService {
  static const _lastKey = 'pos_last_backup_date';

  static Future<File?> runBackup(ApiClient api) async {
    final res = await api.backupNow();
    final data = (res['data'] as Map<String, dynamic>?) ?? res;
    final payload = data['download']?.toString();
    if (payload == null || payload.isEmpty) return null;
    final dir = await getApplicationDocumentsDirectory();
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .split('.')
        .first;
    final file = File('${dir.path}/anyostore-backup-$stamp.json');
    await file.writeAsString(payload);
    await _markDone();
    return file;
  }

  static Future<bool> shouldAutoBackup() async {
    final prefs = await SharedPreferences.getInstance();
    if (!(prefs.getBool('pos_auto_backup') ?? false)) return false;
    final last = prefs.getString(_lastKey);
    if (last == null) return true;
    final d = DateTime.tryParse(last);
    if (d == null) return true;
    return DateTime.now().difference(d).inHours >= 24;
  }

  static Future<void> _markDone() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastKey, DateTime.now().toIso8601String());
  }

  static Future<bool> lowStockNotifyEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool('pos_notify_low_stock') ?? true;
  }

  static Future<Map<String, dynamic>> lowStockOverview(ApiClient api) async {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    return api.reportOverview(start: d(now), end: d(now));
  }

  static Future<void> checkLowStock(ApiClient api) async {
    if (!await lowStockNotifyEnabled()) return;
    try {
      final data = await lowStockOverview(api);
      final items = (data['low_stock'] as List?) ?? [];
      final low = items
          .map((e) => Map<String, dynamic>.from(e as Map))
          .where((e) => (int.tryParse('${e['stock'] ?? 0}') ?? 0) <=
              (int.tryParse('${e['min_stock'] ?? 0}') ?? 0))
          .toList();
      if (low.isEmpty) return;
      await NotificationService.showLowStock(
        low.length,
        low.map((e) => e['name']?.toString() ?? 'Produk').toList(),
      );
    } catch (_) {
      // Gagal cek (mis. offline) — dilewati.
    }
  }
}
