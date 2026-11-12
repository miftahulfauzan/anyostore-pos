import 'dart:async';
import 'dart:convert';

// ignore_for_file: prefer_const_constructors

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:share_plus/share_plus.dart';

import 'api_client.dart';
import 'branch_scope.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'report_filter.dart';
import 'task_ui.dart';

bool reportDateInRange(String? date, String start, String end) {
  if (date == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(date)) {
    return false;
  }
  return date.compareTo(start) >= 0 && date.compareTo(end) <= 0;
}

String? _offlineBusinessDate(Map<String, dynamic> payload, dynamic createdAt,
    {required String dateKey}) {
  final explicit = payload[dateKey]?.toString();
  if (explicit != null && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(explicit)) {
    return explicit;
  }
  final parsed = DateTime.tryParse(createdAt?.toString() ?? '');
  if (parsed == null) return null;
  final wib = parsed.toUtc().add(const Duration(hours: 7));
  return '${wib.year.toString().padLeft(4, '0')}-${wib.month.toString().padLeft(2, '0')}-${wib.day.toString().padLeft(2, '0')}';
}

String _fmtPercent(dynamic value) => '${asNum(value).toStringAsFixed(2)}%';

Map<String, dynamic> _previousSummary(Map<String, dynamic>? data) {
  final direct = data?['previous_summary'];
  if (direct is Map) return Map<String, dynamic>.from(direct);
  final comparison = data?['comparison'];
  if (comparison is Map && comparison['previous_summary'] is Map) {
    return Map<String, dynamic>.from(comparison['previous_summary'] as Map);
  }
  return const {};
}

String? _changePercent(dynamic current, dynamic previous) {
  if (previous == null) return null;
  final before = asNum(previous);
  final now = asNum(current);
  if (before == 0) return now == 0 ? '0%' : null;
  final change = (now - before) * 100 / before.abs();
  final arrow = change >= 0 ? '↑ +' : '↓ ';
  return '$arrow${change.abs().toStringAsFixed(1)}%';
}

class ReportsPage extends StatefulWidget {
  const ReportsPage(
      {super.key,
      required this.api,
      this.role,
      this.dashboardMode = false,
      this.initialSection = 'ringkasan'});
  static final ValueNotifier<int> reloadTick = ValueNotifier(0);
  final ApiClient api;
  final String? role;
  final bool dashboardMode;
  final String initialSection;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String _section = 'penjualan';
  String _preset = '7d';
  String _closingDate = todayWib();
  DateTime? _from;
  DateTime? _to;
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;
  bool get _isOwner => widget.role == 'owner';
  List<Map<String, dynamic>> _branches = [];
  int? _branchId;
  int _loadGeneration = 0;

