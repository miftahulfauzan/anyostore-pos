// ignore_for_file: prefer_const_constructors

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
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
  bool get _dark => Theme.of(context).brightness == Brightness.dark;

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
    final hasProfit = widget.role == 'owner' && summary['net_profit'] != null;
    final fourthLabel = hasProfit ? 'Laba bersih' : 'Pengeluaran';
    final fourthValue =
        hasProfit ? _num(summary['net_profit']) : _num(summary['expenses']);
    final margin =
        widget.role == 'owner' ? summary['profit_margin_percent'] : null;
    final expenses = _num(summary['expenses']);
    final returns = _num(summary['return_amount'] ?? summary['refund_amount']);
    // Backend mengurutkan produk berdasarkan omzet; daftar ini menampilkan pcs,
    // jadi urutkan ulang supaya panjang bar selalu turun dari peringkat 1.
    final topProducts = [..._products]..sort(
        (a, b) => _num(b['quantity_sold']).compareTo(_num(a['quantity_sold'])));

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
                _summaryHero(
                  context,
                  label: 'Penjualan',
                  value: fmtRp(grossSales),
                  change: _changePercent(grossSales, previous['gross_sales']),
                ),
                const SizedBox(height: 7),
                IntrinsicHeight(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Expanded(
                        child: _summaryTile(
                          context,
                          label: 'Pesanan',
                          value: '${transactions.toInt()}',
                          change: _changePercent(
                              transactions, previous['transactions']),
                          icon: Icons.receipt_long_outlined,
                          color: _dark ? kTaskAccentDark : kTaskAccent,
                        ),
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: _summaryTile(
                          context,
                          label: 'Produk',
                          value: '${productsSold.toInt()} pcs',
                          change: _changePercent(
                              productsSold, previous['products_sold']),
                          icon: Icons.inventory_2_outlined,
                          color: _dark
                              ? const Color(0xFF6EE7B7)
                              : const Color(0xFF0F766E),
                        ),
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: _summaryTile(
                          context,
                          label: fourthLabel,
                          value: fmtRp(fourthValue),
                          change: _changePercent(
                              hasProfit
                                  ? summary['net_profit']
                                  : summary['expenses'],
                              hasProfit
                                  ? previous['net_profit']
                                  : previous['expenses']),
                          icon: hasProfit
                              ? Icons.savings_outlined
                              : Icons.account_balance_wallet_outlined,
                          color: _dark
                              ? const Color(0xFFFCD34D)
                              : const Color(0xFFB45309),
                        ),
                      ),
                    ],
                  ),
                ),
                if (widget.role == 'owner') ...[
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
              ],
            ),
          ),
          const SizedBox(height: 10),
          GlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Penjualan',
                    trailing: '${transactions.toInt()} trx',
                    icon: Icons.show_chart_rounded,
                    iconColor: kTaskAccent),
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
            key: const ValueKey('dashboard-top-products'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Produk terlaris',
                    trailing: '${productsSold.toInt()} pcs',
                    icon: Icons.local_fire_department_rounded,
                    iconColor: const Color(0xFFD97706)),
                const SizedBox(height: 6),
                if (topProducts.isEmpty)
                  _empty(context, 'Belum ada produk terlaris pada periode ini.')
                else
                  ...topProducts
                      .take(5)
                      .toList()
                      .asMap()
                      .entries
                      .map((entry) => _bestSellerRow(
                            context,
                            entry.key,
                            entry.value,
                            maxValue: math.max(
                                1, _num(topProducts.first['quantity_sold'])),
                            value: _num(entry.value['quantity_sold']),
                          )),
              ],
            ),
          ),
          const SizedBox(height: 10),
          GlassCard(
            key: const ValueKey('dashboard-low-stock'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionHead(context, 'Stok rendah',
                    trailing: '${_lowStock.length} produk',
                    icon: Icons.warning_amber_rounded,
                    iconColor: const Color(0xFFBE123C)),
                const SizedBox(height: 6),
                if (_lowStock.isEmpty)
                  _empty(context, 'Tidak ada stok yang perlu diperiksa.')
                else
                  ..._lowStock
                      .take(5)
                      .map((product) => _lowStockRow(context, product)),
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
                dropdownColor: appDropdownColor(context),
                borderRadius: BorderRadius.circular(14),
                menuMaxHeight: 320,
                value: _preset,
                isExpanded: true,
                icon: const Icon(Icons.keyboard_arrow_down_rounded),
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

  Widget _sectionHead(BuildContext context, String title,
      {String? trailing, IconData? icon, Color? iconColor}) {
    final accent = iconColor ?? kTaskDark;
    return Row(
      children: [
        if (icon != null)
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 14, color: accent),
          )
        else
          Container(
              width: 4,
              height: 14,
              decoration: BoxDecoration(
                  color: accent, borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 7),
        Text(title,
            style: TextStyle(
                fontSize: TaskTypography.label,
                fontWeight: FontWeight.w800,
                color: ink(context))),
        const Spacer(),
        if (trailing != null)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: taskBorder(context).withValues(alpha: .35),
              borderRadius: BorderRadius.circular(99),
            ),
            child: Text(trailing,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
      ],
    );
  }

  /// Kartu utama ringkasan: penjualan jadi fokus, badge perubahan lega.
  Widget _summaryHero(
    BuildContext context, {
    required String label,
    required String value,
    required String? change,
  }) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1E3A5F), Color(0xFF2B5688)],
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(
              color: Color(0x261E3A5F), blurRadius: 12, offset: Offset(0, 5)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 9,
                  letterSpacing: .7,
                  fontWeight: FontWeight.w800,
                  color: Color(0xB8FFFFFF))),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(value,
                maxLines: 1,
                style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -.4,
                    color: Colors.white)),
          ),
          const SizedBox(height: 6),
          _changeChip(context, change, lead: true, suffix: ' vs periode lalu'),
        ],
      ),
    );
  }

  /// Tile kecil untuk Pesanan/Produk/Laba bersih atau Pengeluaran.
  Widget _summaryTile(
    BuildContext context, {
    required String label,
    required String value,
    required String? change,
    required IconData icon,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: taskSurface(context),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(11),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: color.withValues(alpha: _dark ? .2 : .12),
              borderRadius: BorderRadius.circular(7),
            ),
            child: Icon(icon, size: 13, color: color),
          ),
          const SizedBox(height: 6),
          Text(label.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 8,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .5,
                  color: taskMuted(context))),
          const SizedBox(height: 2),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.1,
                  color: ink(context))),
          const SizedBox(height: 5),
          _changeChip(context, change),
        ],
      ),
    );
  }

  Widget _changeChip(
    BuildContext context,
    String? change, {
    bool lead = false,
    String suffix = '',
  }) {
    final has = change != null;
    final up = change?.startsWith('↑') ?? false;
    final bg = lead
        ? const Color(0x2EFFFFFF)
        : !has
            ? taskBorder(context).withValues(alpha: .35)
            : up
                ? (_dark ? const Color(0x3316A34A) : const Color(0xFFDCFCE7))
                : (_dark ? const Color(0x33EA580C) : const Color(0xFFFFEDD5));
    final fg = lead
        ? const Color(0xFFD8F5E3)
        : !has
            ? taskMuted(context)
            : up
                ? (_dark ? const Color(0xFF86EFAC) : const Color(0xFF137A43))
                : (_dark ? const Color(0xFFFDBA74) : const Color(0xFFC2410C));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
      child: Text('${change ?? '-'}${has ? suffix : ''}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style:
              TextStyle(fontSize: 8.5, fontWeight: FontWeight.w800, color: fg)),
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

  /// Baris terlaris: peringkat, nama (+SKU), angka, lalu bar gradien.
  Widget _bestSellerRow(
    BuildContext context,
    int index,
    Map<String, dynamic> product, {
    required double maxValue,
    required double value,
  }) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final palette = dark
        ? const [
            (fg: Color(0xFFFCD34D), bar: Color(0xFFF59E0B)),
            (fg: Color(0xFFCBD5E1), bar: Color(0xFF94A3B8)),
            (fg: Color(0xFFFDBA74), bar: Color(0xFFFB923C)),
            (fg: Color(0xFF93C5FD), bar: Color(0xFF60A5FA)),
            (fg: Color(0xFFC4B5FD), bar: Color(0xFFA78BFA)),
          ]
        : const [
            (fg: Color(0xFFB45309), bar: Color(0xFFF59E0B)),
            (fg: Color(0xFF334155), bar: Color(0xFF64748B)),
            (fg: Color(0xFFC2410C), bar: Color(0xFFEA580C)),
            (fg: Color(0xFF1D4ED8), bar: Color(0xFF2563EB)),
            (fg: Color(0xFF6D28D9), bar: Color(0xFF7C3AED)),
          ];
    final tone = palette[index % palette.length];
    final ratio = maxValue <= 0 ? 0.0 : (value / maxValue).clamp(0.05, 1.0);
    final name = (product['name'] ?? '-').toString();
    final nameKey = name.toLowerCase().trim();
    final sku = (product['sku'] ?? '').toString().trim();
    final category = (product['category_name'] ?? '').toString().trim();
    // Jangan mengulang nama produk bila SKU sama persis (umum di data Olsera).
    final subtitle = sku.isNotEmpty && sku.toLowerCase() != nameKey
        ? sku
        : (category.isNotEmpty && category.toLowerCase() != nameKey
            ? category
            : '');
    return Container(
      margin: EdgeInsets.only(top: index == 0 ? 0 : 4),
      padding: const EdgeInsets.fromLTRB(6, 6, 6, 7),
      decoration: BoxDecoration(
        color: index == 0
            ? tone.bar.withValues(alpha: dark ? .08 : .07)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: tone.fg.withValues(alpha: dark ? .2 : .14),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text('${index + 1}',
                style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w800, color: tone.fg)),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: TaskTypography.secondary,
                            fontWeight: FontWeight.w800,
                            color: ink(context)),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text('${value.toInt()} pcs',
                        style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ],
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: taskMuted(context))),
                ],
                const SizedBox(height: 5),
                SizedBox(
                  height: 6,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      DecoratedBox(
                        decoration: BoxDecoration(
                          color: taskBorder(context).withValues(alpha: .45),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                      FractionallySizedBox(
                        alignment: Alignment.centerLeft,
                        widthFactor: ratio,
                        heightFactor: 1,
                        child: DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: [
                              tone.bar,
                              tone.bar.withValues(alpha: .55),
                            ]),
                            borderRadius: BorderRadius.circular(99),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Baris stok rendah dengan status warna (MINUS / HABIS / MENIPIS).
  Widget _lowStockRow(BuildContext context, Map<String, dynamic> product) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final stock = _num(product['stock']).toInt();
    final minStock = _num(product['min_stock']).toInt();
    final name = (product['name'] ?? '-').toString();
    final rawSku = (product['sku'] ?? '').toString().trim();
    final sku = rawSku.toLowerCase() == name.toLowerCase().trim() ? '' : rawSku;
    final isOut = stock <= 0;
    final status = stock < 0 ? 'MINUS' : (stock == 0 ? 'HABIS' : 'MENIPIS');
    final color = isOut
        ? (dark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C))
        : (dark ? const Color(0xFFFCD34D) : const Color(0xFFB45309));
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 7),
      decoration: BoxDecoration(
        border:
            Border(bottom: BorderSide(color: taskBorder(context), width: 1)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: TaskTypography.secondary,
                      fontWeight: FontWeight.w700,
                      color: ink(context)),
                ),
                if (sku.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(sku,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w600,
                          color: taskMuted(context))),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: dark ? .2 : .12),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(status,
                    style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .3,
                        color: color)),
              ),
              const SizedBox(height: 3),
              Text('$stock / min $minStock',
                  style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w600,
                      color: taskMuted(context))),
            ],
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
    final labels = [for (final row in rows) _shortDay(row['date'])];
    final dark = Theme.of(context).brightness == Brightness.dark;
    if (values.length < 2) {
      return Container(
        key: const ValueKey('dashboard-sparkline'),
        height: 88,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: taskSurface(context),
          border: Border.all(color: taskBorder(context)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.show_chart_rounded,
                  size: 20, color: taskMuted(context)),
              const SizedBox(height: 4),
              Text('Belum ada data penjualan.',
                  style: TextStyle(
                      fontSize: TaskTypography.micro,
                      color: taskMuted(context))),
            ],
          ),
        ),
      );
    }
    return Container(
      key: const ValueKey('dashboard-sparkline'),
      height: 138,
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: dark
              ? [taskSurface(context), taskSurface(context)]
              : [const Color(0xFFFBFDFF), taskSurface(context)],
        ),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          Expanded(
            child: CustomPaint(
              painter: _SparkPainter(
                values: values,
                color: kTaskAccent,
                gridColor: taskBorder(context),
              ),
              size: Size.infinite,
            ),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              Text(labels.first,
                  style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w600,
                      color: taskMuted(context))),
              const Spacer(),
              if (labels.length > 2)
                Text(labels[labels.length ~/ 2],
                    style: TextStyle(
                        fontSize: 8.5,
                        fontWeight: FontWeight.w600,
                        color: taskMuted(context))),
              const Spacer(),
              Text(labels.last,
                  style: TextStyle(
                      fontSize: 8.5,
                      fontWeight: FontWeight.w600,
                      color: taskMuted(context))),
            ],
          ),
        ],
      ),
    );
  }

  String _shortDay(Object? raw) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des'
    ];
    final text = (raw ?? '').toString().trim();
    if (text.isEmpty) return '';
    final date = DateTime.tryParse(text);
    if (date == null) return text;
    return '${date.day} ${months[date.month - 1]}';
  }
}

