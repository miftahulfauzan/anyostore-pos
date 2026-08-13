// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'format.dart';
import 'task_ui.dart';

const _kGray = Color(0xff8A857C);
const _kDenim = Color(0xff2E5D8F);
const _kDenimLight = Color(0xff7FA8CF);
const _kBorder = Color(0xffE7E0D6);

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  Map<String, dynamic>? _commission;
  bool _loading = true;
  String? _error;
  String _range = 'today'; // today | 7d | month
  int _chartSel = -1;

  @override
  void initState() {
    super.initState();
    _load();
  }

  (String, String) _rangeDates() {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    return switch (_range) {
      '7d' => (d(now.subtract(const Duration(days: 6))), d(now)),
      'month' => (
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
          d(now)),
      _ => (d(now), d(now)),
    };
  }

  bool _isOwner(BuildContext context) =>
      context.read<AuthStore>().role == 'owner';

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final (start, end) = _rangeDates();
      final results = await Future.wait([
        widget.api.dashboard(),
        if (_isOwner(context)) widget.api.commissionAllBranches(start: start, end: end),
      ]);
      if (!mounted) return;
      setState(() {
        _data = results[0];
        if (results.length > 1) {
          _commission = results[1];
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  (double, double, double, double) _stats() {
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final (sales, expenses) = switch (_range) {
      '7d' => (
          asNum(summary['seven_day_sales']),
          asNum(summary['seven_day_expenses'])),
      'month' => (
          asNum(summary['month_sales']),
          asNum(summary['month_expenses'])),
      _ => (asNum(summary['today_sales']), asNum(summary['today_expenses'])),
    };
    final profit = sales - expenses;
    final margin = sales > 0 ? profit / sales * 100 : 0.0;
    return (sales, expenses, profit, margin);
  }

  @override
  Widget build(BuildContext context) {
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
    final auth = context.watch<AuthStore>();
    final name = auth.userName ?? 'Admin';
    final recent = ((_data?['recent_transactions'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final trend =
        ((_data?['sales_trend'] as List?) ?? []).cast<Map<String, dynamic>>();
    final maxTrend = trend.fold<double>(
        0, (m, t) => asNum(t['sales']) > m ? asNum(t['sales']) : m);
    final (sales, expenses, profit, margin) = _stats();

    return ColoredBox(
      color: pageBg(context),
      child: RefreshIndicator(
        onRefresh: _load,
        color: ink(context),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
          children: _stagger([
            Row(
              children: [
                BrandLogo(api: widget.api, size: 42, radius: 13),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Anyostore App',
                          style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                      Text('Ringkasan bisnis Anda',
                          style: TextStyle(fontSize: 11, color: _kGray)),
                    ],
                  ),
                ),
                _circleButton(Icons.refresh, _load),
              ],
            ),
            SizedBox(height: 16),
            Text('Halo, $name',
                style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
            const SizedBox(height: 10),
            // Time range pills
            SizedBox(
              height: 38,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: 3,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final label = const ['Hari ini', '7 Hari', 'Bulan Ini'][i];
                  final value = const ['today', '7d', 'month'][i];
                  final active = _range == value;
                  return GestureDetector(
                    onTap: () {
                      setState(() => _range = value);
                      _load();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 9),
                      decoration: BoxDecoration(
                        color: active ? kTaskDark : Colors.white,
                        borderRadius: BorderRadius.circular(99),
                        border: active
                            ? null
                            : Border.all(color: _kBorder),
                        boxShadow: active
                            ? [
                                BoxShadow(
                                    color: kTaskDark.withValues(alpha: .25),
                                    blurRadius: 10,
                                    offset: const Offset(0, 4))
                              ]
                            : null,
                      ),
                      child: Text(label,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: active ? Colors.white : _kGray)),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 14),
            // 4 stat cards
            Row(
              children: [
                Expanded(
                    child: _stat('Penjualan', fmtRp(sales),
                        Icons.trending_up, _kDenim, const Color(0xffE3EAF2))),
                const SizedBox(width: 10),
                Expanded(
                    child: _stat('Pengeluaran', fmtRp(expenses),
                        Icons.account_balance_wallet, _kDenimLight,
                        const Color(0xffE9F1F8))),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                    child: _stat('Laba Bersih', fmtRp(profit),
                        Icons.savings, kTaskDark, const Color(0xffE3EAF2))),
                const SizedBox(width: 10),
                Expanded(
                    child: _stat('Margin',
                        margin.isFinite ? '${margin.toStringAsFixed(1)}%' : '0%',
                        Icons.pie_chart, const Color(0xff5A8BBF),
                        const Color(0xffE9F1F8))),
              ],
            ),
            const SizedBox(height: 14),
            // Info transaksi hari ini (summary dari backend).
            GlassCard(
              padding: const EdgeInsets.all(14),
              radius: 20,
              child: Row(
                children: [
                  const Icon(Icons.receipt_long, size: 18, color: _kDenim),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text('Transaksi hari ini',
                        style: TextStyle(fontSize: 12, color: _kGray)),
                  ),
                  Text(
                      '${((_data?['summary'] as Map<String, dynamic>?) ?? {})['today_transactions'] ?? 0} transaksi',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                ],
              ),
            ),
            const SizedBox(height: 14),
            // Metode pembayaran (30 hari).
            if (((_data?['payments'] as List?) ?? []).isNotEmpty)
              GlassCard(
                padding: const EdgeInsets.all(16),
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Metode Pembayaran (30 hari)',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: kTaskDark)),
                    const SizedBox(height: 8),
                    for (final p
                        in ((_data?['payments'] as List?) ?? [])
                            .cast<Map<String, dynamic>>())
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            Expanded(
                              child: Text(
                                  (p['payment_method'] ?? '')
                                      .toString()
                                      .toUpperCase(),
                                  style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: ink(context))),
                            ),
                            Text(fmtRp(asNum(p['amount'])),
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: _kDenim)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            const SizedBox(height: 14),
            // Chart: Penjualan 7 Hari
            if (trend.isNotEmpty)
              GlassCard(
                padding: const EdgeInsets.all(16),
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text('Penjualan 7 Hari',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: ink(context))),
                        if (_chartSel >= 0 && _chartSel < trend.length)
                          Container(
                            padding: EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: ink(context),
                              borderRadius: BorderRadius.circular(99),
                            ),
                            child: Text(
                                fmtRp(asNum(trend[_chartSel]['sales'])),
                                style: const TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white)),
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 130,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          for (var i = 0; i < trend.length; i++)
                            Expanded(
                              child: GestureDetector(
                                onTap: () => setState(() => _chartSel = i),
                                child: Column(
                                  mainAxisAlignment: MainAxisAlignment.end,
                                  children: [
                                    TweenAnimationBuilder<double>(
                                      tween: Tween(
                                          begin: 0,
                                          end: maxTrend > 0
                                              ? (asNum(trend[i]['sales']) /
                                                          maxTrend *
                                                      96)
                                                  .clamp(4.0, 96.0)
                                              : 4),
                                      duration:
                                          const Duration(milliseconds: 450),
                                      curve: Interval(
                                          i / (trend.length > 1 ? trend.length : 1),
                                          1,
                                          curve: Curves.easeOutCubic),
                                      builder: (context, h, _) => Container(
                                        height: h,
                                        margin: const EdgeInsets.symmetric(
                                            horizontal: 5),
                                        decoration: BoxDecoration(
                                          color: _chartSel == i
                                              ? kTaskDark
                                              : _kDenim,
                                          borderRadius:
                                              const BorderRadius.vertical(
                                                  top: Radius.circular(6)),
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 6),
                                    Text(trend[i]['label']?.toString() ?? '',
                                        style: const TextStyle(
                                            fontSize: 9, color: _kGray)),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            if (_isOwner(context) &&
                ((_data?['stores'] as List?) ?? []).isNotEmpty) ...[
              const SizedBox(height: 14),
              _StoresCard(
                stores: ((_data?['stores'] as List?) ?? [])
                    .cast<Map<String, dynamic>>(),
                commission: _commission,
                range: _range,
              ),
            ],
            if (recent.isNotEmpty) ...[
              const SizedBox(height: 14),
              GlassCard(
                padding: const EdgeInsets.all(16),
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Transaksi Terakhir',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 8),
                    for (final t in recent)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: Color(0xffE3EAF2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(Icons.receipt,
                                  size: 16, color: ink(context)),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      t['invoice_no']?.toString() ?? '',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: ink(context))),
                                  Text(t['cashier']?.toString() ?? '',
                                      style: const TextStyle(
                                          fontSize: 10, color: _kGray)),
                                ],
                              ),
                            ),
                            Text(fmtRp(asNum(t['grand_total'])),
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: ink(context))),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ]),
        ),
      ),
    );
  }

  List<Widget> _stagger(List<Widget> items) => [
        for (var i = 0; i < items.length; i++)
          Entrance(
            delay: Duration(milliseconds: i * 70),
            child: items[i],
          ),
      ];

  Widget _circleButton(IconData icon, VoidCallback onTap) {
    return Material(
      color: Colors.white,
      shape: CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, size: 19, color: ink(context)),
        ),
      ),
    );
  }

  Widget _stat(String label, String value, IconData icon, Color chipFg,
      Color chipBg) {
    return GlassCard(
      padding: const EdgeInsets.all(14),
      radius: 20,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: const TextStyle(fontSize: 11, color: _kGray)),
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: chipBg,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(icon, size: 15, color: chipFg),
              ),
            ],
          ),
          SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value,
                maxLines: 1,
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ),
        ],
      ),
    );
  }
}

