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
              'expenses': 0,
              'net_profit': 50000,
            },
            'payment_methods': <Object>[],
            'low_stock': <Object>[],
            'products': <Object>[],
          },
        };
      default:
        throw StateError('Unexpected request: $path');
    }
  }
}

void main() {
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
}
