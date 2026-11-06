import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';
import 'package:pos_pakaian_mobile/src/mutation_report_page.dart';
import 'package:pos_pakaian_mobile/src/product_form_page.dart';
import 'package:pos_pakaian_mobile/src/products_page.dart';
import 'package:pos_pakaian_mobile/src/stock_movements_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';
import 'package:pos_pakaian_mobile/src/transfer_history_page.dart';

import 'inventory_submission_test.dart' show InventoryApi;

class VisualInventoryApi extends InventoryApi {
  @override
  Future<List<dynamic>> products(
          {required int branchId, String search = ''}) async =>
      [
        {'id': 10, 'name': 'Denim', 'sku': 'D10', 'stock': 8, 'price': 120000},
      ];

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    if (path == '/products/categories') {
      return {
        'data': [
          {'id': 1, 'name': 'Denim'}
        ]
      };
    }
    if (path == '/inventory-control/transfers/history') {
      return {
        'data': [
          {
            'number': 'TR-1',
            'status': 'completed',
            'source': {'warehouse_name': 'Gudang A'},
            'destination': {'warehouse_name': 'Gudang B'},
            'total_qty': 8
          }
        ],
        'totalPages': 1
      };
    }
    if (path == '/inventory/mutations') {
      return {
        'data': [
          {'product_name': 'Denim', 'qty': 8, 'type': 'incoming'}
        ]
      };
    }
    return super.get(path, query);
  }
}

Future<void> mountInventory(WidgetTester tester, VisualInventoryApi api,
    Widget page, double width, Brightness brightness) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final auth = AuthStore(api)
    ..role = 'admin'
    ..branchId = 4;
  await tester.pumpWidget(ChangeNotifierProvider.value(
    value: auth,
    child: MaterialApp(
        theme: app.buildAnyostoreTheme(brightness: brightness),
        home: Scaffold(body: page)),
  ));
  await tester.pumpAndSettle();
  expect(tester.takeException(), isNull);
}

