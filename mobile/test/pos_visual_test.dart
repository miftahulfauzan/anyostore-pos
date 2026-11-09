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
import 'package:pos_pakaian_mobile/src/category_visuals.dart';
import 'package:pos_pakaian_mobile/src/history_tab.dart';
import 'package:pos_pakaian_mobile/src/payment_sheet.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';
import 'package:pos_pakaian_mobile/src/ui_kit.dart';

class PosVisualApi extends ApiClient {
  int productsCalls = 0;

  @override
  Future<List<dynamic>> products(
      {required int branchId, String search = ''}) async {
    productsCalls++;
    return [
      {
        'id': 10,
        'name': 'Kemeja Denim',
        'sku': 'D10',
        'price': 275000,
        'stock': 24,
        'variant_count': 0,
        'category_id': 2,
        'category_name': 'Denim',
        'category_color': '#7C3AED',
        'category_sort_order': 1,
        'photo_path': '/uploads/denim.jpg'
      },
      {
        'id': 11,
        'name': 'Celana Denim',
        'sku': 'D11',
        'price': 195000,
        'stock': 12,
        'variant_count': 0,
        'category_id': 16,
        'category_name': 'Celana',
        'category_color': '#D89B19',
        'category_sort_order': 2,
      },
    ];
  }

  @override
  Future<List<dynamic>> warehouses(int branchId) async => [
        {'id': 1, 'name': 'Gudang Utama', 'branch_id': 4},
        {'id': 2, 'name': 'Gudang Cadangan', 'branch_id': 4},
      ];
  @override
  Future<List<dynamic>> customers({String search = ''}) async => [];
  @override
  Future<List<dynamic>> productCategories() async => [
        {'id': 2, 'name': 'Denim', 'color': '#7C3AED', 'sort_order': 1},
        {'id': 16, 'name': 'Celana', 'color': '#D89B19', 'sort_order': 2},
      ];
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
          String? search,
          bool allBranches = false}) async =>
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

class DraftPosVisualApi extends PosVisualApi {
  bool resumed = false;
  final deletedDraftIds = <int>[];

  @override
  Future<List<dynamic>> pendingTransactions({int? branchId}) async => [
        {
          'id': 99,
          'held_at': '2026-11-08T04:00:00.000Z',
          'subtotal': 275000,
          'items': [
            {'product_id': 10, 'quantity': 1},
          ],
        },
      ];

