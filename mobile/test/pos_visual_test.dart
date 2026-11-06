import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/branch_scope.dart';
import 'package:pos_pakaian_mobile/src/history_tab.dart';
import 'package:pos_pakaian_mobile/src/payment_sheet.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';
import 'package:pos_pakaian_mobile/src/ui_kit.dart';

class PosVisualApi extends ApiClient {
  @override
  Future<List<dynamic>> products(
          {required int branchId, String search = ''}) async =>
      [
        {
          'id': 10,
          'name': 'Kemeja Denim',
          'sku': 'D10',
          'price': 275000,
          'stock': 24,
          'variant_count': 0,
          'category_name': 'Denim',
          'photo_path': '/uploads/denim.jpg'
        },
        {
          'id': 11,
          'name': 'Celana Denim',
          'sku': 'D11',
          'price': 195000,
          'stock': 12,
          'variant_count': 0,
          'category_name': 'Celana'
        },
      ];
  @override
  Future<List<dynamic>> warehouses(int branchId) async => [
        {'id': 1, 'name': 'Gudang Utama', 'branch_id': 4},
        {'id': 2, 'name': 'Gudang Cadangan', 'branch_id': 4},
      ];
  @override
  Future<List<dynamic>> customers({String search = ''}) async => [];
  @override
  Future<Map<String, dynamic>> storeSettings() async => {};
  @override
  Future<Map<String, dynamic>> productsVersion({required int branchId}) async =>
      {};
  @override
  Future<List<dynamic>> branches() async => [
        {'id': 4, 'name': 'Anyostore Metro'},
        {'id': 5, 'name': 'Toko B'},
      ];
  @override
  Future<Map<String, dynamic>> product(int id, {required int branchId}) async =>
      {'id': id, 'variants': []};
  @override
  Future<Map<String, dynamic>> previewTransaction(
          Map<String, dynamic> body) async =>
      {'subtotal': 275000, 'grand_total': 275000, 'items': []};
  @override
  Future<(List<dynamic>, int)> transactionsPage(
          {int page = 1,
          int limit = 50,
          String? dateFrom,
          String? dateTo,
          String? status,
          String? search}) async =>
      (
        [
          {
            'id': 8,
            'invoice_no': 'INV-20261103-B4-0008',
            'grand_total': 275000,
            'payment_method': 'cash',
            'status': 'completed',
            'transaction_date': '2026-11-03',
            'created_at': '2026-11-03 10:00:00',
            'cashier': 'Ayu'
          },
        ],
        1
      );
  @override
  Future<Map<String, dynamic>> transactionDetail(int id) async => {
        'id': id,
        'invoice_no': 'INV-20261103-B4-0008',
        'status': 'completed',
        'transaction_date': '2026-11-03',
        'created_at': '2026-11-03 10:00:00',
        'subtotal': 275000,
        'grand_total': 275000,
        'amount_paid': 300000,
        'change': 25000,
        'payment_method': 'cash',
        'items': [
          {
            'product_name': 'Kemeja Denim',
            'quantity': 1,
            'price': 275000,
            'subtotal': 275000
          }
        ],
      };
}

Future<void> showPosSurface(
    WidgetTester tester, Widget child, double width, Brightness brightness,
    {AuthStore? auth, double textScale = 1}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  Widget root = MaterialApp(
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context)
              .copyWith(textScaler: TextScaler.linear(textScale)),
          child: child!),
      theme: app.buildAnyostoreTheme(brightness: brightness),
      home: Scaffold(body: child));
  if (auth != null) {
    root = ChangeNotifierProvider.value(value: auth, child: root);
  }
  await tester.pumpWidget(root);
  await tester.pumpAndSettle();
}

double _contrastRatio(Color foreground, Color background) {
  final light = foreground.computeLuminance();
  final dark = background.computeLuminance();
  final brighter = light > dark ? light : dark;
  final dimmer = light > dark ? dark : light;
  return (brighter + 0.05) / (dimmer + 0.05);
}