  (String, String) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    final range = mobileDateFilterRange(
      preset: _preset,
      now: now,
      customStart: _from,
      customEnd: _to,
    );
    return (d(range.start), d(range.end));
  }

  @override
  void initState() {
    super.initState();
    _section = widget.initialSection == 'ringkasan' && widget.role != 'kasir'
        ? 'penjualan'
        : widget.initialSection;
    if (_isOwner) {
      _branchId = BranchScope.active.value;
      widget.api.activeBranchId = _branchId;
      BranchScope.active.addListener(_onBranchScopeChanged);
    }
    _load();
    // Saat internet kembali: otomatis muat ulang dari server (normal setelah sync).
    OfflineStatus.syncTick.addListener(_onSyncTick);
    // Saat tab Laporan dibuka lagi: muat ulang (data offline ikut terhitung).
    ReportsPage.reloadTick.addListener(_onReloadTick);
  }

  void _onSyncTick() {
    _load(silent: true);
  }

  void _onReloadTick() {
    _load(silent: true);
  }

  void _onBranchScopeChanged() {
    if (!_isOwner) return;
    final branchId = BranchScope.active.value;
    widget.api.activeBranchId = branchId;
    if (branchId == _branchId) return;
    setState(() => _branchId = branchId);
    _load();
  }

  @override
  void dispose() {
    OfflineStatus.syncTick.removeListener(_onSyncTick);
    ReportsPage.reloadTick.removeListener(_onReloadTick);
    if (_isOwner) BranchScope.active.removeListener(_onBranchScopeChanged);
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_loadGeneration;
    bool isCurrent() => mounted && generation == _loadGeneration;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final (start, end) = _range;
    final cacheKey = _section == 'penutupan'
        ? 'report-$_section-$_closingDate-$_branchId'
        : 'report-$_section-${_range.$1}-${_range.$2}-$_branchId';
    try {
      if (_isOwner && _branches.isEmpty) {
        try {
          final branches = await widget.api.branches();
          if (!isCurrent()) return;
          _branches = branches.cast<Map<String, dynamic>>();
        } catch (_) {}
      }
      Map<String, dynamic> data;
      if (widget.dashboardMode && widget.role == 'kasir') {
        final payload = await widget.api.dashboard(start: start, end: end);
        final summary =
            (payload['selected_summary'] as Map<String, dynamic>?) ??
                (payload['summary'] as Map<String, dynamic>?) ??
                const {};
        final selectedTrend = (payload['selected_sales_trend'] as List?) ??
            (payload['sales_trend'] as List?) ??
            const [];
        data = {
          'summary': {
            'transactions':
                summary['transactions'] ?? summary['today_transactions'] ?? 0,
            'revenue': summary['sales'] ?? summary['today_sales'] ?? 0,
            'gross_sales': summary['sales'] ?? summary['today_sales'] ?? 0,
            'products_sold': summary['products_sold'] ?? 0,
          },
          'selected_period': payload['selected_period'],
          'cashier_dashboard': payload,
          'payment_methods': payload['selected_payment_breakdown'] ??
              payload['payment_breakdown'] ??
              const [],
          'daily_sales': [
            for (final row in selectedTrend)
              if (row is Map<String, dynamic>)
                {
                  'date': row['date'],
                  'transactions': row['transactions'] ?? 0,
                  'revenue': row['sales'] ?? 0,
                },
          ],
        };
      } else {
        switch (_section) {
          case 'penutupan':
            // Owner all memakai agregasi server-side yang sama dengan web.
            data = await widget.api.reportDailyClosing(
              date: _closingDate,
              branchId: _branchId,
              allBranches: _isOwner && _branchId == null,
            );
            break;
          case 'ppn':
            if (_isOwner && _branchId == null && _branches.isNotEmpty) {
              final reports = await Future.wait(_branches.map((branch) =>
                  widget.api.taxReport(
                      start: start,
                      end: end,
                      branchId: int.tryParse('${branch['id']}'))));
              data = _combineTaxReports(reports);
            } else {
              data = await widget.api
                  .taxReport(start: start, end: end, branchId: _branchId);
            }
            break;
          default:
            data = await widget.api.reportOverview(
                start: start,
                end: end,
                branchId: _branchId,
                allBranches: _isOwner && _branchId == null);
        }
      }
      if (!isCurrent()) return;
      // Transaksi & pengeluaran/pemasukan offline ikut masuk ringkasan/penutupan.
      final merged = await _mergeOffline(data);
      if (!isCurrent()) return;
      setState(() => _data = merged);
      // Simpan cache laporan (data server asli) untuk offline.
      try {
        await OfflineStore.cacheSet(cacheKey, jsonEncode(data));
      } catch (_) {
        // Cache lokal bersifat tambahan; kegagalannya tidak boleh membuat
        // laporan server terlihat gagal.
      }
    } on ApiException catch (e) {
      if (e.isNetwork) {
        try {
          final cached = await OfflineStore.cacheGet(cacheKey);
          if (cached != null && isCurrent()) {
            final merged =
                await _mergeOffline(cached['payload'] as Map<String, dynamic>);
            if (isCurrent()) {
              setState(() {
                _data = merged;
                _error = null;
              });
            }
            return;
          }
        } catch (_) {}
      }
      if (isCurrent()) setState(() => _error = e.message);
    } finally {
      if (isCurrent()) setState(() => _loading = false);
    }
  }

  Map<String, dynamic> _combineTaxReports(List<Map<String, dynamic>> reports) {
    final outputSales = <String, dynamic>{
      'transactions': 0,
      'gross_sales': 0.0,
      'ppn_base': 0.0,
      'ppn_amount': 0.0,
    };
    final inputSales = <String, dynamic>{
      'orders': 0,
      'total_purchase': 0.0,
      'ppn_base': 0.0,
      'ppn_amount': 0.0,
    };
    final months = <String, Map<String, dynamic>>{};
    double net = 0;
    for (final report in reports) {
      final output = (report['ppn_keluaran'] as Map<String, dynamic>?) ?? {};
      final input = (report['ppn_masukan'] as Map<String, dynamic>?) ?? {};
      for (final field in outputSales.keys) {
        final total = asNum(outputSales[field]) + asNum(output[field]);
        outputSales[field] = field == 'transactions' ? total.toInt() : total;
      }
      for (final field in inputSales.keys) {
        final total = asNum(inputSales[field]) + asNum(input[field]);
        inputSales[field] = field == 'orders' ? total.toInt() : total;
      }
      net += asNum(report['net_ppn']);
      for (final raw in (report['monthly'] as List?) ?? []) {
        if (raw is! Map) continue;
        final row = Map<String, dynamic>.from(raw);
        final month = '${row['month']}';
        final target = months.putIfAbsent(month, () => {'month': month});
        for (final field in [
          'transactions',
          'gross_sales',
          'ppn_base',
          'ppn_keluaran',
        ]) {
          final total = asNum(target[field]) + asNum(row[field]);
          target[field] = field == 'transactions' ? total.toInt() : total;
        }
      }
    }
    final sortedMonths = months.values.toList()
      ..sort((a, b) => '${a['month']}'.compareTo('${b['month']}'));
    return {
      'store_name': 'Semua toko/gudang',
      'tax_rate': 'gabungan',
      'ppn_keluaran': outputSales,
      'ppn_masukan': inputSales,
      'net_ppn': net,
      'monthly': sortedMonths,
    };
  }

  /// Tambahkan transaksi & pengeluaran/pemasukan offline ke Ringkasan/Penutupan.
  Future<Map<String, dynamic>> _mergeOffline(Map<String, dynamic> data) async {
    try {
      final rawTxs = await OfflineStore.pending();
      final rawExps = await OfflineStore.pendingExpenses();
      final periodStart = _section == 'penutupan' ? _closingDate : _range.$1;
      final periodEnd = _section == 'penutupan' ? _closingDate : _range.$2;
      // Antrean lokal adalah data tambahan, bukan laporan global. Filter
      // berdasarkan cabang DAN tanggal bisnis agar transaksi lama/offline
      // tidak masuk ke penutupan atau periode yang sedang dilihat.
      final txs = <Map<String, dynamic>>[];
      for (final row in rawTxs) {
        try {
          final payload = jsonDecode(row['payload'] as String? ?? '{}')
              as Map<String, dynamic>;
          final branch = int.tryParse('${payload['branch_id']}');
          final date = _offlineBusinessDate(payload, row['created_at'],
              dateKey: 'transaction_date');
          if ((_branchId == null || branch == _branchId) &&
              reportDateInRange(date, periodStart, periodEnd)) {
            txs.add(row);
          }
        } catch (_) {}
      }
      final exps = <Map<String, dynamic>>[];
      for (final row in rawExps) {
        try {
          final payload = jsonDecode(row['payload'] as String? ?? '{}')
              as Map<String, dynamic>;
          final branch = payload['branch_id'] == null
              ? null
              : int.tryParse('${payload['branch_id']}');
          final date = _offlineBusinessDate(payload, row['created_at'],
              dateKey: 'expense_date');
          // Legacy expense tanpa branch_id tidak boleh masuk laporan cabang
          // tertentu karena asal datanya tidak dapat dipastikan.
          if ((_branchId == null || branch == _branchId) &&
              reportDateInRange(date, periodStart, periodEnd)) {
            exps.add(row);
          }
        } catch (_) {}
      }
      if (txs.isEmpty && exps.isEmpty) return data;
      double txTotal = 0;
      var offlinePcs = 0;
      final byMethod = <String, double>{};
      final methodCounts = <String, int>{};
      final byDate = <String, Map<String, dynamic>>{};
      for (final t in txs) {
        txTotal += asNum(t['grand_total']);
        final p =
            jsonDecode(t['payload'] as String? ?? '{}') as Map<String, dynamic>;
        for (final item in (p['items'] as List?) ?? const []) {
          if (item is Map) offlinePcs += asNum(item['quantity']).round();
        }
        final payments = (p['payments'] as List?) ?? const [];
        if (payments.isNotEmpty) {
          for (final rawPayment in payments) {
            if (rawPayment is! Map) continue;
            final method = (rawPayment['payment_method'] ?? 'cash').toString();
            byMethod[method] =
                (byMethod[method] ?? 0) + asNum(rawPayment['amount']);
            methodCounts[method] = (methodCounts[method] ?? 0) + 1;
          }
        } else {
          final method = (p['payment_method'] ?? 'cash').toString();
          byMethod[method] = (byMethod[method] ?? 0) + asNum(t['grand_total']);
          methodCounts[method] = (methodCounts[method] ?? 0) + 1;
        }
        final date = _offlineBusinessDate(p, t['created_at'],
                dateKey: 'transaction_date') ??
            todayWib();
        final daily = byDate.putIfAbsent(
            date, () => {'date': date, 'transactions': 0, 'revenue': 0.0});
        daily['transactions'] = asNum(daily['transactions']) + 1;
        daily['revenue'] = asNum(daily['revenue']) + asNum(t['grand_total']);
      }
      double expSum = 0;
      double incSum = 0;
      double financeCashNet = 0;
      final incomeByDate = <String, double>{};
      final expenseByDate = <String, double>{};
      for (final r in exps) {
        final p =
            jsonDecode(r['payload'] as String? ?? '{}') as Map<String, dynamic>;
        final date =
            _offlineBusinessDate(p, r['created_at'], dateKey: 'expense_date') ??
                p['date']?.toString() ??
                todayWib();
        final amount = asNum(p['amount']);
        if (p['type'] == 'income') {
          incSum += amount;
          if ((p['payment_method'] ?? 'cash') == 'cash') {
            financeCashNet += amount;
          }
          incomeByDate[date] = (incomeByDate[date] ?? 0) + amount;
        } else {
          expSum += amount;
          if ((p['payment_method'] ?? 'cash') == 'cash') {
            financeCashNet -= amount;
          }
          expenseByDate[date] = (expenseByDate[date] ?? 0) + amount;
        }
      }
      final copy = Map<String, dynamic>.from(data);
      if (_section == 'penutupan') {
        final methods = Map<String, dynamic>.from(
            (copy['methods'] as Map<String, dynamic>?) ?? {});
        for (final e in byMethod.entries) {
          final m = Map<String, dynamic>.from(
              (methods[e.key] as Map<String, dynamic>?) ?? {});
          m['sales'] = asNum(m['sales']) + e.value;
          m['total'] = asNum(m['total']) + e.value;
          methods[e.key] = m;
        }
        copy['methods'] = methods;
        copy['receipt_count'] = asNum(copy['receipt_count']) + txs.length;
        copy['total_sales'] = asNum(copy['total_sales']) + txTotal;
        copy['subtotal'] = asNum(copy['subtotal']) + txTotal;
        copy['expenses'] = asNum(copy['expenses']) + expSum;
        copy['income'] = asNum(copy['income']) + incSum;
        if (financeCashNet != 0) {
          final cash = Map<String, dynamic>.from(
              (methods['cash'] as Map<String, dynamic>?) ?? {});
          cash['cash_in_out'] = asNum(cash['cash_in_out']) + financeCashNet;
          cash['total'] = asNum(cash['total']) + financeCashNet;
          methods['cash'] = cash;
          copy['methods'] = methods;
        }
        copy['expected_total'] =
            asNum(copy['expected_total']) + txTotal + financeCashNet;
      } else {
        final summary = Map<String, dynamic>.from(
            (copy['summary'] as Map<String, dynamic>?) ?? {});
        summary['transactions'] = asNum(summary['transactions']) + txs.length;
        summary['revenue'] = asNum(summary['revenue']) + txTotal;
        summary['gross_sales'] = asNum(summary['gross_sales']) + txTotal;
        summary['income'] = asNum(summary['income']) + incSum;
        summary['expenses'] = asNum(summary['expenses']) + expSum;
        summary['gross_profit'] = asNum(summary['gross_profit']) + txTotal;
        summary['net_profit'] =
            asNum(summary['net_profit']) + txTotal + incSum - expSum;
        final grossSales = asNum(summary['gross_sales'] ?? summary['revenue']);
        final grossProfit = asNum(summary['gross_profit']);
        summary['profit_margin_percent'] = grossSales > 0
            ? double.parse((grossProfit * 100 / grossSales).toStringAsFixed(2))
            : 0;
        final productsSold = _totalProductsSold(copy);
        if (productsSold != null) {
          summary['products_sold'] = productsSold + offlinePcs;
        }
        copy['summary'] = summary;
        final payments = List<Map<String, dynamic>>.from(
            (copy['payment_methods'] as List?) ?? []);
        for (final e in byMethod.entries) {
          final idx = payments.indexWhere(
              (p) => (p['payment_method'] ?? '').toString() == e.key);
          if (idx >= 0) {
            payments[idx] = {
              ...payments[idx],
              'amount': asNum(payments[idx]['amount']) + e.value,
              'transactions':
                  asNum(payments[idx]['transactions']) + methodCounts[e.key]!,
            };
          } else {
            payments.add({
              'payment_method': e.key,
              'amount': e.value,
              'transactions': methodCounts[e.key] ?? 0,
            });
          }
        }
        copy['payment_methods'] = payments;
        final dailySales = List<Map<String, dynamic>>.from(
            (copy['daily_sales'] as List?) ?? []);
        for (final e in byDate.entries) {
          final index =
              dailySales.indexWhere((row) => '${row['date']}' == e.key);
          if (index < 0) {
            dailySales.add(e.value);
          } else {
            dailySales[index] = {
              ...dailySales[index],
              'transactions': asNum(dailySales[index]['transactions']) +
                  asNum(e.value['transactions']),
              'revenue': asNum(dailySales[index]['revenue']) +
                  asNum(e.value['revenue']),
            };
          }
        }
        dailySales.sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
        copy['daily_sales'] = dailySales;

        void mergeDailyAmounts(String key, Map<String, double> additions) {
          final rows =
              List<Map<String, dynamic>>.from((copy[key] as List?) ?? []);
          for (final entry in additions.entries) {
            final index =
                rows.indexWhere((row) => '${row['date']}' == entry.key);
            if (index < 0) {
              rows.add({'date': entry.key, 'amount': entry.value});
            } else {
              rows[index] = {
                ...rows[index],
                'amount': asNum(rows[index]['amount']) + entry.value,
              };
            }
          }
          rows.sort((a, b) => '${a['date']}'.compareTo('${b['date']}'));
          copy[key] = rows;
        }

        mergeDailyAmounts('daily_income', incomeByDate);
        mergeDailyAmounts('daily_expenses', expenseByDate);
      }
      return copy;
    } catch (_) {
      return data;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              if (!widget.dashboardMode)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  child: PillTabs(
                    tabs: [
                      (
                        value:
                            widget.role == 'kasir' ? 'ringkasan' : 'penjualan',
                        icon: Icons.point_of_sale,
                        label: 'Penjualan'
                      ),
                      (
                        value: 'penutupan',
                        icon: Icons.event_available,
                        label: 'Penutupan'
                      ),
                      if (widget.role != 'kasir')
                        (value: 'ppn', icon: Icons.receipt, label: 'PPN'),
                    ],
                    selected: _section,
                    onChanged: (v) {
                      setState(() => _section = v);
                      _load();
                    },
                  ),
                ),
              _buildFilterBar(context),
              Expanded(child: _buildBody()),
            ],
          ),
        ],
      ),
    );
  }

  String _presetLabel(String preset) {
    return mobileDateFilterLabel(preset);
  }

  String _branchLabel(int? id) {
    if (id == null) return _isOwner ? 'Semua toko/gudang' : 'Toko saya';
    final branch = _branches.firstWhere(
      (item) => item['id']?.toString() == id.toString(),
      orElse: () => <String, dynamic>{},
    );
    return branch['name']?.toString() ?? 'Cabang dipilih';
  }

  Widget _buildFilterBar(BuildContext context) {
    // Penutupan memakai satu tanggal bisnis, bukan preset periode. Sembunyikan
    // pemilih periode supaya kasir tidak melihat dua kontrol tanggal sekaligus.
    final usesClosingDate = !widget.dashboardMode && _section == 'penutupan';
    if (widget.dashboardMode && widget.role == 'kasir') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: GlassCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: _buildPeriodSelector(context),
              ),
              IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                tooltip: 'Muat ulang',
              ),
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: GlassCard(
        padding: const EdgeInsets.all(12),
        radius: 20,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                if (usesClosingDate)
                  const Spacer()
                else
                  Expanded(
                    child: _buildPeriodSelector(context),
                  ),
                if (!widget.dashboardMode) ...[
                  const SizedBox(width: 8),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: taskSurface(context),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: taskBorder(context)),
                    ),
                    child: IconButton(
                      key: const ValueKey('reports-filter-button'),
                      onPressed: _openFilterSheet,
                      icon: const Icon(Icons.tune_outlined),
                      tooltip: 'Buka filter',
                      color: ink(context),
                    ),
                  ),
                ],
                if (!widget.dashboardMode) const SizedBox(width: 8),
                if (!widget.dashboardMode)
                  IconButton(
                    onPressed: _export,
                    icon: const Icon(Icons.ios_share, size: 20),
                    tooltip: 'Export CSV',
                  ),
              ],
            ),
            if (_isOwner) ...[
              const SizedBox(height: 4),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Lokasi: ${_branchLabel(_branchId)}',
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        fontWeight: FontWeight.w600,
                        color: taskMuted(context))),
              ),
            ],
            if (!usesClosingDate) ...[
              const SizedBox(height: 4),
              Text(
                  'Periode: ${_presetLabel(_preset)} · ${_range.$1} s.d. ${_range.$2}',
                  style: TextStyle(
                      fontSize: TaskTypography.secondary,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.outline)),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _selectPreset(String? value) async {
    if (value == null) return;
    if (value == 'custom') {
      final now = DateTime.now();
      final picked = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: now,
        initialDateRange: _from != null && _to != null
            ? DateTimeRange(start: _from!, end: _to!)
            : DateTimeRange(
                start: now.subtract(const Duration(days: 6)), end: now),
        helpText: 'Pilih rentang tanggal',
      );
      if (picked == null || !mounted) return;
      setState(() {
        _preset = value;
        _from = picked.start;
        _to = picked.end;
      });
    } else {
      setState(() {
        _preset = value;
        _from = null;
        _to = null;
      });
    }
    _load();
  }

  Widget _buildPeriodSelector(BuildContext context) {
    return Container(
      key: const ValueKey('reports-period-selector'),
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: taskSurface(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: taskBorder(context)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _preset,
          isExpanded: true,
          icon: const Icon(Icons.keyboard_arrow_down),
          selectedItemBuilder: (_) => [
            for (final _ in kMobileDateFilterOptions)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                    '${_presetLabel(_preset)} · ${_range.$1} s.d. ${_range.$2}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: TaskTypography.label,
                        fontWeight: FontWeight.w700,
                        color: ink(context))),
              ),
          ],
          items: [
            for (final option in kMobileDateFilterOptions)
              DropdownMenuItem<String>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: _selectPreset,
        ),
      ),
    );
  }

  Future<void> _openFilterSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _ReportFilterSheet(
        isOwner: _isOwner,
        initialBranchId: _branchId,
        branches: _branches,
        onApply: (branchId) {
          if (branchId == null || BranchScope.active.value == branchId) {
            setState(() => _branchId = branchId);
            _load();
          } else {
            unawaited(BranchScope.set(branchId));
          }
        },
      ),
    );
  }

  Future<void> _export() async {
    final buf = StringBuffer();
    void row(List<String> cells) =>
        buf.writeln(cells.map((c) => '"${c.replaceAll('"', '""')}"').join(';'));
    row(['Laporan', _section, 'Rentang', '${_range.$1} s.d. ${_range.$2}']);
    row([]);
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final productsSold = _totalProductsSold(_data);
    switch (_section) {
      case 'penutupan':
        row(['Tanggal', (_data?['date'] ?? '').toString()]);
        row(['Total struk', '${_data?['receipt_count'] ?? 0}']);
        row(['Total penjualan', fmtRp(asNum(_data?['total_sales']))]);
        row(['Retur', '${_data?['return_count'] ?? 0}']);
        row(['Total kasir', fmtRp(asNum(_data?['expected_total']))]);
        final methods = (_data?['methods'] as Map<String, dynamic>?) ?? {};
        for (final e in methods.entries) {
          final m = e.value as Map<String, dynamic>;
          row([
            'Metode',
            e.key.toUpperCase(),
            'Penjualan',
            fmtRp(asNum(m['sales'])),
            'Total',
            fmtRp(asNum(m['total']))
          ]);
        }
      case 'ppn':
        final kel = (_data?['ppn_keluaran'] as Map<String, dynamic>?) ?? {};
        final mas = (_data?['ppn_masukan'] as Map<String, dynamic>?) ?? {};
        row(['PPN Keluaran', fmtRp(asNum(kel['ppn_amount']))]);
        row(['PPN Masukan', fmtRp(asNum(mas['ppn_amount']))]);
        row(['PPN Bersih', fmtRp(asNum(_data?['net_ppn']))]);
      default:
        row(['Transaksi', '${summary['transactions'] ?? 0}']);
        if (productsSold != null) {
          row(['Produk terjual', '$productsSold pcs']);
        }
        row(['Pendapatan', fmtRp(asNum(summary['revenue']))]);
        row(['HPP', fmtRp(asNum(summary['cost_of_goods']))]);
        row(['Laba kotor', fmtRp(asNum(summary['gross_profit']))]);
        row([
          'Persentase keuntungan',
          _fmtPercent(summary['profit_margin_percent'])
        ]);
        row(['Pengeluaran', fmtRp(asNum(summary['expenses']))]);
        row(['Laba bersih', fmtRp(asNum(summary['net_profit']))]);
        for (final m in ((_data?['payment_methods'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Metode',
            (m['payment_method'] ?? '').toString().toUpperCase(),
            fmtRp(asNum(m['amount']))
          ]);
        }
        for (final s in ((_data?['low_stock'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Stok rendah',
            s['name'].toString(),
            '${s['stock']} / min ${s['min_stock']}'
          ]);
        }
        for (final p in ((_data?['products'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Produk',
            '${p['name']} (${p['sku'] ?? '-'})',
            '${p['quantity_sold']} pcs',
            'Omzet ${fmtRp(asNum(p['revenue']))}',
            'Modal ${fmtRp(asNum(p['cost_of_goods']))}',
            'Laba ${fmtRp(asNum(p['profit']))}',
          ]);
        }
        for (final s in ((_data?['daily_sales'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Penjualan harian',
            '${s['date']}',
            '${s['transactions']} transaksi',
            fmtRp(asNum(s['revenue'])),
          ]);
        }
        for (final c in ((_data?['cashiers'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Kasir',
            '${c['name']} (${c['role']})',
            '${c['transactions']} transaksi',
            fmtRp(asNum(c['revenue'])),
            'Diskon ${fmtRp(asNum(c['discounts']))}',
          ]);
        }
        for (final c in ((_data?['customers'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Pelanggan',
            '${c['name']} · ${c['phone'] ?? '-'}',
            '${c['transactions']} transaksi',
            fmtRp(asNum(c['revenue'])),
          ]);
        }
        for (final t in ((_data?['transactions'] as List?) ?? [])
            .cast<Map<String, dynamic>>()) {
          row([
            'Transaksi',
            '${t['invoice_no']}',
            '${t['transaction_date']} · ${t['cashier']} · ${t['branch_name']}',
            (t['payment_method'] ?? '').toString(),
            '${t['status']}',
            fmtRp(asNum(t['grand_total'])),
          ]);
        }
    }
    final file = File('${Directory.systemTemp.path}/laporan_$_section.csv');
    await file.writeAsString(buf.toString());
    if (!mounted) return;
    await Share.shareXFiles([XFile(file.path)], subject: 'Laporan $_section');
  }

  Future<void> _pickClosingDate() async {
    final selected = DateTime.tryParse(_closingDate) ?? DateTime.now();
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDate: selected.isAfter(now)
          ? DateTime(now.year, now.month, now.day)
          : selected,
      helpText: 'Pilih tanggal penutupan',
    );
    if (picked == null || !mounted) return;
    final date =
        '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
    setState(() => _closingDate = date);
    _load();
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
          child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          CircularProgressIndicator(),
          SizedBox(height: 12),
          Text('Memuat laporan…')
        ],
      ));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
    }
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final emptySales = (widget.dashboardMode ||
            _section == 'ringkasan' ||
            _section == 'penjualan') &&
        asNum(summary['transactions']) == 0 &&
        asNum(summary['gross_sales'] ?? summary['revenue']) == 0;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.fromLTRB(
            12, 12, 12, 16 + MediaQuery.of(context).padding.bottom),
        children: _spaced([
          if (emptySales)
            GlassCard(
                child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.dashboardMode && widget.role == 'kasir'
                    ? 'Belum ada penjualan pada periode ini.'
                    : 'Belum ada penjualan pada rentang ini.'),
                const SizedBox(height: 8),
                OutlinedButton(
                    onPressed: widget.dashboardMode && widget.role == 'kasir'
                        ? _load
                        : () => _selectPreset('custom'),
                    child: Text(widget.dashboardMode && widget.role == 'kasir'
                        ? 'Muat ulang'
                        : 'Ubah periode')),
              ],
            )),
          ...(widget.dashboardMode
              ? _dashboard()
              : switch (_section) {
                  'penjualan' || 'ringkasan' => _sales(),
                  'penutupan' => _closing(),
                  'ppn' => _ppn(),
                  _ => _sales(),
                }),
        ]),
      ),
    );
  }

  List<Widget> _dashboard() {
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final methods = ((_data?['payment_methods'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final products = ((_data?['products'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final lowStock = ((_data?['low_stock'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final daily = ((_data?['daily_sales'] as List?) ?? [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final productsSold = _totalProductsSold(_data);
    final previous = _previousSummary(_data);
    final paymentTotal = methods.fold<double>(0,
        (total, method) => total + asNum(method['amount'] ?? method['total']));
    final hasProfit = summary['net_profit'] != null;
    final fourthKpiLabel = hasProfit ? 'Laba bersih' : 'Pengeluaran';
    final fourthKpiValue = hasProfit
        ? fmtRp(asNum(summary['net_profit']))
        : fmtRp(asNum(summary['expenses']));
    return [
      _ReportSection(
        key: const ValueKey('reports-merged-summary'),
        title: 'Ringkasan toko',
        icon: Icons.storefront_outlined,
        color: kTaskDark,
        children: [
          _DashboardKpiGrid(
            items: [
              _DashboardKpiData(
                  'Pendapatan',
                  fmtRp(asNum(summary['gross_sales'] ?? summary['revenue'])),
                  Icons.account_balance_wallet_outlined,
                  kTaskDark,
                  change: _changePercent(
                      summary['gross_sales'] ?? summary['revenue'],
                      previous['gross_sales'] ?? previous['revenue'])),
              _DashboardKpiData('Pesanan', '${summary['transactions'] ?? 0}',
                  Icons.shopping_bag_outlined, kTaskAccent,
                  change: _changePercent(
                      summary['transactions'], previous['transactions'])),
              _DashboardKpiData('Produk terjual', '${productsSold ?? 0} pcs',
                  Icons.inventory_2_outlined, kTaskTeal,
                  change:
                      _changePercent(productsSold, previous['products_sold'])),
              _DashboardKpiData(fourthKpiLabel, fourthKpiValue,
                  Icons.savings_outlined, kTaskPurple,
                  change: _changePercent(
                      hasProfit ? summary['net_profit'] : summary['expenses'],
                      hasProfit
                          ? previous['net_profit']
                          : previous['expenses'])),
            ],
          ),
          if (summary['profit_margin_percent'] != null)
            _Row('Persentase keuntungan',
                _fmtPercent(summary['profit_margin_percent'])),
          _Row('Laba kotor', fmtRp(asNum(summary['gross_profit']))),
        ],
      ),
      _ReportSection(
        key: const ValueKey('reports-merged-sales'),
        title: 'Penjualan',
        icon: Icons.trending_up,
        color: kTaskAccent,
        children: [
          _FocalMetric('Total penjualan',
              fmtRp(asNum(summary['gross_sales'] ?? summary['revenue']))),
          if (daily.isNotEmpty)
            _SalesTrendCard(rows: daily)
          else
            const _ReportEmptySeries(
                'Belum ada data penjualan pada periode ini.'),
          _DashboardFinanceRows(
            payment: paymentTotal > 0
                ? paymentTotal
                : asNum(summary['gross_sales'] ?? summary['revenue']),
            expense: asNum(summary['expenses']),
            returns: asNum(summary['return_amount']),
            onTap: _showFinanceDetail,
          ),
        ],
      ),
      _DashboardListPair(
        products: products.take(5).toList(),
        lowStock: lowStock.take(5).toList(),
      ),
    ];
  }

  Future<void> _showFinanceDetail(String kind) async {
    if (!mounted) return;
    final (title, icon, color, child) = switch (kind) {
      'Pembayaran' => (
          'Pembayaran',
          Icons.credit_card,
          kTaskTeal,
          _paymentsDetail()
        ),
      'Pengeluaran' => (
          'Pengeluaran',
          Icons.receipt_long,
          kTaskTerracotta,
          _expensesDetail()
        ),
      _ => ('Pengembalian', Icons.refresh, kTaskPurple, _returnsDetail()),
    };
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => SafeArea(
        key: ValueKey('reports-finance-detail-sheet-$title'),
        child: Container(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheetContext).height * .86),
          decoration: BoxDecoration(
            color: pageBg(sheetContext),
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(24),
            ),
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(11),
                      ),
                      child: Icon(icon, size: 20, color: color),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text('Rincian $title',
                          style: TextStyle(
                              fontSize: TaskTypography.sectionTitle,
                              fontWeight: FontWeight.w800,
                              color: ink(sheetContext))),
                    ),
                    IconButton(
                      tooltip: 'Tutup',
                      onPressed: () => Navigator.pop(sheetContext),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text('Data mengikuti periode dan toko/gudang yang dipilih.',
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        color: taskMuted(sheetContext))),
                const SizedBox(height: 12),
                child,
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _spaced(List<Widget> items) => [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          items[i],
        ],
      ];

  int? _totalProductsSold(Map<String, dynamic>? data) {
    if (data == null) return null;
    final summary = data['summary'] as Map<String, dynamic>?;
    if (summary?['products_sold'] != null) {
      return asNum(summary!['products_sold']).round();
    }
    final tiers = data['price_tiers'];
    if (tiers is! List) return null;
    var total = 0;
    for (final tier in tiers) {
      if (tier is Map) total += asNum(tier['products_sold']).round();
    }
    return total;
  }

  List<Widget> _sales() {
    final cashiers = _reportList('cashiers');
    final customers = _reportList('customers');
    final transactions = _reportList('transactions');
    return [
      ..._dashboard(),
      _ReportDetailHeading(key: const ValueKey('reports-detail-heading')),
      _ReportDetailAccordion(
        key: const ValueKey('reports-detail-transactions'),
        title: 'Transaksi',
        description: 'Penjualan, diskon, pembatalan, dan invoice.',
        icon: Icons.receipt_long_outlined,
        color: kTaskDark,
        count:
            '${transactions.length + _reportList('cancellations').length} transaksi',
        initiallyExpanded: true,
        onPdf: () => _exportDetailPdf('transactions'),
        onPrint: () => _printDetail('transactions'),
        child: _transactionsDetail(),
      ),
      _ReportDetailAccordion(
        key: const ValueKey('reports-detail-products'),
        title: 'Produk',
        description: 'Produk terjual, kategori, stok rendah, dan tier harga.',
        icon: Icons.inventory_2_outlined,
        color: kTaskTeal,
        count:
            '${_reportList('products').length + _reportList('categories').length + _reportList('low_stock').length + _reportList('price_tiers').length} data',
        onPdf: () => _exportDetailPdf('products'),
        onPrint: () => _printDetail('products'),
        child: _productsDetail(),
      ),
      _ReportDetailAccordion(
        key: const ValueKey('reports-detail-payments'),
        title: 'Pembayaran',
        description: 'Metode bayar, kasir, dan pelanggan terbaik.',
        icon: Icons.credit_card_outlined,
        color: kTaskAccent,
        count:
            '${_reportList('payment_methods').length + cashiers.length + customers.length} data',
        onPdf: () => _exportDetailPdf('payments'),
        onPrint: () => _printDetail('payments'),
        child: _paymentsDetail(),
      ),
      _ReportDetailAccordion(
        key: const ValueKey('reports-detail-returns'),
        title: 'Retur',
        description: 'Ringkasan dan rincian barang yang dikembalikan.',
        icon: Icons.refresh_outlined,
        color: kTaskPurple,
        count:
            '${_reportList('return_summary').length + _reportList('returns').length} data',
        onPdf: () => _exportDetailPdf('returns'),
        onPrint: () => _printDetail('returns'),
        child: _returnsDetail(),
      ),
      _ReportDetailAccordion(
        key: const ValueKey('reports-detail-analysis'),
        title: 'Analisis periode',
        description: 'Tren harian, jam pencatatan, cabang, dan stok.',
        icon: Icons.analytics_outlined,
        color: kTaskTerracotta,
        count:
            '${_reportList('daily_sales').length + _reportList('hourly_sales').length + _reportList('branch_comparison').length} grafik',
        onPdf: () => _exportDetailPdf('analysis'),
        onPrint: () => _printDetail('analysis'),
        child: _analysisDetail(),
      ),
    ];
  }

  List<Map<String, dynamic>> _reportList(String key) =>
      ((_data?[key] as List?) ?? []).whereType<Map<String, dynamic>>().toList();

  List<Widget> _detailSpaced(List<Widget> children) => [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: 10),
          children[i],
        ],
      ];

  Widget _transactionsDetail() {
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final transactions = _reportList('transactions');
    final cancellations = _reportList('cancellations');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _detailSpaced([
        _ReportDetailTable(
          title: 'Diskon, pembatalan, dan retur',
          subtitle: 'Nilai ringkasan pada periode yang dipilih.',
          rows: [
            _ReportDetailRow(
                'Total diskon', fmtRp(asNum(summary['discounts']))),
            _ReportDetailRow(
                'Diskon item', fmtRp(asNum(summary['item_discounts']))),
            _ReportDetailRow('Diskon transaksi',
                fmtRp(asNum(summary['transaction_discounts']))),
            _ReportDetailRow(
                'Pembatalan (${summary['cancelled_transactions'] ?? 0} transaksi)',
                fmtRp(asNum(summary['cancelled_amount']))),
            _ReportDetailRow('Refund retur (${summary['returns'] ?? 0} retur)',
                fmtRp(asNum(summary['refund_amount']))),
          ],
        ),
        _ReportDetailTable(
          title: 'Daftar transaksi',
          subtitle:
              'Tanggal, invoice, kasir, metode, status, dan total bersih.',
          rows: [
            for (final row in transactions)
              _ReportDetailRow(
                '${row['invoice_no'] ?? '-'} · ${_displayDate(row['transaction_date'])}',
                fmtRp(asNum(row['grand_total']) -
                    asNum(row['cancelled_amount']) -
                    asNum(row['refunded_amount'])),
                '${row['cashier'] ?? '-'} · ${(row['payment_method'] ?? '-').toString().toUpperCase()} · ${row['status'] ?? '-'}',
              ),
          ],
        ),
        _ReportDetailTable(
          title: 'Daftar pembatalan',
          subtitle: 'Transaksi yang memiliki pembatalan pada periode ini.',
          rows: [
            for (final row in cancellations)
              _ReportDetailRow(
                '${row['invoice_no'] ?? '-'} · ${_displayDate(row['transaction_date'])}',
                fmtRp(asNum(row['cancelled_amount'])),
                '${row['cashier'] ?? '-'} · ${row['cancelled_qty'] ?? 0} qty · ${row['cancel_reason'] ?? '-'}',
              ),
          ],
        ),
      ]),
    );
  }

  Widget _productsDetail() {
    final products = _reportList('products');
    final categories = _reportList('categories');
    final lowStock = _reportList('low_stock');
    final tiers = _reportList('price_tiers');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _detailSpaced([
        _ReportDetailTable(
          title: 'Produk terjual',
          subtitle: 'Produk dan varian berdasarkan pendapatan.',
          rows: [
            for (final row in products)
              _ReportDetailRow(
                '${row['name'] ?? '-'} · ${row['sku'] ?? 'Tanpa SKU'}',
                '${row['quantity_sold'] ?? 0} pcs',
                '${row['category_name'] ?? 'Tanpa kategori'} · Omzet ${fmtRp(asNum(row['revenue']))} · Laba ${fmtRp(asNum(row['profit']))}',
              ),
          ],
        ),
        _ReportDetailTable(
          title: 'Penjualan berdasarkan kategori',
          subtitle: 'Kategori mengikuti katalog produk saat ini.',
          rows: [
            for (final row in categories)
              _ReportDetailRow(
                '${row['category_name'] ?? 'Tanpa kategori'}',
                '${row['quantity_sold'] ?? 0} pcs',
                'Omzet ${fmtRp(asNum(row['revenue']))} · Modal ${fmtRp(asNum(row['cost_of_goods']))} · Laba ${fmtRp(asNum(row['profit']))}',
              ),
          ],
        ),
        _ReportDetailTable(
          title: 'Stok perlu perhatian',
          subtitle: 'Produk yang stoknya sama atau di bawah stok minimum.',
          rows: [
            for (final row in lowStock)
              _ReportDetailRow(
                  '${row['name'] ?? '-'} · ${row['sku'] ?? '-'}',
                  '${row['stock'] ?? 0} pcs',
                  'Minimum ${row['min_stock'] ?? 0} pcs'),
          ],
        ),
        _ReportDetailTable(
          title: 'Ringkasan tier harga',
          subtitle: 'Penjualan berdasarkan tier harga transaksi.',
          rows: [
            for (final row in tiers)
              _ReportDetailRow(
                  '${row['price_tier'] ?? '-'}',
                  '${row['products_sold'] ?? 0} pcs',
                  '${row['transactions'] ?? 0} transaksi · ${fmtRp(asNum(row['revenue']))}'),
          ],
        ),
      ]),
    );
  }

  Widget _paymentsDetail() {
    final methods = _reportList('payment_methods');
    final cashiers = _reportList('cashiers');
    final customers = _reportList('customers');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _detailSpaced([
        _ReportDetailTable(
          title: 'Metode pembayaran',
          subtitle: 'Nilai per metode yang dipakai pada transaksi.',
          rows: [
            for (final row in methods)
              _ReportDetailRow(
                  '${row['payment_method'] ?? '-'}'.toUpperCase(),
                  fmtRp(asNum(row['amount'])),
                  '${row['transactions'] ?? 0} transaksi'),
          ],
        ),
        _ReportDetailTable(
          title: 'Laporan kasir',
          subtitle: 'Penjualan per staf.',
          rows: [
            for (final row in cashiers)
              _ReportDetailRow(
                  '${row['name'] ?? '-'} · ${row['role'] ?? ''}',
                  fmtRp(asNum(row['revenue'])),
                  '${row['transactions'] ?? 0} transaksi'),
          ],
        ),
        _ReportDetailTable(
          title: 'Pelanggan terbaik',
          subtitle: 'Pelanggan dengan nilai belanja tertinggi.',
          rows: [
            for (final row in customers)
              _ReportDetailRow(
                  '${row['name'] ?? '-'} · ${row['phone'] ?? 'Tanpa telepon'}',
                  fmtRp(asNum(row['revenue'])),
                  '${row['transactions'] ?? 0} transaksi'),
          ],
        ),
      ]),
    );
  }

  Widget _returnsDetail() {
    final summary = _reportList('return_summary');
    final returns = _reportList('returns');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _detailSpaced([
        _ReportDetailTable(
          title: 'Ringkasan retur',
          subtitle: 'Retur berdasarkan status dan tanggal pencatatan.',
          rows: [
            for (final row in summary)
              _ReportDetailRow(
                  '${row['status'] ?? '-'}',
                  '${row['quantity_returned'] ?? 0} pcs',
                  '${row['returns_count'] ?? 0} retur · Refund ${fmtRp(asNum(row['refund_amount']))}'),
          ],
        ),
        _ReportDetailTable(
          title: 'Daftar retur',
          subtitle: 'Rincian retur yang dicatat pada periode ini.',
          rows: [
            for (final row in returns)
              _ReportDetailRow(
                  '${row['return_no'] ?? '-'} · ${row['invoice_no'] ?? '-'}',
                  '${row['quantity_returned'] ?? 0} pcs',
                  '${row['created_by_name'] ?? '-'} · ${row['status'] ?? '-'} · Refund ${fmtRp(asNum(row['refund_amount']))}'),
          ],
        ),
      ]),
    );
  }

  Widget _expensesDetail() {
    final details = _reportList('expense_details');
    final daily = _reportList('daily_expenses');
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final rows = details.isNotEmpty
        ? [
            for (final row in details)
              _ReportDetailRow(
                '${row['name'] ?? row['category'] ?? 'Pengeluaran'}',
                fmtRp(asNum(row['amount'])),
                '${_displayDate(row['expense_date'] ?? row['date'])} · ${(row['payment_method'] ?? 'cash').toString().toUpperCase()}${row['notes'] == null ? '' : ' · ${row['notes']}'}',
              ),
          ]
        : [
            for (final row in daily)
              _ReportDetailRow(
                _displayDate(row['date']),
                fmtRp(asNum(row['amount'])),
                'Total pengeluaran pada tanggal tersebut',
              ),
          ];
    if (rows.isEmpty && asNum(summary['expenses']) > 0) {
      rows.add(
          _ReportDetailRow('Total periode', fmtRp(asNum(summary['expenses']))));
    }
    return _ReportDetailTable(
      title: 'Rincian pengeluaran',
      subtitle: details.isNotEmpty
          ? 'Nama, tanggal, metode, dan catatan pengeluaran.'
          : 'Ringkasan pengeluaran per tanggal pada periode ini.',
      rows: rows,
    );
  }

  Widget _analysisDetail() {
    final daily = _reportList('daily_sales');
    final hourly = _reportList('hourly_sales');
    final branches = _reportList('branch_comparison');
    final widgets = <Widget>[
      _ReportDetailTable(
        title: 'Penjualan harian',
        subtitle: 'Ringkasan transaksi per hari.',
        rows: [
          for (final row in daily)
            _ReportDetailRow(
                _displayDate(row['date']),
                fmtRp(asNum(row['revenue'])),
                '${row['transactions'] ?? 0} transaksi'),
        ],
      ),
      _ReportDetailTable(
        title: 'Penjualan per jam pencatatan',
        subtitle: 'Dikelompokkan menurut waktu WIB saat transaksi disimpan.',
        rows: [
          for (final row in hourly)
            _ReportDetailRow(
                '${row['hour'] ?? '-'} WIB',
                fmtRp(asNum(row['revenue'])),
                '${row['transactions'] ?? 0} transaksi'),
        ],
      ),
    ];
    if (_isOwner && _branchId == null) {
      widgets.add(_ReportDetailTable(
        title: 'Perbandingan antar toko',
        subtitle: 'Semua toko aktif untuk periode yang dipilih.',
        rows: [
          for (final row in branches)
            _ReportDetailRow(
                '${row['branch_name'] ?? '-'}',
                fmtRp(asNum(row['revenue'])),
                '${row['transactions'] ?? 0} transaksi · Laba ${fmtRp(asNum(row['net_profit']))}'),
        ],
      ));
    }
    widgets.add(GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Laporan stok',
              style: TextStyle(
                  fontSize: TaskTypography.label,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          const SizedBox(height: 6),
          Text('Stok saat ini, mutasi, dan tren tersedia di halaman inventori.',
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  color: taskMuted(context))),
        ],
      ),
    ));
    return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: _detailSpaced(widgets));
  }

  Future<void> _exportDetailPdf(String detail) async {
    final rows = _detailExportRows(detail);
    final document = pw.Document();
    document.addPage(pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(28),
      build: (_) => [
        pw.Text('Laporan ${_detailTitle(detail)}',
            style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 6),
        pw.Text('Periode ${_range.$1} s.d. ${_range.$2}',
            style: const pw.TextStyle(fontSize: 9)),
        pw.SizedBox(height: 16),
        pw.TableHelper.fromTextArray(
          headers: const ['Rincian', 'Nilai', 'Keterangan'],
          data: [
            for (final row in rows)
              [row[0], row[1], row.length > 2 ? row[2] : '']
          ],
          headerStyle: pw.TextStyle(fontWeight: pw.FontWeight.bold),
          cellStyle: const pw.TextStyle(fontSize: 8),
          headerDecoration:
              const pw.BoxDecoration(color: PdfColors.blueGrey100),
          cellPadding:
              const pw.EdgeInsets.symmetric(horizontal: 5, vertical: 4),
        ),
      ],
    ));
    final bytes = await document.save();
    final file = File('${Directory.systemTemp.path}/laporan-$detail.pdf');
    await file.writeAsBytes(bytes, flush: true);
    if (!mounted) return;
    await Share.shareXFiles([XFile(file.path)],
        subject: 'Laporan ${_detailTitle(detail)}');
  }

  Future<void> _printDetail(String detail) => printNow(
        context,
        (printer, device) => printer.printReport(
          title: _detailTitle(detail),
          lines: _detailExportRows(detail),
        ),
        title: 'Cetak ${_detailTitle(detail)}',
      );

  String _detailTitle(String detail) => switch (detail) {
        'transactions' => 'Transaksi',
        'products' => 'Produk',
        'payments' => 'Pembayaran',
        'returns' => 'Retur',
        _ => 'Analisis periode',
      };

  List<List<String>> _detailExportRows(String detail) {
    final rows = <List<String>>[];
    void add(String label, dynamic value, [dynamic note = '']) => rows.add([
          label,
          value?.toString() ?? '-',
          note?.toString() ?? '',
        ]);
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    if (detail == 'transactions') {
      add('Total diskon', fmtRp(asNum(summary['discounts'])));
      add('Diskon item', fmtRp(asNum(summary['item_discounts'])));
      add('Diskon transaksi', fmtRp(asNum(summary['transaction_discounts'])));
      add('Pembatalan', fmtRp(asNum(summary['cancelled_amount'])),
          '${summary['cancelled_transactions'] ?? 0} transaksi');
      add('Refund retur', fmtRp(asNum(summary['refund_amount'])),
          '${summary['returns'] ?? 0} retur');
      for (final row in _reportList('transactions')) {
        add(
            'Transaksi ${row['invoice_no'] ?? '-'}',
            fmtRp(asNum(row['grand_total']) -
                asNum(row['cancelled_amount']) -
                asNum(row['refunded_amount'])),
            '${row['transaction_date'] ?? '-'} · ${row['cashier'] ?? '-'} · ${row['payment_method'] ?? '-'} · ${row['status'] ?? '-'}');
      }
      for (final row in _reportList('cancellations')) {
        add(
            'Pembatalan ${row['invoice_no'] ?? '-'}',
            fmtRp(asNum(row['cancelled_amount'])),
            '${row['transaction_date'] ?? '-'} · ${row['cancelled_qty'] ?? 0} qty · ${row['cancel_reason'] ?? '-'}');
      }
    } else if (detail == 'products') {
      for (final row in _reportList('products')) {
        add('Produk ${row['name'] ?? '-'}', '${row['quantity_sold'] ?? 0} pcs',
            '${row['sku'] ?? '-'} · ${row['category_name'] ?? '-'} · Omzet ${fmtRp(asNum(row['revenue']))} · Modal ${fmtRp(asNum(row['cost_of_goods']))} · Laba ${fmtRp(asNum(row['profit']))}');
      }
      for (final row in _reportList('categories')) {
        add(
            'Kategori ${row['category_name'] ?? '-'}',
            '${row['quantity_sold'] ?? 0} pcs',
            'Omzet ${fmtRp(asNum(row['revenue']))} · Modal ${fmtRp(asNum(row['cost_of_goods']))} · Laba ${fmtRp(asNum(row['profit']))}');
      }
      for (final row in _reportList('low_stock')) {
        add('Stok rendah ${row['name'] ?? '-'}', '${row['stock'] ?? 0} pcs',
            'SKU ${row['sku'] ?? '-'} · Minimum ${row['min_stock'] ?? 0} pcs');
      }
      for (final row in _reportList('price_tiers')) {
        add(
            'Tier ${row['price_tier'] ?? '-'}',
            '${row['products_sold'] ?? 0} pcs',
            '${row['transactions'] ?? 0} transaksi · ${fmtRp(asNum(row['revenue']))}');
      }
    } else if (detail == 'payments') {
      for (final row in _reportList('payment_methods')) {
        add(
            'Metode ${(row['payment_method'] ?? '-').toString().toUpperCase()}',
            fmtRp(asNum(row['amount'])),
            '${row['transactions'] ?? 0} transaksi');
      }
      for (final row in _reportList('cashiers')) {
        add('Kasir ${row['name'] ?? '-'}', fmtRp(asNum(row['revenue'])),
            '${row['transactions'] ?? 0} transaksi · ${row['role'] ?? '-'}');
      }
      for (final row in _reportList('customers')) {
        add('Pelanggan ${row['name'] ?? '-'}', fmtRp(asNum(row['revenue'])),
            '${row['transactions'] ?? 0} transaksi · ${row['phone'] ?? '-'}');
      }
    } else if (detail == 'returns') {
      for (final row in _reportList('return_summary')) {
        add(
            'Retur ${row['status'] ?? '-'}',
            '${row['quantity_returned'] ?? 0} pcs',
            '${row['returns_count'] ?? 0} retur · Refund ${fmtRp(asNum(row['refund_amount']))}');
      }
      for (final row in _reportList('returns')) {
        add(
            'Retur ${row['return_no'] ?? '-'}',
            '${row['quantity_returned'] ?? 0} pcs',
            '${row['invoice_no'] ?? '-'} · ${row['created_by_name'] ?? '-'} · ${row['status'] ?? '-'} · Refund ${fmtRp(asNum(row['refund_amount']))}');
      }
    } else {
      for (final row in _reportList('daily_sales')) {
        add('Harian ${row['date'] ?? '-'}', fmtRp(asNum(row['revenue'])),
            '${row['transactions'] ?? 0} transaksi');
      }
      for (final row in _reportList('hourly_sales')) {
        add('Jam ${row['hour'] ?? '-'} WIB', fmtRp(asNum(row['revenue'])),
            '${row['transactions'] ?? 0} transaksi');
      }
      for (final row in _reportList('branch_comparison')) {
        add('Toko ${row['branch_name'] ?? '-'}', fmtRp(asNum(row['revenue'])),
            '${row['transactions'] ?? 0} transaksi · Pengeluaran ${fmtRp(asNum(row['expenses']))} · Pemasukan ${fmtRp(asNum(row['income']))} · Laba ${fmtRp(asNum(row['net_profit']))}');
      }
      add('Laporan stok', 'Dashboard stok', 'inventori');
    }
    return rows;
  }

  String _displayDate(dynamic value) {
    final raw = value?.toString() ?? '';
    final date = DateTime.tryParse(raw);
    if (date == null) return raw;
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }

  Future<void> _printClosing() {
    return printNow(context, (printer, device) async {
      final previousBranch = widget.api.activeBranchId;
      if (_isOwner) widget.api.activeBranchId = _branchId;
      late final Map<String, dynamic> store;
      try {
        store = _isOwner && _branchId == null
            ? {'store_name': _data?['store'] ?? 'Semua Toko/Gudang'}
            : await widget.api.storeSettings();
      } finally {
        widget.api.activeBranchId = previousBranch;
      }
      await printer.printClosing({
        'store': store,
        'date': _data?['date'] ?? '',
        'receipt_count': _data?['receipt_count'] ?? 0,
        'total_sales': _data?['total_sales'] ?? 0,
        'return_count': _data?['return_count'] ?? 0,
        'expenses': _data?['expenses'] ?? 0,
        'income': _data?['income'] ?? 0,
        'expected_total': _data?['expected_total'] ?? 0,
        'methods': _data?['methods'] ?? {},
      });
    }, title: 'Cetak Penutupan');
  }

  List<Widget> _closing() {
    final methods = (_data?['methods'] as Map<String, dynamic>?) ?? {};
    return [
      OutlinedButton.icon(
        key: const ValueKey('reports-closing-date'),
        onPressed: _pickClosingDate,
        icon: const Icon(Icons.calendar_today_outlined, size: 17),
        label: Text('Tanggal penutupan · $_closingDate'),
        style: OutlinedButton.styleFrom(
          alignment: Alignment.centerLeft,
          minimumSize: const Size.fromHeight(44),
        ),
      ),
      const SizedBox(height: 8),
      FilledButton.icon(
        onPressed: _printClosing,
        style: FilledButton.styleFrom(
          backgroundColor: Theme.of(context).colorScheme.primary,
          foregroundColor: Theme.of(context).colorScheme.onPrimary,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          minimumSize: const Size.fromHeight(50),
        ),
        icon: const Icon(Icons.print, size: 18),
        label: const Text('Cetak Penutupan'),
      ),
      const SizedBox(height: 12),
      _Card('Penutupan ${_data?['date'] ?? ''}', [
        _Row('Total struk', '${_data?['receipt_count'] ?? 0}'),
        _FocalMetric('Total penjualan', fmtRp(asNum(_data?['total_sales']))),
        _Row('Retur', '${_data?['return_count'] ?? 0}'),
        _Row('Pengeluaran', fmtRp(asNum(_data?['expenses']))),
        _Row('Pemasukan', fmtRp(asNum(_data?['income']))),
        _Row('Total kasir', fmtRp(asNum(_data?['expected_total']))),
      ]),
      for (final entry in methods.entries)
        _methodCard(entry.key, entry.value as Map<String, dynamic>),
    ];
  }

  Widget _methodCard(String key, Map<String, dynamic> m) =>
      _Card(key.toUpperCase(), [
        _Row('Penjualan', fmtRp(asNum(m['sales']))),
        _Row('Retur', fmtRp(asNum(m['returns']))),
        _Row('Pembatalan', fmtRp(asNum(m['cancellations']))),
        _Row('Kas masuk/keluar', fmtRp(asNum(m['cash_in_out']))),
        _Row('Total', fmtRp(asNum(m['total']))),
      ]);

  List<Widget> _ppn() {
    final keluaran = (_data?['ppn_keluaran'] as Map<String, dynamic>?) ?? {};
    final masukan = (_data?['ppn_masukan'] as Map<String, dynamic>?) ?? {};
    final monthly =
        ((_data?['monthly'] as List?) ?? []).cast<Map<String, dynamic>>();
    final title = _data?['tax_rate'] == 'gabungan'
        ? 'PPN · Tarif gabungan'
        : 'PPN (rate ${_data?['tax_rate'] ?? 0}%)';
    return [
      _Card(title, [
        _Row('PPN Keluaran', fmtRp(asNum(keluaran['ppn_amount']))),
        _Row('PPN Masukan', fmtRp(asNum(masukan['ppn_amount']))),
        _Row('PPN Bersih', fmtRp(asNum(_data?['net_ppn']))),
      ]),
      _Card('PPN Keluaran', [
        _Row('Transaksi', '${keluaran['transactions'] ?? 0}'),
        _Row('Omset', fmtRp(asNum(keluaran['gross_sales']))),
        _Row('Dasar pengenaan', fmtRp(asNum(keluaran['ppn_base']))),
      ]),
      _Card('PPN Masukan', [
        _Row('PO diterima', '${masukan['orders'] ?? 0}'),
        _Row('Total beli', fmtRp(asNum(masukan['total_purchase']))),
        _Row('Dasar pengenaan', fmtRp(asNum(masukan['ppn_base']))),
      ]),
      if (monthly.isNotEmpty)
        _Card('Rincian bulanan', [
          for (final m in monthly)
            _Row('${m['month']}',
                '${fmtRp(asNum(m['ppn_keluaran']))} (${m['transactions']} trx)'),
        ]),
    ];
  }
}

