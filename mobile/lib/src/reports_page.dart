import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'task_ui.dart';

class ReportsPage extends StatefulWidget {
  const ReportsPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<ReportsPage> createState() => _ReportsPageState();
}

class _ReportsPageState extends State<ReportsPage> {
  String _section = 'ringkasan';
  String _preset = 'today';
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  (String, String) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    switch (_preset) {
      case '7d':
        return (d(now.subtract(const Duration(days: 6))), d(now));
      case '30d':
        return (d(now.subtract(const Duration(days: 29))), d(now));
      case 'bulan':
        return (
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
          d(now)
        );
      default:
        return (d(now), d(now));
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final (start, end) = _range;
      Map<String, dynamic> data;
      switch (_section) {
        case 'penjualan':
          data = await widget.api.reportSales(start: start, end: end);
          break;
        case 'penutupan':
          data = await widget.api.reportDailyClosing(date: start);
          break;
        case 'ppn':
          data = await widget.api.taxReport(start: start, end: end);
          break;
        default:
          data = await widget.api.reportOverview(start: start, end: end);
      }
      if (!mounted) return;
      setState(() => _data = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xffF5F1EA),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: PillTabs(
            tabs: const [
              (value: 'ringkasan', icon: Icons.dashboard_outlined, label: 'Ringkasan'),
              (value: 'penjualan', icon: Icons.trending_up, label: 'Penjualan'),
              (value: 'penutupan', icon: Icons.event_available, label: 'Penutupan'),
              (value: 'ppn', icon: Icons.receipt, label: 'PPN'),
            ],
            selected: _section,
            onChanged: (v) {
              setState(() => _section = v);
              _load();
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _preset,
                  decoration: InputDecoration(
                      labelText: 'Rentang',
                      filled: true,
                      fillColor: Colors.white,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 14),
                      enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide:
                              const BorderSide(color: Color(0xffE7E0D6))),
                      focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(16),
                          borderSide: const BorderSide(
                              color: Color(0xff1E3A5F), width: 1.4))),
                  items: const [
                    DropdownMenuItem(value: 'today', child: Text('Hari ini')),
                    DropdownMenuItem(value: '7d', child: Text('7 hari')),
                    DropdownMenuItem(value: '30d', child: Text('30 hari')),
                    DropdownMenuItem(value: 'bulan', child: Text('Bulan ini')),
                  ],
                  onChanged: (v) {
                    setState(() => _preset = v ?? 'today');
                    _load();
                  },
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  '${_range.$1} s.d. ${_range.$2}',
                  style:
                      TextStyle(color: Theme.of(context).colorScheme.outline),
                ),
              ),
            ],
          ),
        ),
          Expanded(child: _buildBody()),
        ],
      ),
        ],
      ),
    );
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
        padding: const EdgeInsets.all(12),
        children: switch (_section) {
          'penjualan' => _sales(),
          'penutupan' => _closing(),
          'ppn' => _ppn(),
          _ => _overview(),
        },
      ),
    );
  }

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
        _Row('Pendapatan', fmtRp(asNum(summary['revenue']))),
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
          backgroundColor: const Color(0xff1E3A5F),
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
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Color(0xff1E3A5F))),
            const SizedBox(height: 10),
            for (var i = 0; i < rows.length; i++) ...[
              if (i > 0)
                const Divider(
                    height: 14, thickness: 1, color: Color(0x14E7E0D6)),
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
                  style:
                      const TextStyle(fontSize: 12, color: Color(0xff5f5f5d))),
            ),
            const SizedBox(width: 14),
            Text(value,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Color(0xff1E3A5F))),
          ],
        ),
      );
}

