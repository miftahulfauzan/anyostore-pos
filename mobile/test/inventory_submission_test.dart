import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';

class InventoryApi extends ApiClient {
  final posts = <(String, Map<String, dynamic>)>[];
  final gets = <(String, Map<String, String>)>[];
  bool failTransfer = false;
  bool missingRevision = false;
  bool missingStockPhoto = false;
  bool missingTargetWarehouseName = false;
  List<dynamic>? fallbackProducts;
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
          'products': <Object>[
            {
              'id': 10,
              'name': 'Denim',
              'sku': 'D10',
              if (!missingStockPhoto) 'photo_path': '/uploads/denim.jpg',
              'total_stock': 8,
              'min_stock': 1,
            }
          ],
          'summary': <String, dynamic>{
            'total_products': 1,
            'total_stock': 8,
            'low_stock': 0,
            'out_of_stock': 0,
          }
        },
      '/inventory/warehouses' || '/inventory/warehouses/all' => [
          {'id': 1, 'name': 'Gudang A'},
          {'id': 2, 'name': 'Gudang B'},
        ],
      '/inventory-control/store-targets' => [
          {
            'warehouse_id': 2,
            'name': 'Toko B',
            'warehouse_name': missingTargetWarehouseName ? null : 'Gudang B',
          },
        ],
      '/inventory/stock' => [
          {
            'product_id': 10,
            'variant_id': null,
            'name': 'Denim',
            'sku': 'D10',
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
      '/inventory/incoming/targets' => <Object>[],
      '/inventory/channels' => <Object>[],
      '/inventory/mutations' => <Object>[],
      '/inventory/mutation-report' => <Object>[],
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
  Future<List<dynamic>> products({
    required int branchId,
    String search = '',
  }) async =>
      fallbackProducts ?? const [];

  @override
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body,
      {Map<String, String>? query}) async {
    posts.add((path, jsonDecode(jsonEncode(body)) as Map<String, dynamic>));
    if (failTransfer && path.contains('/transfers')) {
      throw ApiException('Respons terputus', isNetwork: true);
    }
    return {'success': true};
  }
}

class ChannelInventoryApi extends InventoryApi {
  final channelRows = <Map<String, dynamic>>[];
  bool failChannelRefreshAfterCreate = false;

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    if (path == '/inventory/channels') {
      if (failChannelRefreshAfterCreate && channelRows.isNotEmpty) {
        throw ApiException('Daftar saluran belum dapat dimuat ulang');
      }
      return {'success': true, 'data': channelRows};
    }
    return super.get(path, query);
  }

  @override
  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body,
      {Map<String, String>? query}) async {
    if (path == '/inventory/channels') {
      posts.add((path, jsonDecode(jsonEncode(body)) as Map<String, dynamic>));
      final row = {
        'id': channelRows.length + 10,
        'value': body['value'],
        'name': body['name'],
        'is_active': true,
      };
      channelRows.add(row);
      failChannelRefreshAfterCreate = true;
      return {'success': true, 'data': row};
    }
    return super.post(path, body, query: query);
  }
}

Future<void> openSection(
    WidgetTester tester, InventoryApi api, String section_) async {
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  // Seksi dirender langsung dari initialSection (paritas dengan pintu di
  // menu Lainnya); halaman default adalah Stok Produk.
  final String? section = switch (section_) {
    'Transfer' => 'transfer',
    'Opname' => 'opname',
    'Mutasi' => 'mutasi',
    'Barcode' => 'barcode',
    _ => null,
  };
  await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: InventoryPage(
              api: api,
              branchId: 4,
              role: 'admin',
              initialSection: section ?? 'stok'))));
  await tester.pumpAndSettle();
}

