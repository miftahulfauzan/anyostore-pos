import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/more_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

class _ThemeRouteApi extends ApiClient {
  @override
  Future<List<dynamic>> branches() async => [];

  @override
  Future<Map<String, dynamic>> storeSettings() async => {};
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('pages opened from the dark drawer keep the light page surface',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final api = _ThemeRouteApi();
    final auth = AuthStore(api)
      ..role = 'admin'
      ..branchId = 4
      ..userName = 'Admin toko';

    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: auth,
      child: MaterialApp(
        theme: app.buildAnyostoreTheme(),
        home: Theme(
          data: app.buildAnyostoreTheme(brightness: Brightness.dark),
          child: Scaffold(
            body: MorePage(api: api, branchId: 4, role: 'admin'),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    final menu = find.byKey(const ValueKey('mobile-more-menu-list'));
    for (var i = 0; i < 8 && find.text('Pengaturan').evaluate().isEmpty; i++) {
      await tester.drag(menu, const Offset(0, -500));
      await tester.pump();
    }
    expect(find.text('Pengaturan'), findsWidgets);
    await tester.tap(find.text('Pengaturan').last);
    await tester.pumpAndSettle();

    final routeScaffold = tester.widget<Scaffold>(find.byType(Scaffold).last);
    expect(routeScaffold.backgroundColor, kTaskBg);
  });
}
