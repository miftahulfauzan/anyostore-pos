import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/stock_status_donut.dart';

void main() {
  test('fraksi donut berjumlah satu saat ada data', () {
    final f = StockStatusDonut.fractions(good: 122, low: 4, empty: 2);
    expect(f.length, 3);
    final total = f.reduce((a, b) => a + b);
    expect(total, closeTo(1, .001));
    expect(f[0], greaterThan(f[1]));
    expect(f[1], greaterThan(f[2]));
  });

  test('fraksi donut kosong saat tidak ada produk', () {
    final f = StockStatusDonut.fractions(good: 0, low: 0, empty: 0);
    expect(f, everyElement(0));
  });

  testWidgets('donut merender ring dengan semantics status stok',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
            body: Center(
                child: StockStatusDonut(good: 122, low: 4, empty: 2)))));
    await tester.pumpAndSettle();
    expect(find.byType(StockStatusDonut), findsOneWidget);
    final semanticsLabel = find.bySemanticsLabel(
        'Status stok: 122 aman, 4 menipis, 2 habis');
    expect(semanticsLabel, findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('donut tanpa data tidak crash', (tester) async {
    await tester.pumpWidget(const MaterialApp(
        home: Scaffold(body: Center(child: StockStatusDonut()))));
    await tester.pumpAndSettle();
    expect(find.bySemanticsLabel('Status stok: 0 aman, 0 menipis, 0 habis'),
        findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
