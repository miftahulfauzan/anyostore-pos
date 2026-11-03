import 'dart:async';
import 'dart:convert';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite/sqflite.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/branch_scope.dart';
import 'package:pos_pakaian_mobile/src/finance_page.dart';
import 'package:pos_pakaian_mobile/src/reports_page.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

import 'dashboard_page_test.dart' show DashboardApi, showDashboard;

class AnalyticsApi extends ApiClient {
  bool empty = false;
  bool fail = false;
  Completer<void>? pending;

  @override
  Future<Map<String, dynamic>> get(String path,
      [Map<String, String>? query]) async {
    if (pending != null) await pending!.future;
    if (fail) throw ApiException('Server laporan gagal', statusCode: 500);
    final Object data = switch (path) {
      '/settings/branches' => [
          {'id': 4, 'name': 'Anyostore Metro'}
        ],
      '/dashboard' => {
          'summary': {
            'today_transactions': 0,
            'today_sales': 0,
            'seven_day_sales': 50000,
            'month_sales': 50000
          },
          'sales_trend': [],
          'payment_breakdown': [],
        },
      '/reports/overview' => {
          'summary': {
            'transactions': empty ? 0 : 3,
            'gross_sales': empty ? 0 : 275000,
            'net_profit': empty ? 0 : 75000,
          },
          'daily_sales': empty
              ? []
              : [
                  {'date': '2026-11-03', 'revenue': 275000, 'transactions': 3}
                ],
          'products': [],
          'low_stock': [],
          'payment_methods': [],
        },
      '/finance/expense-categories' => [],
      '/finance/expenses' => empty
          ? []
          : [
              {
                'id': 1,
                'name': 'Ongkir denim',
                'amount': 25000,
                'expense_date': '2026-11-03',
                'payment_method': 'cash'
              }
            ],
      _ => throw StateError('Unexpected request: $path'),
    };
    return {'success': true, 'data': data};
  }
}

