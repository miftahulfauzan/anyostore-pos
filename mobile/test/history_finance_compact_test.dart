import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite/sqflite.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/cash_drawer_page.dart';
import 'package:pos_pakaian_mobile/src/finance_page.dart';
import 'package:pos_pakaian_mobile/src/format.dart';
import 'package:pos_pakaian_mobile/src/history_tab.dart';

String _shiftDay(String date, int days) {
  final value = DateTime.parse(date).add(Duration(days: days));
  return '${value.year.toString().padLeft(4, '0')}-'
      '${value.month.toString().padLeft(2, '0')}-'
      '${value.day.toString().padLeft(2, '0')}';
}

class _HistoryApi extends ApiClient {
  int? detailBranchId;

  @override
  Future<Map<String, dynamic>> transactionDetail(int id,
      {int? branchId}) async {
    detailBranchId = branchId;
    return {
      'id': id,
      'invoice_no': 'INV-B1-0001',
      'transaction_date': todayWib(),
      'created_at': '${todayWib()}T06:32:19.000Z',
      'status': 'completed',
      'subtotal': 400000,
      'discount': 0,
      'grand_total': 400000,
      'amount_paid': 400000,
      'change': 0,
      'payment_method': 'cash',
      'cashier': 'ade',
      'items': [
        {
          'product_name': 'Kemeja Denim',
          'variant_detail': 'Biru · L',
          'quantity': 2,
          'price': 200000,
          'subtotal': 400000,
        },
      ],
    };
  }

  @override
  Future<(List<dynamic>, int)> transactionsPage({
    int page = 1,
    int limit = 50,
    String? dateFrom,
    String? dateTo,
    String? status,
    String? search,
    bool allBranches = false,
  }) async {
    final today = todayWib();
    final yesterday = _shiftDay(today, -1);
    return (
      [
        {
          'id': 1,
          'branch_id': 4,
          'invoice_no': 'INV-B1-0001',
          'transaction_date': today,
          'created_at': '${today}T06:32:19.000Z',
          'grand_total': 400000,
          'status': 'completed',
          'payment_method': 'cash',
          'cashier': 'ade',
        },
        {
          'id': 2,
          'invoice_no': 'INV-B1-0002',
          'transaction_date': today,
          'created_at': '${today}T05:00:00.000Z',
          'grand_total': 100000,
          'status': 'partially_refunded',
          'payment_method': 'qris',
          'cashier': 'ade',
        },
        {
          'id': 3,
          'invoice_no': 'INV-B1-0003',
          'transaction_date': yesterday,
          'created_at': '${yesterday}T08:00:00.000Z',
          'grand_total': 380000,
          'status': 'completed',
          'payment_method': 'cash',
          'cashier': 'rahmi',
        },
      ],
      1,
    );
  }
}

class _FinanceApi extends ApiClient {
  @override
  Future<Map<String, dynamic>> expensesPage({
    String type = 'expense',
    String? dateFrom,
    String? dateTo,
    int? categoryId,
    String? paymentMethod,
    String? search,
    int page = 1,
    int limit = 20,
  }) async {
    final today = todayWib();
    final yesterday = _shiftDay(today, -1);
    return {
      'data': [
        {
          'id': 1,
          'name': 'Beli rak',
          'category': 'Gudang',
          'category_id': 1,
          'expense_date': today,
          'created_at': '${today}T06:20:00.000Z',
          'amount': 10000,
          'payment_method': 'cash',
        },
        {
          'id': 2,
          'name': 'Bensin',
          'category': 'Transport',
          'category_id': 2,
          'expense_date': yesterday,
          'created_at': '${yesterday}T02:10:00.000Z',
          'amount': 5000,
          'payment_method': 'transfer',
          'notes': 'Bensin',
        },
      ],
      'total': 2,
      'totalPages': 1,
    };
  }

  @override
  Future<List<dynamic>> expenseCategories() async => [
        {'id': 1, 'name': 'Gudang', 'type': 'expense'},
        {'id': 2, 'name': 'Transport', 'type': 'expense'},
      ];
}

class _CashApi extends ApiClient {
  double? opened;
  bool open = false;

  @override
  Future<Map<String, dynamic>> cashDrawerCurrent() async => open
      ? {
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
            {
              'type': 'cash_out',
              'amount': 20000,
              'reason': 'Beli plastik',
              'created_at': '2026-11-21T03:00:00.000Z',
            },
          ],
        }
      : {'drawer': null, 'expected_cash': 0, 'movements': <dynamic>[]};

  @override
  Future<Map<String, dynamic>> cashDrawerSummary() async =>
      throw ApiException('Belum ada laci', statusCode: 404);

  @override
  Future<Map<String, dynamic>> cashDrawerOpen(double amount) async {
    opened = amount;
    return {};
  }
}

