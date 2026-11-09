import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/app_navigation.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

void main() {
  for (final size in [const Size(800, 1280), const Size(1280, 800)]) {
    testWidgets('current owner navigation fits tablet $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      var selected = -1;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          bottomNavigationBar: GlassNavBar(
            current: 0,
            onSelect: (index) => selected = index,
            items: AppNavigation.forRole('owner'),
          ),
        ),
      ));
      expect(tester.takeException(), isNull);
      for (final label in [
        'POS',
        'Dashboard',
        'Riwayat',
        'Keuangan',
        'Lainnya'
      ]) {
        expect(find.text(label), findsOneWidget);
      }
      await tester.tap(find.text('Dashboard'));
      expect(selected, 1);
    });
  }
}
