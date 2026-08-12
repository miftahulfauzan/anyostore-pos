import 'package:flutter/material.dart';

import 'api_client.dart';
import 'task_ui.dart';

class MutationReportPage extends StatefulWidget {
  const MutationReportPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<MutationReportPage> createState() => _MutationReportPageState();
}

class _MutationReportPageState extends State<MutationReportPage> {
  String _type = 'in';
  String _preset = '7d';
  List<Map<String, dynamic>> _batches = [];
  Map<String, dynamic> _summary = {};
  bool _loading = true;
  String? _error;

  (String, String) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    return switch (_preset) {
      'today' => (d(now), d(now)),
      '30d' => (d(now.subtract(const Duration(days: 29))), d(now)),
      _ => (d(now.subtract(const Duration(days: 6))), d(now)),
    };
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
      final data = await widget.api
          .mutationReport(type: _type, start: start, end: end);
      if (!mounted) return;
      setState(() {
        _batches = ((data['data'] as List?) ?? []).cast<Map<String, dynamic>>();
        _summary = (data['summary'] as Map<String, dynamic>?) ?? {};
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: kTaskBg,
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: PillTabs(
                      tabs: const [
                    (value: 'in', icon: Icons.south_west, label: 'Masuk'),
                    (value: 'out', icon: Icons.north_east, label: 'Keluar'),
                  ],
                  selected: _type,
                  onChanged: (v) {
                    setState(() => _type = v);
                    _load();
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                child: PillTabs(
                  tabs: const [
                    (value: 'today', icon: Icons.today, label: 'Hari ini'),
                    (value: '7d', icon: Icons.date_range, label: '7 hari'),
                    (value: '30d', icon: Icons.calendar_month, label: '30 hari'),
                  ],
                  selected: _preset,
                  onChanged: (v) {
                    setState(() => _preset = v);
                    _load();
                  },
                ),
              ),
              if (_batches.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                  child: GlassCard(
                    padding: const EdgeInsets.all(14),
                    radius: 20,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceAround,
                      children: [
                        _stat('Jenis Produk',
                            '${_summary['product_count'] ?? 0}'),
                        _stat('Total Qty',
                            '${_summary['total_qty'] ?? 0}'),
                        _stat('Batch', '${_batches.length}'),
                      ],
                    ),
                  ),
                ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(child: Text(_error!))
                        : _batches.isEmpty
                            ? const Center(
                                child: Text('Belum ada data periode ini'))
                            : ListView.separated(
                                padding: const EdgeInsets.all(12),
                                itemCount: _batches.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) {
                                  final b = _batches[i];
                                  final products =
                                      ((b['products'] as List?) ?? [])
                                          .cast<Map<String, dynamic>>();
                                  return GlassCard(
                                    padding: const EdgeInsets.all(14),
                                    radius: 20,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Row(
                                          children: [
                                            Expanded(
                                              child: Text(
                                                  b['number']?.toString() ??
                                                      '',
                                                  style: const TextStyle(
                                                      fontSize: 12,
                                                      fontWeight:
                                                          FontWeight.w800,
                                                      color:
                                                          Color(0xff1E3A5F))),
                                            ),
                                            Text(
                                                '${b['total_qty'] ?? 0} pcs',
                                                style: const TextStyle(
                                                    fontSize: 12,
                                                    fontWeight:
                                                        FontWeight.w800,
                                                    color:
                                                        Color(0xff1E3A5F))),
                                          ],
                                        ),
                                        const SizedBox(height: 4),
                                        Text(
                                            '${b['date'] ?? ''} · ${b['warehouse'] ?? ''} · ${b['admin'] ?? ''}',
                                            style: const TextStyle(
                                                fontSize: 10,
                                                color: kTaskGray)),
                                        if (products.isNotEmpty) ...[
                                          const SizedBox(height: 8),
                                          for (final p in products.take(6))
                                            Padding(
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                      vertical: 1),
                                              child: Row(
                                                children: [
                                                  Expanded(
                                                    child: Text(
                                                        p['code']?.toString() ??
                                                            '',
                                                        style:
                                                            const TextStyle(
                                                                fontSize: 11,
                                                                color: kTaskGray)),
                                                  ),
                                                  Text(
                                                      '${p['qty'] ?? 0}',
                                                      style:
                                                          const TextStyle(
                                                              fontSize: 11,
                                                              fontWeight:
                                                                  FontWeight
                                                                      .w700)),
                                                ],
                                              ),
                                            ),
                                        ],
                                      ],
                                    ),
                                  );
                                },
                              ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _stat(String label, String value) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: Color(0xff1E3A5F))),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(fontSize: 10, color: kTaskGray)),
      ],
    );
  }
}
