import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'format.dart';

const _kInk = Color(0xff1c1c1c);
const _kMuted = Color(0xff5f5f5d);
const _kBorder = Color(0xffeceae4);

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
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final recent = ((_data?['recent_transactions'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final trend =
        ((_data?['sales_trend'] as List?) ?? []).cast<Map<String, dynamic>>();
    final payments = ((_data?['payment_breakdown'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final maxTrend = trend.fold<double>(
        0, (m, t) => asNum(t['sales']) > m ? asNum(t['sales']) : m);
    final name = auth.userName ?? 'Admin';

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Text('Halo, $name',
              style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: _kInk)),
          const SizedBox(height: 2),
          const Text('Ini ringkasan bisnis Anda hari ini',
              style: TextStyle(fontSize: 12, color: _kMuted)),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _stat('Penjualan Hari Ini',
                    fmtRp(asNum(summary['today_sales'])),
                    Icons.trending_up, const Color(0x0d1c1c1c), _kInk),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _stat('Penjualan 7 Hari',
                    fmtRp(asNum(summary['seven_day_sales'])),
                    Icons.calendar_month, const Color(0xffe8f0e9),
                    const Color(0xff2d5238)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _stat('Bulan Ini',
                    fmtRp(asNum(summary['month_sales'])), Icons.pie_chart,
                    const Color(0xfff0ebe1), const Color(0xff5c4d3c)),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _stat('Transaksi Hari Ini',
                    '${summary['today_transactions'] ?? 0}', Icons.receipt,
                    const Color(0x0d1c1c1c), _kInk),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _card('Pengeluaran', [
            _row('Hari ini', fmtRp(asNum(summary['today_expenses']))),
            _row('7 hari', fmtRp(asNum(summary['seven_day_expenses']))),
            _row('Bulan ini', fmtRp(asNum(summary['month_expenses']))),
          ]),
          if (trend.isNotEmpty) ...[
            const SizedBox(height: 12),
            _card('Penjualan 7 Hari', [
              for (final t in trend)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    children: [
                      SizedBox(
                          width: 40,
                          child: Text(t['label']?.toString() ?? '',
                              style: const TextStyle(
                                  fontSize: 11, color: _kMuted))),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(99),
                          child: LinearProgressIndicator(
                            value: maxTrend > 0
                                ? (asNum(t['sales']) / maxTrend).clamp(0.0, 1.0)
                                : 0,
                            minHeight: 8,
                            backgroundColor: const Color(0xfff0ece4),
                            valueColor: const AlwaysStoppedAnimation(_kInk),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(fmtRp(asNum(t['sales'])),
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: _kInk)),
                    ],
                  ),
                ),
            ]),
          ],
          if (payments.isNotEmpty) ...[
            const SizedBox(height: 12),
            _card('Metode Pembayaran (30 hari)', [
              for (final p in payments)
                _row(p['payment_method']?.toString() ?? '',
                    fmtRp(asNum(p['amount']))),
            ]),
          ],
          if (recent.isNotEmpty) ...[
            const SizedBox(height: 12),
            _card('Transaksi Terakhir', [
              for (final t in recent)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 5),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(t['invoice_no']?.toString() ?? '',
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                    color: _kInk)),
                            Text(
                                '${t['cashier']?.toString() ?? ''}${t['branch_name'] != null ? ' · ${t['branch_name']}' : ''}',
                                style: const TextStyle(
                                    fontSize: 10, color: _kMuted)),
                          ],
                        ),
                      ),
                      Text(fmtRp(asNum(t['grand_total'])),
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: _kInk)),
                    ],
                  ),
                ),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _stat(String label, String value, IconData icon, Color chipBg,
      Color chipFg) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: const TextStyle(fontSize: 11, color: _kMuted)),
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
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: _kInk)),
        ],
      ),
    );
  }

  Widget _card(String title, List<Widget> children) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _kBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: _kInk)),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label,
              style: const TextStyle(fontSize: 12, color: _kMuted)),
          Text(value,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: _kInk)),
        ],
      ),
    );
  }
}
