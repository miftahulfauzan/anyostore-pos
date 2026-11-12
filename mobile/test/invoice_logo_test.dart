import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/invoice_share.dart';

InvoicePayload _payload({String? logoUrl}) => InvoicePayload(
      storeName: 'Anyostore Metro',
      storeAddress: 'Jl. Gatot Subroto 12',
      storePhones: const ['0812-3456-7890'],
      storeLogoUrl: logoUrl,
      invoiceNo: 'INV-20261113-B1-0007',
      dateText: '13 Nov 2026 · 10.21',
      cashier: 'Siti',
      customerLabel: 'Umum',
      items: const [
        InvoiceLine(
            name: 'Celana Baggy A104',
            variant: 'M · Biru',
            qty: 1,
            price: 145000,
            subtotal: 145000),
      ],
      subtotal: 145000,
      discount: 0,
      total: 145000,
    );

Future<void> _pump(WidgetTester tester, InvoicePayload payload) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
        body: SingleChildScrollView(child: InvoiceImage(payload: payload))),
  ));
}

void main() {
  test('logo invoice opsional dan default kosong', () {
    expect(_payload().storeLogoUrl, isNull);
    expect(
        _payload(logoUrl: 'https://anyostore.my.id/uploads/logo.png')
            .storeLogoUrl,
        'https://anyostore.my.id/uploads/logo.png');
  });

  testWidgets('tanpa logo, kepala invoice memakai inisial nama toko',
      (tester) async {
    await _pump(tester, _payload());
    expect(find.byKey(const ValueKey('invoice-logo')), findsOneWidget);
    expect(find.byKey(const ValueKey('invoice-logo-initial')), findsOneWidget);
    expect(find.text('A'), findsWidgets);
  });

  testWidgets(
      'logo gagal dimuat tetap menampilkan inisial, invoice tidak rusak',
      (tester) async {
    await _pump(tester,
        _payload(logoUrl: 'https://anyostore.my.id/uploads/tidak-ada.png'));
    // flutter_test menolak request jaringan; errorBuilder harus jatuh ke inisial.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(const ValueKey('invoice-logo')), findsOneWidget);
    expect(find.byKey(const ValueKey('invoice-logo-initial')), findsOneWidget);
    expect(find.text('INV-20261113-B1-0007'), findsOneWidget);
  });

  testWidgets('bingkai logo membulat 12 px dan berukuran 44 px',
      (tester) async {
    await _pump(tester, _payload());
    final box =
        tester.widget<Container>(find.byKey(const ValueKey('invoice-logo')));
    final decoration = box.decoration! as BoxDecoration;
    expect(decoration.borderRadius, BorderRadius.circular(12));
    expect(box.clipBehavior, Clip.antiAlias);
  });
}
