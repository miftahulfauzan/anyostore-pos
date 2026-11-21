import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/opname_reminder.dart';
import 'package:pos_pakaian_mobile/src/settings_page.dart';

class _NotificationApi extends ApiClient {
  @override
  Future<List<dynamic>> branches() async => [
        {'id': 1, 'name': 'BASIK PGMTA'},
      ];

  @override
  Future<Map<String, dynamic>> storeSettings() async => {
        'store_name': 'BASIK PGMTA',
      };
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('default pengingat opname: nonaktif, tanggal 1, sekali sehari', () {
    const settings = OpnameReminderSettings.defaults;
    expect(settings.enabled, isFalse);
    expect(settings.days, {1});
    expect(settings.times, [const TimeOfDay(hour: 9, minute: 0)]);
  });

  test('kombinasi tanggal x jam unik dan terurut', () {
    const settings = OpnameReminderSettings(
      enabled: true,
      days: {15, 1},
      times: [
        TimeOfDay(hour: 9, minute: 0),
        TimeOfDay(hour: 16, minute: 0),
        TimeOfDay(hour: 9, minute: 0),
      ],
    );
    final occurrences = settings.occurrences;
    expect(occurrences.map((item) => '${item.day}-${item.hour}').toList(),
        ['1-9', '1-16', '15-9', '15-16']);
    expect(settings.summary, contains('tanggal 1 & 15'));
    expect(settings.summary, contains('09:00, 16:00'));
  });

  test('simpan dan muat ulang pengaturan', () async {
    const settings = OpnameReminderSettings(
      enabled: true,
      days: {1, 20},
      times: [
        TimeOfDay(hour: 8, minute: 30),
        TimeOfDay(hour: 17, minute: 0),
      ],
    );
    await settings.save();
    final loaded = await OpnameReminderSettings.load();
    expect(loaded.enabled, isTrue);
    expect(loaded.days, {1, 20});
    expect(loaded.times, const [
      TimeOfDay(hour: 8, minute: 30),
      TimeOfDay(hour: 17, minute: 0),
    ]);
  });

  test('json rusak jatuh ke default', () async {
    SharedPreferences.setMockInitialValues({
      'pos_opname_reminder': '{bukan json',
    });
    final loaded = await OpnameReminderSettings.load();
    expect(loaded.enabled, isFalse);
    expect(loaded.days, {1});
  });

  testWidgets('kartu notifikasi menampilkan pengaturan stock opname',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: SettingsPage(
          api: _NotificationApi(),
          role: 'owner',
          section: 'notifications',
        ),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Jadwal Stock Opname'), findsOneWidget);
    await tester.tap(find.text('Jadwal Stock Opname'));
    await tester.pump();
    expect(find.text('TANGGAL (SETIAP BULAN)'), findsOneWidget);
    expect(find.text('BERAPA KALI SEHARI'), findsOneWidget);
    expect(find.text('JAM'), findsOneWidget);
    expect(find.text('Simpan & Jadwalkan'), findsOneWidget);

    await tester.tap(find.text('2×'));
    await tester.pump();
    expect(find.text('09:00'), findsOneWidget);
    expect(find.text('16:00'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
