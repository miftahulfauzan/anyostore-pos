import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/commissions_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

class _CommissionApi extends ApiClient {
  @override
  Future<List<dynamic>> branches() async => [
        {'id': 1, 'name': 'BASIK PGMTA'},
      ];

  @override
  Future<Map<String, dynamic>> commissionMine(
          {required String start, required String end, int? branchId}) async =>
      {
        'live': {
          'estimated': 314300,
          'total_sales': 87605000,
          'total_transactions': 50,
          'qty_reguler': 898,
          'qty_grosir_seri': 0,
          'period_start': '2026-11-01',
          'period_end': '2026-11-21',
        }
      };

  @override
  Future<Map<String, dynamic>> commissionReport(
          {required String start, required String end, int? branchId}) async =>
      {
        'total_commission': 333200,
        'period_start': '2026-11-01',
        'period_end': '2026-11-21',
        'per_account': [
          {
            'name': 'ade',
            'qty_reguler': 898,
            'qty_grosir': 0,
            'total_qty': 898,
            'commission': 314300,
          },
          {
            'name': 'rahmi',
            'qty_reguler': 54,
            'qty_grosir': 0,
            'total_qty': 54,
            'commission': 18900,
          },
        ],
      };

  @override
  Future<Map<String, dynamic>> commissions() async => {
        'rules': [
          {
            'id': 1,
            'name': 'Komisi toko',
            'calculation_type': 'per_pcs_customer_tier',
            'branch_id': null,
            'commission_reguler_per_pcs': 3000,
            'commission_grosir_seri_per_pcs': 1000,
          }
        ]
      };
}

Future<void> _pump(WidgetTester tester, String role) async {
  await tester.pumpWidget(MaterialApp(
    theme: app.buildAnyostoreTheme(),
    home: Scaffold(
      body: CommissionsPage(
        api: _CommissionApi(),
        branchId: 1,
        role: role,
      ),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('halaman Komisi punya kartu ringkasan dan label kontras',
      (tester) async {
    await _pump(tester, 'manager');

    expect(find.text('ESTIMASI KOMISI'), findsOneWidget);
    expect(find.text('Rp314.300'), findsOneWidget);
    expect(find.text('PENJUALAN'), findsOneWidget);
    expect(find.text('Rp87.605.000'), findsOneWidget);
    expect(find.text('50'), findsOneWidget);
    expect(find.text('Reguler'), findsOneWidget);
    expect(find.text('Grosir Seri'), findsOneWidget);
    expect(find.text('898'), findsOneWidget);
    expect(find.text('1 Nov 2026 → 21 Nov 2026'), findsOneWidget);

    // Label tidak boleh memakai abu muda bawaan outline yang sulit dibaca.
    final label = tester.widget<Text>(find.text('PENJUALAN'));
    expect(label.style?.color, kTaskSecondary);
    expect(label.style?.fontWeight, FontWeight.w800);

    await tester.tap(find.text('Laporan'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('TOTAL KOMISI'), findsOneWidget);
    expect(find.text('Rp333.200'), findsOneWidget);
    expect(find.text('ade'), findsOneWidget);
    expect(find.text('rahmi'), findsOneWidget);
    expect(find.text('R 898'), findsOneWidget);
    expect(find.text('R 54'), findsOneWidget);
    expect(find.text('Rp18.900'), findsOneWidget);
    expect(find.text('952 pcs · R 952 / G 0'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('aturan komisi tampil rapi untuk owner', (tester) async {
    await _pump(tester, 'owner');
    await tester.tap(find.text('Aturan'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Komisi toko'), findsOneWidget);
    expect(find.text('Per pcs · tier pelanggan · Global'), findsOneWidget);
    expect(find.text('Reguler Rp3.000/pcs'), findsOneWidget);
    expect(find.text('Grosir Rp1.000/pcs'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