class _ReportDetailHeading extends StatelessWidget {
  const _ReportDetailHeading({super.key});

  @override
  Widget build(BuildContext context) => GlassCard(
        child: Row(
          children: [
            Icon(Icons.shopping_bag_outlined, size: 20, color: kTaskAccent),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Laporan detail',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                  const SizedBox(height: 3),
                  Text(
                      'Rincian transaksi, produk, pembayaran, retur, dan analisis periode.',
                      style: TextStyle(
                          fontSize: TaskTypography.secondary,
                          color: taskMuted(context))),
                ],
              ),
            ),
            Icon(Icons.analytics_outlined,
                size: 24, color: taskBorder(context)),
          ],
        ),
      );
}

class _ReportDetailAccordion extends StatefulWidget {
  const _ReportDetailAccordion({
    super.key,
    required this.title,
    required this.description,
    required this.icon,
    required this.color,
    required this.count,
    required this.child,
    required this.onPdf,
    required this.onPrint,
    this.initiallyExpanded = false,
  });

  final String title;
  final String description;
  final IconData icon;
  final Color color;
  final String count;
  final Widget child;
  final VoidCallback onPdf;
  final VoidCallback onPrint;
  final bool initiallyExpanded;

  @override
  State<_ReportDetailAccordion> createState() => _ReportDetailAccordionState();
}

