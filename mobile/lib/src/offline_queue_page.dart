// ignore_for_file: prefer_const_constructors

import 'dart:convert';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'ui_kit.dart';
import 'format.dart';
import 'offline_store.dart';
import 'task_ui.dart';

/// Halaman antrean transaksi offline: lihat, sync manual, hapus.
class OfflineQueuePage extends StatefulWidget {
  const OfflineQueuePage({super.key, required this.api});
  final ApiClient api;

  @override
  State<OfflineQueuePage> createState() => _OfflineQueuePageState();
}

class _OfflineQueuePageState extends State<OfflineQueuePage> {
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  bool _syncing = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final txs = await OfflineStore.pending();
    final exps = await OfflineStore.pendingExpenses();
    if (!mounted) return;
    setState(() {
      _rows = [
        for (final r in txs)
          {
            'kind': 'tx',
            'id': r['client_transaction_id']?.toString() ?? '',
            'row': r,
          },
        for (final r in exps)
          {
            'kind': 'expense',
            'id': '${r['id']}',
            'row': r,
          },
      ];
      _loading = false;
    });
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    final n = await syncOfflineTransactions(widget.api);
    final m = await syncOfflineExpenses(widget.api);
    await _load();
    if (!mounted) return;
    setState(() => _syncing = false);
    final total = n + m;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(total > 0
            ? '$total data berhasil disinkronkan'
            : 'Tidak ada data yang tersinkron (cek koneksi/antrean)')));
  }

  Future<void> _remove(Map<String, dynamic> row) async {
    if (row['kind'] == 'expense') {
      await OfflineStore.removeExpense(int.parse('${row['id']}'));
    } else {
      await OfflineStore.remove(row['id']?.toString() ?? '');
    }
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: pageBg(context),
      appBar: AppBar(
        surfaceTintColor: Colors.transparent,
        title: const Text('Antrean Offline'),
      ),
      body: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: FilledButton.icon(
                        onPressed: _syncing ? null : _sync,
                        style: FilledButton.styleFrom(
                          backgroundColor:
                              Theme.of(context).colorScheme.primary,
                          foregroundColor:
                              Theme.of(context).colorScheme.onPrimary,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14)),
                        ),
                        icon: _syncing
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.cloud_sync, size: 18),
                        label: Text(
                            _syncing ? 'Menyinkronkan...' : 'Sync Sekarang'),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(child: _body()),
            ],
          ),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading) return const UiLoadingState(label: 'Memuat antrean…');
    if (_rows.isEmpty) {
      return const AppEmptyState(
        icon: Icons.cloud_done_outlined,
        title: 'Antrean kosong',
        message: 'Tidak ada data offline yang menunggu sinkronisasi.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _rows.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final row = _rows[i];
        final isExpense = row['kind'] == 'expense';
        final raw = row['row'] as Map<String, dynamic>;
        final payload = jsonDecode(raw['payload'] as String? ?? '{}')
            as Map<String, dynamic>;
        final created = raw['created_at']?.toString() ?? '';
        final title = isExpense
            ? (payload['name']?.toString() ?? 'Pengeluaran')
            : (raw['temp_invoice_no']?.toString() ?? '-');
        final amount = isExpense
            ? '${payload['type'] == 'income' ? 'Pemasukan' : 'Pengeluaran'} ${fmtRp(asNum(payload['amount']))}'
            : "Transaksi ${fmtRp(asNum(payload['grand_total'] ?? raw['grand_total']))}";
        final accent =
            isExpense ? const Color(0xFFB45309) : const Color(0xFF1D4ED8);
        return AppListCard(
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: .1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                    isExpense
                        ? Icons.account_balance_wallet_outlined
                        : Icons.cloud_off_outlined,
                    size: 18,
                    color: accent),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 1),
                    Text(amount,
                        style:
                            TextStyle(fontSize: 11, color: taskMuted(context))),
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 5,
                      runSpacing: 3,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        AppStatusPill(
                          label: 'MENUNGGU SYNC',
                          fg: const Color(0xFFB45309),
                          bg: const Color(0xFFFEF3C7),
                        ),
                        Text(formatWibDateTime(created),
                            style: TextStyle(
                                fontSize: TaskTypography.micro,
                                color: taskMuted(context))),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => _remove(row),
                icon: Icon(Icons.delete_outline,
                    size: 19, color: taskMuted(context)),
                tooltip: 'Hapus dari antrean',
              ),
            ],
          ),
        );
      },
    );
  }
}
