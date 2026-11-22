import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/settings_hub_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

class _SettingsHubApi extends ApiClient {
  @override
  Future<List<dynamic>> branches() async => [
        {'id': 4, 'name': 'Anyostore', 'type': 'toko'},
      ];

  @override
  Future<List<dynamic>> productCategories() async => [
        {'id': 1, 'name': 'Kemeja'},
      ];

  @override
  Future<Map<String, dynamic>> storeSettings() async => {
        'store_name': 'Anyostore',
        'branch_id': 4,
      };
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('settings hub groups owner features and opens detail',
      (tester) async {
    tester.view.physicalSize = const Size(320, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SettingsHubPage(api: _SettingsHubApi(), role: 'owner'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Toko & Invoice'), findsOneWidget);
    expect(find.text('Kategori Produk'), findsOneWidget);
    expect(find.text('POS & Printer'), findsOneWidget);
    expect(find.text('Backup & Data'), findsOneWidget);
    expect(find.byKey(const ValueKey('settings-hub-row-category')),
        findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('settings-hub-row-category')));
    await tester.pumpAndSettle();
    expect(
        find.byKey(const ValueKey('settings-detail-category')), findsOneWidget);
    expect(find.byTooltip('Back'), findsOneWidget);
    final detailAppBar = tester.widget<AppBar>(find.byType(AppBar));
    expect(detailAppBar.backgroundColor, kTaskDark);
    expect(detailAppBar.foregroundColor, Colors.white);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('settings-hub-row-category')),
        findsOneWidget);
  });

  testWidgets('warehouse settings hub hides store management', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SettingsHubPage(api: _SettingsHubApi(), role: 'gudang'),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Toko & Invoice'), findsNothing);
    expect(find.text('Kategori Produk'), findsNothing);
    expect(find.text('POS & Printer'), findsOneWidget);
    expect(find.text('Tampilan'), findsOneWidget);
  });

  testWidgets('ikon pengaturan memakai warna denim seragam', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: SettingsHubPage(api: _SettingsHubApi(), role: 'owner'),
      ),
    ));
    await tester.pumpAndSettle();

    Color? chipColor(IconData icon) {
      final container = tester.widget<Container>(find
          .ancestor(of: find.byIcon(icon), matching: find.byType(Container))
          .first);
      return (container.decoration as BoxDecoration?)?.color;
    }

    // Semua ikon section memakai satu tint denim (bukan warna-warni).
    const denimBg = Color(0xFFE3EBF5);
    for (final icon in [
      Icons.storefront_outlined,
      Icons.sell_outlined,
      Icons.print_outlined,
      Icons.display_settings_outlined,
      Icons.storage_outlined,
      Icons.account_tree_outlined,
    ]) {
      expect(chipColor(icon), denimBg, reason: 'ikon $icon harus tint denim');
    }
    expect(tester.takeException(), isNull);
  });
}