class _ReportDetailAccordionState extends State<_ReportDetailAccordion> {
  late bool _expanded = widget.initiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final accent = Theme.of(context).brightness == Brightness.dark &&
            widget.color == kTaskDark
        ? kTaskAccentDark
        : widget.color;
    return GlassCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: _expanded,
            label: '${widget.title}, ${_expanded ? 'tutup' : 'buka'}',
            child: InkWell(
              onTap: () => setState(() => _expanded = !_expanded),
              borderRadius: BorderRadius.circular(14),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 13, 12, 13),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: accent.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(widget.icon, size: 19, color: accent),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(widget.title,
                              style: TextStyle(
                                  fontSize: TaskTypography.cardTitle,
                                  fontWeight: FontWeight.w800,
                                  color: accent)),
                          const SizedBox(height: 2),
                          Text(widget.description,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: TaskTypography.secondary,
                                  color: taskMuted(context))),
                        ],
                      ),
                    ),
                    Text(widget.count,
                        style: TextStyle(
                            fontSize: TaskTypography.secondary,
                            color: taskMuted(context))),
                    const SizedBox(width: 4),
                    Icon(
                        _expanded
                            ? Icons.keyboard_arrow_up
                            : Icons.keyboard_arrow_down,
                        size: 21,
                        color: accent),
                  ],
                ),
              ),
            ),
          ),
          if (_expanded) ...[
            Divider(height: 1, color: taskBorder(context)),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: widget.onPdf,
                          icon: const Icon(Icons.picture_as_pdf_outlined,
                              size: 16),
                          label: const Text('Lihat PDF'),
                          style: OutlinedButton.styleFrom(
                              minimumSize: const Size.fromHeight(42)),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: widget.onPrint,
                          icon: const Icon(Icons.print_outlined, size: 16),
                          label: const Text('Cetak'),
                          style: FilledButton.styleFrom(
                              minimumSize: const Size.fromHeight(42)),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  widget.child,
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReportDetailRow {
  const _ReportDetailRow(this.label, this.value, [this.meta = '']);

  final String label;
  final String value;
  final String meta;
}

class _ReportDetailTable extends StatelessWidget {
  const _ReportDetailTable({
    required this.title,
    required this.subtitle,
    required this.rows,
  });

  final String title;
  final String subtitle;
  final List<_ReportDetailRow> rows;

  @override
  Widget build(BuildContext context) => GlassCard(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: TextStyle(
                              fontSize: TaskTypography.label,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                      const SizedBox(height: 3),
                      Text(subtitle,
                          style: TextStyle(
                              fontSize: TaskTypography.secondary,
                              color: taskMuted(context))),
                    ],
                  ),
                ),
                Text('${rows.length} data',
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        color: taskMuted(context))),
              ],
            ),
            const SizedBox(height: 8),
            if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Text('Belum ada data untuk periode ini.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        color: taskMuted(context))),
              )
            else
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) Divider(height: 1, color: taskBorder(context)),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 7),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(rows[i].label,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: TaskTypography.secondary,
                                    fontWeight: FontWeight.w700,
                                    color: ink(context))),
                            if (rows[i].meta.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(rows[i].meta,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: TaskTypography.secondary,
                                      color: taskMuted(context))),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(rows[i].value,
                          textAlign: TextAlign.right,
                          style: TextStyle(
                              fontSize: TaskTypography.secondary,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                    ],
                  ),
                ),
              ],
          ],
        ),
      );
}