void main() {
  setUpAll(() => databaseFactory = databaseFactorySqflitePlugin);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    BranchScope.active.value = 4;
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
        const MethodChannel('com.tekartik.sqflite'),
        (call) async => switch (call.method) {
              'getDatabasesPath' => '/tmp',
              'openDatabase' => {'id': 1},
              'query' => <Map<String, dynamic>>[],
              'batch' => <Object?>[],
              _ => null,
            });
    messenger.setMockMethodCallHandler(
        const MethodChannel('dev.fluttercommunity.plus/connectivity_status'),
        (call) async => null);
  });

  testWidgets(
      'large text keeps POS cart and payment action reachable at 320 px',
      (tester) async {
    final api = PosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth, textScale: 1.4);
    await tester.tap(find.text('Kemeja Denim'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Bayar'));
    await tester.pumpAndSettle();
    expect(find.text('Bayar · Rp275.000').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    await showPosSurface(
        tester, const PaymentSheet(grandTotal: 275000), 320, Brightness.dark,
        textScale: 1.4);
    expect(find.text('Selesaikan pembayaran').hitTestable(), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('POS exposes a Draft quick action in the app bar',
      (tester) async {
    final api = PosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);
    expect(find.byTooltip('Buka Draft'), findsOneWidget);
    expect(find.text('Draft'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('history uses a denim header', (tester) async {
    addTearDown(() => PosPage.requestTab.value = 0);
    final auth = AuthStore(PosVisualApi())
      ..role = 'kasir'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 390, Brightness.light,
        auth: auth);
    PosPage.requestTab.value = 2;
    await tester.pumpAndSettle();
    final bar = tester.widget<AppBar>(find.byType(AppBar));
    expect(bar.backgroundColor, kTaskDark);
    expect(bar.foregroundColor, Colors.white);
    expect(bar.titleTextStyle?.color, Colors.white);
  });

  for (final width in [320.0, 390.0]) {
    for (final brightness in Brightness.values) {
      testWidgets(
          'POS controls, photos, cart and Bayar at $width in $brightness',
          (tester) async {
        final api = PosVisualApi();
        final auth = AuthStore(api)
          ..role = 'owner'
          ..branchId = 4;
        await showPosSurface(tester, const PosPage(), width, brightness,
            auth: auth);
        expect(tester.takeException(), isNull);
        final search = find.byType(TextField).first;
        expect(tester.widget<TextField>(search).decoration!.labelText,
            'Cari produk');
        expect(find.byTooltip('Scan barcode').hitTestable(), findsOneWidget);
        await tester.tap(find.text('Anyostore Metro').first);
        await tester.pumpAndSettle();
        expect(find.text('Gudang'), findsOneWidget);
        await tester.tap(find.byType(DropdownButtonFormField<int?>).first);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Anyostore Metro').last);
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.text('Denim'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Denim'));
        await tester.pumpAndSettle();
        expect(find.text('Celana Denim'), findsNothing);
        await tester.ensureVisible(find.text('Semua'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Semua'));
        await tester.pumpAndSettle();
        expect(find.text('Celana Denim'), findsOneWidget);
        final grid = tester.widget<SliverGrid>(find.byType(SliverGrid));
        expect(
            (grid.gridDelegate as SliverGridDelegateWithFixedCrossAxisCount)
                .crossAxisCount,
            3);
        expect(
            tester
                .widget<UiProductPhoto>(find.byType(UiProductPhoto).first)
                .path,
            endsWith('/uploads/denim.jpg'));
        final card = tester.widget<GlassCard>(find
            .ancestor(
                of: find.text('Kemeja Denim'), matching: find.byType(GlassCard))
            .first);
        expect(card.radius, 16);
        await tester.enterText(search, 'D10');
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text('Celana Denim'), findsNothing);
        await tester.enterText(search, '');
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Kemeja Denim'));
        await tester.pumpAndSettle();
        final summary = find.text('Keranjang · 1 pcs');
        expect(summary.hitTestable(), findsOneWidget);
        expect(find.ancestor(of: summary, matching: find.byType(GlassCard)),
            findsOneWidget);
        await tester.tap(find.text('Bayar'));
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('cart-sheet-header')), findsOneWidget);
        expect(find.text('Nama'), findsOneWidget);
        expect(find.text('Qty'), findsOneWidget);
        expect(find.text('Total'), findsOneWidget);
        expect(find.text('Diskon'), findsNothing);
        expect(find.text('Catatan'), findsNothing);
        expect(find.text('Tahan'), findsNothing);
        expect(find.text('Lainnya'), findsNothing);
        expect(
            find.byKey(const ValueKey('cart-summary-footer')), findsOneWidget);
        expect(find.text('1 pcs'), findsOneWidget);
        expect(find.text('Total'), findsOneWidget);
        expect(find.text('Pelanggan Umum'), findsNothing);
        expect(find.text('Ambil Draft'), findsNothing);
        expect(find.text('Ambil transaksi ditahan'), findsNothing);
        expect(find.byTooltip('Tampilkan menu aksi'), findsOneWidget);
        await tester.tap(find.byTooltip('Tampilkan menu aksi'));
        await tester.pumpAndSettle();
        expect(find.text('Diskon'), findsOneWidget);
        expect(find.text('Catatan'), findsOneWidget);
        expect(find.text('Tahan'), findsOneWidget);
        expect(find.text('Lainnya'), findsOneWidget);
        expect(find.byTooltip('Sembunyikan menu aksi'), findsOneWidget);
        await tester.tap(find.byTooltip('Sembunyikan menu aksi'));
        await tester.pumpAndSettle();
        expect(find.text('Bayar · Rp275.000').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      });

      testWidgets('payment methods and primary action at $width in $brightness',
          (tester) async {
        await showPosSurface(
            tester, const PaymentSheet(grandTotal: 275000), width, brightness);
        for (final label in ['Tunai', 'QRIS', 'Transfer', 'Debit']) {
          expect(find.text(label).hitTestable(), findsOneWidget);
          final control = find
              .ancestor(of: find.text(label), matching: find.byType(InkWell))
              .first;
          expect(tester.getSize(control).height, greaterThanOrEqualTo(44));
        }
        final selected = tester.widget<Container>(find
            .ancestor(of: find.text('Tunai'), matching: find.byType(Container))
            .first);
        final selectedDecoration = selected.decoration as BoxDecoration;
        final theme = app.buildAnyostoreTheme(brightness: brightness);
        expect(selectedDecoration.borderRadius, BorderRadius.circular(12));
        expect(selectedDecoration.color,
            brightness == Brightness.dark ? kTaskDarkBg : kTaskSurfaceMuted);
        expect(selectedDecoration.color, isNot(theme.colorScheme.primary));
        expect(selectedDecoration.border!.top.color, theme.colorScheme.primary);
        final selectedIcon =
            tester.widget<Icon>(find.byIcon(Icons.payments_outlined));
        final selectedLabel = tester.widget<Text>(find.text('Tunai'));
        expect(selectedIcon.color, theme.colorScheme.primary);
        expect(selectedLabel.style!.color, theme.colorScheme.primary);
        expect(
            _contrastRatio(
                theme.colorScheme.primary, selectedDecoration.color!),
            greaterThan(4.5));
        expect(
            find.text('Selesaikan pembayaran').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      testWidgets(
          'history and receipt retain real values at $width in $brightness',
          (tester) async {
        await showPosSurface(tester,
            HistoryTab(api: PosVisualApi(), role: 'kasir'), width, brightness);
        final invoice = find.text('INV-20261103-B4-0008');
        final card = tester.widget<GlassCard>(
            find.ancestor(of: invoice, matching: find.byType(GlassCard)).first);
        expect(card.radius, 16);
        expect(find.text('Rp275.000'), findsOneWidget);
        final statusTop = tester.getTopLeft(find.text('Selesai'));
        final totalTop = tester.getTopLeft(find.text('Rp275.000'));
        expect(statusTop.dy, lessThan(totalTop.dy));
        await tester.tap(invoice);
        await tester.pumpAndSettle();
        expect(find.text('Kemeja Denim'), findsOneWidget);
        expect(find.text('Rp25.000'), findsOneWidget);
        expect(find.text('CASH'), findsWidgets);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
