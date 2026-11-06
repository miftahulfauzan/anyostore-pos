import 'package:flutter_test/flutter_test.dart';

import 'package:pos_pakaian_mobile/src/receipt_layout.dart';

void main() {
  test('formats 58mm receipt columns within 32 characters', () {
    final receipt = <String, dynamic>{
      'store': {'printer_size': '58'},
      'items': [
        {
          'product_name': 'Celana Denim Panjang',
          'variant_detail': 'Biru / M',
          'quantity': 4,
          'price': 90000,
          'subtotal': 360000,
        },
      ],
      'subtotal': 360000,
      'grand_total': 360000,
      'payments': [
        {'payment_method': 'transfer', 'amount': 360000},
      ],
    };
    final lines = ReceiptLayout.fromReceipt(receipt).build(receipt);

    expect(lines.map((line) => line.text).every((line) => line.length <= 32),
        isTrue);
    expect(lines.any((line) => line.text == 'Celana Denim Panjang'), isTrue);
    expect(lines.any((line) => line.text == '4 x Rp90.000           Rp360.000'),
        isTrue);
  });

  test('wraps long store data instead of overflowing', () {
    final receipt = <String, dynamic>{
      'store': {
        'printer_size': '58',
        'store_address': 'BASIK PGMTA Lantai 6 Blok B nomor 118'
      },
    };
    final lines = ReceiptLayout.fromReceipt(receipt).build(receipt);

    expect(lines.map((line) => line.text).every((line) => line.length <= 32),
        isTrue);
    expect(lines.map((line) => line.text),
        contains('BASIK PGMTA Lantai 6 Blok B'));
  });
}
