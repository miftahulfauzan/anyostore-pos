import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/format.dart';

void main() {
  test('fmtRp memformat angka dengan pemisah ribuan', () {
    expect(fmtRp(1234567), 'Rp1.234.567');
    expect(fmtRp(0), 'Rp0');
    expect(fmtRp(100), 'Rp100');
  });

  test('todayWib mengembalikan format YYYY-MM-DD', () {
    expect(RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(todayWib()), isTrue);
  });
}
