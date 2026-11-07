import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/payment_sheet.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;

Future<void> openPayment(
    WidgetTester tester, ValueChanged<Map<String, dynamic>?> onResult) async {
  await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
          body: Builder(
        builder: (context) => TextButton(
            onPressed: () async {
              onResult(await showModalBottomSheet<Map<String, dynamic>>(
                context: context,
                isScrollControlled: true,
                builder: (_) => const PaymentSheet(grandTotal: 275000),
              ));
            },
            child: const Text('Bayar')),
      ))));
  await tester.tap(find.text('Bayar'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
      'cash change updates immediately and returns existing payment payload',
      (tester) async {
    Map<String, dynamic>? result;
    await openPayment(tester, (value) => result = value);
    await tester.enterText(find.byType(TextField).first, '300000');
    await tester.pump();
    expect(find.text('Kembalian: Rp25.000'), findsOneWidget);
    await tester.ensureVisible(find.text('Selesaikan pembayaran'));
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pumpAndSettle();
    expect(result, {'payment_method': 'cash', 'amount_paid': 300000});
  });

  testWidgets('single non-cash method uses the total and preserves reference',
      (tester) async {
    Map<String, dynamic>? result;
    await openPayment(tester, (value) => result = value);
    await tester.tap(find.text('Tunai'));
    await tester.tap(find.text('QRIS'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, ' QR-123 ');
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pumpAndSettle();
    expect(result, {
      'payment_method': 'qris',
      'amount_paid': 275000,
      'payment_reference': 'QR-123'
    });
  });

  testWidgets('split payment keeps both amounts and validates their sum',
      (tester) async {
    Map<String, dynamic>? result;
    await openPayment(tester, (value) => result = value);
    // Re-select cash so the existing sheet creates its split controller.
    await tester.tap(find.text('Tunai'));
    await tester.tap(find.text('Tunai'));
    await tester.tap(find.text('QRIS'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Tunai (Rp)'), '180000');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pump();
    expect(result, isNull);
    expect(find.text('Isi nominal untuk setiap metode pembayaran.'),
        findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'QRIS (Rp)'), '90000');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pump();
    expect(result, isNull);
    expect(find.text('Jumlah pembayaran harus sama dengan total Rp275.000.'),
        findsOneWidget);
    await tester.enterText(
        find.widgetWithText(TextField, 'QRIS (Rp)'), '95000');
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Selesaikan pembayaran'));
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pumpAndSettle();
    expect(result, {
      'payment_method': 'split',
      'amount_paid': 275000,
      'payments': [
        {'payment_method': 'cash', 'amount': 180000},
        {'payment_method': 'qris', 'amount': 95000},
      ]
    });
  });
}
