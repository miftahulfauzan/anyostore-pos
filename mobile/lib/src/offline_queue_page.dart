import 'dart:convert';

import 'package:flutter/material.dart';

import 'api_client.dart';
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
    final rows = await OfflineStore.pending();
    if (!mounted) return;
    setState(() {
      _rows = rows;
      _loading = false;
    });
  }

  Future<void> _sync() async {
    setState(() => _syncing = true);
    final n = await syncOfflineTransactions(widget.api);
    await _load();
    if (!mounted) return;
    setState(() => _syncing = false);
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(n > 0
            ? '$n transaksi berhasil disinkronkan'
            : 'Tidak ada transaksi yang tersinkron (cek koneksi/antrean)')));
  }

  Future<void> _remove(Map<String, dynamic> row) async {
    await OfflineStore.remove(row['client_transaction_id']?.toString() ?? '');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xffF5F1EA),
      appBar: AppBar(
        backgroundColor: Colors.white,
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
                          backgroundColor: kTaskDark,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(28)),
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
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_rows.isEmpty) {
      return const Center(
        child: Text('Tidak ada transaksi offline menunggu sync.',
            style: TextStyle(color: kTaskGray)),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: _rows.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final row = _rows[i];
        final payload = jsonDecode(row['payload'] as String? ?? '{}')
            as Map<String, dynamic>;
        final created = row['created_at']?.toString() ?? '';
        final datePart = created.contains('T') ? created.split('T').first : created;
        return GlassCard(
          padding: const EdgeInsets.all(12),
          radius: 18,
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: const Color(0x141E3A5F),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.cloud_off, size: 20, color: kTaskDark),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row['temp_invoice_no']?.toString() ?? '-',
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: kTaskDark)),
                    Text(
                        "Total ${fmtRp(asNum(payload['grand_total'] ?? row['grand_total']))}",
                        style: const TextStyle(
                            fontSize: 12, color: kTaskGray)),
                    Text(datePart,
                        style: const TextStyle(
                            fontSize: 10, color: kTaskGray)),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => _remove(row),
                icon: const Icon(Icons.delete_outline, color: kTaskGray),
                tooltip: 'Hapus dari antrean',
              ),
            ],
          ),
        );
      },
    );
  }
}
