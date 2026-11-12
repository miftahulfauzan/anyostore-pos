import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/reports_page.dart';

class _FinanceRowApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    if (path == '/reports/overview') {
      return {
        'success': true,
        'data': {
          'summary': {
            'transactions': 2,
            'gross_sales': 200000,
            'revenue': 200000,
            'expenses': 25000,
            'return_amount': 10000,
            'returns': 1,
          },
          'previous_summary': const {},
          'daily_sales': [
            {'date': '2026-11-10', 'transactions': 2, 'revenue': 200000}
          ],
          'daily_expenses': [
            {'date': '2026-11-10', 'amount': 25000}
          ],
          'daily_returns': [
            {'date': '2026-11-10', 'amount': 10000, 'count': 1}
          ],
          'payment_methods': [
            {'payment_method': 'cash', 'amount': 200000, 'transactions': 2}
          ],
          'cashiers': const [],
          'customers': const [],
          'products': const [],
          'categories': const [],
          'low_stock': const [],
          'price_tiers': const [],
          'transactions': const [],
          'cancellations': const [],
          'return_summary': [
            {
              'status': 'approved',
              'quantity_returned': 1,
              'returns_count': 1,
              'refund_amount': 10000
            }
          ],
          'returns': [
            {
              'return_no': 'RET-001',
              'invoice_no': 'INV-001',
              'quantity_returned': 1,
              'created_by_name': 'Kasir',
              'status': 'approved',
              'refund_amount': 10000,
            }
          ],
          'hourly_sales': const [],
          'branch_comparison': const [],
        },
      };
    }
    if (path == '/settings/branches') return {'success': true, 'data': []};
    throw StateError('Unexpected request: $path');
  }
}

void main() {
  testWidgets('dashboard finance rows open their detail sheets',
      (tester) async {
    tester.view.physicalSize = const Size(390, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: ReportsPage(
          api: _FinanceRowApi(),
          role: 'owner',
          dashboardMode: true,
        ),
      ),
    ));
    await tester.pumpAndSettle();

    const rows = <String, String>{
      'Pembayaran': 'reports-finance-row-pembayaran',
      'Pengeluaran': 'reports-finance-row-pengeluaran',
      'Pengembalian': 'reports-finance-row-pengembalian',
    };
    for (final entry in rows.entries) {
      final label = entry.key;
      final finder = find.byKey(ValueKey(entry.value));
      for (var i = 0; i < 12 && finder.evaluate().isEmpty; i++) {
        await tester.drag(find.byType(ListView).first, const Offset(0, -420));
        await tester.pump();
      }
      expect(finder, findsOneWidget);
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pumpAndSettle();
      expect(find.byKey(ValueKey('reports-finance-detail-sheet-$label')),
          findsOneWidget);
      await tester.tap(find.byTooltip('Tutup'));
      await tester.pumpAndSettle();
    }
  });
}
