import 'package:flutter_test/flutter_test.dart';

import 'package:pos_pakaian_mobile/src/receipt_layout.dart';

void main() {
  test('formats 58mm receipt columns within 32 characters', () {
    final receipt = <String, dynamic>{
      'store': {
        'printer_size': '58',
        'store_name': 'BASIK PGMTA',
        'receipt_header': 'Terima kasih telah berbelanja',
      },
      'invoice_no': 'INV-20261105-B2-0018',
      'transaction_date': '2026-11-05',
      'created_at': '2026-11-05T07:08:14.000Z',
      'cashier': 'Miftahul Fauzan',
      'items': [
        {
          'product_name': 'Celana Denim Panjang',
          'sku': 'B1-CELANA',
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
      'amount_paid': 360000,
      'change': 0,
    };
    final lines = ReceiptLayout.fromReceipt(receipt).build(receipt);

    expect(lines.map((line) => line.text).every((line) => line.length <= 32),
        isTrue);
    expect(lines.any((line) => line.text.startsWith('Celana Denim Panjang')),
        isTrue);
    expect(
        lines.any((line) =>
            line.text.startsWith('Celana Denim Panjang') &&
            line.text.endsWith('Rp360.000')),
        isTrue);
    expect(lines.any((line) => line.text == '4 x Rp90.000'), isTrue);
    expect(lines.map((line) => line.text), contains('INFORMASI TRANSAKSI'));
    expect(lines.map((line) => line.text), contains('PRODUK'));
    expect(
        lines.any((line) =>
            line.text.startsWith('Tanggal') &&
            line.text.endsWith('05/11/2026 · 14:08')),
        isTrue);
    expect(
        lines.any((line) =>
            line.text.startsWith('Dibayar') && line.text.endsWith('Rp360.000')),
        isTrue);
    expect(
        lines.any((line) =>
            line.text.startsWith('Kembalian') && line.text.endsWith('Rp0')),
        isTrue);
  });

  test(
      'keeps transaction, product, payment, and footer sections in photo-two order',
      () {
    final receipt = <String, dynamic>{
      'store': {
        'printer_size': '80',
        'store_name': 'TOKO D',
        'store_address': 'Blok B lantai LG 105 F no 107',
        'store_phone': '081234567890',
        'receipt_header': 'Terima kasih telah berbelanja',
        'receipt_note':
            'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
        'receipt_footer': 'Simpan struk ini sebagai bukti transaksi',
      },
      'invoice_no': 'INV-20261105-B2-0018',
      'transaction_date': '2026-11-05',
      'created_at': '2026-11-05T07:08:14.000Z',
      'cashier': 'Miftahul Fauzan',
      'items': [
        {
          'product_name': 'AC07',
          'sku': 'B1-AC07',
          'quantity': 3,
          'price': 125000,
          'subtotal': 375000,
        },
      ],
      'subtotal': 375000,
      'grand_total': 375000,
      'payment_method': 'cash',
      'amount_paid': 400000,
      'change': 25000,
    };
    final lines = ReceiptLayout.fromReceipt(receipt).build(receipt);
    final text = lines.map((line) => line.text).toList();

    expect(
        text.indexOf('INFORMASI TRANSAKSI'), lessThan(text.indexOf('PRODUK')));
    int indexOfLabel(String label) =>
        text.indexWhere((line) => line.startsWith(label));
    expect(indexOfLabel('PRODUK'), lessThan(indexOfLabel('Subtotal')));
    expect(indexOfLabel('Subtotal'), lessThan(indexOfLabel('Total')));
    expect(indexOfLabel('Total'), lessThan(indexOfLabel('Tunai')));
    expect(indexOfLabel('Kembalian'),
        lessThan(text.indexOf('Terima kasih, sampai jumpa lagi!')));
    expect(text, contains('Barang yang sudah dibeli tidak dapat'));
    expect(text, contains('Simpan struk ini sebagai bukti transaksi'));
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

  test('treats 58mm and 58mm settings as the narrow layout', () {
    for (final printerSize in ['58', '58mm']) {
      final receipt = <String, dynamic>{
        'store': {'printer_size': printerSize},
        'subtotal': 360000,
        'grand_total': 360000,
        'items': [
          {
            'product_name': 'Celana Denim Panjang',
            'quantity': 4,
            'price': 90000,
            'subtotal': 360000,
          },
        ],
      };
      final layout = ReceiptLayout.fromReceipt(receipt);
      final lines = layout.build(receipt);

      expect(layout.width, 32);
      expect(lines.map((line) => line.text).every((line) => line.length <= 32),
          isTrue);
    }
  });

  test('keeps every item in a multi-item receipt', () {
    final receipt = <String, dynamic>{
      'store': {'printer_size': '58'},
      'items': List.generate(
        5,
        (index) => {
          'product_name': 'Produk $index',
          'quantity': 1,
          'price': 90000,
          'subtotal': 90000,
        },
      ),
    };
    final lines = ReceiptLayout.fromReceipt(receipt).build(receipt);

    for (var index = 0; index < 5; index++) {
      expect(
          lines.any((line) => line.text.startsWith('Produk $index')), isTrue);
    }
  });
}
