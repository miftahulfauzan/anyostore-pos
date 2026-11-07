import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/app_navigation.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';
import 'package:pos_pakaian_mobile/src/more_page.dart';
import 'package:pos_pakaian_mobile/src/payment_sheet.dart';
import 'package:pos_pakaian_mobile/src/settings_page.dart';
import 'package:pos_pakaian_mobile/src/font_scale_controller.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

import 'dashboard_page_test.dart' as analytics;

class RedesignApi extends ApiClient {
  final requests = <String>[];
  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    requests.add(path);
    final rows = [
      {
        'id': 10,
        'name': 'A100 Kemeja Denim',
        'sku': 'A100',
        'total_stock': 24,
        'min_stock': 5
      },
      {
        'id': 11,
        'name': 'A102 Bordir',
        'sku': 'A102',
        'total_stock': 3,
        'min_stock': 5
      },
      {
        'id': 12,
        'name': 'A104 Denim',
        'sku': 'A104',
        'total_stock': 0,
        'min_stock': 5
      },
    ];
    final Object data = switch (path) {
      '/inventory/stock-total' => {
          'products': rows,
          'summary': {
            'total_products': 3,
            'total_stock': 27,
            'low_stock': 1,
            'out_of_stock': 1
          }
        },
      '/inventory/warehouses' => [
          {'id': 1, 'name': 'Gudang contoh', 'branch_id': 4, 'type': 'utama'}
        ],
      '/settings' => {'store_name': 'Anyostore', 'branch_id': 4},
      '/settings/branches' => throw StateError(
          'Warehouse settings must not load owner-only branches'),
      '/inventory/mutations' => <Object>[],
      '/products' => <Object>[],
      _ => <Object>[],
    };
    return {'success': true, 'data': data};
  }
}