  @override
  Future<Map<String, dynamic>> resumeTransaction(int id,
      {int? branchId}) async {
    resumed = true;
    return {
      'id': id,
      'items': [
        {
          'product_id': 10,
          'name': 'Kemeja Denim',
          'price': 275000,
          'quantity': 1,
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> deletePendingTransaction(int id,
      {int? branchId}) async {
    deletedDraftIds.add(id);
    return {
      'success': true,
      'data': {'id': id}
    };
  }
}

class AutoHoldPosVisualApi extends PosVisualApi {
  final List<Map<String, dynamic>> holdBodies = [];

  @override
  Future<Map<String, dynamic>> holdTransaction(
      Map<String, dynamic> body) async {
    holdBodies.add(Map<String, dynamic>.from(body));
    return {
      'success': true,
      'data': {'id': 123},
    };
  }
}

class BasikStaffVisualApi extends PosVisualApi {
  @override
  Future<Map<String, dynamic>> storeSettings() async =>
      {'store_name': 'TOKO BASIK'};
}

class RefreshableCategoryPosVisualApi extends PosVisualApi {
  bool useUpdatedCategoryColor = false;

  @override
  Future<List<dynamic>> products(
      {required int branchId, String search = ''}) async {
    final rows = await super.products(branchId: branchId, search: search);
    if (!useUpdatedCategoryColor) return rows;
    return [
      {...rows.first as Map<String, dynamic>, 'category_color': '#DB2777'},
      ...rows.skip(1),
    ];
  }

  @override
  Future<List<dynamic>> productCategories() async {
    final rows = await super.productCategories();
    if (!useUpdatedCategoryColor) return rows;
    return [
      {...rows.first as Map<String, dynamic>, 'color': '#DB2777'},
      ...rows.skip(1),
    ];
  }
}

class CategorySourcePosVisualApi extends PosVisualApi {
  @override
  Future<List<dynamic>> productCategories() async {
    return [
      {'id': 16, 'name': 'Celana', 'color': '#DB2777', 'sort_order': 0},
      {'id': 2, 'name': 'Denim', 'color': '#16A34A', 'sort_order': 1},
    ];
  }
}

class CategoryResponseOrderPosVisualApi extends PosVisualApi {
  @override
  Future<List<dynamic>> productCategories() async {
    // The endpoint response is already sorted by the saved settings. The
    // numeric values intentionally conflict to ensure POS preserves that
    // response order instead of rebuilding an alphabetical/product order.
    return [
      {'id': 16, 'name': 'Celana', 'color': '#DB2777', 'sort_order': 50},
      {'id': 2, 'name': 'Denim', 'color': '#16A34A', 'sort_order': 2},
    ];
  }
}

class RevisitingCategoryPosVisualApi extends PosVisualApi {
  bool useUpdatedCategorySettings = false;

  @override
  Future<Map<String, dynamic>> productsVersion({required int branchId}) async =>
      {'updated_at': 'fixed-product-version'};

  @override
  Future<List<dynamic>> productCategories() async {
    if (!useUpdatedCategorySettings) return super.productCategories();
    return [
      {'id': 16, 'name': 'Celana', 'color': '#DB2777', 'sort_order': 0},
      {'id': 2, 'name': 'Denim', 'color': '#16A34A', 'sort_order': 1},
    ];
  }
}

class LowStockPosVisualApi extends PosVisualApi {
  @override
  Future<List<dynamic>> products(
      {required int branchId, String search = ''}) async {
    final rows = await super.products(branchId: branchId, search: search);
    return [
      ...rows,
      {
        'id': 12,
        'name': 'Oneset Sample',
        'sku': 'D12',
        'price': 180000,
        'stock': 4,
        'variant_count': 0,
        'category_name': 'Oneset',
      },
    ];
  }
}

Future<void> showPosSurface(
    WidgetTester tester, Widget child, double width, Brightness brightness,
    {AuthStore? auth, double textScale = 1, EdgeInsets? padding}) async {
  tester.view.physicalSize = Size(width, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  Widget root = MaterialApp(
      builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(textScale), padding: padding),
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

  testWidgets('Draft quick action opens a draft and restores its cart',
      (tester) async {
    final api = DraftPosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);

    await tester.tap(find.byTooltip('Buka Draft'));
    await tester.pumpAndSettle();
    expect(find.text('Draft'), findsOneWidget);
    expect(find.textContaining('1 item · Rp275.000'), findsOneWidget);

    await tester.tap(find.textContaining('1 item · Rp275.000'));
    await tester.pumpAndSettle();
    expect(api.resumed, isTrue);
    expect(find.byKey(const ValueKey('cart-sheet-header')), findsOneWidget);

    await tester.tap(find.text('Bayar'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('cart-summary-footer')), findsOneWidget);
    expect(find.text('1 pcs'), findsOneWidget);
  });

  testWidgets('Draft list can delete a server draft', (tester) async {
    final api = DraftPosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);

    await tester.tap(find.byTooltip('Buka Draft'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Hapus draft'));
    await tester.pumpAndSettle();
    expect(find.text('Hapus draft?'), findsOneWidget);
    await tester.tap(find.text('Hapus'));
    await tester.pumpAndSettle();

    expect(api.deletedDraftIds, [99]);
    expect(find.textContaining('1 item · Rp275.000'), findsNothing);
  });

  testWidgets(
      'app suspension sends one active cart to the server draft despite repeated lifecycle events',
      (tester) async {
    final api = AutoHoldPosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);

    await tester.tap(find.text('Kemeja Denim'));
    await tester.pumpAndSettle();

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pumpAndSettle();

    expect(api.holdBodies, hasLength(1));
    expect(api.holdBodies.single['client_hold_id'], isNotEmpty);
    expect(api.holdBodies.single['branch_id'], 4);
    expect(api.holdBodies.single['items'], hasLength(1));
  });

  testWidgets(
      'manual POS refresh reloads catalog even when version is unchanged',
      (tester) async {
    final api = PosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);
    final initialCalls = api.productsCalls;
    await tester.drag(
        find.byType(CustomScrollView).first, const Offset(0, 500));
    await tester.pumpAndSettle();
    expect(api.productsCalls, greaterThan(initialCalls));
    expect(tester.takeException(), isNull);
  });

  testWidgets('POS reloads category colors when settings changes the catalog',
      (tester) async {
    final api = RefreshableCategoryPosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);
    final initialCalls = api.productsCalls;
    api.useUpdatedCategoryColor = true;
    categoryCatalogRevision.value++;
    await tester.pumpAndSettle();

    expect(api.productsCalls, greaterThan(initialCalls));
    final accent = tester.widget<Container>(
        find.byKey(const ValueKey('pos-product-category-accent-10')));
    expect(accent.color, parseCategoryColor('#DB2777'));
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'TOKO BASIK starts a new cart item at four pieces for store staff',
      (tester) async {
    BranchScope.active.value = null;
    final api = BasikStaffVisualApi();
    final auth = AuthStore(api)
      ..role = 'kasir'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);
    await tester.tap(find.text('Kemeja Denim'));
    await tester.pumpAndSettle();
    expect(find.text('Keranjang · 4 pcs'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('non-Metro starts a new cart item at one piece', (tester) async {
    BranchScope.active.value = 5;
    final api = PosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 5;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);
    await tester.tap(find.text('Kemeja Denim'));
    await tester.pumpAndSettle();
    expect(find.text('Keranjang · 1 pcs'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('POS category filters use distinct visual colors',
      (tester) async {
    final auth = AuthStore(PosVisualApi())
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 320, Brightness.light,
        auth: auth);

    final denim = tester.widget<ChoiceChip>(
        find.byKey(const ValueKey('pos-category-chip-Denim')));
    final celana = tester.widget<ChoiceChip>(
        find.byKey(const ValueKey('pos-category-chip-Celana')));
    expect(denim.side?.color, isNot(equals(celana.side?.color)));
    expect(denim.backgroundColor, isNotNull);
    expect(celana.backgroundColor, isNotNull);
  });

  testWidgets('POS uses saved category order and product category color',
      (tester) async {
    final auth = AuthStore(PosVisualApi())
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 390, Brightness.light,
        auth: auth);

    final celana = tester.widget<ChoiceChip>(
        find.byKey(const ValueKey('pos-category-chip-Celana')));
    final denim = tester.widget<ChoiceChip>(
        find.byKey(const ValueKey('pos-category-chip-Denim')));
    expect(
        tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Denim')))
            .dx,
        lessThan(tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Celana')))
            .dx));
    expect(celana.label, isNotNull);
    expect(denim.label, isNotNull);

    final accent = tester.widget<Container>(
        find.byKey(const ValueKey('pos-product-category-accent-10')));
    expect(accent.color, const Color(0xff7c3aed));
  });

  testWidgets('POS uses category settings as the order and color source',
      (tester) async {
    final auth = AuthStore(CategorySourcePosVisualApi())
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 390, Brightness.light,
        auth: auth);

    expect(
        tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Celana')))
            .dx,
        lessThan(tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Denim')))
            .dx));
    final accent = tester.widget<Container>(
        find.byKey(const ValueKey('pos-product-category-accent-10')));
    expect(accent.color, const Color(0xff16a34a));
  });

  testWidgets(
      'POS refreshes category settings when returning with the same product version',
      (tester) async {
    addTearDown(() => PosPage.requestTab.value = 0);
    final api = RevisitingCategoryPosVisualApi();
    final auth = AuthStore(api)
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 390, Brightness.light,
        auth: auth);

    api.useUpdatedCategorySettings = true;
    PosPage.requestTab.value = 1;
    await tester.pumpAndSettle();
    PosPage.requestTab.value = 0;
    await tester.pumpAndSettle();

    expect(
        tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Celana')))
            .dx,
        lessThan(tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Denim')))
            .dx));
    final accent = tester.widget<Container>(
        find.byKey(const ValueKey('pos-product-category-accent-10')));
    expect(accent.color, const Color(0xff16a34a));
  });

  testWidgets('POS preserves the saved category response order below search',
      (tester) async {
    final auth = AuthStore(CategoryResponseOrderPosVisualApi())
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 390, Brightness.light,
        auth: auth);

    expect(
        tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Celana')))
            .dx,
        lessThan(tester
            .getTopLeft(find.byKey(const ValueKey('pos-category-chip-Denim')))
            .dx));
  });

  testWidgets('POS keeps the legacy fallback for a category without color',
      (tester) async {
    final auth = AuthStore(LowStockPosVisualApi())
      ..role = 'owner'
      ..branchId = 4;
    await showPosSurface(tester, const PosPage(), 390, Brightness.light,
        auth: auth);

    final accent = tester.widget<Container>(
        find.byKey(const ValueKey('pos-product-category-accent-12')));
    expect(accent.color, const Color(0xffe85d4a));
  });

  for (final brightness in Brightness.values) {
    testWidgets('POS stock below five uses warning color in $brightness',
        (tester) async {
      final auth = AuthStore(LowStockPosVisualApi())
        ..role = 'owner'
        ..branchId = 4;
      await showPosSurface(tester, const PosPage(), 320, brightness,
          auth: auth);

      final good = tester
          .widget<Text>(find.byKey(const ValueKey('pos-product-stock-10')));
      final low = tester
          .widget<Text>(find.byKey(const ValueKey('pos-product-stock-12')));
      expect(
          good.style?.color,
          brightness == Brightness.dark
              ? const Color(0xff86EFAC)
              : kTaskStockGood);
      expect(
          low.style?.color,
          brightness == Brightness.dark
              ? const Color(0xffFDBA74)
              : kTaskStockLow);
    });
  }

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
        final photoRect = tester.getRect(find.byType(UiProductPhoto).first);
        expect(photoRect.width / photoRect.height, closeTo(1, 0.03));
        final card = tester.widget<GlassCard>(find
            .ancestor(
                of: find.text('Kemeja Denim'), matching: find.byType(GlassCard))
            .first);
        expect(card.radius, 12);
        final cardDecorationFinder =
            find.byKey(const ValueKey('pos-product-card-decoration-10'));
        expect(cardDecorationFinder, findsOneWidget);
        final cardDecoration =
            tester.widget<DecoratedBox>(cardDecorationFinder);
        final boxDecoration = cardDecoration.decoration as BoxDecoration;
        expect(boxDecoration.boxShadow, isNotEmpty);
        expect(boxDecoration.boxShadow!.single.blurRadius, greaterThan(0));
        final denimAccentFinder =
            find.byKey(const ValueKey('pos-product-category-accent-10'));
        final celanaAccentFinder =
            find.byKey(const ValueKey('pos-product-category-accent-11'));
        expect(denimAccentFinder, findsOneWidget);
        expect(celanaAccentFinder, findsOneWidget);
        final denimAccent = tester.widget<Container>(denimAccentFinder);
        final celanaAccent = tester.widget<Container>(celanaAccentFinder);
        expect(denimAccent.color, isNotNull);
        expect(celanaAccent.color, isNotNull);
        expect(celanaAccent.color, isNot(equals(denimAccent.color)));
        final productCard = find
            .ancestor(
                of: find.text('Kemeja Denim'), matching: find.byType(GlassCard))
            .first;
        expect(find.text('Stok 24'), findsNothing);
        expect(find.text('varian'), findsNothing);
        final stockLabel = find.text('24');
        final priceLabel = find.text('Rp275.000');
        expect(stockLabel, findsOneWidget);
        expect(priceLabel, findsOneWidget);
        final stockText = tester.widget<Text>(stockLabel);
        expect(
            stockText.style?.color,
            brightness == Brightness.dark
                ? const Color(0xff86EFAC)
                : kTaskStockGood);
        expect(
            (tester.getRect(stockLabel).center.dy -
                    tester.getRect(priceLabel).center.dy)
                .abs(),
            lessThan(8));
        expect(tester.getRect(stockLabel).right,
            greaterThan(tester.getRect(priceLabel).right));
        expect(
            tester.getRect(productCard).bottom -
                tester.getRect(stockLabel).bottom,
            lessThan(12));
        await tester.enterText(search, 'D10');
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.text('Celana Denim'), findsNothing);
        await tester.enterText(search, '');
        await tester.pump(const Duration(milliseconds: 400));
        await tester.tap(find.text('Kemeja Denim'));
        await tester.pumpAndSettle();
        final summary = find.text('Keranjang · 4 pcs');
        expect(summary.hitTestable(), findsOneWidget);
        expect(find.ancestor(of: summary, matching: find.byType(GlassCard)),
            findsOneWidget);
        await tester.tap(find.text('Bayar'));
        await tester.pumpAndSettle();
        final cartHeader = find.byKey(const ValueKey('cart-sheet-header'));
        final cartFooter = find.byKey(const ValueKey('cart-summary-footer'));
        expect(cartHeader, findsOneWidget);
        expect(cartFooter, findsOneWidget);
        expect(tester.getRect(cartHeader).top, lessThanOrEqualTo(1));
        expect(tester.getRect(cartFooter).bottom, greaterThanOrEqualTo(843));
        expect(find.text('Nama'), findsOneWidget);
        expect(find.text('Qty'), findsOneWidget);
        expect(find.text('Total'), findsOneWidget);
        expect(find.text('Diskon'), findsNothing);
        expect(find.text('Catatan'), findsNothing);
        expect(find.text('Tahan'), findsNothing);
        expect(find.text('Lainnya'), findsNothing);
        expect(find.text('4 pcs'), findsOneWidget);
        expect(find.text('Total'), findsOneWidget);
        expect(find.text('Pelanggan Umum'), findsNothing);
        expect(find.text('Ambil Draft'), findsNothing);
        expect(find.text('Ambil transaksi ditahan'), findsNothing);
        expect(find.byTooltip('Tampilkan menu aksi'), findsOneWidget);
        expect(
            find.descendant(
                of: cartHeader, matching: find.byIcon(Icons.expand_more)),
            findsOneWidget);
        final lineMenu =
            find.byTooltip('Opsi Kemeja Denim: ubah harga atau hapus');
        expect(lineMenu, findsOneWidget);
        final lineMenuHitArea =
            find.byKey(const ValueKey('cart-line-menu-hit-area'));
        expect(lineMenuHitArea, findsOneWidget);
        expect(tester.getSize(lineMenuHitArea), const Size(44, 44));
        await tester.tap(lineMenu);
        await tester.pumpAndSettle();
        expect(find.text('Ubah harga'), findsOneWidget);
        expect(find.text('Hapus item'), findsOneWidget);
        await tester.sendKeyEvent(LogicalKeyboardKey.escape);
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Tampilkan menu aksi'));
        await tester.pumpAndSettle();
        expect(find.text('Diskon'), findsOneWidget);
        expect(find.text('Catatan'), findsOneWidget);
        expect(find.text('Tahan'), findsOneWidget);
        expect(find.text('Lainnya'), findsOneWidget);
        expect(find.byTooltip('Sembunyikan menu aksi'), findsOneWidget);
        expect(find.byIcon(Icons.expand_less), findsOneWidget);
        await tester.tap(find.byTooltip('Sembunyikan menu aksi'));
        await tester.pumpAndSettle();
        expect(find.text('Bayar · Rp275.000').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pumpAndSettle();
      });

      testWidgets(
          'cart reserves status bar space and keeps qty background uniform',
          (tester) async {
        final api = PosVisualApi();
        final auth = AuthStore(api)
          ..role = 'owner'
          ..branchId = 4;
        await showPosSurface(tester, const PosPage(), 320, Brightness.light,
            auth: auth, padding: const EdgeInsets.only(top: 24));
        await tester.tap(find.text('Kemeja Denim'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Bayar'));
        await tester.pumpAndSettle();

        expect(tester.getTopLeft(find.text('Keranjang')).dy,
            greaterThanOrEqualTo(24));
        final qtyFields = tester
            .widgetList<TextField>(find.byType(TextField))
            .where(
                (field) => field.decoration?.contentPadding == EdgeInsets.zero);
        expect(qtyFields, hasLength(1));
        expect(qtyFields.single.decoration?.filled, isFalse);
        expect(tester.takeException(), isNull);
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
