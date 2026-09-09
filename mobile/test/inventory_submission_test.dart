import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';

class InventoryApi extends ApiClient {
  final posts = <(String, Map<String, dynamic>)>[];
  final gets = <(String, Map<String, String>)>[];
  bool failTransfer = false;
  bool missingRevision = false;
  Completer<Map<String, dynamic>>? pendingStock;

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    gets.add((path, query ?? {}));
    if (path == '/inventory/stock' && pendingStock != null) {
      return pendingStock!.future;
    }
    final Object data = switch (path) {
      '/inventory/stock-total' => {
          'products': <Object>[], 'summary': <String, dynamic>{}
        },
      '/inventory/warehouses' => [
          {'id': 1, 'name': 'Gudang A'},
          {'id': 2, 'name': 'Gudang B'},
        ],
      '/inventory-control/store-targets' => [
          {'warehouse_id': 2, 'name': 'Toko B', 'warehouse_name': 'Gudang B'},
        ],
      '/inventory/stock' => [
          {
            'product_id': 10,
            'variant_id': 20,
            'name': 'Denim',
            'sku': 'D10',
            'variant_color': 'Biru',
            'variant_size': 'M',
            'quantity': 8,
            if (!missingRevision) 'stock_revision': '9007199254740993',
          },
          {
            'product_id': 11,
            'variant_id': null,
            'name': 'Rompi',
            'sku': 'R11',
            'quantity': 3,
            'stock_revision': '0',
          },
        ],
      '/inventory/incoming/products' => [
          {
            'id': 10,
            'name': 'Denim',
            'sku': 'D10',
            'stock': 8,
            'variants': <Object>[],
          },
        ],
      _ => throw StateError('Unexpected request $path'),
    };
    return {'success': true, 'data': data};
  }

  @override
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    posts.add((path, jsonDecode(jsonEncode(body)) as Map<String, dynamic>));
    if (failTransfer && path.contains('/transfers')) {
      throw ApiException('Respons terputus', isNetwork: true);
    }
    return {'success': true};
  }
}

Future<void> openSection(
    WidgetTester tester, InventoryApi api, String section) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: InventoryPage(api: api, branchId: 4, role: 'admin'))));
  await tester.pumpAndSettle();
  await tester.tap(find.text(section));
  await tester.pumpAndSettle();
}

Future<void> addOpname(WidgetTester tester, {String count = '0'}) async {
  await tester.tap(find.text('Tambah Item (stok fisik)'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Denim').first);
  await tester.pumpAndSettle();
  await tester.enterText(find.widgetWithText(TextField, 'Stok fisik (dihitung)'), count);
  await tester.tap(find.text('Tambah'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Selesai (1)'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('opname sends only counted item with unchanged stock snapshot',
      (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Opname');
    await addOpname(tester);
    await tester.tap(find.text('Simpan Opname'));
    await tester.pumpAndSettle();
    expect(api.gets.where((r) => r.$1 == '/inventory/stock').single.$2,
        {'branch_id': '4', 'warehouse_id': '1'});
    expect(api.posts.single.$2['items'], [
      {
        'product_id': 10,
        'variant_id': 20,
        'physical_stock': 0,
        'expected_stock': 8,
        'expected_revision': '9007199254740993',
      }
    ]);
  });

  testWidgets('opname blank count stays in dialog with an error', (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Opname');
    await tester.tap(find.text('Tambah Item (stok fisik)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Denim').first);
    await tester.pumpAndSettle();
    final field = find.widgetWithText(TextField, 'Stok fisik (dihitung)');
    expect(tester.widget<TextField>(field).controller!.text, isEmpty);
    await tester.tap(find.text('Tambah'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.text('Isi stok fisik dengan angka 0 atau lebih.'), findsOneWidget);
    expect(api.posts, isEmpty);
  });

  testWidgets('changing opname warehouse clears counted items', (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Opname');
    await addOpname(tester, count: '7');
    await tester.tap(find.text('Gudang A').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Gudang B').last);
    await tester.pumpAndSettle();
    expect(find.text('Denim'), findsNothing);
    await tester.tap(find.text('Simpan Opname'));
    await tester.pumpAndSettle();
    expect(api.posts, isEmpty);
  });

  testWidgets('missing revision cannot silently send unguarded opname',
      (tester) async {
    final api = InventoryApi()..missingRevision = true;
    await openSection(tester, api, 'Opname');
    await tester.tap(find.text('Tambah Item (stok fisik)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Denim').first);
    await tester.pumpAndSettle();
    expect(find.text('Snapshot stok tidak lengkap. Muat ulang daftar item.'),
        findsOneWidget);
    expect(api.posts, isEmpty);
  });

  testWidgets('transfer retry reuses UUID and edited transfer gets new UUID',
      (tester) async {
    final api = InventoryApi()..failTransfer = true;
    await openSection(tester, api, 'Transfer');
    await tester.tap(find.text('Tambah Item'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Denim').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tambah'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Selesai (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Proses Transfer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Proses Transfer'));
    await tester.pumpAndSettle();
    final firstId = api.posts[0].$2['client_transfer_id'];
    expect(firstId, matches(RegExp(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(api.posts[1].$2['client_transfer_id'], firstId);
    await tester.enterText(find.widgetWithText(TextField, 'Keterangan'), 'Revisi');
    await tester.tap(find.text('Proses Transfer'));
    await tester.pumpAndSettle();
    expect(api.posts[2].$2['client_transfer_id'], isNot(firstId));
  });
}