Future<void> showScreen(WidgetTester tester, Widget child, RedesignApi api,
    {Brightness brightness = Brightness.light,
    Size size = const Size(390, 844)}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final auth = AuthStore(api)
    ..role = 'gudang'
    ..branchId = 4
    ..userName = 'Akun gudang contoh';
  final theme = app.buildAnyostoreTheme(brightness: brightness);
  await tester.pumpWidget(ChangeNotifierProvider.value(
      value: auth,
      child: MaterialApp(
        theme: theme.copyWith(
            textTheme: theme.textTheme.apply(fontFamily: 'Roboto')),
        home: RepaintBoundary(
            key: const ValueKey('preview'),
            child: Scaffold(
                body: SafeArea(
                    child: child is InventoryPage || child is MorePage
                        ? Stack(children: [
                            Positioned.fill(child: child),
                            Positioned(
                                left: 0,
                                right: 0,
                                bottom: 0,
                                child: GlassNavBar(
                                    current: child is MorePage ? 3 : 1,
                                    onSelect: (_) {},
                                    items: AppNavigation.forRole('gudang')))
                          ])
                        : child))),
      )));
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(() async {
    final config = File('.dart_tool/package_config.json').absolute;
    final packages =
        jsonDecode(await config.readAsString())['packages'] as List;
    final flutter = packages.firstWhere((p) => p['name'] == 'flutter') as Map;
    final root =
        Directory.fromUri(config.uri.resolve(flutter['rootUri'] as String)).uri;
    final fonts = FontLoader('Roboto');
    for (final style in ['Regular', 'Medium', 'Bold']) {
      final font = File.fromUri(root.resolve(
          '../../bin/cache/artifacts/material_fonts/Roboto-$style.ttf'));
      if (font.existsSync()) {
        fonts.addFont(
            Future.value(ByteData.sublistView(await font.readAsBytes())));
      }
    }
    await fonts.load();
    final icons = File.fromUri(root.resolve(
        '../../bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf'));
    if (icons.existsSync()) {
      await (FontLoader('MaterialIcons')
            ..addFont(
                Future.value(ByteData.sublistView(await icons.readAsBytes()))))
          .load();
    }
  });
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final brightness in Brightness.values) {
    testWidgets(
        'stock is readable and all sections remain reachable in $brightness',
        (tester) async {
      final api = RedesignApi();
      await showScreen(
          tester, InventoryPage(api: api, branchId: 4, role: 'gudang'), api,
          brightness: brightness);
      expect(tester.takeException(), isNull);
      expect(find.text('A100 Kemeja Denim'), findsOneWidget);
      expect(find.text('Tersedia'), findsOneWidget);
      expect(find.text('Menipis'), findsOneWidget);
      expect(find.text('Habis'), findsWidgets);
      if (Platform.environment['CAPTURE_MOBILE_UI'] == '1') {
        await expectLater(find.byKey(const ValueKey('preview')),
            matchesGoldenFile('goldens/stock-${brightness.name}.png'));
      }
    });
  }

  for (final brightness in Brightness.values) {
    testWidgets('analytics focal metric remains readable in $brightness',
        (tester) async {
      await analytics.showDashboard(tester, analytics.DashboardApi(),
          size: const Size(320, 844), brightness: brightness);
      await tester.pumpAndSettle();
      expect(find.text('12.345'), findsOneWidget);
      expect(tester.widget<Text>(find.text('12.345')).style!.fontSize,
          greaterThanOrEqualTo(28));
      await tester.scrollUntilVisible(find.text('Pergerakan Stok'), 200);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'warehouse settings retain theme and printer without owner-only requests',
      (tester) async {
    final api = RedesignApi();
    await showScreen(tester, SettingsPage(api: api, role: 'gudang'), api);
    expect(api.requests, isNot(contains('/settings/branches')));
    expect(find.text('Tampilan'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Printer Thermal'), 300);
    expect(find.text('Pilih Printer'), findsOneWidget);
    expect(find.text('Backup Data'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final width in [320.0, 390.0]) {
    testWidgets('settings expose six font sizes at ${width.toInt()} px',
        (tester) async {
      final api = RedesignApi();
      FontScaleController.scale.value = FontScaleController.defaultScale;
      await showScreen(tester, SettingsPage(api: api, role: 'gudang'), api,
          size: Size(width, 844));
      expect(find.text('Tampilan'), findsOneWidget);
      expect(find.text('Ukuran teks'), findsOneWidget);
      for (final label in ['40%', '60%', '80%', '100%', '120%', '140%']) {
        expect(find.text(label), findsOneWidget);
      }
      final chips = find.byType(ChoiceChip);
      expect(chips, findsNWidgets(6));
      for (var i = 0; i < 6; i++) {
        final rect = tester.getRect(chips.at(i));
        expect(rect.left, greaterThanOrEqualTo(0));
        expect(rect.right, lessThanOrEqualTo(width));
        expect(rect.height, greaterThanOrEqualTo(32));
      }
      await tester.tap(find.text('120%'));
      await tester.pump();
      expect(FontScaleController.scale.value, 1.2);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets(
      'warehouse menu keeps operational groups without sales management',
      (tester) async {
    final api = RedesignApi();
    await showScreen(
        tester, MorePage(api: api, branchId: 4, role: 'gudang'), api,
        brightness: Brightness.dark);
    expect(find.text('TRANSAKSI'), findsOneWidget);
    expect(find.text('GUDANG'), findsOneWidget);
    expect(find.text('Komisi'), findsNothing);
    expect(find.text('Pegawai'), findsNothing);
    expect(find.text('Promo'), findsNothing);
    expect(find.text('Keuangan'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  for (final brightness in Brightness.values) {
    testWidgets(
        'payment visual uses four methods in a narrow viewport in $brightness',
        (tester) async {
      final api = RedesignApi();
      await showScreen(tester, const PaymentSheet(grandTotal: 275000), api,
          size: const Size(320, 720), brightness: brightness);
      for (final label in ['Tunai', 'QRIS', 'Transfer', 'Debit']) {
        expect(find.text(label), findsOneWidget);
      }
      final totalCard = tester.widget<GlassCard>(find
          .ancestor(
              of: find.text('Total pembayaran'),
              matching: find.byType(GlassCard))
          .first);
      expect(totalCard.radius, 20);
      expect(find.text('Selesaikan pembayaran').hitTestable(), findsOneWidget);
      expect(tester.takeException(), isNull);
      if (Platform.environment['CAPTURE_MOBILE_UI'] == '1' &&
          brightness == Brightness.light) {
        await expectLater(find.byKey(const ValueKey('preview')),
            matchesGoldenFile('goldens/payment.png'));
      }
    });
  }
}