typedef _ReportFilterApply = void Function(int? branchId);

class _ReportSection extends StatelessWidget {
  const _ReportSection({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.children,
  });

  final String title;
  final IconData icon;
  final Color color;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final sectionColor =
        Theme.of(context).brightness == Brightness.dark && color == kTaskDark
            ? kTaskAccentDark
            : color;
    return GlassCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: sectionColor),
              const SizedBox(width: 9),
              Expanded(
                child: Text(title,
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: sectionColor)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < children.length; i++) ...[
            if (i > 0)
              Divider(height: 14, thickness: 1, color: taskBorder(context)),
            children[i],
          ],
        ],
      ),
    );
  }
}

class _DashboardKpiData {
  const _DashboardKpiData(this.label, this.value, this.icon, this.color,
      {this.change});

  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final String? change;
}

class _DashboardKpiGrid extends StatelessWidget {
  const _DashboardKpiGrid({required this.items});

  final List<_DashboardKpiData> items;

  @override
  Widget build(BuildContext context) => GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: items.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
          mainAxisExtent: 104,
        ),
        itemBuilder: (context, index) {
          final item = items[index];
          return Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: taskSurface(context),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: taskBorder(context)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: item.color.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(6),
                        child: Icon(item.icon, size: 15, color: item.color),
                      ),
                    ),
                    const Spacer(),
                    if (item.change != null)
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 3),
                          decoration: BoxDecoration(
                            color: item.change!.startsWith('↓')
                                ? kTaskTerracotta.withValues(alpha: .12)
                                : kTaskTeal.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(99),
                          ),
                          child: Text(item.change!,
                              key: ValueKey('reports-kpi-change-${item.label}'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: TaskTypography.badge,
                                  fontWeight: FontWeight.w800,
                                  color: item.change!.startsWith('↓')
                                      ? kTaskTerracotta
                                      : kTaskTeal)),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        fontWeight: FontWeight.w700,
                        color: taskMuted(context))),
                const SizedBox(height: 3),
                Text(item.value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w900,
                        color: ink(context))),
              ],
            ),
          );
        },
      );
}

