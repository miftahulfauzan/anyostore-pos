import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/font_scale_controller.dart';
import 'package:pos_pakaian_mobile/src/settings_page.dart';
import 'package:pos_pakaian_mobile/src/theme_controller.dart';

class _DisplayApi extends ApiClient {
  @override
  Future<List<dynamic>> branches() async => [
        {'id': 1, 'name': 'BASIK PGMTA'},
      ];

  @override
  Future<Map<String, dynamic>> storeSettings() async => {};
}

Future<void> _pump(WidgetTester tester) async {
  await tester.pumpWidget(MaterialApp(
    theme: app.buildAnyostoreTheme(),
    home: Scaffold(
      body: SettingsPage(
        api: _DisplayApi(),
        role: 'owner',
        section: 'display',
      ),
    ),
  ));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 150));
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FontScaleController.scale.value = FontScaleController.defaultScale;
    ThemeController.mode.value = ThemeMode.light;
  });

  testWidgets('tampilan memakai kartu tema, slider 80%, dan pratinjau',
      (tester) async {
    await _pump(tester);

    expect(find.text('Terang'), findsOneWidget);
    expect(find.text('Gelap'), findsOneWidget);
    expect(find.text('Sistem'), findsOneWidget);
    expect(find.text('UKURAN TEKS'), findsOneWidget);
    expect(find.text('80%'), findsNWidgets(2));
    expect(find.byType(Slider), findsOneWidget);
    expect(find.text('PRATINJAU'), findsOneWidget);
    expect(find.text('Kemeja Denim A100'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('memilih tema gelap langsung mengubah controller',
      (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Gelap'));
    await tester.pump(const Duration(milliseconds: 250));
    expect(ThemeController.mode.value, ThemeMode.dark);
    expect(tester.takeException(), isNull);
  });
}
