import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

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

  static tz.TZDateTime _next(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var t = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (!t.isAfter(now)) t = t.add(const Duration(days: 1));
    return t;
  }
}
