import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/mutation_report_page.dart';

class MutationReportApi extends ApiClient {
  MutationReportApi({this.type = 'in'});

  String type;
  final requests = <(String, Map<String, String>)>[];
  final deleted = <String>[];

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    final params = query ?? <String, String>{};
    requests.add((path, params));
    if (path == '/inventory/incoming/targets') {
      return {
        'success': true,
        'data': [
          {'id': 1, 'name': 'Gudang Utama', 'type': 'gudang'},
          {'id': 2, 'name': 'Anyostore Metro', 'type': 'toko'},
        ],
      };
    }
    if (path == '/inventory/mutation-report') {
      final isOut = params['type'] == 'out' || type == 'out';
      return {
        'success': true,
        'data': [
          for (var i = 0; i < 7; i++)
            {
              'id': i + 1,
              'number': '${isOut ? 'OUT' : 'IN'}-20260914-${i + 1}',
              'date': '2026-09-14',
              'warehouse': 'Gudang Utama',
              'products': [
                {
                  'name': 'Kemeja Denim',
                  'code': 'B4-KEMEJA-${i + 1}',
                  'photo_path': '/uploads/kemeja-${i + 1}.jpg',
                  'qty': i + 1,
                }
              ],
              'total_qty': i + 1,
              'product_count': 1,
              'description': 'Konveksi',
              'channel': isOut ? 'Shopee' : null,
              'destination': isOut ? 'Shopee' : null,
              'admin': 'Resti',
              'deletable': true,
            },
        ],
        'summary': {'product_count': 1, 'total_qty': 28},
        'breakdown': [
          {'label': isOut ? 'Shopee' : 'Konveksi', 'total_qty': 28},
        ],
      };
    }
    throw StateError('Unexpected request: $path');
  }

  @override
  Future<Map<String, dynamic>> delete(String path) async {
    deleted.add(path);
    return {'success': true, 'message': 'Batch dihapus dan stok dikembalikan.'};
  }
}

Future<void> showReport(WidgetTester tester, MutationReportApi api) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(body: MutationReportPage(api: api)),
  ));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('mobile report follows web batch summary and detail rules',
      (tester) async {
    final api = MutationReportApi();
    await showReport(tester, api);

    expect(find.text('Mutasi'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('mutation-period-selector')), findsOneWidget);
    expect(find.byTooltip('Buka filter'), findsOneWidget);
    expect(find.text('Filter'), findsNothing);
    expect(find.text('Ringkasan Keterangan'), findsOneWidget);
    expect(find.text('Konveksi'), findsNothing);
    expect(find.text('Kemeja Denim'), findsNothing);
    expect(find.text('B4-KEMEJA-1'), findsNothing);
    expect(find.text('IN-20260914-7'), findsNothing);
    expect(find.text('Admin'), findsNothing);

    await tester.tap(find.text('Ringkasan Keterangan'));
    await tester.pumpAndSettle();
    expect(find.text('Konveksi'), findsOneWidget);
    await tester.tap(find.byTooltip('Tutup ringkasan'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('IN-20260914-1'));
    await tester.pumpAndSettle();
    expect(find.text('Kemeja Denim'), findsOneWidget);
    expect(find.text('B4-KEMEJA-1'), findsNothing);
    expect(find.text('Nomor batch'), findsOneWidget);
    expect(find.text('Admin'), findsOneWidget);
    expect(find.text('Masuk ke'), findsOneWidget);
    expect(find.text('Konveksi → Gudang Utama'), findsWidgets);
    expect(find.text('Gudang Utama'), findsWidgets);
    expect(
        find.byKey(const ValueKey('mutation-product-thumbnail-Kemeja Denim')),
        findsOneWidget);

    await tester.drag(find.byType(ListView).last, const Offset(0, -4000));
    await tester.pumpAndSettle();
    expect(find.text('Lihat 1 batch berikutnya'), findsOneWidget);
  });

  testWidgets('report filters open in a compact sheet and apply the draft',
      (tester) async {
    final api = MutationReportApi();
    await showReport(tester, api);

    expect(find.text('Cari keterangan'), findsNothing);
    await tester.tap(find.byTooltip('Buka filter'));
    await tester.pumpAndSettle();
    expect(find.text('Filter laporan'), findsOneWidget);
    expect(find.text('Terapkan Filter'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Konveksi');
    await tester.tap(find.text('Terapkan Filter'));
    await tester.pumpAndSettle();

    final request = api.requests
        .lastWhere((item) => item.$1 == '/inventory/mutation-report');
    expect(request.$2['description'], 'Konveksi');
    expect(find.text('Cari: Konveksi'), findsOneWidget);
  });

  testWidgets('period selector remains visible and changes the report range',
      (tester) async {
    final api = MutationReportApi();
    await showReport(tester, api);

    await tester.tap(find.byKey(const ValueKey('mutation-period-selector')));
    await tester.pumpAndSettle();
    expect(find.text('30 hari'), findsOneWidget);

    await tester.tap(find.text('30 hari'));
    await tester.pumpAndSettle();

    expect(
        find.byKey(const ValueKey('mutation-period-selector')), findsOneWidget);
    final request = api.requests
        .lastWhere((item) => item.$1 == '/inventory/mutation-report');
    expect(request.$2['start'], isNot(''));
    expect(request.$2['end'], isNot(''));
  });

  testWidgets('outgoing report shows destination and supports deleting a batch',
      (tester) async {
    final api = MutationReportApi();
    await showReport(tester, api);

    await tester.tap(find.text('Keluar'));
    await tester.pumpAndSettle();
    expect(find.text('Ringkasan Tujuan'), findsOneWidget);
    expect(find.text('Gudang Utama → Shopee'), findsWidgets);

    await tester.tap(find.text('OUT-20260914-1'));
    await tester.pumpAndSettle();
    expect(find.text('Keluar dari'), findsOneWidget);
    expect(find.text('Keluar ke'), findsOneWidget);
    expect(find.text('Hapus batch'), findsOneWidget);
    final deleteButton = tester.widget<OutlinedButton>(
        find.widgetWithText(OutlinedButton, 'Hapus batch'));
    deleteButton.onPressed!();
    await tester.pumpAndSettle();
    expect(find.text('Hapus batch?'), findsOneWidget);
    await tester.tap(find.text('Hapus'));
    await tester.pumpAndSettle();
    expect(api.deleted, contains('/inventory/mutation-report/out/1'));
  });

  test('mutation report request supports web filters and full page size',
      () async {
    final api = MutationReportApi();
    await api.mutationReport(
      type: 'out',
      start: '2026-09-01',
      end: '2026-09-14',
      branchId: '2',
      description: 'Shopee',
      limit: 500,
    );
    final request = api.requests
        .singleWhere((item) => item.$1 == '/inventory/mutation-report');
    expect(request.$2, {
      'type': 'out',
      'start': '2026-09-01',
      'end': '2026-09-14',
      'branch_id': '2',
      'description': 'Shopee',
      'limit': '500',
    });
  });
}
