import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/account_switcher_page.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/profile_page.dart';

class _ProfileApi extends ApiClient {}

AuthStore _auth(ApiClient api) => AuthStore(api)
  ..userId = 7
  ..userName = 'ade'
  ..email = 'ade@gmail.com'
  ..username = 'ade'
  ..role = 'manager'
  ..branchId = 4
  ..token = 'token-uji';

Future<void> _pump(WidgetTester tester, Widget page, AuthStore auth,
    Brightness brightness) async {
  await tester.pumpWidget(ChangeNotifierProvider.value(
    value: auth,
    child: MaterialApp(
      theme: app.buildAnyostoreTheme(brightness: brightness),
      home: Scaffold(body: page),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 150));
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final brightness in Brightness.values) {
    testWidgets('profil tampil rapi di ${brightness.name}', (tester) async {
      final api = _ProfileApi();
      final auth = _auth(api);
      await _pump(tester, ProfilePage(api: api), auth, brightness);

      expect(find.text('ade'), findsWidgets);
      expect(find.text('ade@gmail.com'), findsWidgets);
      expect(find.text('MANAGER'), findsOneWidget);
      expect(find.text('Profil Saya'), findsOneWidget);
      expect(find.text('Ganti Password'), findsNWidgets(2));
      expect(find.text('Simpan Profil'), findsOneWidget);
      await tester.drag(find.byType(ListView), const Offset(0, -700));
      await tester.pump();
      expect(find.text('Ganti PIN'), findsNWidgets(2));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('sakelar sandi menampilkan dan menyembunyikan isi',
      (tester) async {
    final api = _ProfileApi();
    final auth = _auth(api);
    await _pump(tester, ProfilePage(api: api), auth, Brightness.light);

    final field = tester.widget<TextField>(find.byType(TextField).at(3));
    expect(field.obscureText, isTrue);
    await tester.tap(find.byTooltip('Tampilkan').first);
    await tester.pump();
    final visible = tester.widget<TextField>(find.byType(TextField).at(3));
    expect(visible.obscureText, isFalse);
    expect(tester.takeException(), isNull);
  });

  testWidgets('daftar akun menandai akun aktif dan bisa diganti',
      (tester) async {
    final api = _ProfileApi();
    final auth = _auth(api);
    auth.savedAccounts = [
      {
        'user': {
          'id': 7,
          'name': 'ade',
          'username': 'ade',
          'email': 'ade@gmail.com',
          'role': 'manager',
        },
        'token': 'token-uji',
        'refreshToken': 'refresh-uji',
      },
      {
        'user': {
          'id': 9,
          'name': 'Sari',
          'username': 'sari',
          'email': 'sari@gmail.com',
          'role': 'kasir',
        },
        'token': 'token-sari',
        'refreshToken': 'refresh-sari',
      },
    ];
    await _pump(tester, const AccountSwitcherPage(), auth, Brightness.dark);

    expect(find.text('ade'), findsWidgets);
    expect(find.text('Sari'), findsOneWidget);
    expect(find.text('AKTIF'), findsOneWidget);
    expect(find.text('Manager · ade@gmail.com'), findsOneWidget);
    expect(find.text('Kasir · sari@gmail.com'), findsOneWidget);
    expect(find.byTooltip('Hapus akun'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('profil dan daftar akun aman di layar 320 px', (tester) async {
    tester.view.physicalSize = const Size(320, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = _ProfileApi();
    final auth = _auth(api)
      ..savedAccounts = [
        {
          'user': {
            'id': 7,
            'name': 'ade',
            'username': 'ade',
            'email': 'ade@gmail.com',
            'role': 'manager',
          },
          'token': 'token-uji',
          'refreshToken': 'refresh-uji',
        },
      ];
    await _pump(tester, ProfilePage(api: api), auth, Brightness.light);
    expect(tester.takeException(), isNull);
    await _pump(tester, const AccountSwitcherPage(), auth, Brightness.light);
    expect(find.text('AKTIF'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