class _SparkPainter extends CustomPainter {
  _SparkPainter(
      {required this.values, required this.color, required this.gridColor});

  final List<double> values;
  final Color color;
  final Color gridColor;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.length < 2 || size.width <= 0 || size.height <= 0) return;

    // Grid halus: tiga garis horizontal, bukan kotak penuh.
    final grid = Paint()
      ..color = gridColor.withValues(alpha: .55)
      ..strokeWidth = 1;
    for (var i = 1; i <= 3; i++) {
      final y = size.height * i / 4;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), grid);
    }

    final maxValue = values.reduce(math.max);
    final minValue = values.reduce(math.min);
    final span = math.max(1e-6, maxValue - minValue);
    const sidePad = 4.0;
    const topPad = 8.0;
    const bottomPad = 6.0;
    final chartWidth = math.max(1.0, size.width - sidePad * 2);
    final chartHeight = math.max(1.0, size.height - topPad - bottomPad);
    final dx = chartWidth / (values.length - 1);
    final points = <Offset>[];
    for (var i = 0; i < values.length; i++) {
      final normalized = (values[i] - minValue) / span;
      points.add(Offset(
        sidePad + i * dx,
        topPad + (1 - normalized) * chartHeight,
      ));
    }

    // Kurva monotone (Fritsch-Carlson): halus tetapi tidak melewati titik
    // maksimum/minimum data, jadi puncak tidak terlihat lebih tinggi.
    final count = points.length;
    final slopes = List<double>.filled(count - 1, 0);
    for (var i = 0; i < count - 1; i++) {
      slopes[i] =
          (points[i + 1].dy - points[i].dy) / (points[i + 1].dx - points[i].dx);
    }
    final tangents = List<double>.filled(count, 0);
    tangents[0] = slopes.first;
    tangents[count - 1] = slopes.last;
    for (var i = 1; i < count - 1; i++) {
      tangents[i] =
          slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
    }
    for (var i = 0; i < count - 1; i++) {
      if (slopes[i] == 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
        continue;
      }
      final a = tangents[i] / slopes[i];
      final b = tangents[i + 1] / slopes[i];
      final sum = a * a + b * b;
      if (sum > 9) {
        final scale = 3 / math.sqrt(sum);
        tangents[i] = scale * a * slopes[i];
        tangents[i + 1] = scale * b * slopes[i];
      }
    }
    final line = Path()..moveTo(points.first.dx, points.first.dy);
    for (var i = 0; i < count - 1; i++) {
      final h = points[i + 1].dx - points[i].dx;
      final c1 =
          Offset(points[i].dx + h / 3, points[i].dy + tangents[i] * h / 3);
      final c2 = Offset(
          points[i + 1].dx - h / 3, points[i + 1].dy - tangents[i + 1] * h / 3);
      line.cubicTo(
          c1.dx, c1.dy, c2.dx, c2.dy, points[i + 1].dx, points[i + 1].dy);
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
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round
        ..color = color,
    );

    // Hanya titik terakhir yang diberi penanda supaya grafik terasa luwes.
    final last = points.last;
    canvas.drawCircle(last, 8, Paint()..color = color.withValues(alpha: .12));
    canvas.drawCircle(last, 4, Paint()..color = Colors.white);
    canvas.drawCircle(
      last,
      4,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.2
        ..color = color,
    );
  }

  @override
  bool shouldRepaint(_SparkPainter oldDelegate) =>
      oldDelegate.values != values ||
      oldDelegate.color != color ||
      oldDelegate.gridColor != gridColor;
}
