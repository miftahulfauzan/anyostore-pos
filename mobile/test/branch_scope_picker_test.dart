import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/branch_scope.dart';
import 'package:pos_pakaian_mobile/src/pos_page.dart';

class _PickerApi extends ApiClient {
  _PickerApi({this.failFirst = false});

  final bool failFirst;
  int branchCalls = 0;

  @override
  Future<List<dynamic>> products(
          {required int branchId, String search = ''}) async =>
      [];
  @override
  Future<List<dynamic>> warehouses(int branchId) async => [];
  @override
  Future<List<dynamic>> customers({String search = ''}) async => [];
  @override
  Future<Map<String, dynamic>> storeSettings() async => {};
  @override
  Future<Map<String, dynamic>> productsVersion({required int branchId}) async =>
      {};
  @override
  Future<List<dynamic>> branches() async {
    branchCalls++;
    if (failFirst && branchCalls == 1) {
      throw ApiException('Gagal memuat cabang');
    }
    return [
      {
        'id': 4,
        'name': 'Anyostore Metro',
        'type': 'toko',
        'is_active': 1,
        'address': 'Jl. Metro 1',
      },
      {
        'id': 7,
        'name': 'Gudang Utama',
        'type': 'gudang',
        'is_active': 1,
        'address': 'Jl. Raya 8',
      },
      {
        'id': 9,
        'name': 'Rak Rijek',
        'type': 'gudang',
        'is_active': 0,
        'address': 'Area belakang',
      },
    ];
  }
}

Future<void> _settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 350));
}

Future<_PickerApi> _openDrawer(WidgetTester tester,
    {bool failFirst = false}) async {
  tester.view.physicalSize = const Size(390, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  BranchScope.active.value = 4;
  final api = _PickerApi(failFirst: failFirst);
  final auth = AuthStore(api)
    ..role = 'owner'
    ..branchId = 4
    ..userName = 'Pemilik Toko';
  await tester.pumpWidget(ChangeNotifierProvider.value(
    value: auth,
    child: MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: const PosPage(runStartupBackgroundTasks: false),
    ),
  ));
  await tester.pump();
  await tester.tap(find.byTooltip('Open navigation menu'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
  return api;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  tearDown(() => BranchScope.pendingCartCount = null);

  testWidgets('pemilih toko memakai label tipe, alamat, dan cabang aktif saja',
      (tester) async {
    await _openDrawer(tester);
    await tester.tap(find.byType(DropdownButton<int?>));
    await _settle(tester);

    expect(find.text('Toko · Anyostore Metro'), findsWidgets);
    expect(find.text('Gudang · Gudang Utama'), findsWidgets);
    expect(find.text('Jl. Metro 1'), findsWidgets);
    expect(find.text('Gudang · Rak Rijek'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('pindah toko minta konfirmasi kalau keranjang berisi',
      (tester) async {
    await _openDrawer(tester);
    BranchScope.pendingCartCount = () => 3;

    await tester.tap(find.byType(DropdownButton<int?>));
    await _settle(tester);
    await tester.tap(find.text('Gudang · Gudang Utama').last);
    await _settle(tester);

    expect(find.text('Pindah toko?'), findsOneWidget);
    expect(
        find.text(
            'Keranjang POS berisi 3 pcs. Draft akan disimpan dan keranjang dikosongkan.'),
        findsOneWidget);

    await tester.tap(find.text('Batal'));
    await _settle(tester);
    expect(BranchScope.active.value, 4);

    await tester.tap(find.byType(DropdownButton<int?>));
    await _settle(tester);
    await tester.tap(find.text('Gudang · Gudang Utama').last);
    await _settle(tester);
    await tester.tap(find.text('Simpan & pindah'));
    await _settle(tester);

    expect(BranchScope.active.value, 7);
    // Sidebar menutup otomatis setelah toko dipilih.
    await _settle(tester);
    expect(find.byKey(const ValueKey('sidebar-branch-scope')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('gagal memuat daftar toko menampilkan tombol coba lagi',
      (tester) async {
    await _openDrawer(tester, failFirst: true);

    expect(find.text('Gagal memuat daftar toko'), findsOneWidget);
    expect(find.text('Coba lagi'), findsOneWidget);

    await tester.tap(find.text('Coba lagi'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.text('Gagal memuat daftar toko'), findsNothing);
    expect(find.text('Toko · Anyostore Metro'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