class _DashboardFinanceRows extends StatelessWidget {
  const _DashboardFinanceRows({
    required this.payment,
    required this.expense,
    required this.returns,
    required this.onTap,
  });

  final double payment;
  final double expense;
  final double returns;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          _DashboardFinanceRow(
              label: 'Pembayaran',
              amount: payment,
              icon: Icons.credit_card,
              color: kTaskTeal,
              key: const ValueKey('reports-finance-row-pembayaran'),
              onTap: () => onTap('Pembayaran')),
          _DashboardFinanceRow(
              label: 'Pengeluaran',
              amount: expense,
              icon: Icons.receipt_long,
              color: kTaskTerracotta,
              key: const ValueKey('reports-finance-row-pengeluaran'),
              onTap: () => onTap('Pengeluaran')),
          _DashboardFinanceRow(
              label: 'Pengembalian',
              amount: returns,
              icon: Icons.refresh,
              color: kTaskPurple,
              key: const ValueKey('reports-finance-row-pengembalian'),
              onTap: () => onTap('Pengembalian')),
        ],
      );
}

class _DashboardFinanceRow extends StatelessWidget {
  const _DashboardFinanceRow(
      {super.key,
      required this.label,
      required this.amount,
      required this.icon,
      required this.color,
      required this.onTap});

