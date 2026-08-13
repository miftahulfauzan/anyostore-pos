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
            (icon: Icons.shopping_bag_outlined, activeIcon: Icons.shopping_bag, label: 'POS'),
            (icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long, label: 'Riwayat'),
            (icon: Icons.inventory_2_outlined, activeIcon: Icons.inventory_2, label: 'Stok'),
            (icon: Icons.bar_chart_outlined, activeIcon: Icons.bar_chart, label: 'Laporan'),
            (icon: Icons.more_horiz, activeIcon: Icons.more_horiz, label: 'Lainnya'),
          ],
        ),
      ),
    ));
    await tester.pump(const Duration(milliseconds: 500));
    // Semua label navbar tampil, POS paling kiri.
    for (final label in ['POS', 'Riwayat', 'Stok', 'Laporan', 'Lainnya']) {
      expect(find.text(label), findsOneWidget);
    }
    // POS aktif di awal -> ikon keranjang terisi.
    expect(find.byIcon(Icons.shopping_bag), findsOneWidget);
    // Ketuk item -> onSelect terpanggil.
    await tester.tap(find.text('Laporan'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(selected, 3);
    // Buang widget supaya animasi repeat() berhenti.
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(milliseconds: 300));
  });
}
