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
              'cost_of_goods': 50000,
              'gross_profit': 50000,
              'profit_margin_percent': 50,
              'expenses': 0,
              'net_profit': 50000,
            },
            'payment_methods': <Object>[],
            'low_stock': <Object>[],
            'products': <Object>[],
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
    expect(reportDateInRange('2026-11-06', '2026-11-07', '2026-11-07'), isFalse);
    expect(reportDateInRange('2026-11-08', '2026-11-07', '2026-11-07'), isFalse);
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

  testWidgets('penutupan memakai tanggal bisnis WIB sebelumnya dan bisa diubah',
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
    final previous = nowWib.subtract(const Duration(days: 1));
    final expected =
        '${previous.year.toString().padLeft(4, '0')}-${previous.month.toString().padLeft(2, '0')}-${previous.day.toString().padLeft(2, '0')}';
    final request =
        api.requests.lastWhere((item) => item.$1 == '/reports/daily-closing');
    expect(request.$2['date'], expected);
    expect(find.byKey(const ValueKey('reports-closing-date')), findsOneWidget);
    expect(find.text('Rp2.415.000'), findsWidgets);
  });
}
