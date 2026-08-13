import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'format.dart';
import 'pos_page.dart';
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
  bool _loading = true;
  String? _error;
  String _range = 'today'; // today | 7d | month
  int _chartSel = -1;

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
      final data = await widget.api.dashboard();
      if (!mounted) return;
      setState(() => _data = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openKasir() {
    Navigator.of(context).popUntil((route) => route.isFirst);
    PosPage.requestTab.value = 0;
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
      color: const Color(0xffF5F1EA),
      child: RefreshIndicator(
        onRefresh: _load,
        color: kTaskDark,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 28),
          children: _stagger([
            Row(
              children: [
                BrandLogo(api: widget.api, size: 42, radius: 13),
                const SizedBox(width: 10),
                const Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Anyostore App',
                          style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: kTaskDark)),
                      Text('Ringkasan bisnis Anda',
                          style: TextStyle(fontSize: 11, color: _kGray)),
                    ],
                  ),
                ),
                _circleButton(Icons.refresh, _load),
              ],
            ),
            const SizedBox(height: 16),
            Text('Halo, $name',
                style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: kTaskDark)),
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
                    onTap: () => setState(() => _range = value),
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
                        const Text('Penjualan 7 Hari',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w800,
                                color: kTaskDark)),
                        if (_chartSel >= 0 && _chartSel < trend.length)
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: kTaskDark,
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
            if (recent.isNotEmpty) ...[
              const SizedBox(height: 14),
              GlassCard(
                padding: const EdgeInsets.all(16),
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Transaksi Terakhir',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: kTaskDark)),
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
                                color: const Color(0xffE3EAF2),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.receipt,
                                  size: 16, color: kTaskDark),
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
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: kTaskDark)),
                                  Text(t['cashier']?.toString() ?? '',
                                      style: const TextStyle(
                                          fontSize: 10, color: _kGray)),
                                ],
                              ),
                            ),
                            Text(fmtRp(asNum(t['grand_total'])),
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: kTaskDark)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 18),
            SizedBox(
              height: 56,
              child: FilledButton(
                onPressed: _openKasir,
                style: FilledButton.styleFrom(
                  backgroundColor: kTaskDark,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(28)),
                  padding: const EdgeInsets.only(left: 30, right: 6),
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('Mulai Kasir',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w600)),
                    ),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.arrow_forward,
                          size: 20, color: kTaskDark),
                    ),
                  ],
                ),
              ),
            ),
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
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, size: 19, color: kTaskDark),
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
          const SizedBox(height: 8),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value,
                maxLines: 1,
                style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: kTaskDark)),
          ),
        ],
      ),
    );
  }
}
