import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';
import 'package:pos_pakaian_mobile/src/stock_status_donut.dart';

/// Fake API untuk halaman Stok Produk (seksi 'stok') — redesign Opsi D.
class StockHomeApi extends ApiClient {
  int stockTotalCalls = 0;
  bool emptyStock = false;

  Map<String, dynamic> get _stockData {
    if (emptyStock) {
      return {
        'products': <Object>[],
        'summary': <String, dynamic>{},
      };
    }

    return {
      'products': <Object>[
        {
          'id': 10,
          'name': 'Denim Highwaist Bells',
          'sku': 'DW-HWB-01',
          'branch_name': 'BASIK',
          'total_stock': 24,
          'min_stock': 10,
        },
        {
          'id': 11,
          'name': 'Kulot Denim Premium',
          'sku': 'DW-KDP-02',
          'branch_name': 'BASIK',
          'total_stock': 8,
          'min_stock': 10,
        },
        {
          'id': 12,
          'name': 'Rok Denim A-Line',
          'sku': 'DW-RDA-03',
          'branch_name': 'BASIK',
          'total_stock': 0,
          'min_stock': 5,
        },
        {
          'id': 13,
          'name': 'Mom Jeans Straight',
          'sku': 'DW-MJS-04',
          'branch_name': 'BASIK',
          'total_stock': 45,
          'min_stock': 15,
        },
      ],
      'summary': <String, dynamic>{
        'total_products': 4,
        'total_stock': 77,
        'low_stock': 1,
        'out_of_stock': 1,
      },
    };
  }

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    if (path == '/inventory/stock-total') stockTotalCalls++;
    final Object data = switch (path) {
      '/inventory/stock-total' => _stockData,
      '/inventory/warehouses' || '/inventory/warehouses/all' => [
          {'id': 1, 'name': 'Gudang A'},
          {'id': 2, 'name': 'Gudang B'},
        ],
      '/inventory/incoming/targets' => <Object>[],
      '/inventory/channels' => <Object>[],
      '/inventory/incoming/products' => <Object>[],
      '/inventory/mutations' => <Object>[],
      _ => throw StateError('Unexpected get $path'),
    };
    return {'success': true, 'data': data};
  }

  @override
  Future<List<dynamic>> products({
    required int branchId,
    String search = '',
  }) async =>
      const [];

  @override
  Future<List<dynamic>> branches() async => const [];
}

Future<void> pumpHome(WidgetTester tester, ApiClient api, {String? role}) async {
  await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: InventoryPage(
              api: api, branchId: 4, role: role ?? 'gudang'))));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('hero ringkasan menampilkan total stok dan donut status',
      (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    expect(find.text('TOTAL STOK'), findsOneWidget);
    expect(find.text('77'), findsOneWidget);
    expect(find.text('4'), findsOneWidget);
    expect(find.byType(StockStatusDonut), findsOneWidget);
    expect(api.stockTotalCalls, greaterThanOrEqualTo(1));
  });

  testWidgets('chip aksi gudang tersedia dan Masuk membuka form penuh',
      (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    expect(find.text('Masuk'), findsOneWidget);
    expect(find.text('Keluar'), findsOneWidget);
    // PillTabs seksi lama masih tampil di task ini; chip aksi ada di bawahnya.
    expect(find.text('Transfer'), findsWidgets);
    expect(find.text('Opname'), findsWidgets);

    final callsBefore = api.stockTotalCalls;
    await tester.tap(find.text('Masuk'));
    await tester.pumpAndSettle();
    expect(find.text('Simpan stok masuk'), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(api.stockTotalCalls, greaterThan(callsBefore));
  });

  testWidgets('filter chip menipis menyaring daftar', (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    expect(find.text('Denim Highwaist Bells'), findsOneWidget);

    await tester.tap(find.text('Menipis · 1'));
    await tester.pumpAndSettle();
    expect(find.text('Kulot Denim Premium'), findsOneWidget);
    expect(find.text('Denim Highwaist Bells'), findsNothing);
    expect(find.text('Menipis · 1'), findsOneWidget);

    await tester.tap(find.text('Semua · 4'));
    await tester.pumpAndSettle();
    expect(find.text('Denim Highwaist Bells'), findsOneWidget);
  });

  testWidgets('hero sub-line membuka pemilih gudang', (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    await tester.tap(find.byTooltip('Pilih gudang'));
    await tester.pumpAndSettle();
    expect(find.text('Gudang B'), findsWidgets);
    final callsBefore = api.stockTotalCalls;
    await tester.tap(find.text('Gudang B').last);
    await tester.pumpAndSettle();
    expect(api.stockTotalCalls, greaterThan(callsBefore));
  });

  testWidgets('baris stok flat menampilkan angka dan label status',
      (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    expect(find.text('Denim Highwaist Bells'), findsOneWidget);
    expect(find.text('24'), findsWidgets);
    expect(find.text('AMAN'), findsNWidgets(2));
    expect(find.text('MENIPIS'), findsOneWidget);
    expect(find.text('HABIS'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('summary kosong menampilkan empty state tanpa error',
      (tester) async {
    final api = StockHomeApi()..emptyStock = true;
    await pumpHome(tester, api);
    expect(find.text('TOTAL STOK'), findsOneWidget);
    expect(find.text('Belum ada produk'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