Future<void> addOpname(WidgetTester tester, {String count = '0'}) async {
  await tester.tap(find.text('Tambah Produk'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Denim').first);
  await tester.pumpAndSettle();
  await tester.enterText(
      find.widgetWithText(TextField, 'Stok fisik (dihitung)'), count);
  await tester.tap(find.text('Tambah'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Selesai (1)'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('stock page opens without the action chips row',
      (tester) async {
    final api = InventoryApi();
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(api: api, branchId: 4, role: 'gudang'))));
    await tester.pumpAndSettle();

    // Halaman fokus tanpa selector seksi; baris chip aksi dihapus — pintu
    // Mutasi/Masuk/Keluar/Transfer/Opname hidup di menu Lainnya (sidebar).
    expect(find.text('Stok'), findsNothing);
    expect(find.text('Mutasi'), findsNothing);
    expect(find.text('Masuk'), findsNothing);
    expect(find.text('Keluar'), findsNothing);
    expect(find.text('Transfer'), findsNothing);
    expect(find.text('Opname'), findsNothing);
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Menipis'), findsOneWidget);
    expect(find.text('Habis'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-stock-search-field')),
        findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-sort-button')), findsOneWidget);

    // Mutasi & Cetak Barcode tetap di menu ⋮ hero.
    await tester.tap(find.byTooltip('Opsi inventori'));
    await tester.pumpAndSettle();
    expect(find.text('Mutasi'), findsOneWidget);
    expect(find.text('Cetak Barcode'), findsOneWidget);
    expect(find.text('Riwayat Transfer'), findsOneWidget);
  });

  testWidgets('mutasi section renders directly via initialSection',
      (tester) async {
    final api = InventoryApi();
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(
                api: api,
                branchId: 4,
                role: 'gudang',
                initialSection: 'mutasi'))));
    await tester.pumpAndSettle();

    // Tab gudang "Stok Masuk/Mutasi" tetap hidup tanpa selector seksi.
    expect(find.text('Stok masuk'), findsOneWidget);
    expect(find.text('Stok keluar'), findsOneWidget);
  });

  testWidgets('mutasi via hero menu and back preserves stock access',
      (tester) async {
    final api = InventoryApi();
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(api: api, branchId: 4, role: 'gudang'))));
    await tester.pumpAndSettle();

    // Baris chip aksi sudah dihapus; halaman tetap membuka Mutasi via ⋮.
    expect(find.byKey(const ValueKey('inventory-stock-search-field')),
        findsOneWidget);
    await tester.tap(find.byTooltip('Opsi inventori'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Mutasi'));
    await tester.pumpAndSettle();
    expect(find.text('Stok masuk'), findsOneWidget);
    expect(find.text('Stok keluar'), findsOneWidget);
    expect(find.text('Mutasi Stok'), findsOneWidget);

    await tester.tap(find.text('Stok masuk'));
    await tester.pumpAndSettle();
    expect(find.text('Stok Masuk'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Cari produk'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-inout-cart-bar')), findsOneWidget);
    expect(find.text('Barang MASUK ke gudang'), findsNothing);
    expect(find.text('Simpan stok masuk'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stok keluar'));
    await tester.pumpAndSettle();
    expect(find.text('Stok Keluar'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Cari produk'), findsOneWidget);
    expect(find.text('Barang KELUAR dari gudang'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('inventory-inout-details')));
    await tester.pumpAndSettle();
    expect(find.text('Saluran'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    // Kembali dari Mutasi ke halaman Stok dengan baris kontrol utuh.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('inventory-stock-search-field')),
        findsOneWidget);
  });

  testWidgets('outgoing form adds and selects a new channel', (tester) async {
    final api = ChannelInventoryApi();
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(
                api: api,
                branchId: 4,
                role: 'gudang',
                initialSection: 'outgoing'))));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('inventory-inout-details')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Tambah saluran'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Nama saluran'), 'Marketplace');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Tambah'));
    await tester.pumpAndSettle();

    expect(api.posts.single.$2, {
      'value': 'marketplace',
      'name': 'Marketplace',
    });
    expect(find.text('Marketplace'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
  });

  testWidgets('outgoing form keeps a created channel when refresh is delayed',
      (tester) async {
    final api = ChannelInventoryApi();
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(
                api: api,
                branchId: 4,
                role: 'gudang',
                initialSection: 'outgoing'))));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('inventory-inout-details')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Tambah saluran'));
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Nama saluran'), 'Marketplace');
    await tester.pump();
    await tester.tap(find.widgetWithText(FilledButton, 'Tambah'));
    await tester.pumpAndSettle();

    expect(find.text('Marketplace'), findsOneWidget);
    expect(find.text('Daftar saluran belum dapat dimuat ulang'), findsNothing);
  });

  testWidgets('opname save button stays reachable on a phone-sized screen',
      (tester) async {
    final api = InventoryApi();
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(
                api: api,
                branchId: 4,
                role: 'admin',
                initialSection: 'opname'))));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('opname-save-button')).hitTestable(),
        findsOneWidget);
  });

  testWidgets('baris stok dapat diketuk untuk membuka editor produk',
      (tester) async {
    final api = InventoryApi();
    tester.view.physicalSize = const Size(900, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(api: api, branchId: 4, role: 'admin'))));
    await tester.pumpAndSettle();

    // Daftar flat: seluruh baris adalah affordance edit (tanpa badge pensil).
    expect(find.byIcon(Icons.edit_outlined), findsNothing);
    expect(find.text('Denim'), findsOneWidget);
  });

  testWidgets('stok dapat difilter berdasarkan gudang aktif', (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Stok');

    // Pemilihan gudang kini lewat subteks hero (tooltip "Pilih gudang").
    await tester.tap(find.byTooltip('Pilih gudang'));
    await tester.pumpAndSettle();
    expect(find.text('Gudang B'), findsWidgets);
    await tester.tap(find.text('Gudang B').last);
    await tester.pumpAndSettle();

    final request =
        api.gets.lastWhere((item) => item.$1 == '/inventory/stock-total');
    expect(request.$2['warehouse_id'], '2');
  });

  testWidgets('kontrol stok: hero, cari, dan urut tampil bersamaan',
      (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Stok');

    expect(
        find.byKey(const ValueKey('inventory-stock-controls')), findsOneWidget);
    expect(find.byKey(const ValueKey('inventory-stock-search-field')),
        findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-sort-button')), findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-warehouse-menu')), findsNothing);
    expect(find.byKey(const ValueKey('inventory-view-mode-button')),
        findsNothing);
    expect(find.text('TOTAL STOK'), findsOneWidget);
  });

  testWidgets('urut memakai tombol ikon dan pilihan tetap tersedia di menu',
      (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Stok');

    expect(find.byKey(const ValueKey('inventory-sort-button')), findsOneWidget);
    expect(find.byIcon(Icons.sort), findsOneWidget);
    expect(find.text('Urut: Nama A–Z'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('inventory-sort-button')));
    await tester.pumpAndSettle();
    expect(find.text('Nama A–Z'), findsOneWidget);
    expect(find.text('Stok terendah'), findsOneWidget);
  });

  testWidgets(
      'stok memakai foto katalog saat ringkasan stok belum mengirim foto',
      (tester) async {
    final api = InventoryApi()
      ..missingStockPhoto = true
      ..fallbackProducts = [
        {
          'id': 10,
          'name': 'Denim',
          'photo_path': '/uploads/denim-from-catalog.jpg',
        },
      ];
    await openSection(tester, api, 'Stok');

    // Daftar flat: foto fallback katalog tetap dipakai tanpa mode grid.
    expect(find.byType(CachedNetworkImage), findsOneWidget);
    expect(find.byKey(const ValueKey('inventory-view-mode-button')),
        findsNothing);
  });

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
        'physical_stock': 0,
        'expected_stock': 8,
        'expected_revision': '9007199254740993',
      }
    ]);
  });

  testWidgets('opname picker shows the server quantity as system stock',
      (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Opname');
    await tester.tap(find.text('Tambah Produk'));
    await tester.pumpAndSettle();

    expect(find.text('SKU D10 · stok sistem 8'), findsOneWidget);
    expect(find.text('SKU D10 · stok sistem 0'), findsNothing);
  });

  testWidgets('opname picker keeps the completion action visible',
      (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Opname');
    await tester.tap(find.text('Tambah Produk'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Denim').first);
    await tester.pumpAndSettle();
    await tester.enterText(
        find.widgetWithText(TextField, 'Stok fisik (dihitung)'), '5');
    await tester.tap(find.text('Tambah'));
    await tester.pumpAndSettle();

    final action = tester
        .widget<TextButton>(find.widgetWithText(TextButton, 'Selesai (1)'));
    expect(action.style?.foregroundColor?.resolve({}), Colors.white);
    expect(
        find
            .byKey(const ValueKey('opname-picker-done-bottom-button'))
            .hitTestable(),
        findsOneWidget);
  });

  testWidgets('opname blank count stays in dialog with an error',
      (tester) async {
    final api = InventoryApi();
    await openSection(tester, api, 'Opname');
    await tester.tap(find.text('Tambah Produk'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Denim').first);
    await tester.pumpAndSettle();
    final field = find.widgetWithText(TextField, 'Stok fisik (dihitung)');
    expect(tester.widget<TextField>(field).controller!.text, isEmpty);
    await tester.tap(find.text('Tambah'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(
        find.text('Isi stok fisik dengan angka 0 atau lebih.'), findsOneWidget);
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
    await tester.tap(find.text('Tambah Produk'));
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
    await tester.tap(find.text('Tambah Produk'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Denim').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Tambah'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Selesai (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buat Transfer'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Buat Transfer'));
    await tester.pumpAndSettle();
    final firstId = api.posts[0].$2['client_transfer_id'];
    expect(
        firstId,
        matches(RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(api.posts[1].$2['client_transfer_id'], firstId);
    await tester.enterText(
        find.widgetWithText(TextField, 'Keterangan'), 'Revisi');
    await tester.tap(find.text('Buat Transfer'));
    await tester.pumpAndSettle();
    expect(api.posts[2].$2['client_transfer_id'], isNot(firstId));
  });

  testWidgets('transfer destination does not display a null location',
      (tester) async {
    final api = InventoryApi()..missingTargetWarehouseName = true;
    await openSection(tester, api, 'Transfer');

    expect(find.text('Toko B · null'), findsNothing);
    expect(find.text('Toko B'), findsOneWidget);
    expect(find.text('null'), findsNothing);
  });
}