void main() {
  setUpAll(() => databaseFactory = databaseFactorySqflitePlugin);
  setUp(() {
    final messenger =
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
    messenger.setMockMethodCallHandler(
        const MethodChannel('com.tekartik.sqflite'),
        (call) async => switch (call.method) {
              'getDatabasesPath' => '/tmp',
              'openDatabase' => {'id': 1},
              'query' => <Map<String, dynamic>>[],
              'batch' => <Object?>[],
              _ => null,
            });
  });

  testWidgets('riwayat dikelompokkan per tanggal dengan jam WIB',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: HistoryTab(api: _HistoryApi(), role: 'kasir'),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.textContaining('Hari ini ·'), findsOneWidget);
    expect(find.textContaining('Kemarin ·'), findsOneWidget);
    expect(find.text('13:32'), findsNothing); // jam ada di baris meta gabungan
    expect(find.textContaining('13:32 · CASH · Kasir: ade'), findsOneWidget);
    expect(find.textContaining('2026-'), findsNothing);
    expect(find.text('Selesai'), findsWidgets);
    expect(find.textContaining('trx ·'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('keuangan memakai chip filter dan grup per tanggal',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: FinancePage(api: _FinanceApi(), role: 'manager'),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.text('Bulan ini'), findsOneWidget);
    expect(find.text('Kategori'), findsOneWidget);
    expect(find.text('Metode'), findsOneWidget);
    expect(find.textContaining('Hari ini ·'), findsOneWidget);
    expect(find.textContaining('Kemarin ·'), findsOneWidget);
    expect(find.textContaining('1 catatan · Rp10.000'), findsOneWidget);
    // Kategori jadi judul, keterangan opsional di baris bawahnya.
    expect(find.text('Gudang'), findsOneWidget);
    expect(find.textContaining('Beli rak'), findsOneWidget);
    expect(find.text('Transport'), findsOneWidget);
    expect(find.textContaining('Bensin'), findsOneWidget);
    expect(find.textContaining('Tunai'), findsWidgets);
    expect(find.byTooltip('Aksi'), findsNWidgets(2));
    expect(tester.takeException(), isNull);
  });

  testWidgets('tombol Buka kas aktif setelah modal awal diketik',
      (tester) async {
    final api = _CashApi();
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(body: CashDrawerPage(api: api)),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    FilledButton tombol() => tester
        .widget<FilledButton>(find.widgetWithText(FilledButton, 'Buka kas'));
    expect(tombol().onPressed, isNull);

    await tester.enterText(find.byType(TextField).first, '100000');
    await tester.pump();
    expect(tombol().onPressed, isNotNull);

    await tester.tap(find.widgetWithText(FilledButton, 'Buka kas'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(api.opened, 100000);
    expect(tester.takeException(), isNull);
  });

  testWidgets('laci kas terbuka menampilkan saldo dan mutasi', (tester) async {
    final api = _CashApi()..open = true;
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(body: CashDrawerPage(api: api)),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150));

    expect(find.text('Kas terbuka'), findsOneWidget);
    expect(find.text('Rp250.000'), findsOneWidget);
    expect(find.text('Tambahan modal'), findsOneWidget);
    expect(find.text('Beli plastik'), findsOneWidget);
    expect(find.text('+Rp50.000'), findsOneWidget);
    expect(find.text('-Rp20.000'), findsOneWidget);
    await tester.drag(find.byType(ListView), const Offset(0, -900));
    await tester.pump();
    // Judul kartu "Tutup kas" dan tombolnya sama-sama berlabel demikian,
    // jadi cari tombolnya secara eksplisit.
    expect(find.widgetWithText(FilledButton, 'Tutup kas'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('detail transaksi tampil sebagai sheet ringkas', (tester) async {
    final api = _HistoryApi();
    await tester.pumpWidget(MaterialApp(
      theme: app.buildAnyostoreTheme(),
      home: Scaffold(
        body: HistoryTab(api: api, role: 'kasir'),
      ),
    ));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    await tester.tap(find.text('INV-B1-0001').first);
    await tester.pumpAndSettle();

    expect(find.text('Produk (1)'), findsOneWidget);
    expect(find.text('Kemeja Denim'), findsOneWidget);
    expect(find.text('Biru · L'), findsOneWidget);
    // Tanggal terformat WIB (mis. "23 Nov 2026 · 13:32") — bukan ISO mentah.
    expect(find.textContaining('Nov 2026'), findsWidgets);
    expect(find.text('Total'), findsOneWidget);
    expect(find.text('Cetak Struk'), findsOneWidget);
    expect(find.byTooltip('Tutup'), findsOneWidget);
    expect(find.textContaining('20/'), findsNothing);
    expect(api.detailBranchId, 4,
        reason: 'detail transaksi lintas cabang wajib mengirim branch_id');
    expect(tester.takeException(), isNull);
  });
}
