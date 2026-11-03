import 'dart:async';
import 'dart:convert';

// ignore_for_file: prefer_const_constructors

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'api_client.dart';
import 'branch_scope.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'report_filter.dart';
import 'task_ui.dart';

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
  String _section = 'ringkasan';
  String _preset = '7d';
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
    _section = widget.initialSection;
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
    final cacheKey = 'report-$_section-${_range.$1}-${_range.$2}-$_branchId';
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
            (payload['summary'] as Map<String, dynamic>?) ?? const {};
        data = {
          'summary': {
            'transactions': summary['today_transactions'] ?? 0,
            'revenue': summary['today_sales'] ?? 0,
            'gross_sales': summary['today_sales'] ?? 0,
          },
          'cashier_dashboard': payload,
          'payment_methods': payload['payment_breakdown'] ?? const [],
          'daily_sales': [
            for (final row in (payload['sales_trend'] as List? ?? const []))
              if (row is Map<String, dynamic>)
                {
                  'date': row['date'],
                  'transactions': 0,
                  'revenue': row['sales'] ?? 0,
                },
          ],
        };
      } else
        switch (_section) {
          case 'penutupan':
            // Penutupan harian per cabang; owner dapat melihat gabungannya.
            if (_isOwner && _branchId == null && _branches.isNotEmpty) {
              final reports = await Future.wait(_branches.map((branch) =>
                  widget.api.reportDailyClosing(
                      date: todayWib(),
                      branchId: int.tryParse('${branch['id']}'))));
              data = _combineClosings(reports);
            } else {
              data = await widget.api
                  .reportDailyClosing(date: todayWib(), branchId: _branchId);
            }
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

  Map<String, dynamic> _combineClosings(List<Map<String, dynamic>> reports) {
    final combined = <String, dynamic>{
      'document': 'Penutupan Penjualan',
      'store': 'Semua toko/gudang',
      'date': todayWib(),
      'receipt_count': 0,
      'return_count': 0,
      'total_sales': 0.0,
      'subtotal': 0.0,
      'expenses': 0.0,
      'income': 0.0,
      'expected_total': 0.0,
      'methods': <String, Map<String, dynamic>>{},
    };
    final methods = combined['methods'] as Map<String, Map<String, dynamic>>;
    for (final report in reports) {
      for (final field in [
        'receipt_count',
        'return_count',
        'total_sales',
        'subtotal',
        'expenses',
        'income',
        'expected_total',
      ]) {
        final total = asNum(combined[field]) + asNum(report[field]);
        combined[field] =
            const {'receipt_count', 'return_count'}.contains(field)
                ? total.toInt()
                : total;
      }
      final branchMethods = (report['methods'] as Map<String, dynamic>?) ?? {};
      for (final entry in branchMethods.entries) {
        final target = methods.putIfAbsent(entry.key, () => {});
        final values = entry.value as Map<String, dynamic>;
        for (final field in [
          'sales',
          'returns',
          'cancellations',
          'cash_in_out',
          'total',
        ]) {
          target[field] = asNum(target[field]) + asNum(values[field]);
        }
      }
    }
    return combined;
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
      // Filter by cabang: owner ganti cabang tidak boleh masuk ringkasan cabang lain.
      final txs = _branchId == null
          ? rawTxs
          : rawTxs.where((t) {
              try {
                final p = jsonDecode(t['payload'] as String? ?? '{}')
                    as Map<String, dynamic>;
                final b = int.tryParse('${p['branch_id']}');
                return b == _branchId;
              } catch (_) {
                return false;
              }
            }).toList();
      final exps = _branchId == null
          ? rawExps
          : rawExps.where((r) {
              try {
                final p = jsonDecode(r['payload'] as String? ?? '{}')
                    as Map<String, dynamic>;
                final b = p['branch_id'] == null
                    ? null
                    : int.tryParse('${p['branch_id']}');
                // legacy tanpa branch_id dianggap milik cabang aktif filter -> jangan hitung kalau filter cabang spesifik
                if (b == null) return false;
                return b == _branchId;
              } catch (_) {
                return false;
              }
            }).toList();
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
        final date = p['transaction_date']?.toString() ??
            t['created_at']?.toString().substring(0, 10) ??
            todayWib();
        final daily = byDate.putIfAbsent(
            date, () => {'date': date, 'transactions': 0, 'revenue': 0.0});
        daily['transactions'] = asNum(daily['transactions']) + 1;
        daily['revenue'] = asNum(daily['revenue']) + asNum(t['grand_total']);
      }
      double expSum = 0;
      double incSum = 0;
      for (final r in exps) {
        final p =
            jsonDecode(r['payload'] as String? ?? '{}') as Map<String, dynamic>;
        if (p['type'] == 'income') {
          incSum += asNum(p['amount']);
        } else {
          expSum += asNum(p['amount']);
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
        copy['expected_total'] = asNum(copy['expected_total']) + txTotal;
      } else {
        final summary = Map<String, dynamic>.from(
            (copy['summary'] as Map<String, dynamic>?) ?? {});
        summary['transactions'] = asNum(summary['transactions']) + txs.length;
        summary['revenue'] = asNum(summary['revenue']) + txTotal + incSum;
        summary['gross_sales'] = asNum(summary['gross_sales']) + txTotal;
        summary['income'] = asNum(summary['income']) + incSum;
        summary['expenses'] = asNum(summary['expenses']) + expSum;
        summary['gross_profit'] =
            asNum(summary['gross_profit']) + txTotal + incSum;
        summary['net_profit'] =
            asNum(summary['net_profit']) + txTotal + incSum - expSum;
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
              if (widget.dashboardMode)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Dashboard',
                        style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  child: PillTabs(
                    tabs: [
                      if (widget.role != 'kasir')
                        (
                          value: 'penjualan',
                          icon: Icons.point_of_sale,
                          label: 'Penjualan'
                        ),
                      (
                        value: 'ringkasan',
                        icon: Icons.dashboard_outlined,
                        label: 'Ringkasan'
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
    if (widget.dashboardMode && widget.role == 'kasir') {
      return Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: GlassCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          child: Row(
            children: [
              Expanded(
                child: Text('Penjualan hari ini, 7 hari, dan bulan ini',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: taskMuted(context))),
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
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: taskMuted(context))),
              ),
            ],
            const SizedBox(height: 4),
            Text(
                'Periode: ${_presetLabel(_preset)} · ${_range.$1} s.d. ${_range.$2}',
                style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: Theme.of(context).colorScheme.outline)),
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
                        fontSize: 13,
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
                    ? 'Belum ada penjualan hari ini.'
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
                  'penjualan' => _sales(),
                  'penutupan' => _closing(),
                  'ppn' => _ppn(),
                  _ => _overview(),
                }),
        ]),
      ),
    );
  }

  List<Widget> _dashboard() {
    if (widget.role == 'kasir') {
      final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
      final cashierData =
          (_data?['cashier_dashboard'] as Map<String, dynamic>?) ?? {};
      final periodSummary =
          (cashierData['summary'] as Map<String, dynamic>?) ?? {};
      final payments = ((_data?['payment_methods'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      final daily = ((_data?['daily_sales'] as List?) ?? [])
          .whereType<Map<String, dynamic>>()
          .toList();
      return [
        _Card('Penjualan', [
          _FocalMetric('Hari ini', fmtRp(asNum(summary['revenue']))),
          _Row('Transaksi hari ini', '${summary['transactions'] ?? 0}'),
          _Row('7 hari', fmtRp(asNum(periodSummary['seven_day_sales']))),
          _Row('Bulan ini', fmtRp(asNum(periodSummary['month_sales']))),
        ]),
        if (daily.isNotEmpty) _SalesTrendCard(rows: daily),
        if (payments.isNotEmpty)
          _Card('Pembayaran · 30 hari', [
            for (final payment in payments.take(5))
              _Row((payment['payment_method'] ?? '').toString().toUpperCase(),
                  fmtRp(asNum(payment['amount']))),
          ]),
      ];
    }

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
    return [
      _Card('Ringkasan penjualan', [
        _FocalMetric('Omzet',
            fmtRp(asNum(summary['gross_sales'] ?? summary['revenue']))),
        _Row('Transaksi', '${summary['transactions'] ?? 0}'),
        if (productsSold != null) _Row('Produk terjual', '$productsSold pcs'),
      ]),
      if (daily.isNotEmpty) _SalesTrendCard(rows: daily),
      _Card('Hasil usaha', [
        _Row('Diskon', fmtRp(asNum(summary['discounts']))),
        _Row('Modal barang', fmtRp(asNum(summary['cost_of_goods']))),
        _Row('Laba kotor', fmtRp(asNum(summary['gross_profit']))),
        _Row('Pemasukan lain', fmtRp(asNum(summary['income']))),
        _Row('Pengeluaran', fmtRp(asNum(summary['expenses']))),
        _Row('Laba bersih', fmtRp(asNum(summary['net_profit']))),
      ]),
      if (methods.isNotEmpty)
        _Card('Pembayaran per metode', [
          for (final method in methods.take(5))
            _Row((method['payment_method'] ?? '').toString().toUpperCase(),
                fmtRp(asNum(method['amount']))),
        ]),
      if (products.isNotEmpty)
        _Card('Produk terlaris', [
          for (final product in products.take(6))
            _Row('${product['name']} · ${product['quantity_sold']} pcs',
                fmtRp(asNum(product['revenue']))),
        ]),
      if (lowStock.isNotEmpty)
        _Card('Stok perlu diperiksa', [
          for (final product in lowStock.take(6))
            _Row('${product['name']}',
                '${product['stock']} / min ${product['min_stock']}'),
        ]),
    ];
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

  List<Widget> _overview() {
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final methods = ((_data?['payment_methods'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final products =
        ((_data?['products'] as List?) ?? []).cast<Map<String, dynamic>>();
    final lowStock =
        ((_data?['low_stock'] as List?) ?? []).cast<Map<String, dynamic>>();
    final productsSold = _totalProductsSold(_data);
    return [
      _Card('Ringkasan', [
        _FocalMetric('Penjualan',
            fmtRp(asNum(summary['gross_sales'] ?? summary['revenue']))),
        _Row('Transaksi', '${summary['transactions'] ?? 0}'),
        if (productsSold != null) _Row('Produk terjual', '$productsSold pcs'),
        _Row('Pemasukan', fmtRp(asNum(summary['income']))),
        _Row('HPP', fmtRp(asNum(summary['cost_of_goods']))),
        _Row('Laba kotor', fmtRp(asNum(summary['gross_profit']))),
        _Row('Pengeluaran', fmtRp(asNum(summary['expenses']))),
        _Row('Laba bersih', fmtRp(asNum(summary['net_profit']))),
      ]),
      if (methods.isNotEmpty)
        _Card('Metode pembayaran', [
          for (final m in methods)
            _Row((m['payment_method'] ?? '').toString().toUpperCase(),
                fmtRp(asNum(m['amount']))),
        ]),
      _Card('Stok rendah (${lowStock.length})', [
        for (final s in lowStock.take(10))
          _Row('${s['name']}', '${s['stock']} / min ${s['min_stock']}'),
      ]),
      _Card('Produk terlaris', [
        for (final p in products.take(10))
          _Row('${p['name']}',
              '${p['quantity_sold']} pcs · ${fmtRp(asNum(p['revenue']))}'),
      ]),
    ];
  }

  List<Widget> _sales() {
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final payments = ((_data?['payment_methods'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final products =
        ((_data?['products'] as List?) ?? []).cast<Map<String, dynamic>>();
    final daily =
        ((_data?['daily_sales'] as List?) ?? []).cast<Map<String, dynamic>>();
    final cashiers =
        ((_data?['cashiers'] as List?) ?? []).cast<Map<String, dynamic>>();
    final customers =
        ((_data?['customers'] as List?) ?? []).cast<Map<String, dynamic>>();
    final transactions =
        ((_data?['transactions'] as List?) ?? []).cast<Map<String, dynamic>>();
    final productsSold = _totalProductsSold(_data);
    return [
      _Card('Penjualan', [
        _FocalMetric('Penjualan bersih',
            fmtRp(asNum(summary['gross_sales'] ?? summary['revenue']))),
        _Row('Transaksi', '${summary['transactions'] ?? 0}'),
        if (productsSold != null) _Row('Produk terjual', '$productsSold pcs'),
        _Row('Diskon', fmtRp(asNum(summary['discounts']))),
        _Row('Modal barang terjual', fmtRp(asNum(summary['cost_of_goods']))),
        _Row('Laba kotor', fmtRp(asNum(summary['gross_profit']))),
        _Row('Laba bersih', fmtRp(asNum(summary['net_profit']))),
      ]),
      if (payments.isNotEmpty)
        _Card('Pembayaran per metode', [
          for (final p in payments)
            _Row(
                '${(p['payment_method'] ?? '').toString().toUpperCase()} · ${p['transactions'] ?? 0} transaksi',
                fmtRp(asNum(p['amount']))),
        ]),
      if (daily.isNotEmpty)
        _Card('Penjualan per tanggal', [
          for (final d in daily)
            _Row('${_displayDate(d['date'])} · ${d['transactions']} transaksi',
                fmtRp(asNum(d['revenue']))),
        ]),
      if (cashiers.isNotEmpty)
        _Card('Penjualan per kasir', [
          for (final c in cashiers.take(20))
            _Row('${c['name']} · ${c['role']}',
                '${c['transactions']} trx · ${fmtRp(asNum(c['revenue']))}'),
        ]),
      if (customers.isNotEmpty)
        _Card('Penjualan per pelanggan', [
          for (final c in customers.take(20))
            _Row('${c['name']} · ${c['phone'] ?? '-'}',
                '${c['transactions']} trx · ${fmtRp(asNum(c['revenue']))}'),
        ]),
      if (products.isNotEmpty)
        _Card('Produk terjual', [
          for (final p in products.take(30))
            _Row(
                '${p['name']} · SKU ${p['sku'] ?? '-'} · ${p['quantity_sold']} pcs',
                'Omzet ${fmtRp(asNum(p['revenue']))}\nModal ${fmtRp(asNum(p['cost_of_goods']))} · Laba ${fmtRp(asNum(p['profit']))}'),
        ]),
      if (transactions.isNotEmpty)
        _Card('Transaksi terbaru', [
          for (final t in transactions.take(30))
            _Row(
                '${t['invoice_no']} · ${_displayDate(t['transaction_date'])}\n${t['cashier']} · ${t['branch_name']} · ${(t['payment_method'] ?? '').toString().toUpperCase()}',
                '${fmtRp(asNum(t['grand_total']))}\n${t['status']}'),
        ]),
    ];
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
        store = await widget.api.storeSettings();
      } finally {
        widget.api.activeBranchId = previousBranch;
      }
      await printer.printClosing({
        'store': store,
        'date': _data?['date'] ?? '',
        'receipt_count': _data?['receipt_count'] ?? 0,
        'total_sales': _data?['total_sales'] ?? 0,
        'return_count': _data?['return_count'] ?? 0,
        'expected_total': _data?['expected_total'] ?? 0,
        'methods': _data?['methods'] ?? {},
      });
    }, title: 'Cetak Penutupan');
  }

  List<Widget> _closing() {
    final methods = (_data?['methods'] as Map<String, dynamic>?) ?? {};
    return [
      FilledButton.icon(
        onPressed: _isOwner && _branchId == null ? null : _printClosing,
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
      if (_isOwner && _branchId == null)
        Padding(
          padding: const EdgeInsets.only(top: 6),
          child: Text('Pilih satu cabang untuk mencetak penutupan.',
              style: TextStyle(fontSize: 11, color: taskMuted(context))),
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

typedef _ReportFilterApply = void Function(int? branchId);

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

class _SalesTrendCard extends StatelessWidget {
  const _SalesTrendCard({required this.rows});

  final List<Map<String, dynamic>> rows;

  @override
  Widget build(BuildContext context) {
    final visible = rows.length > 14 ? rows.sublist(rows.length - 14) : rows;
    final values = visible.map((row) => asNum(row['revenue'])).toList();
    final maxValue =
        values.fold<double>(0, (max, value) => value > max ? value : max);
    const accent = kTaskAccent;
    return GlassCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Tren penjualan harian',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          const SizedBox(height: 14),
          SizedBox(
            height: 104,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < visible.length; i++)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          SizedBox(
                            height: 76,
                            child: Align(
                              alignment: Alignment.bottomCenter,
                              child: Tooltip(
                                message: fmtRp(values[i]),
                                child: Container(
                                  width: 12,
                                  height: maxValue == 0
                                      ? 4
                                      : (values[i] / maxValue * 72)
                                          .clamp(4, 72)
                                          .toDouble(),
                                  decoration: BoxDecoration(
                                    color: accent.withValues(alpha: .82),
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            (visible[i]['date']?.toString() ?? '').length >= 10
                                ? visible[i]['date'].toString().substring(8, 10)
                                : visible[i]['date']?.toString() ?? '',
                            style: TextStyle(
                                fontSize: 9, color: taskMuted(context)),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card(this.title, this.rows);
  final String title;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) => GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
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
                      fontSize: 12,
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
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(fontSize: 13, color: taskMuted(context))),
          const SizedBox(height: 6),
          Text(value,
              style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  color: kTaskAccent)),
          const SizedBox(height: 8),
        ],
      );
}
