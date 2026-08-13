import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

void main() {
  testWidgets('GlassNavBar liquid glass renders semua item tanpa error',
      (tester) async {
    var selected = 0;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        bottomNavigationBar: GlassNavBar(
          current: selected,
          onSelect: (i) => selected = i,
          items: const [
            (icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long, label: 'Riwayat'),
            (icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2, label: 'Stok'),
            (icon: Icons.add, activeIcon: Icons.add, label: 'Kasir'),
            (icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart, label: 'Laporan'),
            (icon: Icons.more_horiz, activeIcon: Icons.more_horiz, label: 'Lainnya'),
          ],
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    // Label navbar tampil (Kasir diganti FAB tengah).
    for (final label in ['Riwayat', 'Stok', 'Laporan', 'Lainnya']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.byIcon(Icons.shopping_bag_outlined), findsOneWidget);
    // Ketuk item -> onSelect terpanggil.
    await tester.tap(find.text('Laporan'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(selected, 3);
    // Buang widget supaya animasi repeat() berhenti.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 300));
  });
}
