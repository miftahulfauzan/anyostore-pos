import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/app_navigation.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

void main() {
  test('warehouse navigation preserves inventory work and omits sales', () {
    final navigation = AppNavigation.forRole('gudang');
    expect(navigation.map((item) => item.label),
        ['Dashboard', 'Stok', 'Mutasi', 'Lainnya']);
    expect(AppNavigation.forRole('owner').map((item) => item.label),
        ['POS', 'Riwayat', 'Stok', 'Laporan', 'Lainnya']);
  });

  test('management actions match existing API permissions', () {
    expect(const AppPermissions('gudang').manageUsers, isFalse);
    expect(const AppPermissions('kasir').managePromotions, isFalse);
    expect(const AppPermissions('admin').managePromotions, isTrue);
    expect(const AppPermissions('owner').manageUsers, isTrue);
    expect(const AppPermissions('gudang').ownCommission, isTrue);
    expect(const AppPermissions('gudang').inventory, isTrue);
  });

  for (final role in ['owner', 'gudang']) {
    for (final brightness in Brightness.values) {
      testWidgets('$role navigation fits a 320-wide phone in $brightness',
          (tester) async {
        tester.view.physicalSize = const Size(320, 720);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        var selected = -1;
        final items = AppNavigation.forRole(role);
        await tester.pumpWidget(MaterialApp(
          theme: ThemeData(brightness: brightness),
          home: Scaffold(
            bottomNavigationBar: GlassNavBar(
              current: 0,
              onSelect: (index) => selected = index,
              items: items,
            ),
          ),
        ));
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Lainnya'));
        expect(selected, items.length - 1);
        expect(find.text('Stok'), findsOneWidget);
      });
    }

    testWidgets('$role navigation remains readable with large text',
        (tester) async {
      tester.view.physicalSize = const Size(320, 720);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final items = AppNavigation.forRole(role);
      var selected = -1;
      await tester.pumpWidget(MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
              size: Size(320, 720), textScaler: TextScaler.linear(1.5)),
          child: Scaffold(
            bottomNavigationBar: GlassNavBar(
              current: 0,
              onSelect: (index) => selected = index,
              items: items,
            ),
          ),
        ),
      ));
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Lainnya'));
      expect(selected, items.length - 1);
    });
  }
}
