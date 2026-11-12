// ignore_for_file: prefer_const_constructors

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'branch_scope.dart';
import 'format.dart';
import 'offline_status.dart';
import 'report_filter.dart';
import 'task_ui.dart';

/// Dasbor penjualan dengan susunan yang sama seperti PWA:
/// KPI (label kecil + angka + badge perbandingan), kartu Penjualan (angka
/// utama + grafik + pembayaran/pengeluaran/pengembalian), lalu daftar
/// Terlaris dan Stok rendah satu baris per item.
class SalesDashboardPage extends StatefulWidget {
  const SalesDashboardPage({super.key, required this.api, this.role});

  final ApiClient api;
  final String? role;

  @override
  State<SalesDashboardPage> createState() => _SalesDashboardPageState();
}

class _SalesDashboardPageState extends State<SalesDashboardPage> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;
  String _preset = 'today';
  DateTime? _from;
  DateTime? _to;
  int _generation = 0;

  bool get _isKasir => widget.role == 'kasir';

  @override
  void initState() {
    super.initState();
    OfflineStatus.syncTick.addListener(_onSyncTick);
    BranchScope.active.addListener(_onBranchChanged);
    _load();
  }

  @override
  void dispose() {
    OfflineStatus.syncTick.removeListener(_onSyncTick);
    BranchScope.active.removeListener(_onBranchChanged);
    super.dispose();
  }

  void _onSyncTick() => unawaited(_load(silent: true));

  void _onBranchChanged() {
    widget.api.activeBranchId = BranchScope.active.value;
    unawaited(_load(silent: true));
  }

  (String, String) get _range {
    final range = mobileDateFilterRange(
      preset: _preset,
      now: DateTime.now(),
      customStart: _from,
      customEnd: _to,
    );
    String d(DateTime value) =>
        '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
    return (d(range.start), d(range.end));
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_generation;
    bool isCurrent() => mounted && generation == _generation;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final (start, end) = _range;
    try {
      Map<String, dynamic> data;
      if (_isKasir) {
        final payload = await widget.api.dashboard(start: start, end: end);
        final summary =
            (payload['selected_summary'] as Map<String, dynamic>?) ??
                (payload['summary'] as Map<String, dynamic>?) ??
                const <String, dynamic>{};
        final trend = (payload['selected_sales_trend'] as List?) ??
            (payload['sales_trend'] as List?) ??
            const [];
        data = {
          'branch_name': payload['branch_name'],
          'summary': {
            'gross_sales': summary['sales'] ?? summary['today_sales'] ?? 0,
            'transactions':
                summary['transactions'] ?? summary['today_transactions'] ?? 0,
            'products_sold': summary['products_sold'] ?? 0,
            'expenses': summary['expenses'] ?? 0,
            'return_amount': summary['return_amount'] ?? 0,
          },
          'daily_sales': [
            for (final row in trend)
              if (row is Map<String, dynamic>)
                {'date': row['date'], 'revenue': row['sales'] ?? 0},
          ],
          'payment_methods': payload['selected_payment_breakdown'] ??
              payload['payment_breakdown'] ??
              const [],
          'products': payload['products'] ?? const [],
          'low_stock': payload['low_stock'] ?? const [],
        };
      } else {
        data = await widget.api.reportOverview(
          start: start,
          end: end,
          branchId: widget.api.activeBranchId,
          allBranches: widget.api.activeBranchId == null,
        );
      }
      if (!isCurrent()) return;
      setState(() {
        _data = data;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!isCurrent()) return;
      setState(() {
        _loading = false;
        _error = error is ApiException ? error.message : '$error';
      });
    }
  }

  Future<void> _pickPreset(String? value) async {
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
        _preset = 'custom';
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
    unawaited(_load());
  }

  double _num(Object? value) =>
      value is num ? value.toDouble() : double.tryParse('${value ?? ''}') ?? 0;

  Map<String, dynamic> get _summary =>
      (_data?['summary'] as Map<String, dynamic>?) ?? const {};

  Map<String, dynamic> get _previous {
    final direct = _data?['previous_summary'];
    if (direct is Map) return Map<String, dynamic>.from(direct);
    final comparison = _data?['comparison'];
    if (comparison is Map && comparison['previous_summary'] is Map) {
      return Map<String, dynamic>.from(comparison['previous_summary'] as Map);
    }
    return const {};
  }

  String? _changePercent(Object? current, Object? previous) {
    if (previous == null) return null;
    final before = _num(previous);
    final now = _num(current);
    if (before == 0) return now == 0 ? '0%' : null;
    final change = (now - before) / before.abs() * 100;
    final text = change.abs().toStringAsFixed(1).replaceAll('.', ',');
    return '${change >= 0 ? '↑ +' : '↓ '}$text%';
  }

  List<Map<String, dynamic>> get _products => [
        for (final row in (_data?['products'] as List?) ?? const [])
          if (row is Map<String, dynamic>) row,
      ];

  List<Map<String, dynamic>> get _lowStock => [
        for (final row in (_data?['low_stock'] as List?) ?? const [])
          if (row is Map<String, dynamic>) row,
      ];

  List<Map<String, dynamic>> get _daily => [
        for (final row in (_data?['daily_sales'] as List?) ?? const [])
          if (row is Map<String, dynamic>) row,
      ];

  double get _paymentTotal {
    final methods = (_data?['payment_methods'] as List?) ?? const [];
    var total = 0.0;
    for (final row in methods) {
      if (row is Map<String, dynamic>) {
        total += _num(row['amount'] ?? row['total']);
      }
    }
    return total;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _data == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_data == null) {
      return _errorState(context);
    }
    final summary = _summary;
    final previous = _previous;
    final grossSales =
        _num(summary['gross_sales'] ?? summary['revenue'] ?? summary['sales']);
    final transactions = _num(summary['transactions']);
    final productsSold = _num(summary['products_sold']);
    final hasProfit = summary['net_profit'] != null;
    final fourthLabel = hasProfit ? 'Laba bersih' : 'Pengeluaran';
    final fourthValue =
        hasProfit ? _num(summary['net_profit']) : _num(summary['expenses']);
    final margin = summary['profit_margin_percent'];
    final expenses = _num(summary['expenses']);
    final returns = _num(summary['return_amount'] ?? summary['refund_amount']);

    return RefreshIndicator(
      onRefresh: () => _load(silent: true),
      color: Theme.of(context).colorScheme.primary,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
        children: [
          _filterBar(context),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: TaskTypography.secondary)),
          ],
          const SizedBox(height: 10),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Ringkasan toko',
                    trailing: '${transactions.toInt()} pesanan'),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                        child: _kpi(context, 'Penjualan', fmtRp(grossSales),
                            _changePercent(grossSales, previous['gross_sales']),
                            lead: true)),
                    const SizedBox(width: 6),
                    Expanded(
                        child: _kpi(
                            context,
                            'Pesanan',
                            '${transactions.toInt()}',
                            _changePercent(
                                transactions, previous['transactions']))),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                        child: _kpi(
                            context,
                            'Produk',
                            '${productsSold.toInt()} pcs',
                            _changePercent(
                                productsSold, previous['products_sold']))),
                    const SizedBox(width: 6),
                    Expanded(
                        child: _kpi(
                            context,
                            fourthLabel,
                            fmtRp(fourthValue),
                            _changePercent(
                                hasProfit
                                    ? summary['net_profit']
                                    : summary['expenses'],
                                hasProfit
                                    ? previous['net_profit']
                                    : previous['expenses']))),
                  ],
                ),
                const SizedBox(height: 10),
                _divider(context),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text('Margin keuntungan',
                        style: TextStyle(
                            fontSize: TaskTypography.micro,
                            color: taskMuted(context),
                            fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text(
                        margin == null
                            ? '-'
                            : '${_num(margin).toStringAsFixed(2).replaceAll('.', ',')}%',
                        style: TextStyle(
                            fontSize: TaskTypography.label,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Penjualan',
                    trailing: '${transactions.toInt()} trx'),
                const SizedBox(height: 10),
                Text('Total penjualan',
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        color: taskMuted(context),
                        fontWeight: FontWeight.w600)),
                Text(fmtRp(grossSales),
                    style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -.4,
                        color: kTaskAccent)),
                Text('${transactions.toInt()} pesanan',
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        color: taskMuted(context))),
                const SizedBox(height: 8),
                _sparkline(context),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                        width: 9,
                        height: 9,
                        decoration: const BoxDecoration(
                            color: kTaskAccent,
                            borderRadius:
                                BorderRadius.all(Radius.circular(2)))),
                    const SizedBox(width: 6),
                    Text('Penjualan',
                        style: TextStyle(
                            fontSize: TaskTypography.micro,
                            color: taskMuted(context),
                            fontWeight: FontWeight.w600)),
                  ],
                ),
                const SizedBox(height: 8),
                _financeRow(context, 'Pembayaran',
                    fmtRp(_paymentTotal > 0 ? _paymentTotal : grossSales)),
                _financeRow(context, 'Pengeluaran', fmtRp(expenses)),
                _financeRow(context, 'Pengembalian', fmtRp(returns),
                    last: true),
              ],
            ),
          ),
          const SizedBox(height: 10),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Produk terlaris',
                    trailing: '${productsSold.toInt()} pcs'),
                const SizedBox(height: 6),
                if (_products.isEmpty)
                  _empty(context, 'Belum ada produk terlaris pada periode ini.')
                else
                  ..._products.take(5).map((product) => _barRow(
                        context,
                        '${product['name'] ?? '-'}',
                        '${_num(product['quantity_sold']).toInt()} pcs',
                        maxValue:
                            math.max(1, _num(_products.first['quantity_sold'])),
                        value: _num(product['quantity_sold']),
                        color: kTaskDark,
                      )),
              ],
            ),
          ),
          const SizedBox(height: 10),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Stok rendah',
                    trailing: '${_lowStock.length} produk'),
                const SizedBox(height: 6),
                if (_lowStock.isEmpty)
                  _empty(context, 'Tidak ada stok yang perlu diperiksa.')
                else
                  ..._lowStock.take(5).map((product) => _plainRow(
                        context,
                        '${product['name'] ?? '-'}',
                        '${_num(product['stock']).toInt()} / min ${_num(product['min_stock']).toInt()}',
                      )),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text('Data mengikuti periode dan toko/gudang yang sedang dipilih.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: TaskTypography.micro, color: taskMuted(context))),
        ],
      ),
    );
  }

  Widget _errorState(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error ?? 'Dasbor tidak dapat dimuat',
                textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(
                onPressed: () => _load(), child: const Text('Coba lagi')),
          ],
        ),
      ),
    );
  }

  Widget _filterBar(BuildContext context) {
    final (start, end) = _range;
    return GlassCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _preset,
                isExpanded: true,
                icon: const Icon(Icons.keyboard_arrow_down),
                items: [
                  for (final option in kMobileDateFilterOptions)
                    DropdownMenuItem<String>(
                        value: option.value, child: Text(option.label)),
                ],
                onChanged: _pickPreset,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text('$start s.d. $end',
              style: TextStyle(
                  fontSize: TaskTypography.micro, color: taskMuted(context))),
          IconButton(
              onPressed: () => _load(),
              icon: const Icon(Icons.refresh),
              tooltip: 'Muat ulang'),
        ],
      ),
    );
  }

  Widget _sectionHead(BuildContext context, String title, {String? trailing}) {
    return Row(
      children: [
        Container(
            width: 4,
            height: 14,
            decoration: BoxDecoration(
                color: kTaskDark, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 7),
        Text(title,
            style: TextStyle(
                fontSize: TaskTypography.label,
                fontWeight: FontWeight.w800,
                color: ink(context))),
        const Spacer(),
        if (trailing != null)
          Text(trailing,
              style: TextStyle(
                  fontSize: TaskTypography.micro,
                  fontWeight: FontWeight.w700,
                  color: taskMuted(context))),
      ],
    );
  }

  Widget _kpi(BuildContext context, String label, String value, String? change,
      {bool lead = false}) {
    final bg = lead ? kTaskDark : taskSurface(context);
    final border = lead ? kTaskDark : taskBorder(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
      decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: lead ? const Color(0xCCFFFFFF) : taskMuted(context))),
          const SizedBox(height: 2),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.2,
                  color: lead ? Colors.white : ink(context))),
          if (change != null) ...[
            const SizedBox(height: 3),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: lead
                    ? const Color(0x33FFFFFF)
                    : (change.startsWith('↓')
                        ? const Color(0xFFFFEDD5)
                        : const Color(0xFFDCFCE7)),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(change,
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: lead
                          ? const Color(0xFFD8F5E3)
                          : (change.startsWith('↓')
                              ? const Color(0xFFC2410C)
                              : const Color(0xFF137A43)))),
            ),
          ],
        ],
      ),
    );
  }

  Widget _divider(BuildContext context) =>
      Container(height: 1, color: taskBorder(context));

  Widget _financeRow(BuildContext context, String label, String value,
      {bool last = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        border: last
            ? null
            : Border(bottom: BorderSide(color: taskBorder(context), width: 1)),
      ),
      child: Row(
        children: [
          Text(label,
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  color: taskMuted(context),
                  fontWeight: FontWeight.w600)),
          const Spacer(),
          Text(value,
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
        ],
      ),
    );
  }

  /// Satu baris terlaris: nama di kiri, bar di tengah, angka di kanan.
  Widget _barRow(
    BuildContext context,
    String name,
    String valueText, {
    required double maxValue,
    required double value,
    required Color color,
  }) {
    final ratio = maxValue <= 0 ? 0.0 : (value / maxValue).clamp(0.05, 1.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Flexible(
            flex: 5,
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  fontWeight: FontWeight.w700,
                  color: ink(context)),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 4,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(99),
              child: LinearProgressIndicator(
                value: ratio,
                minHeight: 6,
                backgroundColor: taskBorder(context),
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            valueText,
            style: TextStyle(
                fontSize: TaskTypography.micro,
                fontWeight: FontWeight.w800,
                color: ink(context)),
          ),
        ],
      ),
    );
  }

  /// Baris polos (stok rendah): nama di kiri, nilai di kanan.
  Widget _plainRow(BuildContext context, String name, String valueText) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: BoxDecoration(
        border:
            Border(bottom: BorderSide(color: taskBorder(context), width: 1)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  fontWeight: FontWeight.w700,
                  color: ink(context)),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            valueText,
            style: TextStyle(
                fontSize: TaskTypography.micro,
                fontWeight: FontWeight.w700,
                color: taskMuted(context)),
          ),
        ],
      ),
    );
  }

  Widget _empty(BuildContext context, String message) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Text(message,
            style: TextStyle(
                fontSize: TaskTypography.secondary, color: taskMuted(context))),
      );

  Widget _sparkline(BuildContext context) {
    final rows = _daily;
    final values = [
      for (final row in rows) _num(row['revenue'] ?? row['sales'])
    ];
    return Container(
      height: 96,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
          color: taskSurface(context),
          border: Border.all(color: taskBorder(context)),
          borderRadius: BorderRadius.circular(10)),
      child: values.length < 2
          ? Center(
              child: Text('Belum ada data penjualan.',
                  style: TextStyle(
                      fontSize: TaskTypography.micro,
                      color: taskMuted(context))))
          : CustomPaint(
              painter: _SparkPainter(values: values, color: kTaskAccent),
              size: Size.infinite),
    );
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter({required this.values, required this.color});

  final List<double> values;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2 || size.width <= 0 || size.height <= 0) return;
    final maxValue = values.reduce(math.max);
    final minValue = values.reduce(math.min);
    final span = math.max(1e-6, maxValue - minValue);
    final dx = size.width / (values.length - 1);
    final points = <Offset>[];
    for (var i = 0; i < values.length; i++) {
      final normalized = (values[i] - minValue) / span;
      points.add(
          Offset(i * dx, size.height - normalized * (size.height - 6) - 3));
    }
    final line = Path()..moveTo(points.first.dx, points.first.dy);
    for (var i = 1; i < points.length; i++) {
      line.lineTo(points[i].dx, points[i].dy);
    }
    final area = Path.from(line)
      ..lineTo(points.last.dx, size.height)
      ..lineTo(points.first.dx, size.height)
      ..close();
    canvas.drawPath(
      area,
      Paint()
        ..shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [color.withValues(alpha: .26), color.withValues(alpha: .02)],
        ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
    );
    canvas.drawPath(
      line,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeCap = StrokeCap.round
        ..color = color,
    );
    for (final point in points) {
      canvas.drawCircle(point, 3, Paint()..color = Colors.white);
      canvas.drawCircle(
        point,
        3,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2
          ..color = color,
      );
    }
  }

  @override
  bool shouldRepaint(_SparkPainter oldDelegate) =>
      oldDelegate.values != values || oldDelegate.color != color;
}
