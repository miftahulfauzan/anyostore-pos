import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/reports_page.dart';

class ReportsApi extends ApiClient {
  final requests = <(String, Map<String, String>)>[];

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    final params = query ?? <String, String>{};
    requests.add((path, params));
    switch (path) {
      case '/settings/branches':
        return {
          'success': true,
          'data': [
            {'id': 1, 'name': 'Gudang Utama'},
            {'id': 2, 'name': 'Anyostore Metro'},
          ],
        };
      case '/reports/overview':
        return {
          'success': true,
          'data': {
            'summary': {
              'transactions': 1,
              'gross_sales': 100000,
              'income': 0,
              'products_sold': 4,
              'cost_of_goods': 50000,
              'gross_profit': 50000,
              'profit_margin_percent': 50,
              'expenses': 0,
              'net_profit': 50000,
            },
            'previous_summary': {
              'gross_sales': 80000,
              'transactions': 1,
              'products_sold': 2,
              'net_profit': 40000,
              'expenses': 10000,
            },
            'payment_methods': <Object>[],
            'low_stock': <Object>[],
            'products': <Object>[],
          },
        };
      case '/dashboard':
        return {
          'success': true,
          'data': {
            'selected_period': {
              'start': '2026-11-03',
              'end': '2026-11-09',
            },
            'selected_summary': {
              'transactions': 2,
              'sales': 180000,
              'expenses': 25000,
              'products_sold': 4,
            },
            'selected_sales_trend': [
              {
                'date': '2026-11-09',
                'label': '09/11',
                'sales': 180000,
                'transactions': 2,
              },
            ],
            'selected_payment_breakdown': <Object>[],
            'selected_recent_transactions': <Object>[],
          },
        };
      case '/reports/daily-closing':
        return {
          'success': true,
          'data': {
            'document': 'Penutupan Penjualan',
            'date': params['date'],
            'receipt_count': 14,
            'return_count': 0,
            'total_sales': 2415000,
            'subtotal': 2415000,
            'expenses': 760000,
            'income': 0,
            'expected_total': 1655000,
            'methods': <String, dynamic>{
              'cash': {
                'sales': 1205000,
                'returns': 0,
                'cancellations': 0,
                'cash_in_out': 0,
                'total': 1205000,
              },
              'qris': {
                'sales': 1210000,
                'returns': 0,
                'cancellations': 0,
                'cash_in_out': 0,
                'total': 1210000,
              },
            },
          },
        };
      default:
        throw StateError('Unexpected request: $path');
    }
  }
}