Future<void> showAnalytics(WidgetTester tester, Widget page,
    Brightness brightness, double width) async {
  tester.view.physicalSize = Size(width, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(MaterialApp(
    theme: app.buildAnyostoreTheme(brightness: brightness),
    home: Scaffold(body: page),
  ));
  await tester.pump();
}

void main() {
  var pendingExpenses = <Map<String, dynamic>>[];
  var pendingTransactions = <Map<String, dynamic>>[];
  setUpAll(() => databaseFactory = databaseFactorySqflitePlugin);
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    pendingExpenses = [];
    pendingTransactions = [];
    BranchScope.active.value = 4;
    // Keep the real offline merge; replace only the native SQLite transport.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
            const MethodChannel('com.tekartik.sqflite'),
            (call) async => switch (call.method) {
                  'getDatabasesPath' => '/tmp',
                  'openDatabase' => {'id': 1},
                  'query' => (call.arguments as Map)['sql']
                          .toString()
                          .contains('offline_expenses')
                      ? pendingExpenses
                      : (call.arguments as Map)['sql']
                              .toString()
                              .contains('offline_transactions')
                          ? pendingTransactions
                          : <Map<String, dynamic>>[],
                  'batch' => <Object?>[],
                  _ => null,
                });
  });

  for (final brightness in Brightness.values) {
    for (final width in [320.0, 390.0]) {
      testWidgets('stock focal metric and chart at $width in $brightness',
          (tester) async {
        await showDashboard(tester, DashboardApi(),
            size: Size(width, 2400), brightness: brightness);
        await tester.pumpAndSettle();
        final metric = tester.widget<Text>(find.text('12.345'));
        expect(metric.style!.fontSize, greaterThanOrEqualTo(28));
        expect(tester.getTopLeft(find.text('12.345')).dy,
            lessThan(tester.getTopLeft(find.byType(LineChart)).dy));
        expect(find.byType(LineChart), findsOneWidget);
        final chart = tester.widget<LineChart>(find.byType(LineChart));
        expect(chart.data.lineBarsData.first.color, kTaskAccent);
        expect(chart.data.lineBarsData.first.spots.first.y, 12345);
        expect(chart.data.lineBarsData.last.spots.first.y, 21);
        await tester
            .tap(find.byKey(const ValueKey('dashboard-period-selector')));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Kemarin'));
        await tester.pumpAndSettle();
        await tester.tap(find.byTooltip('Buka filter'));
        await tester.pumpAndSettle();
        expect(find.text('Toko / Gudang'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      for (final dashboard in [true, false]) {
        testWidgets(
            'sales focal value at $width in $brightness dashboard=$dashboard',
            (tester) async {
          final api = AnalyticsApi();
          await showAnalytics(
              tester,
              ReportsPage(api: api, role: 'owner', dashboardMode: dashboard),
              brightness,
              width);
          await tester.pumpAndSettle();
          final metric = find.text('Rp275.000').first;
          expect(tester.widget<Text>(metric).style!.fontSize,
              greaterThanOrEqualTo(28));
          expect(find.byKey(const ValueKey('reports-period-selector')),
              findsOneWidget);
          await tester
              .tap(find.byKey(const ValueKey('reports-period-selector')));
          await tester.pumpAndSettle();
          await tester.tap(find.text('Kemarin'));
          await tester.pumpAndSettle();
          if (dashboard) {
            // Dashboard uses the shared drawer branch selection, not a local filter.
            BranchScope.active.value = null;
            await tester.pumpAndSettle();
            expect(find.text('Lokasi: Semua toko/gudang'), findsOneWidget);
            expect(find.text('Tren penjualan harian'), findsOneWidget);
          } else {
            await tester.tap(find.byTooltip('Buka filter'));
            await tester.pumpAndSettle();
            expect(find.text('Toko / Gudang'), findsOneWidget);
          }
          expect(tester.takeException(), isNull);
        });
      }

      testWidgets('finance amount and actions at $width in $brightness',
          (tester) async {
        final api = AnalyticsApi();
        await showAnalytics(
            tester, FinancePage(api: api, role: 'owner'), brightness, width);
        await tester.pumpAndSettle();
        expect(find.text('Rp25.000'), findsOneWidget);
        expect(find.byKey(const ValueKey('finance-summary')), findsOneWidget);
        expect(find.text('1 catatan'), findsOneWidget);
        expect(find.text('Ongkir denim'), findsWidgets);
        expect(find.byTooltip('Edit'), findsOneWidget);
        expect(find.byTooltip('Hapus'), findsOneWidget);
        await tester.tap(find.text('Pemasukan'));
        await tester.pumpAndSettle();
        expect(find.text('Tambah Pemasukan'), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }

  testWidgets('focal sales retains offline merge and shared branch isolation',
      (tester) async {
    pendingTransactions = [
      {
        'grand_total': 25000,
        'payload': jsonEncode({
          'branch_id': 4,
          'transaction_date': '2026-11-03',
          'payment_method': 'cash',
          'items': [],
        })
      },
      {
        'grand_total': 900000,
        'payload': jsonEncode({
          'branch_id': 5,
          'transaction_date': '2026-11-03',
          'payment_method': 'cash',
          'items': [],
        })
      },
    ];
    final api = AnalyticsApi();
    await showAnalytics(
        tester,
        ReportsPage(api: api, role: 'owner', dashboardMode: true),
        Brightness.dark,
        390);
    await tester.pumpAndSettle();
    expect(find.text('Rp300.000'), findsOneWidget);
    expect(find.text('Rp1.200.000'), findsNothing);
    BranchScope.active.value = null;
    await tester.pumpAndSettle();
    expect(find.text('Rp1.200.000'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cashier empty state keeps the fixed dashboard periods',
      (tester) async {
    final api = AnalyticsApi();
    await showAnalytics(
        tester,
        ReportsPage(api: api, role: 'kasir', dashboardMode: true),
        Brightness.light,
        320);
    await tester.pumpAndSettle();
    expect(find.text('Belum ada penjualan hari ini.'), findsOneWidget);
    expect(find.text('Ubah periode'), findsNothing);
    expect(find.text('Rp50.000'), findsNWidgets(2));
    await tester.tap(find.widgetWithText(OutlinedButton, 'Muat ulang'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('reports loading, error, retry and empty action', (tester) async {
    final api = AnalyticsApi()..pending = Completer<void>();
    await showAnalytics(
        tester,
        ReportsPage(api: api, role: 'owner', dashboardMode: true),
        Brightness.light,
        320);
    expect(find.text('Memuat laporan…'), findsOneWidget);
    api.fail = true;
    api.pending!.complete();
    await tester.pumpAndSettle();
    expect(find.text('Server laporan gagal'), findsOneWidget);
    api.fail = false;
    api.empty = true;
    await tester.tap(find.text('Coba lagi'));
    await tester.pumpAndSettle();
    expect(find.text('Belum ada penjualan pada rentang ini.'), findsOneWidget);
    await tester.tap(find.text('Ubah periode'));
    await tester.pumpAndSettle();
    expect(find.text('Pilih rentang tanggal'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('finance loading, error, retry and empty explanation',
      (tester) async {
    final api = AnalyticsApi()..pending = Completer<void>();
    await showAnalytics(
        tester, FinancePage(api: api, role: 'owner'), Brightness.dark, 320);
    expect(find.text('Memuat keuangan…'), findsOneWidget);
    api.fail = true;
    api.pending!.complete();
    await tester.pumpAndSettle();
    api.fail = false;
    api.empty = true;
    await tester.tap(find.text('Coba lagi'));
    await tester.pumpAndSettle();
    expect(find.text('Belum ada pengeluaran pada toko ini.'), findsOneWidget);
    expect(find.text('Tambah Pengeluaran'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
