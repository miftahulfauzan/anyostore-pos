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
            brightness == Brightness.dark ? kTaskDarkSurface : kTaskSurface);
        expect(find.text('Pemilik Toko'), findsOneWidget);
        final profileCard = tester.widget<GlassCard>(
          find
              .ancestor(
                of: find.text('Pemilik Toko'),
                matching: find.byType(GlassCard),
              )
              .first,
        );
        expect(profileCard.radius, 16);
        expect(find.text('Toko/Gudang aktif'), findsOneWidget);
        expect(find.text('Anyostore Metro'), findsOneWidget);
        expect(find.text('AKSES CEPAT'), findsNothing);
        expect(find.text('Operasional'), findsOneWidget);
        final posIcon = find.byIcon(Icons.point_of_sale).last;
        final selectedColor = brightness == Brightness.dark
            ? kTaskDarkSurface
            : kTaskSurfaceMuted;
        final activeRow = tester
            .widgetList<Container>(
                find.ancestor(of: posIcon, matching: find.byType(Container)))
            .firstWhere((container) =>
                container.decoration is BoxDecoration &&
                (container.decoration as BoxDecoration).color == selectedColor);
        expect((activeRow.decoration as BoxDecoration).color, selectedColor);
        expect(
          tester.widget<Icon>(find.byIcon(Icons.point_of_sale).first).color,
          theme.colorScheme.primary,
        );
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
