import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/cash_drawer_page.dart';
import 'package:pos_pakaian_mobile/src/customers_page.dart';
import 'package:pos_pakaian_mobile/src/promotions_page.dart';
import 'package:pos_pakaian_mobile/src/users_page.dart';

class _DarkApi extends ApiClient {
  @override
  Future<List<dynamic>> customers({String search = ''}) async => [
        {
          'id': 1,
          'name': 'Hanni Mart',
          'phone': '0813-2211-4455',
          'price_tier': 'grosir_seri',
          'expedition': 'JNE',
        },
      ];

  @override
  Future<List<dynamic>> users({int? branchId}) async => [
        {
          'id': 1,
          'name': 'ade',
          'username': 'ade',
          'email': 'ade@gmail.com',
          'role': 'manager',
          'is_active': true,
        },
      ];

  @override
  Future<List<dynamic>> branches() async => [
        {'id': 4, 'name': 'BASIK PGMTA'},
      ];

  @override
  Future<List<dynamic>> promotions() async => [
        {
          'id': 1,
          'name': 'Diskon Gajian',
          'code': 'GAJIAN25',
          'discount_type': 'percentage',
          'discount_value': 25,
          'usage_count': 1,
          'usage_limit': 10,
          'is_active': true,
        },
      ];

  @override
  Future<Map<String, dynamic>> cashDrawerCurrent() async => {
        'drawer': {
          'status': 'open',
          'opening_amount': 100000,
          'opened_at': '2026-11-21T01:00:00.000Z',
        },
        'expected_cash': 250000,
        'movements': [
          {
            'type': 'cash_in',
            'amount': 50000,
            'reason': 'Tambahan modal',
            'created_at': '2026-11-21T02:00:00.000Z',
          },
        ],
      };
}

Future<void> _pump(WidgetTester tester, Widget page) async {
  await tester.pumpWidget(MaterialApp(
    theme: app.buildAnyostoreTheme(brightness: Brightness.dark),
    home: Scaffold(body: page),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('halaman batch 1 & laci kas aman di mode gelap', (tester) async {
    final api = _DarkApi();

    await _pump(tester, CustomersPage(api: api));
    expect(find.text('Hanni Mart'), findsOneWidget);
    expect(find.text('GROSIR SERI'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await _pump(tester, UsersPage(api: api, branchId: 4, role: 'owner'));
    expect(find.text('MANAGER'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await _pump(tester, PromotionsPage(api: api));
    expect(find.text('AKTIF'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await _pump(tester, CashDrawerPage(api: api));
    expect(find.text('Kas terbuka'), findsOneWidget);
    expect(find.text('Tambahan modal'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
