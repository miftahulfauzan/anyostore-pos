import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/format.dart';

void main() {
  test('timestamp UTC dikonversi ke WIB', () {
    expect(
        formatWibDateTime('2026-11-21T06:32:19.000Z'), '21 Nov 2026 · 13:32');
  });

  test('timestamp MySQL tanpa zona dipakai apa adanya', () {
    expect(formatWibDateTime('2026-11-21 13:32:00'), '21 Nov 2026 · 13:32');
  });

  test('tanggal polos tanpa jam', () {
    expect(formatWibDateTime('2026-11-21'), '21 Nov 2026');
    expect(formatWibDate('2026-11-21T06:32:19.000Z'), '21 Nov 2026');
  });

  test('nilai kosong atau bukan tanggal tetap aman', () {
    expect(formatWibDateTime(null), '-');
    expect(formatWibDateTime('bukan tanggal'), 'bukan tanggal');
  });

  test('fmtNum memisah ribuan dengan titik', () {
    expect(fmtNum(1248), '1.248');
    expect(fmtNum(0), '0');
    expect(fmtNum(999), '999');
    expect(fmtNum(1000000), '1.000.000');
  });
}
