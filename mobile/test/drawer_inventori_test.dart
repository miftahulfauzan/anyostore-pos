import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/more_page.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _DrawerApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    final Object data = switch (path) {
      '/settings' => {'store_name': 'Anyostore'},
      '/notifications' => <Object>[],
      '/offline-queue/count' => {'count': 0},
      _ => <Object>[],
    };
    return {'success': true, 'data': data};
  }
}

Future<void> mountDrawer(WidgetTester tester, String role) async {
  tester.view.physicalSize = const Size(390, 1400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final api = _DrawerApi();
  final auth = AuthStore(api)
    ..role = role
    ..branchId = 4
    ..userName = 'Pemilik Toko';
  await tester.pumpWidget(ChangeNotifierProvider.value(
    value: auth,
    child: MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: MorePage(api: api, branchId: 4, role: role),
      ),
    ),
  ));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('drawer owner: subgroup MUTASI STOK dan RIWAYAT tampil',
      (tester) async {
    await mountDrawer(tester, 'owner');
    expect(find.text('MUTASI STOK'), findsOneWidget);
    expect(find.text('RIWAYAT'), findsOneWidget);

    // Item utama dulu, baru subgroup — urutan sama seperti web.
    double y(String t) => tester.getTopLeft(find.text(t)).dy;
    expect(y('Daftar Produk'), lessThan(y('Stok Produk')));
    expect(y('Stok Produk'), lessThan(y('Cetak Barcode')));
    expect(y('Cetak Barcode'), lessThan(y('MUTASI STOK')));
    expect(y('MUTASI STOK'), lessThan(y('Stok Masuk')));
    expect(y('Stok Keluar'), lessThan(y('Transfer Stok')));
    expect(y('Transfer Stok'), lessThan(y('Stok Opname')));
    expect(y('Stok Opname'), lessThan(y('RIWAYAT')));
    expect(y('RIWAYAT'), lessThan(y('Riwayat Transfer')));
    expect(y('Riwayat Transfer'), lessThan(y('Pergerakan Stok')));
    expect(y('Pergerakan Stok'), lessThan(y('Riwayat Mutasi')));
  });

  testWidgets('Kartu Stok berganti nama menjadi Pergerakan Stok',
      (tester) async {
    await mountDrawer(tester, 'owner');
    expect(find.text('Pergerakan Stok'), findsOneWidget);
    expect(find.text('Kartu Stok'), findsNothing);
  });

  testWidgets('drawer kasir: tanpa pencatatan mutasi & riwayat transfer',
      (tester) async {
    await mountDrawer(tester, 'kasir');
    expect(find.text('MUTASI STOK'), findsOneWidget);
    expect(find.text('Stok Masuk'), findsNothing);
    expect(find.text('Stok Keluar'), findsNothing);
    expect(find.text('Transfer Stok'), findsOneWidget);
    expect(find.text('Stok Opname'), findsOneWidget);
    expect(find.text('Riwayat Transfer'), findsNothing);
    expect(find.text('Pergerakan Stok'), findsOneWidget);
  });

  testWidgets('drawer gudang tidak berubah strukturnya', (tester) async {
    await mountDrawer(tester, 'gudang');
    // Grup gudang memakai label web: Transaksi & Stok / Gudang / Lainnya.
    expect(find.text('MUTASI STOK'), findsNothing);
    expect(find.text('Pergerakan Stok'), findsNothing);
    expect(find.text('Stok Opname'), findsOneWidget);
    expect(find.text('Riwayat Mutasi'), findsOneWidget);
  });
}
