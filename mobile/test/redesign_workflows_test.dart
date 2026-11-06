import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/payment_sheet.dart';

Future<void> openPayment(
    WidgetTester tester, ValueChanged<Map<String, dynamic>?> onResult) async {
  await tester.pumpWidget(MaterialApp(
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
    expect(result?['payment_method'], 'cash');
    expect(result?['amount_paid'], 300000);
  });

  testWidgets('non-cash amount must match total and keeps the form on error',
      (tester) async {
    Map<String, dynamic>? result;
    await openPayment(tester, (value) => result = value);
    await tester.tap(find.text('QRIS'));
    await tester.enterText(find.byType(TextField).first, '300000');
    await tester.ensureVisible(find.text('Selesaikan pembayaran'));
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pump();
    expect(
        find.text('Pembayaran non-tunai harus sesuai total'), findsOneWidget);
    expect(result, isNull);
    expect(find.text('Pembayaran'), findsOneWidget);
  });

  testWidgets('split payment keeps both amounts and validates their sum',
      (tester) async {
    Map<String, dynamic>? result;
    await openPayment(tester, (value) => result = value);
    await tester.tap(find.text('Split'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tambah metode'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).first, '180000');
    await tester.ensureVisible(find.text('Tambah metode'));
    await tester.tap(find.text('Tambah metode'));
    await tester.pump();
    await tester.enterText(find.byType(TextField).last, '95000');
    await tester.ensureVisible(find.text('Selesaikan pembayaran'));
    await tester.tap(find.text('Selesaikan pembayaran'));
    await tester.pumpAndSettle();
    expect(result?['payments'], hasLength(2));
    expect((result?['payments'] as List).map((row) => row['amount']),
        [180000, 95000]);
  });
}
