import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'opname_reminder.dart';

/// Notifikasi lokal: stok menipis + pengingat backup harian.
class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  static bool _ready = false;

  static const _lowStockId = 1001;
  static const _reminderId = 1002;

  static Future<void> init() async {
    if (_ready) return;
    try {
      tzdata.initializeTimeZones();
      try {
        tz.setLocalLocation(tz.getLocation('Asia/Jakarta'));
      } catch (_) {
        tz.setLocalLocation(tz.UTC);
      }
      const android = AndroidInitializationSettings('@mipmap/ic_launcher');
      const settings = InitializationSettings(android: android);
      await _plugin.initialize(settings);
      await _plugin
          .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin>()
          ?.requestNotificationsPermission();
      _ready = true;
    } catch (_) {
      // Notifikasi bukan fitur kritis; app tetap jalan.
    }
  }

  static Future<void> showLowStock(int count, List<String> names) async {
    if (!_ready || count == 0) return;
    final lines = names.take(3).map((n) => '• $n').join('\n');
    await _plugin.show(
      _lowStockId,
      count == 1 ? '1 produk stok menipis' : '$count produk stok menipis',
      lines,
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'low_stock',
          'Stok menipis',
          channelDescription: 'Produk di bawah stok minimum',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
    );
  }

  static Future<void> showBackupDone(String fileName) async {
    if (!_ready) return;
    await _plugin.show(
      1003,
      'Backup otomatis selesai',
      'File $fileName tersimpan. Jangan lupa salin ke Google Drive / email.',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'backup',
          'Backup data',
          channelDescription: 'Status backup otomatis',
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
        ),
      ),
    );
  }

  /// Pengingat harian jam 09:00 WIB: cek stok & backup.
  static Future<void> scheduleDailyReminder() async {
    if (!_ready) return;
    try {
      await _plugin.zonedSchedule(
        _reminderId,
        'Pengingat harian Anyostore',
        'Cek stok menipis & lakukan backup data',
        _next(9, 0),
        const NotificationDetails(
          android: AndroidNotificationDetails(
            'daily_reminder',
            'Pengingat harian',
            channelDescription: 'Cek stok & backup harian',
            importance: Importance.defaultImportance,
            priority: Priority.defaultPriority,
          ),
        ),
        androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
        matchDateTimeComponents: DateTimeComponents.time,
      );
    } catch (_) {}
  }

  static const _opnameBaseId = 2100;
  static const _opnameSlots = 31 * OpnameReminderSettings.maxTimesPerDay;

  /// Jadwalkan pengingat stock opname berulang tiap bulan. Selalu batalkan
  /// jadwal lama lebih dulu supaya tidak dobel saat pengaturan disimpan ulang.
  static Future<void> scheduleOpnameReminder(
      OpnameReminderSettings settings) async {
    if (!_ready) return;
    try {
      for (var i = 0; i < _opnameSlots; i++) {
        await _plugin.cancel(_opnameBaseId + i);
      }
      if (!settings.enabled) return;
      var id = _opnameBaseId;
      for (final item in settings.occurrences) {
        await _plugin.zonedSchedule(
          id++,
          'Waktunya Stock Opname',
          'Cek dan hitung stok fisik untuk tanggal ini.',
          _nextMonthly(item.day, item.hour, item.minute),
          const NotificationDetails(
            android: AndroidNotificationDetails(
              'opname_reminder',
              'Stock Opname',
              channelDescription: 'Pengingat jadwal stock opname',
              importance: Importance.high,
              priority: Priority.high,
            ),
          ),
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          matchDateTimeComponents: DateTimeComponents.dayOfMonthAndTime,
        );
      }
    } catch (_) {}
  }

  static tz.TZDateTime _nextMonthly(int day, int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    for (var offset = 0; offset < 14; offset++) {
      final candidate = tz.TZDateTime(
          tz.local, now.year, now.month + offset, day, hour, minute);
      if (candidate.day != day) continue;
      if (!candidate.isAfter(now)) continue;
      return candidate;
    }
    return tz.TZDateTime.now(tz.local).add(const Duration(days: 1));
  }

  static tz.TZDateTime _next(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var t = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!t.isAfter(now)) t = t.add(const Duration(days: 1));
    return t;
  }
}