  final String label;
  final double amount;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        label: '$label ${fmtRp(amount)}',
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 7),
              child: Row(
                children: [
                  Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: .12),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Icon(icon, size: 16, color: color),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(label,
                        style: TextStyle(
                            fontSize: TaskTypography.secondary,
                            color: taskMuted(context))),
                  ),
                  Text(fmtRp(amount),
                      style: TextStyle(
                          fontSize: TaskTypography.label,
                          fontWeight: FontWeight.w900,
                          color: color)),
                  const SizedBox(width: 5),
                  Icon(Icons.chevron_right, size: 18, color: color),
                ],
              ),
            ),
          ),
        ),
      );
}

class _DashboardListPair extends StatelessWidget {
  const _DashboardListPair({required this.products, required this.lowStock});

  final List<Map<String, dynamic>> products;
  final List<Map<String, dynamic>> lowStock;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, constraints) {
          final cards = [
            _DashboardListCard(
              key: const ValueKey('reports-merged-products'),
              title: 'Produk terlaris',
              icon: Icons.shopping_bag_outlined,
              color: kTaskTeal,
              items: products,
              emptyMessage: 'Belum ada produk terlaris pada periode ini.',
              value: (product) => '${product['quantity_sold'] ?? 0} pcs',
              progress: (product) => asNum(product['quantity_sold']),
            ),
            _DashboardListCard(
              key: const ValueKey('reports-merged-low-stock'),
              title: 'Stok rendah',
              icon: Icons.inventory_2_outlined,
              color: kTaskTerracotta,
              items: lowStock,
              emptyMessage: 'Tidak ada stok yang perlu diperiksa.',
              value: (product) =>
                  '${product['stock'] ?? 0} / min ${product['min_stock'] ?? 0}',
              progress: (product) => asNum(product['stock']),
            ),
          ];
          if (constraints.maxWidth < 350) {
            return Column(
                children: [cards[0], const SizedBox(height: 12), cards[1]]);
          }
          return Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: cards[0]),
              const SizedBox(width: 10),
              Expanded(child: cards[1]),
            ],
          );
        },
      );
}

class _DashboardListCard extends StatelessWidget {
  const _DashboardListCard({
    super.key,
    required this.title,
    required this.icon,
    required this.color,
    required this.items,
    required this.emptyMessage,
    required this.value,
    required this.progress,
  });

