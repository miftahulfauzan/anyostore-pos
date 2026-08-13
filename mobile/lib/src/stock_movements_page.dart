// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'task_ui.dart';

class StockMovementsPage extends StatefulWidget {
  const StockMovementsPage({super.key, required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<StockMovementsPage> createState() => _StockMovementsPageState();
}

class _StockMovementsPageState extends State<StockMovementsPage> {
  String _preset = '7d';
  List<Map<String, dynamic>> _rows = [];
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
      final rows = await widget.api.mutations(
          limit: 200, dateFrom: start, dateTo: end);
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
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
                padding: const EdgeInsets.only(top: 12),
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
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(child: Text(_error!))
                        : _rows.isEmpty
                            ? const Center(child: Text('Belum ada mutasi'))
                            : ListView.separated(
                                padding: const EdgeInsets.all(12),
                                itemCount: _rows.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) {
                                  final r = _rows[i];
                                  final qty = asNum(r['qty']);
                                  final positive = qty >= 0;
                                  return GlassCard(
                                    padding: const EdgeInsets.all(12),
                                    radius: 20,
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 40,
                                          height: 40,
                                          decoration: BoxDecoration(
                                            color: positive
                                                ? const Color(0xffE3EAF2)
                                                : const Color(0xffF7E4DE),
                                            borderRadius:
                                                BorderRadius.circular(13),
                                          ),
                                          child: Icon(
                                              positive
                                                  ? Icons.south_west
                                                  : Icons.north_east,
                                              size: 18,
                                              color: positive
                                                  ? const Color(0xff1E3A5F)
                                                  : const Color(0xffC2410C)),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                  r['product_name']
                                                          ?.toString() ??
                                                      '',
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: TextStyle(
                                                      fontSize: 13,
                                                      fontWeight:
                                                          FontWeight.w800,
                                                      color: ink(context))),
                                              const SizedBox(height: 2),
                                              Text(
                                                  '${r['type'] ?? ''} · ${r['warehouse_name'] ?? ''} · ${r['created_at'] ?? ''}',
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                      fontSize: 10,
                                                      color: kTaskGray)),
                                            ],
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          '${positive ? '+' : ''}${qty.toStringAsFixed(0)}',
                                          style: TextStyle(
                                              fontSize: 15,
                                              fontWeight: FontWeight.w800,
                                              color: positive
                                                  ? const Color(0xff1E6B3F)
                                                  : const Color(0xffC2410C)),
                                        ),
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
}
