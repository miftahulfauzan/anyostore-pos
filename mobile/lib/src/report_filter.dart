import 'package:flutter/material.dart';

/// Pilihan periode yang dipakai bersama oleh Dashboard dan Riwayat Mutasi.
/// Nilai sengaja disamakan agar filter tidak punya perilaku berbeda di tiap
/// halaman.
class MobileDateFilterOption {
  const MobileDateFilterOption(this.value, this.label);

  final String value;
  final String label;
}

const kMobileDateFilterOptions = <MobileDateFilterOption>[
  MobileDateFilterOption('today', 'Hari ini'),
  MobileDateFilterOption('yesterday', 'Kemarin'),
  MobileDateFilterOption('7d', '7 hari'),
  MobileDateFilterOption('30d', '30 hari'),
  MobileDateFilterOption('month', 'Bulan ini'),
  MobileDateFilterOption('lastmonth', 'Bulan lalu'),
  MobileDateFilterOption('custom', 'Rentang tanggal'),
];

String mobileDateFilterLabel(String value) {
  for (final option in kMobileDateFilterOptions) {
    if (option.value == value) return option.label;
  }
  return '7 hari';
}

DateTimeRange mobileDateFilterRange({
  required String preset,
  required DateTime now,
  DateTime? customStart,
  DateTime? customEnd,
}) {
  DateTime start;
  DateTime end = now;
  switch (preset) {
    case 'today':
      start = now;
      break;
    case 'yesterday':
      start = now.subtract(const Duration(days: 1));
      end = start;
      break;
    case '30d':
      start = now.subtract(const Duration(days: 29));
      break;
    case 'month':
      start = DateTime(now.year, now.month, 1);
      break;
    case 'lastmonth':
      final firstThisMonth = DateTime(now.year, now.month, 1);
      end = firstThisMonth.subtract(const Duration(days: 1));
      start = DateTime(end.year, end.month, 1);
      break;
    case 'custom':
      start = customStart ?? now.subtract(const Duration(days: 6));
      end = customEnd ?? now;
      break;
    default:
      start = now.subtract(const Duration(days: 6));
  }
  return DateTimeRange(start: _dateOnly(start), end: _dateOnly(end));
}

DateTime _dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);
