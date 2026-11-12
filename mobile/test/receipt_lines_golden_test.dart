import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/receipt_layout.dart';

/// Fixture golden dipakai bersama dengan backend (backend/test/fixtures/
/// receipt-lines). Kalau aturan struk berubah di salah satu sisi, test ini
/// gagal sehingga cetak Android dan halaman resi web tidak bisa berbeda.
void main() {
  final dir = Directory('../backend/test/fixtures/receipt-lines');
  final files = dir.existsSync()
      ? (dir
          .listSync()
          .whereType<File>()
          .where((file) => file.path.endsWith('.json'))
          .toList()
        ..sort((a, b) => a.path.compareTo(b.path)))
      : <File>[];

  test('fixture golden struk tersedia', () {
    expect(files.length, greaterThanOrEqualTo(10),
        reason: 'jalankan backend/scripts/generate-receipt-fixtures.js');
  });

  for (final file in files) {
    final name = file.uri.pathSegments.last;
    test('Dart sama dengan backend: $name', () {
      final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      final receipt = (json['receipt'] as Map).cast<String, dynamic>();
      final expected = (json['expected'] as Map).cast<String, dynamic>();

      final layout = ReceiptLayout.fromReceipt(receipt);
      expect(layout.width, expected['width'], reason: 'lebar kertas');
      expect(layout.margin, expected['margin'], reason: 'margin');
      expect(layout.fontB, expected['font'] == 'b', reason: 'font');

      final lines = layout.build(receipt);
      final expectedLines = (expected['lines'] as List).cast<Map>();
      expect(lines.length, expectedLines.length, reason: 'jumlah baris');
      for (var i = 0; i < lines.length; i++) {
        final want = expectedLines[i];
        expect(lines[i].text, want['text'], reason: 'baris ${i + 1}');
        expect(lines[i].bold, want['bold'], reason: 'bold baris ${i + 1}');
        expect(
          lines[i].alignment == ReceiptLineAlignment.center ? 'center' : 'left',
          want['alignment'],
          reason: 'alignment baris ${i + 1}',
        );
      }
    });
  }

  test('baris dari server dipakai apa adanya', () {
    final receipt = <String, dynamic>{
      'store': {'printer_size': '58'},
      'invoice_no': 'INV-1',
      'lines': [
        {'text': '  HALO  ', 'bold': true, 'alignment': 'center'},
        {'text': 'BARIS KEDUA', 'bold': false, 'alignment': 'left'},
      ],
    };
    final lines = ReceiptLayout.fromReceipt(receipt).resolve(receipt);
    expect(lines, hasLength(2));
    expect(lines.first.text, '  HALO  ');
    expect(lines.first.bold, isTrue);
    expect(lines.first.alignment, ReceiptLineAlignment.center);
    expect(lines.last.alignment, ReceiptLineAlignment.left);
  });

  test('tanpa baris server, struk disusun lokal (mode offline)', () {
    final receipt = <String, dynamic>{
      'store': {'printer_size': '80', 'store_name': 'ANYOSTORE METRO'},
      'invoice_no': 'OFF-1-1731498000000',
      'transaction_date': '2026-11-13',
      'items': [
        {
          'product_name': 'A104',
          'quantity': 2,
          'price': 145000,
          'subtotal': 290000
        },
      ],
      'subtotal': 290000,
      'discount': 0,
      'grand_total': 290000,
      'payment_method': 'cash',
      'amount_paid': 300000,
      'change': 10000,
    };
    final lines = ReceiptLayout.fromReceipt(receipt).resolve(receipt);
    final teks = lines.map((line) => line.text).join('\n');
    expect(teks, contains('OFF-1-1731498000000'));
    expect(teks, contains('A104'));
    expect(teks, contains('Rp290.000'));
    expect(teks, contains('Tunai'));
    expect(lines.every((line) => line.text.length == 64), isTrue);
  });

  test('baris server yang kosong tetap jatuh ke susunan lokal', () {
    final receipt = <String, dynamic>{
      'store': {'store_name': 'ANYOSTORE'},
      'invoice_no': 'INV-2',
      'lines': <Map<String, dynamic>>[],
      'subtotal': 0,
      'discount': 0,
      'grand_total': 0,
    };
    final lines = ReceiptLayout.fromReceipt(receipt).resolve(receipt);
    expect(lines, isNotEmpty);
    expect(lines.first.text.trim(), 'ANYOSTORE');
  });
}
