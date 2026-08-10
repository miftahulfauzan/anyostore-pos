import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';

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
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final recent = ((_data?['recent_transactions'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final trend =
        ((_data?['sales_trend'] as List?) ?? []).cast<Map<String, dynamic>>();
    final payments = ((_data?['payment_breakdown'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final maxTrend = trend.fold<double>(
        0, (m, t) => asNum(t['sales']) > m ? asNum(t['sales']) : m);

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          _Card(
            title: 'Penjualan',
            children: [
              _Row('Hari ini', fmtRp(asNum(summary['today_sales']))),
              _Row('7 hari', fmtRp(asNum(summary['seven_day_sales']))),
              _Row('Bulan ini', fmtRp(asNum(summary['month_sales']))),
              _Row('Transaksi hari ini',
                  '${summary['today_transactions'] ?? 0}'),
            ],
          ),
          const SizedBox(height: 10),
          _Card(
            title: 'Pengeluaran',
            children: [
              _Row('Hari ini', fmtRp(asNum(summary['today_expenses']))),
              _Row('7 hari', fmtRp(asNum(summary['seven_day_expenses']))),
              _Row('Bulan ini', fmtRp(asNum(summary['month_expenses']))),
            ],
          ),
          if (trend.isNotEmpty) ...[
            const SizedBox(height: 10),
            _Card(
              title: 'Penjualan 7 hari',
              children: [
                for (final t in trend)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            SizedBox(
                                width: 44,
                                child: Text(t['label']?.toString() ?? '',
                                    style: const TextStyle(fontSize: 12))),
                            Text(fmtRp(asNum(t['sales'])),
                                style: const TextStyle(
                                    fontSize: 12, fontWeight: FontWeight.w600)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: maxTrend == 0
                                ? 0
                                : (asNum(t['sales']) / maxTrend)
                                    .clamp(0.0, 1.0),
                            minHeight: 6,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
          if (payments.isNotEmpty) ...[
            const SizedBox(height: 10),
            _Card(
              title: 'Metode pembayaran (30 hari)',
              children: [
                for (final p in payments)
                  _Row((p['payment_method'] ?? '').toString().toUpperCase(),
                      fmtRp(asNum(p['amount']))),
              ],
            ),
          ],
          const SizedBox(height: 10),
          _Card(
            title: 'Transaksi terakhir',
            children: [
              if (recent.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(8),
                  child: Text('Belum ada transaksi'),
                )
              else
                for (final t in recent)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(t['invoice_no']?.toString() ?? '-',
                        style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(t['created_at']?.toString() ?? ''),
                    trailing: Text(fmtRp(asNum(t['grand_total'])),
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                  ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 8),
              ...children,
            ],
          ),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: TextStyle(color: Theme.of(context).colorScheme.outline)),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