  final String title;
  final IconData icon;
  final Color color;
  final List<Map<String, dynamic>> items;
  final String emptyMessage;
  final String Function(Map<String, dynamic>) value;
  final double Function(Map<String, dynamic>) progress;

  @override
  Widget build(BuildContext context) {
    final maxValue = items.fold<double>(
        0, (max, item) => progress(item) > max ? progress(item) : max);
    return GlassCard(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Icon(icon, size: 20, color: color),
              const SizedBox(width: 9),
              Expanded(
                child: Text(title,
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: color)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 18),
              child: Text(emptyMessage,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: taskMuted(context))),
            )
          else
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0)
                Divider(height: 12, thickness: 1, color: taskBorder(context)),
              _DashboardListItem(
                item: items[i],
                value: value(items[i]),
                color: color,
                progress: maxValue <= 0
                    ? .05
                    : (progress(items[i]) / maxValue).clamp(.05, 1.0),
              ),
            ],
        ],
      ),
    );
  }
}

class _DashboardListItem extends StatelessWidget {
  const _DashboardListItem({
    required this.item,
    required this.value,
    required this.color,
    required this.progress,
  });

  final Map<String, dynamic> item;
  final String value;
  final Color color;
  final double progress;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('${item['name'] ?? '-'}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        fontWeight: FontWeight.w700,
                        color: ink(context))),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.right,
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        color: taskMuted(context))),
              ),
            ],
          ),
          const SizedBox(height: 7),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: SizedBox(
              height: 7,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ColoredBox(color: taskBorder(context)),
                  FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: progress,
                    child: ColoredBox(color: color),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
}

class _ReportEmptySeries extends StatelessWidget {
  const _ReportEmptySeries(this.message);

  final String message;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 18),
        child: Text(message,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: taskMuted(context))),
      );
}

class _ReportFilterSheet extends StatefulWidget {
  const _ReportFilterSheet({
    required this.isOwner,
    required this.initialBranchId,
    required this.branches,
    required this.onApply,
  });

  final bool isOwner;
  final int? initialBranchId;
  final List<Map<String, dynamic>> branches;
  final _ReportFilterApply onApply;

  @override
  State<_ReportFilterSheet> createState() => _ReportFilterSheetState();
}

class _ReportFilterSheetState extends State<_ReportFilterSheet> {
  late int? _branchId;

  @override
  void initState() {
    super.initState();
    _branchId = widget.initialBranchId;
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 4, 16, bottomInset + 16),
        child: ConstrainedBox(
          constraints:
              BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .9),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('Filter laporan',
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                      tooltip: 'Tutup',
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                if (widget.isOwner) ...[
                  const SizedBox(height: 8),
                  DropdownButtonFormField<int?>(
                    initialValue: _branchId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Toko / Gudang',
                      prefixIcon: Icon(Icons.store_outlined),
                    ),
                    items: [
                      DropdownMenuItem<int?>(
                        value: null,
                        child: Text(
                            widget.isOwner ? 'Semua toko/gudang' : 'Toko saya'),
                      ),
                      for (final branch in widget.branches)
                        DropdownMenuItem<int?>(
                          value: int.tryParse('${branch['id']}'),
                          child: Text(branch['name']?.toString() ?? ''),
                        ),
                    ],
                    onChanged: (value) => setState(() => _branchId = value),
                  ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => setState(() {
                          _branchId = null;
                        }),
                        child: const Text('Reset'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: () {
                          widget.onApply(_branchId);
                          Navigator.pop(context);
                        },
                        child: const Text('Terapkan Filter'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SalesTrendCard extends StatefulWidget {
  const _SalesTrendCard({required this.rows});

  final List<Map<String, dynamic>> rows;

  @override
  State<_SalesTrendCard> createState() => _SalesTrendCardState();
}

class _SalesTrendCardState extends State<_SalesTrendCard> {
  int? _selectedIndex;

  @override
  Widget build(BuildContext context) {
    final visible = widget.rows.length > 14
        ? widget.rows.sublist(widget.rows.length - 14)
        : widget.rows;
    final values = visible.map((row) => asNum(row['revenue'])).toList();
    final maxValue =
        values.fold<double>(0, (max, value) => value > max ? value : max);
    final selected = _selectedIndex != null && _selectedIndex! < visible.length
        ? visible[_selectedIndex!]
        : null;
    const accent = kTaskAccent;
    return GlassCard(
      key: const ValueKey('reports-dashboard-trend'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Tren penjualan harian',
              style: TextStyle(
                  fontSize: TaskTypography.label,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          const SizedBox(height: 14),
          SizedBox(
            height: 148,
            child: Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    painter: _SalesTrendPainter(
                        values: values, color: accent, maxValue: maxValue),
                  ),
                ),
                Positioned.fill(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      for (var i = 0; i < visible.length; i++)
                        Expanded(
                          child: GestureDetector(
                            key: ValueKey('reports-sales-trend-bar-$i'),
                            behavior: HitTestBehavior.opaque,
                            onTap: () => setState(() => _selectedIndex = i),
                            child: const SizedBox.expand(),
                          ),
                        ),
                    ],
                  ),
                ),
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 0,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      for (final row in visible)
                        Text(_dateLabel(row['date']),
                            style: TextStyle(
                                fontSize: TaskTypography.chartAxis,
                                color: taskMuted(context))),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          if (selected == null)
            Text('Ketuk grafik untuk melihat total penjualan',
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: TaskTypography.secondary,
                    color: taskMuted(context)))
          else
            Container(
              key: const ValueKey('reports-sales-trend-value'),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: kTaskAccent.withValues(alpha: .08),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: kTaskAccent.withValues(alpha: .22)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(_dateLabel(selected['date']),
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: taskMuted(context))),
                  ),
                  Text(fmtRp(asNum(selected['revenue'])),
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          color: kTaskAccent)),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String _dateLabel(dynamic value) {
    final raw = value?.toString() ?? '';
    return raw.length >= 10
        ? '${raw.substring(8, 10)}/${raw.substring(5, 7)}'
        : raw;
  }
}

class _SalesTrendPainter extends CustomPainter {
  const _SalesTrendPainter(
      {required this.values, required this.color, required this.maxValue});

  final List<double> values;
  final Color color;
  final double maxValue;

  @override
  void paint(Canvas canvas, Size size) {
    final chart = Rect.fromLTRB(12, 8, size.width - 12, size.height - 28);
    final gridPaint = Paint()
      ..color = color.withValues(alpha: .12)
      ..strokeWidth = 1;
    for (var i = 0; i < 4; i++) {
      final y = chart.top + chart.height * i / 3;
      canvas.drawLine(Offset(chart.left, y), Offset(chart.right, y), gridPaint);
    }
    if (values.isEmpty) return;
    final points = <Offset>[];
    for (var i = 0; i < values.length; i++) {
      final x = values.length == 1
          ? chart.center.dx
          : chart.left + chart.width * i / (values.length - 1);
      final ratio = maxValue <= 0 ? 0.0 : (values[i] / maxValue).clamp(0, 1);
      points.add(Offset(x, chart.bottom - chart.height * ratio));
    }
    final line = Path()..moveTo(points.first.dx, points.first.dy);
    for (var i = 1; i < points.length; i++) {
      final previous = points[i - 1];
      final current = points[i];
      final midpoint = (previous.dx + current.dx) / 2;
      line.cubicTo(
          midpoint, previous.dy, midpoint, current.dy, current.dx, current.dy);
    }
    final area = Path.from(line)
      ..lineTo(points.last.dx, chart.bottom)
      ..lineTo(points.first.dx, chart.bottom)
      ..close();
    canvas.drawPath(
        area,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              color.withValues(alpha: .24),
              color.withValues(alpha: .03)
            ],
          ).createShader(chart));
    canvas.drawPath(
        line,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.2
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round);
    final dotPaint = Paint()..color = color;
    final ringPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    for (final point in points) {
      canvas.drawCircle(point, 4.2, dotPaint);
      canvas.drawCircle(point, 4.2, ringPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _SalesTrendPainter oldDelegate) =>
      oldDelegate.values != values ||
      oldDelegate.color != color ||
      oldDelegate.maxValue != maxValue;
}

class _Card extends StatelessWidget {
  const _Card(this.title, this.rows);
  final String title;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) {
    final accent = _dashboardCardAccent(title);
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(_dashboardCardIcon(title), size: 18, color: accent),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(title,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: accent)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < rows.length; i++) ...[
            if (i > 0)
              Divider(height: 14, thickness: 1, color: taskBorder(context)),
            rows[i],
          ],
        ],
      ),
    );
  }
}

Color _dashboardCardAccent(String title) {
  if (title.contains('Hasil usaha')) return kTaskTeal;
  if (title.contains('Ringkasan')) return kTaskAccent;
  if (title.contains('Pembayaran') || title.contains('Metode')) {
    return kTaskTeal;
  }
  if (title.contains('Stok')) return kTaskWarning;
  if (title.contains('Produk')) return kTaskTerracotta;
  return kTaskAccent;
}

IconData _dashboardCardIcon(String title) {
  if (title.contains('Hasil usaha')) {
    return Icons.account_balance_wallet_outlined;
  }
  if (title.contains('Pembayaran') || title.contains('Metode')) {
    return Icons.payments_outlined;
  }
  if (title.contains('Stok')) return Icons.inventory_2_outlined;
  if (title.contains('Produk')) return Icons.local_mall_outlined;
  return Icons.insights_outlined;
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, color: taskMuted(context))),
            ),
            const SizedBox(width: 14),
            Flexible(
              child: Text(value,
                  textAlign: TextAlign.right,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: TaskTypography.secondary,
                      fontWeight: FontWeight.w700,
                      color: ink(context))),
            ),
          ],
        ),
      );
}

class _FocalMetric extends StatelessWidget {
  const _FocalMetric(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final valueSize = MediaQuery.sizeOf(context).width <= 360
        ? TaskTypography.displayCompact
        : TaskTypography.display;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: TaskTypography.label, color: taskMuted(context))),
        const SizedBox(height: 6),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value,
              style: TextStyle(
                  fontSize: valueSize,
                  fontWeight: FontWeight.w800,
                  color: kTaskAccent)),
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}