void main() {
  test('offline report records are scoped to the selected business date', () {
    expect(reportDateInRange('2026-11-07', '2026-11-07', '2026-11-07'), isTrue);
    expect(
        reportDateInRange('2026-11-06', '2026-11-07', '2026-11-07'), isFalse);
    expect(
        reportDateInRange('2026-11-08', '2026-11-07', '2026-11-07'), isFalse);
  });

  testWidgets(
      'reports use the same compact period and filter controls as dashboard',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReportsApi();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ReportsPage(api: api, role: 'owner')),
    ));
    await tester.pumpAndSettle();

    expect(
        find.byKey(const ValueKey('reports-period-selector')), findsOneWidget);
    expect(find.byTooltip('Buka filter'), findsOneWidget);
    expect(find.text('Filter'), findsNothing);
    expect(find.text('Toko/Gudang'), findsNothing);
    expect(find.text('Persentase keuntungan'), findsOneWidget);
    expect(find.text('50.00%'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('reports-period-selector')));
    await tester.pumpAndSettle();
    expect(find.text('Kemarin'), findsOneWidget);
    expect(find.text('Bulan lalu'), findsOneWidget);
    expect(find.text('Rentang tanggal'), findsOneWidget);
    await tester.tap(find.text('Kemarin'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Buka filter'));
    await tester.pumpAndSettle();
    expect(find.text('Filter laporan'), findsOneWidget);
    expect(find.text('Toko / Gudang'), findsOneWidget);
    expect(find.text('Terapkan Filter'), findsOneWidget);
  });

  testWidgets(
      'penutupan default memakai tanggal bisnis WIB hari ini dan bisa diubah',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReportsApi();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: ReportsPage(
              api: api, role: 'admin', initialSection: 'penutupan')),
    ));
    await tester.pumpAndSettle();

    final nowWib = DateTime.now().toUtc().add(const Duration(hours: 7));
    final expected =
        '${nowWib.year.toString().padLeft(4, '0')}-${nowWib.month.toString().padLeft(2, '0')}-${nowWib.day.toString().padLeft(2, '0')}';
    final request =
        api.requests.lastWhere((item) => item.$1 == '/reports/daily-closing');
    expect(request.$2['date'], expected);
    expect(find.byKey(const ValueKey('reports-closing-date')), findsOneWidget);
    // Hanya satu kontrol tanggal: preset periode (7 hari/30 hari/bulan ini)
    // tidak boleh muncul lagi di tab penutupan.
    expect(find.byKey(const ValueKey('reports-period-selector')), findsNothing);
    expect(find.byTooltip('Buka filter'), findsNothing);
    expect(find.byTooltip('Export CSV'), findsNothing);
    expect(find.textContaining('Periode:'), findsNothing);
    expect(find.text('Rp2.415.000'), findsWidgets);
  });

  testWidgets(
      'combined report uses Penjualan without a duplicate Ringkasan tab',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReportsApi();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ReportsPage(api: api, role: 'owner')),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Penjualan'), findsWidgets);
    expect(find.text('Ringkasan'), findsNothing);
    expect(find.text('Produk terjual'), findsOneWidget);
    expect(find.text('Laba kotor'), findsOneWidget);
    expect(find.text('Persentase keuntungan'), findsOneWidget);
    expect(find.text('Laba bersih'), findsOneWidget);
  });

  testWidgets('non-owner does not see margin or net profit', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReportsApi();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: ReportsPage(api: api, role: 'admin', dashboardMode: true)),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Margin keuntungan'), findsNothing);
    expect(find.text('Laba bersih'), findsNothing);
    expect(find.text('Pengeluaran'), findsWidgets);
  });

  testWidgets('cashier dashboard uses the selected period contract',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReportsApi();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: ReportsPage(api: api, role: 'kasir', dashboardMode: true)),
    ));
    await tester.pumpAndSettle();

    expect(
        find.byKey(const ValueKey('reports-period-selector')), findsOneWidget);
    expect(find.text('Pesanan'), findsOneWidget);
    expect(find.text('Produk terjual'), findsOneWidget);
    expect(find.text('Transaksi hari ini'), findsNothing);
  });

  testWidgets('report details expose five icon-led groups and actions',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = ReportsApi();

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: ReportsPage(api: api, role: 'owner')),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Ringkasan toko'), findsOneWidget);
    final detailHeading = find.byKey(const ValueKey('reports-detail-heading'));
    final reportScroll = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(detailHeading, 600,
        scrollable: reportScroll);
    expect(find.text('Laporan detail'), findsOneWidget);
    for (final entry in {
      'Transaksi': 'reports-detail-transactions',
      'Produk': 'reports-detail-products',
      'Pembayaran': 'reports-detail-payments',
      'Retur': 'reports-detail-returns',
      'Analisis periode': 'reports-detail-analysis',
    }.entries) {
      final group = find.byKey(ValueKey(entry.value));
      await tester.scrollUntilVisible(group, 600, scrollable: reportScroll);
      expect(find.descendant(of: group, matching: find.text(entry.key)),
          findsOneWidget);
    }
    await tester.scrollUntilVisible(
        find.byKey(const ValueKey('reports-detail-transactions')), 600,
        scrollable: reportScroll);
    expect(find.text('Lihat PDF'), findsOneWidget);
    expect(find.text('Cetak'), findsOneWidget);
  });
}
