import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/customers_page.dart';
import 'package:pos_pakaian_mobile/src/promotions_page.dart';
import 'package:pos_pakaian_mobile/src/users_page.dart';

class _BatchApi extends ApiClient {
  bool promoEmpty = false;

  @override
  Future<List<dynamic>> customers({String search = ''}) async => [
        {
          'id': 1,
          'name': 'Hanni Mart',
          'phone': '0813-2211-4455',
          'address': 'Jl. Pahlawan 12',
          'price_tier': 'reguler',
          'expedition': 'JNE',
        },
        {
          'id': 2,
          'name': 'Rhamanda Muharry',
          'phone': '0821-1204-0914',
          'address': 'Blok B',
          'price_tier': 'grosir_seri',
          'expedition': 'BARAKA',
        },
      ];

  @override
  Future<List<dynamic>> users({int? branchId}) async => [
        {
          'id': 1,
          'name': 'Miftahul Fauzan',
          'username': 'miftah',
          'email': 'mift4hul@gmail.com',
          'role': 'owner',
          'is_active': true,
        },
        {
          'id': 2,
          'name': 'ade',
          'username': 'ade',
          'email': 'ade@gmail.com',
          'role': 'manager',
          'is_active': true,
          'has_pin': true,
        },
        {
          'id': 3,
          'name': 'rahmi',
          'username': 'rahmi',
          'email': 'rahmi@gmail.com',
          'role': 'kasir',
          'is_active': false,
        },
      ];

  @override
  Future<List<dynamic>> branches() async => [
        {'id': 4, 'name': 'BASIK PGMTA'},
      ];

  @override
  Future<List<dynamic>> promotions() async => promoEmpty
      ? []
      : [
          {
            'id': 1,
            'name': 'Diskon Gajian',
            'code': 'GAJIAN25',
            'discount_type': 'percentage',
            'discount_value': 25,
            'usage_count': 35,
            'usage_limit': 100,
            'is_active': true,
          },
        ];
}

Future<void> _pump(WidgetTester tester, Widget page) async {
  await tester.pumpWidget(MaterialApp(
    theme: app.buildAnyostoreTheme(),
    home: Scaffold(body: page),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 200));
}

void main() {
  testWidgets('pelanggan memakai tier/ekspedisi chip dan menu aksi',
      (tester) async {
    final api = _BatchApi();
    await _pump(tester, CustomersPage(api: api));

    expect(find.text('Hanni Mart'), findsOneWidget);
    expect(find.text('REGULER'), findsOneWidget);
    expect(find.text('GROSIR SERI'), findsOneWidget);
    expect(find.text('JNE'), findsOneWidget);
    expect(find.text('BARAKA'), findsOneWidget);
    expect(find.byTooltip('Aksi pelanggan'), findsNWidgets(2));
    expect(find.text('reguler'), findsNothing);
    expect(tester.takeException(), isNull);

    await tester.tap(find.byIcon(Icons.person_add_alt_1_outlined).last);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 250));
    expect(find.text('Tambah Pelanggan'), findsOneWidget);
    expect(find.text('Tipe harga'), findsOneWidget);
    expect(find.widgetWithText(ChoiceChip, 'Grosir Seri'), findsOneWidget);
  });

  testWidgets('pengguna memakai role/status chip dan menu aksi',
      (tester) async {
    final api = _BatchApi();
    await _pump(tester, UsersPage(api: api, branchId: 4, role: 'owner'));

    expect(find.text('Miftahul Fauzan'), findsOneWidget);
    expect(find.text('OWNER'), findsOneWidget);
    expect(find.text('MANAGER'), findsOneWidget);
    expect(find.text('KASIR'), findsOneWidget);
    expect(find.text('NONAKTIF'), findsOneWidget);
    expect(find.text('PIN'), findsOneWidget);
    expect(find.byTooltip('Aksi pegawai'), findsNWidgets(3));
    expect(tester.takeException(), isNull);
  });

  testWidgets('promo punya kartu status dan empty state beraksi',
      (tester) async {
    final api = _BatchApi();
    await _pump(tester, PromotionsPage(api: api));

    expect(find.textContaining('GAJIAN25'), findsWidgets);
    expect(find.text('25%'), findsWidgets);
    expect(find.text('AKTIF'), findsOneWidget);
    expect(find.text('35 / 100'), findsOneWidget);
    expect(tester.takeException(), isNull);

    api.promoEmpty = true;
    await _pump(tester, PromotionsPage(key: UniqueKey(), api: api));
    expect(find.text('Belum ada promo'), findsOneWidget);
    expect(find.text('Buat promo pertama'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
