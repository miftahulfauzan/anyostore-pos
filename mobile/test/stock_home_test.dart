import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';
import 'package:pos_pakaian_mobile/src/stock_status_donut.dart';

/// Fake API untuk halaman Stok Produk (seksi 'stok') — redesign Opsi D.
class StockHomeApi extends ApiClient {
  int stockTotalCalls = 0;
  bool emptyStock = false;
  bool noWarehouses = false;

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
      // Semantik backend riil (backend/src/routes/inventory.js): low_stock
      // memakai total_stock <= min_stock — termasuk produk habis. UI harus
      // tetap konsisten dengan baris yang benar-benar ditampilkan.
      'summary': <String, dynamic>{
        'total_products': 4,
        'total_stock': 77,
        'low_stock': 2,
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
      '/inventory/warehouses' || '/inventory/warehouses/all' => noWarehouses
          ? <Object>[]
          : [
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

  testWidgets('baris chip aksi dihapus: pintu mutasi lewat sidebar',
      (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    // Semua pintu (Masuk/Keluar/Transfer/Opname) kini hanya di menu Lainnya.
    expect(find.text('Masuk'), findsNothing);
    expect(find.text('Keluar'), findsNothing);
    expect(find.text('Transfer'), findsNothing);
    expect(find.text('Opname'), findsNothing);
    // Baris kontrol tinggal: chip filter + cari + sort.
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Menipis'), findsOneWidget);
    expect(find.text('Habis'), findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-stock-search-field')),
        findsOneWidget);
    expect(
        find.byKey(const ValueKey('inventory-sort-button')), findsOneWidget);
  });

  testWidgets('form stok masuk tetap bisa dibuka via initialSection',
      (tester) async {
    final api = StockHomeApi();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: InventoryPage(
                api: api,
                branchId: 4,
                role: 'gudang',
                initialSection: 'incoming'))));
    await tester.pumpAndSettle();
    expect(find.text('Simpan stok masuk'), findsOneWidget);
  });

  testWidgets('filter chip menipis menyaring daftar', (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api);
    expect(find.text('Denim Highwaist Bells'), findsOneWidget);

    await tester.tap(find.text('Menipis'));
    await tester.pumpAndSettle();
    expect(find.text('Kulot Denim Premium'), findsOneWidget);
    expect(find.text('Denim Highwaist Bells'), findsNothing);
    expect(find.text('Menipis'), findsOneWidget);

    await tester.tap(find.text('Semua'));
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

  testWidgets('legend hero & chip filter konsisten dengan baris (semantik backend)',
      (tester) async {
    // Backend menghitung low_stock termasuk produk habis (low_stock: 2 di
    // fake). Legenda donut harus mengikuti baris yang tampil: 2 aman,
    // 1 menipis, 1 habis. Chip filter kini tanpa angka — angka hidup di
    // legenda hero.
    final api = StockHomeApi();
    await pumpHome(tester, api);
    expect(find.text('Semua'), findsOneWidget);
    expect(find.text('Menipis'), findsOneWidget);
    expect(find.text('Habis'), findsOneWidget);
    expect(find.text('Menipis 1'), findsOneWidget);
    expect(find.text('Aman 2'), findsOneWidget);
    expect(find.text('Habis 1'), findsOneWidget);
  });

  testWidgets('owner memilih semua toko/gudang: label scope ikut berubah',
      (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api, role: 'owner');
    await tester.tap(find.byTooltip('Pilih gudang'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Semua toko/gudang'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Semua toko/gudang'), findsOneWidget);
    expect(find.textContaining(' · Gudang'), findsNothing);
  });

  testWidgets('subteks scope tanpa pilihan tersedia tidak menawarkan ketukan',
      (tester) async {
    final api = StockHomeApi()..noWarehouses = true;
    await pumpHome(tester, api, role: 'kasir');
    expect(find.byTooltip('Pilih gudang'), findsNothing);
    expect(find.byIcon(Icons.expand_more), findsNothing);
    expect(find.text('TOTAL STOK'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('kasir: tanpa baris chip aksi dan tanpa item terlarang di ⋮',
      (tester) async {
    final api = StockHomeApi();
    await pumpHome(tester, api, role: 'kasir');
    // Seluruh chip aksi dihapus untuk semua role.
    expect(find.text('Masuk'), findsNothing);
    expect(find.text('Keluar'), findsNothing);
    expect(find.text('Transfer'), findsNothing);
    expect(find.text('Opname'), findsNothing);

    await tester.tap(find.byTooltip('Opsi inventori'));
    await tester.pumpAndSettle();
    expect(find.text('Mutasi'), findsNothing);
    expect(find.text('Riwayat Transfer'), findsNothing);
    expect(find.text('Cetak Barcode'), findsOneWidget);
  });

  testWidgets('menu ⋮ hero memakai warna dropdown tema di mode gelap',
      (tester) async {
    final api = StockHomeApi();
    await tester.pumpWidget(MaterialApp(
        theme: app.buildAnyostoreTheme(brightness: Brightness.dark),
        home: Scaffold(
            body: InventoryPage(
                api: api, branchId: 4, role: 'gudang'))));
    await tester.pumpAndSettle();
    // Menu tidak boleh hardcode putih — di mode gelap teks item (terang)
    // jadi tak terbaca di permukaan putih.
    for (final button in tester.widgetList<PopupMenuButton<String>>(
        find.byType(PopupMenuButton<String>))) {
      expect(button.color, isNot(Colors.white));
    }
    await tester.tap(find.byTooltip('Opsi inventori'));
    await tester.pumpAndSettle();
    expect(find.text('Cetak Barcode'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