/// Kartu "Semua Toko" (owner): ranking penjualan antar cabang + total komisi.
class _StoresCard extends StatelessWidget {
  const _StoresCard(
      {required this.stores, required this.commission, required this.range});
  final List<Map<String, dynamic>> stores;
  final Map<String, dynamic>? commission;
  final String range;

  double _asNum(dynamic v) => asNum(v);

  @override
  Widget build(BuildContext context) {
    final perBranch =
        ((commission?['per_branch'] as List?) ?? []).cast<Map<String, dynamic>>();
    double commOf(dynamic branchId) => _asNum(perBranch
        .where((b) => '${b['branch_id']}' == '$branchId')
        .fold<num>(0, (sum, b) => sum + _asNum(b['total_commission'])));
    final totalComm = _asNum(commission?['total_commission']);
    final is7d = range == '7d';
    final isMonth = range == 'month';
    final ranked = [...stores]..sort((a, b) =>
        _asNum(is7d ? b['seven_day_sales'] : isMonth ? b['month_sales'] : b['today_sales'])
            .compareTo(_asNum(is7d ? a['seven_day_sales'] : isMonth ? a['month_sales'] : a['today_sales'])));
    final rangeLabel = switch (range) {
      '7d' => '7 Hari',
      'month' => 'Bulan Ini',
      _ => 'Hari Ini',
    };

    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Semua Toko',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
              ),
              Container(
                padding:
                    EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xffE3EAF2),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(rangeLabel,
                    style: TextStyle(
                        fontSize: 9, fontWeight: FontWeight.w700,
                        color: ink(context))),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (commission != null)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xff1E3A5F), Color(0xff2E5D8F)]),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.payments_outlined,
                      size: 18, color: Colors.white),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text('Total Komisi Pegawai',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Colors.white)),
                  ),
                  Text(fmtRp(totalComm),
                      style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                ],
              ),
            ),
          const SizedBox(height: 10),
          for (var i = 0; i < ranked.length; i++) ...[
            if (i > 0) const Divider(height: 14, color: _kBorder),
            Row(
              children: [
                _RankBadge(rank: i + 1),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(ranked[i]['name']?.toString() ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                      const SizedBox(height: 2),
                      Text(
                          '${fmtRp(_asNum(is7d ? ranked[i]['seven_day_sales'] : isMonth ? ranked[i]['month_sales'] : ranked[i]['today_sales']))}'
                          ' · Laba ${fmtRp(_asNum(is7d ? ranked[i]['seven_day_sales'] : isMonth ? ranked[i]['month_sales'] : ranked[i]['today_sales']) - _asNum(is7d ? ranked[i]['seven_day_expenses'] : isMonth ? ranked[i]['month_expenses'] : ranked[i]['today_expenses']))}'
                          ' · ${_asNum(is7d ? ranked[i]['seven_day_transactions'] : isMonth ? ranked[i]['month_transactions'] : ranked[i]['today_transactions'])} trx',
                          style:
                              const TextStyle(fontSize: 10, color: _kGray)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(fmtRp(commOf(ranked[i]['id'])),
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: _kDenim)),
                    const Text('komisi',
                        style:
                            TextStyle(fontSize: 9, color: _kGray)),
                  ],
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}


/// Lencana peringkat toko (1-3 berwarna, sisanya netral).
class _RankBadge extends StatelessWidget {
  const _RankBadge({required this.rank});
  final int rank;

  @override
  Widget build(BuildContext context) {
    final colors = [
      const Color(0xFFB8860B),
      const Color(0xFF6B7280),
      const Color(0xFFB45309),
    ];
    return Container(
      width: 24,
      height: 24,
      decoration: BoxDecoration(
        color: rank <= 3 ? colors[rank - 1] : const Color(0xffE3EAF2),
        borderRadius: BorderRadius.circular(8),
      ),
      alignment: Alignment.center,
      child: Text('$rank',
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: rank <= 3 ? Colors.white : kTaskDark)),
    );
  }
}
