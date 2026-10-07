import 'dart:convert';

// ignore_for_file: prefer_const_constructors

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import 'api_client.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'report_filter.dart';
import 'task_ui.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.api, this.role});
  static final ValueNotifier<int> reloadTick = ValueNotifier(0);
  final ApiClient api;
  final String? role;

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

  @override
  void dispose() {
    OfflineStatus.syncTick.removeListener(_onSyncTick);
    ReportsPage.reloadTick.removeListener(_onReloadTick);
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
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
          _branches =
              (await widget.api.branches()).cast<Map<String, dynamic>>();
        } catch (_) {}
      }
      Map<String, dynamic> data;
      switch (_section) {
        case 'penutupan':
          // Penutupan hanya untuk hari ini (tanpa rentang).
          data = await widget.api
              .reportDailyClosing(date: todayWib(), branchId: _branchId);
          break;
        case 'ppn':
          data = await widget.api
              .taxReport(start: start, end: end, branchId: _branchId);
          break;
        default:
          data = await widget.api
              .reportOverview(start: start, end: end, branchId: _branchId);
      }
      if (!mounted) return;
      // Transaksi & pengeluaran/pemasukan offline ikut masuk ringkasan/penutupan.
      final merged = await _mergeOffline(data);
      if (!mounted) return;
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
          if (cached != null && mounted) {
            final merged =
                await _mergeOffline(cached['payload'] as Map<String, dynamic>);
            if (mounted) {
              setState(() {
                _data = merged;
                _error = null;
              });
            }
            return;
          }
        } catch (_) {}
      }
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
      final byMethod = <String, double>{};
      for (final t in txs) {
        txTotal += asNum(t['grand_total']);
        final p =
            jsonDecode(t['payload'] as String? ?? '{}') as Map<String, dynamic>;
        final m = (p['payment_method'] ?? 'cash').toString();
        byMethod[m] = (byMethod[m] ?? 0) + asNum(t['grand_total']);
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
        summary['income'] = asNum(summary['income']) + incSum;
        summary['expenses'] = asNum(summary['expenses']) + expSum;
        summary['gross_profit'] =
            asNum(summary['gross_profit']) + txTotal + incSum;
        summary['net_profit'] =
            asNum(summary['net_profit']) + txTotal + incSum - expSum;
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
            };
          } else {
            payments.add({'payment_method': e.key, 'amount': e.value});
          }
        }
        copy['payment_methods'] = payments;
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
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                child: PillTabs(
                  tabs: const [
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
    if (id == null) return 'Toko saya (default)';
    final branch = _branches.firstWhere(
      (item) => item['id']?.toString() == id.toString(),
      orElse: () => <String, dynamic>{},
    );
    return branch['name']?.toString() ?? 'Cabang dipilih';
  }

  Widget _buildFilterBar(BuildContext context) {
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
                const SizedBox(width: 8),
                IconButton(
                  onPressed: _export,
                  icon: const Icon(Icons.ios_share, size: 20),
                  tooltip: 'Export CSV',
                ),
              ],
            ),
            if (_isOwner && _branchId != null) ...[
              const SizedBox(height: 4),
              SizedBox(
                height: 48,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: InputChip(
                    label: Text('Lokasi: ${_branchLabel(_branchId)}'),
                    onDeleted: () {
                      setState(() => _branchId = null);
                      _load();
                    },
                    materialTapTargetSize: MaterialTapTargetSize.padded,
                  ),
                ),
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
          setState(() {
            _branchId = branchId;
          });
          _load();
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
            p['name'].toString(),
            '${p['quantity_sold']} pcs',
            fmtRp(asNum(p['revenue']))
          ]);
        }
    }
    final file = File('${Directory.systemTemp.path}/laporan_$_section.csv');
    await file.writeAsString(buf.toString());
    if (!mounted) return;
    await Share.shareXFiles([XFile(file.path)], subject: 'Laporan $_section');
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
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
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
        children: _spaced(switch (_section) {
          'penjualan' => _sales(),
          'penutupan' => _closing(),
          'ppn' => _ppn(),
          _ => _overview(),
        }),
      ),
    );
  }

  List<Widget> _spaced(List<Widget> items) => [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          items[i],
        ],
      ];

  List<Widget> _overview() {
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final methods = ((_data?['payment_methods'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final products =
        ((_data?['products'] as List?) ?? []).cast<Map<String, dynamic>>();
    final lowStock =
        ((_data?['low_stock'] as List?) ?? []).cast<Map<String, dynamic>>();
    return [
      _Card('Ringkasan', [
        _Row('Transaksi', '${summary['transactions'] ?? 0}'),
        _Row('Penjualan',
            fmtRp(asNum(summary['gross_sales'] ?? summary['revenue']))),
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
    final payments =
        ((_data?['payments'] as List?) ?? []).cast<Map<String, dynamic>>();
    return [
      _Card('Penjualan', [
        _Row('Transaksi', '${summary['transactions'] ?? 0}'),
        _Row('Penjualan bersih', fmtRp(asNum(summary['gross_sales']))),
        _Row('Diskon', fmtRp(asNum(summary['discounts']))),
      ]),
      if (payments.isNotEmpty)
        _Card('Per metode', [
          for (final p in payments)
            _Row((p['payment_method'] ?? '').toString().toUpperCase(),
                fmtRp(asNum(p['amount']))),
        ]),
    ];
  }

  Future<void> _printClosing() {
    return printNow(context, (printer, device) async {
      final store = await widget.api.storeSettings();
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
        onPressed: _printClosing,
        style: FilledButton.styleFrom(
          backgroundColor: kTaskDark,
          foregroundColor: Colors.white,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
          minimumSize: const Size.fromHeight(50),
        ),
        icon: const Icon(Icons.print, size: 18),
        label: const Text('Cetak Penutupan'),
      ),
      const SizedBox(height: 12),
      _Card('Penutupan ${_data?['date'] ?? ''}', [
        _Row('Total struk', '${_data?['receipt_count'] ?? 0}'),
        _Row('Total penjualan', fmtRp(asNum(_data?['total_sales']))),
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
    return [
      _Card('PPN (rate ${_data?['tax_rate'] ?? 0}%)', [
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
                      const DropdownMenuItem<int?>(
                        value: null,
                        child: Text('Toko saya (default)'),
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
                const Divider(
                    height: 14, thickness: 1, color: Color(0x14E2E8F0)),
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
                  style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xffCBD5E1)
                          : kTaskSecondary)),
            ),
            const SizedBox(width: 14),
            Text(value,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: ink(context))),
          ],
        ),
      );
}
