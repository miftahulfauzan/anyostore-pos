// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'format.dart';
import 'ui_kit.dart';
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

  String _actionLabel(String action) {
    final text = action.replaceAll('_', ' ').trim();
    if (text.isEmpty) return 'Aktivitas';
    return text[0].toUpperCase() + text.substring(1);
  }

  Widget _activityCard(Map<String, dynamic> row) {
    final action = row['action']?.toString() ?? '';
    final color = action.contains('stock')
        ? const Color(0xFF0F766E)
        : action.contains('transaction') || action.contains('sale')
            ? const Color(0xFF1D4ED8)
            : action.contains('return')
                ? const Color(0xFF6D28D9)
                : action.contains('login') || action.contains('auth')
                    ? const Color(0xFF137A43)
                    : const Color(0xFF475569);
    final meta = [row['user_name'], row['branch_name']]
        .map((part) => part?.toString().trim() ?? '')
        .where((part) => part.isNotEmpty)
        .join(' · ');
    return AppListCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: _isDark ? .2 : .1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.history, size: 17, color: color),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(_actionLabel(action),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                const SizedBox(height: 2),
                Text(row['description']?.toString() ?? '',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11, height: 1.4, color: ink(context))),
                const SizedBox(height: 3),
                Text(
                    [
                      if (meta.isNotEmpty) meta,
                      formatWibDateTime(row['created_at']),
                    ].join(' · '),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 9.5, color: taskMuted(context))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

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
                    fillColor: taskSurface(context),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: taskBorder(context))),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: Theme.of(context).colorScheme.primary,
                            width: 2)),
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
                                    fontSize: TaskTypography.micro,
                                    fontWeight: _action == f.$1
                                        ? FontWeight.w800
                                        : FontWeight.w600)),
                            selected: _action == f.$1,
                            selectedColor:
                                Theme.of(context).colorScheme.primary,
                            labelStyle: TextStyle(
                                color: _action == f.$1
                                    ? Theme.of(context).colorScheme.onPrimary
                                    : taskMuted(context)),
                            side: BorderSide(color: taskBorder(context)),
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
                    ? const UiLoadingState(label: 'Memuat aktivitas…')
                    : _error != null
                        ? UiErrorState(message: _error!, onRetry: _load)
                        : _rows.isEmpty
                            ? AppEmptyState(
                                icon: Icons.history,
                                title: 'Belum ada aktivitas',
                                message:
                                    'Aktivitas transaksi, stok, dan pengguna akan tampil di sini.',
                              )
                            : ListView.separated(
                                padding: const EdgeInsets.all(12),
                                itemCount: _rows.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) {
                                  final r = _rows[i];
                                  return _activityCard(r);
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
