import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/sales_dashboard_page.dart';

class _DashboardApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> reportOverview({
    required String start,
    required String end,
    int? branchId,
    bool allBranches = false,
  }) async =>
      {
        'summary': {
          'gross_sales': 44415000,
          'transactions': 18,
          'products_sold': 457,
          'expenses': 120000,
          'return_amount': 0,
          'net_profit': 8000000,
          'profit_margin_percent': 18.5,
        },
        'previous_summary': {
          'gross_sales': 30000000,
          'transactions': 12,
          'products_sold': 300,
          'expenses': 100000,
          'return_amount': 0,
          'net_profit': 5000000,
          'profit_margin_percent': 16,
        },
        'daily_sales': [
          {'date': '2026-11-01', 'revenue': 800000},
          {'date': '2026-11-05', 'revenue': 1400000},
          {'date': '2026-11-11', 'revenue': 2100000},
          {'date': '2026-11-16', 'revenue': 2800000},
          {'date': '2026-11-21', 'revenue': 3600000},
        ],
        'payment_methods': [
          {'payment_method': 'cash', 'amount': 44415000},
        ],
        'products': [
          {
            'name': 'A167',
            'sku': 'A167',
            'category_name': 'Kemeja',
            'quantity_sold': 108
          },
          {
            'name': 'B-05',
            'sku': 'B-05',
            'category_name': 'Kemeja',
            'quantity_sold': 89
          },
          {
            'name': 'ROK-04',
            'sku': 'ROK-04',
            'category_name': 'Rok',
            'quantity_sold': 74
          },
          {
            'name': 'Blazer Denim',
            'sku': 'BZ-01',
            'category_name': 'Blazer',
            'quantity_sold': 83
          },
          {
            'name': 'AB09',
            'sku': 'AB09',
            'category_name': 'Celana',
            'quantity_sold': 64
          },
        ],
        'low_stock': [
          {
            'name': 'AB94-Renda',
            'sku': 'AB94-Renda',
            'stock': -4,
            'min_stock': 5
          },
          {
            'name': 'A102 BORDIR',
            'sku': 'A102 BORDIR',
            'stock': 0,
            'min_stock': 24
          },
          {
            'name': 'AB12 CH MODEL',
            'sku': 'AB12 CH MODEL',
            'stock': 2,
            'min_stock': 24
          },
        ],
      };
}

Future<void> _pump(WidgetTester tester,
    {Brightness brightness = Brightness.light}) async {
  await tester.pumpWidget(MaterialApp(
    theme: app.buildAnyostoreTheme(brightness: brightness),
    home:
        Scaffold(body: SalesDashboardPage(api: _DashboardApi(), role: 'owner')),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  testWidgets('grafik halus dan daftar terlaris/stok berwarna', (tester) async {
    await _pump(tester);

    // Ringkasan toko: penjualan jadi kartu utama, sisanya tiga tile sejajar.
    expect(find.text('PENJUALAN'), findsOneWidget);
    expect(find.text('Rp44.415.000'), findsWidgets);
    expect(find.text('PESANAN'), findsOneWidget);
    expect(find.text('PRODUK'), findsOneWidget);
    expect(find.text('LABA BERSIH'), findsOneWidget);
    expect(find.textContaining('vs periode lalu'), findsOneWidget);

    expect(find.byKey(const ValueKey('dashboard-sparkline')), findsOneWidget);
    expect(find.text('1 Nov'), findsOneWidget);
    expect(find.text('21 Nov'), findsOneWidget);

    await tester.drag(find.byType(ListView).first, const Offset(0, -900));
    await tester.pump();
    expect(
        find.byKey(const ValueKey('dashboard-top-products')), findsOneWidget);
    expect(find.text('A167'), findsOneWidget);
    expect(find.text('108 pcs'), findsOneWidget);
    // Peringkat mengikuti pcs: Blazer (83) harus di atas ROK-04 (74).
    final blazerY = tester.getTopLeft(find.text('Blazer Denim')).dy;
    final rokY = tester.getTopLeft(find.text('ROK-04')).dy;
    expect(blazerY, lessThan(rokY));

    await tester.drag(find.byType(ListView).first, const Offset(0, -700));
    await tester.pump();
    expect(find.byKey(const ValueKey('dashboard-low-stock')), findsOneWidget);
    expect(find.text('MINUS'), findsOneWidget);
    expect(find.text('HABIS'), findsOneWidget);
    expect(find.text('MENIPIS'), findsOneWidget);
    expect(find.text('-4 / min 5'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('daftar tetap terbaca di mode gelap', (tester) async {
    await _pump(tester, brightness: Brightness.dark);
    await tester.drag(find.byType(ListView).first, const Offset(0, -1600));
    await tester.pump();
    expect(find.text('MINUS'), findsOneWidget);
    expect(find.text('Stok rendah'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
