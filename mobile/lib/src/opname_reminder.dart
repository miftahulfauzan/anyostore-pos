import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pengaturan pengingat Stock Opname yang berulang setiap bulan.
///
/// Tanggal disimpan sebagai hari dalam bulan (1–31). Notifikasi dijadwalkan
/// lokal oleh [NotificationService] untuk setiap kombinasi tanggal × jam.
class OpnameReminderSettings {
  const OpnameReminderSettings({
    this.enabled = false,
    this.days = const {1},
    this.times = const [TimeOfDay(hour: 9, minute: 0)],
  });

  static const _key = 'pos_opname_reminder';
  static const maxTimesPerDay = 4;

  /// Hari dalam bulan (1–31) saat pengingat muncul.
  final Set<int> days;

  /// Jam pengingat; panjang list = berapa kali sehari (1–4).
  final List<TimeOfDay> times;
  final bool enabled;

  static const defaults = OpnameReminderSettings();

  /// Kombinasi unik tanggal + jam yang akan dijadwalkan.
  List<({int day, int hour, int minute})> get occurrences {
    final seen = <String>{};
    final result = <({int day, int hour, int minute})>[];
    final sortedDays = days.toList()..sort();
    for (final day in sortedDays) {
      if (day < 1 || day > 31) continue;
      for (final time in times.take(maxTimesPerDay)) {
        final key = '$day-${time.hour}-${time.minute}';
        if (!seen.add(key)) continue;
        result.add((day: day, hour: time.hour, minute: time.minute));
      }
    }
    return result;
  }

  String get summary {
    if (days.isEmpty) return 'Pilih minimal satu tanggal.';
    final sortedDays = days.toList()..sort();
    final dayText = sortedDays.join(' & ');
    final timeText =
        times.take(maxTimesPerDay).map((time) => formatTime(time)).join(', ');
    return 'Setiap tanggal $dayText · ${times.length}× sehari · $timeText';
  }

  static String formatTime(TimeOfDay time) =>
      '${time.hour.toString().padLeft(2, '0')}:'
      '${time.minute.toString().padLeft(2, '0')}';

  OpnameReminderSettings copyWith({
    bool? enabled,
    Set<int>? days,
    List<TimeOfDay>? times,
  }) =>
      OpnameReminderSettings(
        enabled: enabled ?? this.enabled,
        days: days ?? this.days,
        times: times ?? this.times,
      );

  Map<String, dynamic> toJson() => {
        'enabled': enabled,
        'days': (days.toList()..sort()),
        'times': [for (final time in times) formatTime(time)],
      };

  factory OpnameReminderSettings.fromJson(Map<String, dynamic> json) {
    final rawDays = (json['days'] as List?) ?? const [1];
    final days = <int>{
      for (final value in rawDays)
        if (int.tryParse('$value') != null) int.parse('$value').clamp(1, 31)
    };
    final rawTimes = (json['times'] as List?) ?? const ['09:00'];
    final times = <TimeOfDay>[];
    for (final value in rawTimes) {
      final parts = '$value'.split(':');
      if (parts.length < 2) continue;
      final hour = int.tryParse(parts[0]);
      final minute = int.tryParse(parts[1]);
      if (hour == null || minute == null) continue;
      if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
      times.add(TimeOfDay(hour: hour, minute: minute));
    }
    return OpnameReminderSettings(
      enabled: json['enabled'] == true,
      days: days.isEmpty ? const {1} : days,
      times: times.isEmpty
          ? const [TimeOfDay(hour: 9, minute: 0)]
          : times.take(maxTimesPerDay).toList(),
    );
  }

  static Future<OpnameReminderSettings> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return defaults;
      final decoded = jsonDecode(raw);
      if (decoded is! Map) return defaults;
      return OpnameReminderSettings.fromJson(
          Map<String, dynamic>.from(decoded));
    } catch (_) {
      return defaults;
    }
  }

  Future<void> save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(toJson()));
  }
}
