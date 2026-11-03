import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/branch_scope.dart';
import 'package:pos_pakaian_mobile/src/more_page.dart';

class _ShellApi extends ApiClient {
  @override
  Future<List<dynamic>> branches() async => [
        {'id': 4, 'name': 'Anyostore Metro'},
      ];
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  for (final width in [320.0, 390.0]) {
    for (final brightness in Brightness.values) {
      testWidgets('drawer shell at $width in $brightness', (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        BranchScope.active.value = 4;
        final api = _ShellApi();
        final auth = AuthStore(api)
          ..role = 'owner'
          ..branchId = 4
          ..userName = 'Pemilik Toko';
        final theme = app.buildAnyostoreTheme(brightness: brightness);
        await tester.pumpWidget(ChangeNotifierProvider.value(
          value: auth,
          child: MaterialApp(
            theme: theme,
            home: Scaffold(
              appBar: AppBar(title: const Text('Kasir')),
              drawer: Drawer(
                child: SafeArea(
                  child: MorePage(
                    api: api,
                    branchId: 4,
                    role: 'owner',
                    currentTab: 0,
                    onNavigateTab: (_) {},
                  ),
                ),
              ),
              body: const SizedBox.expand(),
            ),
          ),
        ));
        await tester.tap(find.byTooltip('Open navigation menu'));
        await tester.pumpAndSettle();
        expect(find.text('Pemilik Toko'), findsOneWidget);
        expect(find.text('Toko/Gudang aktif'), findsOneWidget);
        expect(find.text('Anyostore Metro'), findsOneWidget);
        final activeRow = tester.widget<Container>(
          find.ancestor(
            of: find.text('POS'),
            matching: find.byType(Container),
          ).first,
        );
        expect((activeRow.decoration as BoxDecoration).color,
            theme.colorScheme.primary);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
