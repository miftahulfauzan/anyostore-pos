import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/report_filter.dart';

void main() {
  test('dashboard and mutation report share the same period options', () {
    expect(
      kMobileDateFilterOptions.map((option) => option.value),
      ['today', 'yesterday', '7d', '30d', 'month', 'lastmonth', 'custom'],
    );
    expect(mobileDateFilterLabel('yesterday'), 'Kemarin');
    expect(mobileDateFilterLabel('lastmonth'), 'Bulan lalu');
  });

  test('shared period ranges use inclusive local dates', () {
    final now = DateTime(2026, 9, 16, 10, 30);

    expect(
      mobileDateFilterRange(preset: 'yesterday', now: now),
      DateTimeRange(
        start: DateTime(2026, 9, 15),
        end: DateTime(2026, 9, 15),
      ),
    );
    expect(
      mobileDateFilterRange(preset: '7d', now: now),
      DateTimeRange(
        start: DateTime(2026, 9, 10),
        end: DateTime(2026, 9, 16),
      ),
    );
    expect(
      mobileDateFilterRange(preset: 'lastmonth', now: now),
      DateTimeRange(
        start: DateTime(2026, 8, 1),
        end: DateTime(2026, 8, 31),
      ),
    );
  });
}
