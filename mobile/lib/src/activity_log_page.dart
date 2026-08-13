// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'task_ui.dart';

class ActivityLogPage extends StatefulWidget {
  const ActivityLogPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<ActivityLogPage> createState() => _ActivityLogPageState();
}

class _ActivityLogPageState extends State<ActivityLogPage> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;
  String _action = ''; // '' | transaction_ | stock_ | return_ | product_

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await widget.api
          .activityLogs(search: _search.text.trim(), action: _action);
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
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: 'Cari aktivitas / petugas',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    filled: true,
                    fillColor: Colors.white,
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: kTaskBorder)),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide:
                            const BorderSide(color: kTaskDark, width: 1.4)),
                  ),
                  onSubmitted: (_) => _load(),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final f in const [
                        ('', 'Semua'),
                        ('transaction_', 'Transaksi'),
                        ('stock_', 'Stok'),
                        ('return_', 'Retur'),
                        ('product_', 'Produk'),
                      ])
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(f.$2,
                                style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: _action == f.$1
                                        ? FontWeight.w800
                                        : FontWeight.w600)),
                            selected: _action == f.$1,
                            selectedColor: kTaskDark,
                            labelStyle: TextStyle(
                                color: _action == f.$1
                                    ? Colors.white
                                    : kTaskGray),
                            onSelected: (_) {
                              setState(() => _action = f.$1);
                              _load();
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(child: Text(_error!))
                        : _rows.isEmpty
                            ? const Center(child: Text('Belum ada aktivitas'))
                            : ListView.separated(
                                padding: const EdgeInsets.all(12),
                                itemCount: _rows.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) {
                                  final r = _rows[i];
                                  return GlassCard(
                                    padding: const EdgeInsets.all(12),
                                    radius: 20,
                                    child: Row(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          width: 38,
                                          height: 38,
                                          decoration: BoxDecoration(
                                            color: Color(0xffE3EAF2),
                                            borderRadius:
                                                BorderRadius.circular(12),
                                          ),
                                          child: Icon(
                                              Icons.history,
                                              size: 18,
                                              color: ink(context)),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(
                                                  r['action']?.toString() ??
                                                      '',
                                                  style: TextStyle(
                                                      fontSize: 12,
                                                      fontWeight:
                                                          FontWeight.w800,
                                                      color: ink(context))),
                                              const SizedBox(height: 2),
                                              Text(
                                                  r['description']
                                                          ?.toString() ??
                                                      '',
                                                  style: const TextStyle(
                                                      fontSize: 11,
                                                      color: kTaskGray)),
                                              const SizedBox(height: 2),
                                              Text(
                                                  '${r['user_name'] ?? ''} · ${r['branch_name'] ?? ''} · ${r['created_at'] ?? ''}',
                                                  style: const TextStyle(
                                                      fontSize: 9,
                                                      color: kTaskGray)),
                                            ],
                                          ),
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
