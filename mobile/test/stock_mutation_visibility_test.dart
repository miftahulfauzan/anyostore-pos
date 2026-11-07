import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/app_navigation.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';
import 'package:pos_pakaian_mobile/src/more_page.dart';

class VisibilityApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    final Object data = switch (path) {
      '/inventory/stock-total' => {
          'products': <Object>[],
          'summary': <String, dynamic>{}
        },
      '/inventory/warehouses' => <Object>[],
      '/inventory/mutations' => <Object>[],
      _ => <Object>[]
    };
    return {'success': true, 'data': data};
  }
}

void main() {
  test('stock mutation permission is limited to owner and gudang', () {
    expect(canManageStockMutations('owner'), isTrue);
    expect(canManageStockMutations('gudang'), isTrue);
    for (final role in ['manager', 'admin', 'kasir', null]) {
      expect(canManageStockMutations(role), isFalse);
    }
  });

  testWidgets('non-allowed role cannot see the mutasi selector or input page',
      (tester) async {
    final api = VisibilityApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: InventoryPage(api: api, branchId: 4, role: 'admin')),
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('inventory-section-selector')));
    await tester.pumpAndSettle();
    expect(
        find.descendant(
            of: find.byType(PopupMenuItem<String>),
            matching: find.text('Mutasi')),
        findsNothing);
  });

  testWidgets('owner and gudang retain the mutasi selector', (tester) async {
    for (final role in ['owner', 'gudang']) {
      final api = VisibilityApi();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: InventoryPage(api: api, branchId: 4, role: role)),
      ));
      await tester.pumpAndSettle();
      await tester
          .tap(find.byKey(const ValueKey('inventory-section-selector')));
      await tester.pumpAndSettle();
      expect(
          find.descendant(
              of: find.byType(PopupMenuItem<String>),
              matching: find.text('Mutasi')),
          findsOneWidget);
      await tester.tap(find.text('Mutasi').last);
      await tester.pumpAndSettle();
    }
  });

  testWidgets('direct input section is blocked for a store admin',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: InventoryPage(
            api: VisibilityApi(),
            branchId: 4,
            role: 'admin',
            initialSection: 'incoming'),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Akses mutasi stok dibatasi'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Cari produk'), findsNothing);
  });

  testWidgets('drawer hides stock incoming/outgoing for a store admin',
      (tester) async {
    final auth = AuthStore(VisibilityApi())
      ..role = 'admin'
      ..branchId = 4
      ..userName = 'Admin toko';
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: auth,
      child: MaterialApp(
        home: Scaffold(
            body: MorePage(api: VisibilityApi(), branchId: 4, role: 'admin')),
      ),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Stok Masuk'), findsNothing);
    expect(find.text('Stok Keluar'), findsNothing);
    expect(find.text('Transfer Stok'), findsOneWidget);
  });
}
