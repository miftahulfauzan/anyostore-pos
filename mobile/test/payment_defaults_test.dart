import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/payment_defaults.dart';
import 'package:pos_pakaian_mobile/src/payment_sheet.dart';
import 'package:pos_pakaian_mobile/main.dart' show buildAnyostoreTheme;

void main() {
  test('metode pembayaran default per toko', () {
    expect(defaultPaymentMethod('BASIK PGMTA'), 'transfer');
    expect(defaultPaymentMethod('Toko B'), 'qris');
    expect(defaultPaymentMethod('Toko B', 'Blok B lantai LG los F no 107'),
        'qris');
    expect(defaultPaymentMethod('Gudang Anyostore Metro'), 'cash');
  });

  testWidgets('pindah metode tidak otomatis jadi bayar terpisah',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: buildAnyostoreTheme(brightness: Brightness.light),
      home: const Scaffold(
          body: PaymentSheet(grandTotal: 400000, defaultMethod: 'transfer')),
    ));
    await tester.pumpAndSettle();

    // Transfer terpilih sebagai default.
    expect(find.text('Transfer'), findsOneWidget);
    expect(find.text('Bayar terpisah'), findsOneWidget);

    // Menekan QRIS hanya memindahkan metode, tidak memunculkan isian split.
    await tester
        .ensureVisible(find.byKey(const ValueKey('payment-method-qris')));
    await tester.tap(find.byKey(const ValueKey('payment-method-qris')));
    await tester.pumpAndSettle();
    expect(find.textContaining('(Rp)'), findsNothing);

    // Setelah mode bayar terpisah dinyalakan, memilih metode kedua membuka nominal.
    await tester.tap(find.text('Bayar terpisah'));
    await tester.pumpAndSettle();
    await tester
        .ensureVisible(find.byKey(const ValueKey('payment-method-cash')));
    await tester.tap(find.byKey(const ValueKey('payment-method-cash')));
    await tester.pumpAndSettle();
    expect(find.textContaining('(Rp)'), findsWidgets);
  });
}
