import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/transfer_history_page.dart';

class _TransferApi extends ApiClient {
  final requests = <(String, Map<String, dynamic>)>[];
  var historyCalls = 0;
  final rows = <Map<String, dynamic>>[
    {
      'id': 42,
      'number': 'TRF-20261107-0042',
      'status': 'completed',
      'created_at': '2026-11-07 10:00:00',
      'source': {'branch_name': 'Toko A', 'warehouse_name': 'Gudang A'},
      'destination': {'branch_name': 'Toko B', 'warehouse_name': 'Gudang B'},
      'product_count': 1,
      'total_qty': 4,
      'admin': 'Syukri',
      'details': {
        'from': [
          {'name': 'Kemeja Denim', 'qty': 4},
        ],
      },
    },
  ];

  @override
  Future<Map<String, dynamic>> transferHistory({
    int page = 1,
    int limit = 25,
    String search = '',
    String status = '',
    String direction = '',
    String? start,
    String? end,
  }) async {
    historyCalls++;
    return {'success': true, 'data': rows, 'totalPages': 1};
  }

  @override
  Future<Map<String, dynamic>> post(
      String path, Map<String, dynamic> body) async {
    requests.add((path, body));
    rows.first['status'] = 'cancelled';
    return {
      'success': true,
      'data': {'id': 42, 'status': 'cancelled'}
    };
  }
}

Future<void> showHistory(WidgetTester tester, _TransferApi api,
    {required String role}) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(body: TransferHistoryPage(api: api, role: role)),
  ));
  await tester.pumpAndSettle();
}

void main() {
  test('ApiClient sends transfer cancellation reason', () async {
    final api = _TransferApi();
    await api.cancelTransfer(42, reason: 'Salah pilih gudang');

    expect(api.requests, hasLength(1));
    expect(api.requests.single.$1, '/inventory-control/transfers/42/cancel');
    expect(api.requests.single.$2, {'reason': 'Salah pilih gudang'});
  });

  testWidgets('owner can cancel completed transfer and history reloads',
      (tester) async {
    final api = _TransferApi();
    await showHistory(tester, api, role: 'owner');

    expect(find.text('Batalkan transfer'), findsOneWidget);
    await tester.tap(find.text('Batalkan transfer'));
    await tester.pumpAndSettle();
    expect(
        find.byKey(const ValueKey('transfer-cancel-reason')), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('transfer-cancel-reason')),
        'Salah pilih gudang');
    await tester.tap(find.text('Batalkan'));
    await tester.pumpAndSettle();

    expect(api.requests.single.$1, '/inventory-control/transfers/42/cancel');
    expect(api.requests.single.$2, {'reason': 'Salah pilih gudang'});
    expect(api.historyCalls, greaterThanOrEqualTo(2));
    expect(find.text('Batalkan transfer'), findsNothing);
    expect(find.text('Dibatalkan'), findsOneWidget);
  });

  testWidgets('manager does not see transfer cancellation action',
      (tester) async {
    final api = _TransferApi();
    await showHistory(tester, api, role: 'manager');

    expect(find.text('Batalkan transfer'), findsNothing);
  });
}
