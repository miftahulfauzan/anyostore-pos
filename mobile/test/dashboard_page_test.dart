import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/dashboard_page.dart';

class DashboardApi extends ApiClient {
  Future<Map<String, dynamic>> Function(String, Map<String, String>)? respond;
  final requests = <(String, Map<String, String>)>[];
  bool empty = false;

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    final params = query ?? {};
    requests.add((path, params));
    if (respond != null) return respond!(path, params);
    return response(path, params);
  }

  Map<String, dynamic> response(String path, Map<String, String> params) {
    final Object data = switch (path) {
      '/settings/branches' => <Object>[],
      '/inventory/mutations-summary' => {
          'total_in': empty ? 0 : 12345,
          'total_out': empty ? 0 : 21,
          'daily': empty
              ? <Object>[]
              : [
                  {'date': params['start'], 'in': 12345, 'out': 21}
                ],
        },
      '/inventory/stock-total' => {
          'summary': {
            'total_products': empty ? 0 : 10,
            'low_stock': empty ? 0 : 2,
            'out_of_stock': empty ? 0 : 1,
          },
          'products': <Object>[],
        },
      '/inventory/stock-by-category' => empty
          ? <Object>[]
          : [
              {'name': 'Kategori asli', 'total': 11}
            ],
      '/inventory/top-products-out' => empty
          ? <Object>[]
          : [
              {'name': 'Produk asli', 'total': 21}
            ],
      _ => throw StateError('Unexpected request: $path'),
    };
    return {'success': true, 'data': data};
  }
}

Future<void> showDashboard(WidgetTester tester, DashboardApi api) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final auth = AuthStore(api)
    ..role = 'owner'
    ..branchId = 4;
  await tester.pumpWidget(ChangeNotifierProvider.value(
    value: auth,
    child: MaterialApp(home: Scaffold(body: DashboardPage(api: api))),
  ));
  await tester.pump();
}

void main() {
  testWidgets('loading contains no business figures or charts', (tester) async {
    final pending = Completer<Map<String, dynamic>>();
    final api = DashboardApi();
    api.respond = (path, query) => path == '/inventory/mutations-summary'
        ? pending.future
        : Future.value(api.response(path, query));
    await showDashboard(tester, api);
    expect(find.text('Memuat ringkasan…'), findsOneWidget);
    expect(find.byType(LineChart), findsNothing);
    expect(find.byType(PieChart), findsNothing);
    expect(find.byType(BarChart), findsNothing);
    expect(find.text('0'), findsNothing);
    expect(find.text('AT77'), findsNothing);
    await tester.pumpWidget(const SizedBox());
    pending.complete(api.response('/inventory/mutations-summary', {}));
    await tester.pump();
    expect(tester.takeException(), isNull);
  });

  testWidgets('successful response shows only real totals and stock status',
      (tester) async {
    await showDashboard(tester, DashboardApi());
    await tester.pumpAndSettle();
    expect(find.text('12.345'), findsOneWidget);
    expect(find.text('70%'), findsWidgets);
    expect(find.text('Produk asli'), findsOneWidget);
    expect(find.text('AT77'), findsNothing);
    expect(find.byType(LineChart), findsOneWidget);
  });

  testWidgets('empty success clears previous charts and lists', (tester) async {
    final api = DashboardApi();
    await showDashboard(tester, api);
    await tester.pumpAndSettle();
    api.empty = true;
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(find.text('0'), findsNWidgets(3));
    expect(find.text('Belum ada pergerakan stok pada rentang ini.'),
        findsOneWidget);
    expect(find.text('Belum ada produk pada toko/gudang ini.'), findsOneWidget);
    expect(find.text('Belum ada data stok per kategori.'), findsOneWidget);
    expect(find.text('Belum ada produk keluar pada rentang ini.'),
        findsOneWidget);
    expect(find.byType(PieChart), findsNothing);
    expect(find.byType(LineChart), findsNothing);
    expect(find.byType(BarChart), findsNothing);
    expect(find.text('Produk asli'), findsNothing);
  });

  testWidgets('API failure clears old figures and retry recovers', (tester) async {
    final api = DashboardApi();
    await showDashboard(tester, api);
    await tester.pumpAndSettle();
    api.respond = (path, params) async {
      if (path == '/inventory/stock-by-category') {
        throw ApiException('Server sedang bermasalah', statusCode: 500);
      }
      return api.response(path, params);
    };
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(find.text('Gagal memuat ringkasan'), findsOneWidget);
    expect(find.text('12.345'), findsNothing);
    expect(find.byType(PieChart), findsNothing);
    expect(find.text('Produk asli'), findsNothing);
    api.respond = null;
    await tester.tap(find.text('Coba lagi'));
    await tester.pumpAndSettle();
    expect(find.text('Gagal memuat ringkasan'), findsNothing);
    expect(find.text('12.345'), findsOneWidget);
  });

  testWidgets('late result cannot overwrite a newer filter response',
      (tester) async {
    final pending = Completer<Map<String, dynamic>>();
    final api = DashboardApi();
    api.respond = (path, params) => path == '/inventory/mutations-summary'
        ? pending.future
        : Future.value(api.response(path, params));
    await showDashboard(tester, api);
    api.respond = null;
    api.empty = true;
    await tester.tap(find.text('Toko saya (default)').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Semua toko/gudang').last);
    await tester.pumpAndSettle();
    expect(find.text('Belum ada data stok per kategori.'), findsOneWidget);
    pending.complete({
      'data': {'total_in': 99999, 'total_out': 0, 'daily': <Object>[]}
    });
    await tester.pumpAndSettle();
    expect(find.text('99.999'), findsNothing);
    expect(find.text('0'), findsNWidgets(3));
    final latest = api.requests
        .where((r) => r.$1.startsWith('/inventory/'))
        .toList()
        .sublist(4);
    expect(latest, hasLength(4));
    expect(latest.every((r) => r.$2['branch_id'] == 'all'), isTrue);
  });

  testWidgets('changing date preset clears data while loading the new range',
      (tester) async {
    final api = DashboardApi();
    await showDashboard(tester, api);
    await tester.pumpAndSettle();
    final pending = Completer<Map<String, dynamic>>();
    api.respond = (path, params) => path == '/inventory/mutations-summary'
        ? pending.future
        : Future.value(api.response(path, params));
    await tester.tap(find.text('7 Hari').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Hari ini').last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('12.345'), findsNothing);
    expect(find.text('Memuat ringkasan…'), findsOneWidget);
    final params = api.requests
        .lastWhere((r) => r.$1 == '/inventory/mutations-summary')
        .$2;
    expect(params['start'], params['end']);
    pending.complete(api.response('/inventory/mutations-summary', params));
    await tester.pumpAndSettle();
    expect(find.text('12.345'), findsOneWidget);
    expect(find.text('Pergerakan Stok'), findsOneWidget);
  });

  testWidgets('unexpected response failure shows retry instead of fake zeros',
      (tester) async {
    final api = DashboardApi();
    api.respond = (path, params) async => path == '/inventory/stock-total'
        ? {'data': {'summary': 'invalid'}}
        : api.response(path, params);
    await showDashboard(tester, api);
    await tester.pumpAndSettle();
    expect(find.text('Gagal memuat ringkasan'), findsOneWidget);
    expect(find.text('Coba lagi'), findsOneWidget);
    expect(find.text('0'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