void expectSolidCards(WidgetTester tester, Brightness brightness) {
  for (final card in tester.widgetList<GlassCard>(find.byType(GlassCard))) {
    expect(card.frosted, isFalse);
  }
  final decorations = tester
      .widgetList<Container>(find.descendant(
          of: find.byType(GlassCard), matching: find.byType(Container)))
      .map((c) => c.decoration)
      .whereType<BoxDecoration>();
  expect(
      decorations.any((d) =>
          d.color ==
              (brightness == Brightness.dark
                  ? kTaskDarkSurface
                  : kTaskSurface) &&
          d.border != null &&
          d.gradient == null),
      isTrue);
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final width in [320.0, 390.0]) {
    for (final brightness in Brightness.values) {
      final variant = '$width ${brightness.name}';
      testWidgets('stock cards, grid, search and warehouse controls $variant',
          (tester) async {
        final api = VisualInventoryApi()..missingStockPhoto = true;
        await mountInventory(
            tester,
            api,
            InventoryPage(api: api, branchId: 4, role: 'admin'),
            width,
            brightness);
        expect(find.text('Denim'), findsOneWidget);
        expectSolidCards(tester, brightness);
        await tester.tap(find.byTooltip('Pilih gudang'));
        await tester.pumpAndSettle();
        expect(find.text('Gudang B'), findsWidgets);
        await tester.tap(find.text('Gudang B').last);
        await tester.pumpAndSettle();
        await tester.tap(find.byIcon(Icons.grid_view_outlined));
        await tester.pumpAndSettle();
        expect(find.text('Denim'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      for (final kind in ['incoming', 'outgoing']) {
        testWidgets(
            '$kind compact header, inline catalog, sticky cart and editable cart $variant',
            (tester) async {
          final api = VisualInventoryApi();
          await mountInventory(
              tester,
              api,
              InventoryPage(
                  api: api, branchId: 4, role: 'admin', initialSection: kind),
              width,
              brightness);
          final details = find.byKey(const ValueKey('inventory-inout-details'));
          expect(details, findsOneWidget);
          expect(tester.getSize(details).height, greaterThanOrEqualTo(76));
          final collapsedDetailsHeight = tester.getSize(details).height;
          expect(find.text('Gudang A'), findsOneWidget);
          expect(find.text('0 item'), findsOneWidget);
          expect(find.widgetWithText(TextField, 'Cari produk'), findsOneWidget);
          expect(find.text('Tambah Produk'), findsNothing);
          expect(find.byKey(const ValueKey('inventory-inout-cart-bar')),
              findsOneWidget);
          await tester.tap(details);
          await tester.pumpAndSettle();
          expect(tester.getSize(details).height,
              greaterThan(collapsedDetailsHeight));
          final dateLabel = find.text('Tanggal');
          expect(dateLabel, findsOneWidget);
          expect(tester.getTopLeft(dateLabel).dy,
              greaterThan(tester.getTopLeft(details).dy + 4));
          expect(find.text('Nomor batch / nota (opsional)'), findsOneWidget);
          final bar = tester.widget<AppBar>(find.byType(AppBar));
          expect(bar.backgroundColor, kTaskDark);
          final save = find.widgetWithText(FilledButton,
              kind == 'incoming' ? 'Simpan stok masuk' : 'Simpan stok keluar');
          expect(
              tester
                  .widget<FilledButton>(save)
                  .style!
                  .backgroundColor!
                  .resolve({}),
              kind == 'incoming' ? kTaskTeal : kTaskTerracotta);
          expect(tester.getSize(save).height, greaterThanOrEqualTo(44));
          expectSolidCards(tester, brightness);
          final grid = tester.widget<SliverGrid>(find.byType(SliverGrid).first);
          expect(
              (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
                  .crossAxisCount,
              3);
          expect(find.byKey(const ValueKey('inventory-inout-cart-bar')),
              findsOneWidget);
          await tester.tap(find.text('Denim').first);
          await tester.pumpAndSettle();
          await tester.enterText(find.widgetWithText(TextField, 'Jumlah'), '2');
          await tester.tap(find.text('Tambah').last);
          await tester.pumpAndSettle();
          expect(find.text('1 item'), findsOneWidget);
          expect(find.textContaining('Keranjang'), findsOneWidget);
          await tester
              .tap(find.byKey(const ValueKey('inventory-inout-cart-bar')));
          await tester.pumpAndSettle();
          expect(find.byKey(const ValueKey('inventory-inout-cart-sheet')),
              findsOneWidget);
          expect(find.byTooltip('Ubah jumlah'), findsOneWidget);
          await tester.tap(find.byTooltip('Ubah jumlah'));
          await tester.pumpAndSettle();
          await tester.enterText(
              find.widgetWithText(TextField, 'Jumlah *'), '3');
          await tester.tap(find.text('Simpan').last);
          await tester.pumpAndSettle();
          expect(find.text('3 pcs'), findsWidgets);
          await tester.tap(find.byTooltip('Tutup keranjang'));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          expect(api.posts, isEmpty);
        });
      }

      testWidgets('product list controls and variant/media form $variant',
          (tester) async {
        final api = VisualInventoryApi();
        await mountInventory(tester, api, ProductsPage(api: api, branchId: 4),
            width, brightness);
        expect(find.text('Denim'), findsOneWidget);
        expectSolidCards(tester, brightness);
        for (final tooltip in [
          'Cetak label harga',
          'Salin produk',
          'Hapus produk'
        ]) {
          expect(tester.getSize(find.byTooltip(tooltip)).shortestSide,
              greaterThanOrEqualTo(44));
        }
        await tester.tap(find.text('Tambah Produk'));
        await tester.pumpAndSettle();
        expect(find.byType(ProductFormPage), findsOneWidget);
        final form = find.byType(ProductFormPage);
        await tester.scrollUntilVisible(
            find
                .descendant(
                    of: form, matching: find.text('Varian (warna/ukuran)'))
                .first,
            180,
            scrollable: find.byType(Scrollable).last);
        await tester.tap(find.widgetWithText(TextButton, 'Tambah').first);
        await tester.pumpAndSettle();
        final panel = tester.widget<Container>(find
            .ancestor(
                of: find.widgetWithText(TextField, 'Warna'),
                matching: find.byWidgetPredicate(
                    (w) => w is Container && w.decoration is BoxDecoration))
            .first);
        expect((panel.decoration as BoxDecoration).color,
            brightness == Brightness.dark ? kTaskDarkSurface : kTaskSurface);
        await tester.scrollUntilVisible(
            find.descendant(of: form, matching: find.text('Foto Produk')).first,
            200,
            scrollable: find.byType(Scrollable).last);
        expect(find.text('Tambah Foto'), findsOneWidget);
        final formScroll = find.byType(Scrollable).last;
        await tester.drag(formScroll, const Offset(0, -560));
        await tester.pumpAndSettle();
        await tester.drag(formScroll, const Offset(0, -560));
        await tester.pumpAndSettle();
        expect(find.text('Simpan Produk').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets('transfer history and stock reports $variant',
          (tester) async {
        final api = VisualInventoryApi();
        await mountInventory(
            tester, api, TransferHistoryPage(api: api), width, brightness);
        expect(find.text('TR-1'), findsOneWidget);
        expect(find.text('Selesai'), findsOneWidget);
        expect(find.text('Arah'), findsOneWidget);
        expectSolidCards(tester, brightness);
        await mountInventory(tester, api,
            StockMovementsPage(api: api, branchId: 4), width, brightness);
        expect(find.text('Denim'), findsOneWidget);
        expectSolidCards(tester, brightness);
        await mountInventory(
            tester, api, MutationReportPage(api: api), width, brightness);
        final masuk = find.ancestor(
            of: find.text('Masuk'), matching: find.byType(InkWell));
        expect(tester.getSize(masuk).height, greaterThanOrEqualTo(44));
        await tester.tap(find.text('Keluar'));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
      });
    }
  }
}
