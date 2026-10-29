import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/ui_kit.dart';

void main() {
  test('productDisplayName always prioritizes the product name', () {
    expect(productDisplayName({'name': 'Kemeja Denim', 'sku': 'B4-KM01'}),
        'Kemeja Denim');
    expect(productDisplayName({'sku': 'B4-KM01'}), 'Produk tanpa nama');
  });

  testWidgets('UiErrorState provides a visible retry action', (tester) async {
    var retries = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body:
            UiErrorState(message: 'Koneksi terputus', onRetry: () => retries++),
      ),
    ));

    expect(find.text('Koneksi terputus'), findsOneWidget);
    expect(find.text('Coba lagi'), findsOneWidget);
    await tester.tap(find.text('Coba lagi'));
    expect(retries, 1);
  });

  testWidgets('UiEmptyState explains the next action', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: UiEmptyState(
          title: 'Belum ada produk',
          message: 'Produk yang ditambahkan akan tampil di sini.',
        ),
      ),
    ));

    expect(find.text('Belum ada produk'), findsOneWidget);
    expect(find.text('Produk yang ditambahkan akan tampil di sini.'),
        findsOneWidget);
  });
}
