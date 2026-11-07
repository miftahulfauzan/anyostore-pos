import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/branch_scope.dart';
import 'package:pos_pakaian_mobile/src/login_page.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

class _ShellApi extends ApiClient {
  @override
  Future<List<dynamic>> products(
          {required int branchId, String search = ''}) async =>
      [];
  @override
  Future<List<dynamic>> warehouses(int branchId) async => [];
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
      ];
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final width in [320.0, 390.0]) {
    for (final brightness in Brightness.values) {
      testWidgets('drawer shell at $width in $brightness', (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        BranchScope.active.value = 4;
        final api = _ShellApi();
        final auth = AuthStore(api)
          ..role = 'owner'
          ..branchId = 4
          ..userName = 'Pemilik Toko';
        final theme = app.buildAnyostoreTheme(brightness: brightness);
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: auth,
          child: MaterialApp(
            theme: theme,
            home: const PosPage(runStartupBackgroundTasks: false),
          ),
        ));
        await tester.pump();
        final bar = tester.widget<AppBar>(find.byType(AppBar).first);
        expect(bar.backgroundColor, kTaskDark);
        await tester.tap(find.byTooltip('Open navigation menu'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 400));
        final drawer = tester.widget<Drawer>(find.byType(Drawer));
        expect(drawer.backgroundColor,
            brightness == Brightness.dark ? kTaskDarkBg : kTaskSidebarBg);
        expect(drawer.shape, isNotNull);
        expect(find.text('Pemilik Toko'), findsOneWidget);
        expect(find.byKey(const ValueKey('sidebar-profile')), findsOneWidget);
        expect(find.text('Toko/Gudang aktif'), findsOneWidget);
        expect(find.text('Anyostore Metro'), findsOneWidget);
        expect(find.text('AKSES CEPAT'), findsNothing);
        expect(find.text('Operasional'), findsOneWidget);
        final posIcon = find.byIcon(Icons.point_of_sale).last;
        final selectedColor = brightness == Brightness.dark
            ? kTaskDarkSurface
            : kTaskSidebarActive;
        final activeRow = tester
            .widgetList<Container>(
                find.ancestor(of: posIcon, matching: find.byType(Container)))
            .firstWhere((container) =>
                container.decoration is BoxDecoration &&
                (container.decoration as BoxDecoration).color == selectedColor);
        expect((activeRow.decoration as BoxDecoration).color, selectedColor);
        final sidebarList = tester.widget<ListView>(
            find.byKey(const ValueKey('mobile-more-menu-list')));
        expect(sidebarList.padding,
            const EdgeInsets.fromLTRB(16, 8, 16, 12));
        final operationalCard = tester.getRect(
            find.byKey(const ValueKey('more-menu-card-Operasional')));
        final productsCard = tester.getRect(find.byKey(
            const ValueKey('more-menu-card-Produk & Inventori')));
        expect(productsCard.top - operationalCard.bottom, 14);
        expect(activeRow.margin,
            const EdgeInsets.symmetric(horizontal: 0, vertical: 0));
        final row = find
            .ancestor(of: posIcon, matching: find.byType(InkWell))
            .first;
        expect(tester.getRect(row).height, greaterThanOrEqualTo(52));
        final iconCircle = tester.widget<Container>(find
            .ancestor(of: posIcon, matching: find.byType(Container))
            .first);
        final iconDecoration = iconCircle.decoration as BoxDecoration;
        expect(iconDecoration.color,
            brightness == Brightness.dark
                ? kTaskSidebarDarkIconBg
                : kTaskSidebarIconBg);
        final groupHeader = find
            .ancestor(of: find.text('Operasional'), matching: find.byType(InkWell))
            .first;
        expect(tester.getRect(groupHeader).height, greaterThanOrEqualTo(44));
        expect(
          tester.widget<Icon>(find.byIcon(Icons.point_of_sale).first).color,
          theme.colorScheme.primary,
        );
        final sidebarListFinder =
            find.byKey(const ValueKey('mobile-more-menu-list'));
        final logoutFinder = find.byKey(const ValueKey('sidebar-logout'));
        for (var i = 0; i < 6 && logoutFinder.evaluate().isEmpty; i++) {
          await tester.drag(sidebarListFinder, const Offset(0, -500));
          await tester.pump(const Duration(milliseconds: 100));
        }
        expect(logoutFinder, findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('login hero uses the approved 20 px radius', (tester) async {
    final api = _ShellApi();
    await tester.pumpWidget(ChangeNotifierProvider.value(
        value: AuthStore(api),
        child: MaterialApp(
          theme: app.buildAnyostoreTheme(),
          home: const LoginPage(),
        )));
    final card = tester.widget<GlassCard>(find
        .ancestor(of: find.text('Anyostore'), matching: find.byType(GlassCard))
        .first);
    expect(card.radius, 20);
  });
}
