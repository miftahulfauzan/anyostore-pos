import 'dart:convert';

// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'barcode_scanner_page.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'task_ui.dart';

class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key, required this.api, required this.role});
  static final ValueNotifier<int> reloadTick = ValueNotifier(0);
  final ApiClient api;
  final String? role;

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab> {
  String _section = 'transaksi'; // transaksi | retur
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _returns = [];
  int _page = 1;
  int _totalPages = 1;
  bool _loading = true;
  String? _error;

  String _preset = 'today'; // today | 7d | 30d | all
  String _status = '';
  final _search = TextEditingController();

  bool get _canCancel => ['owner', 'manager', 'admin'].contains(widget.role);

  @override
  void initState() {
    super.initState();
    _load();
    // Saat internet kembali: otomatis muat ulang dari server (normal setelah sync).
    OfflineStatus.syncTick.addListener(_onSyncTick);
    // Saat tab Riwayat dibuka lagi: muat ulang (transaksi offline langsung muncul).
    HistoryTab.reloadTick.addListener(_onReloadTick);
  }

  void _onSyncTick() {
    _page = 1;
    _load(silent: true);
  }

  void _onReloadTick() {
    _load(silent: true);
  }

  @override
  void dispose() {
    OfflineStatus.syncTick.removeListener(_onSyncTick);
    HistoryTab.reloadTick.removeListener(_onReloadTick);
    _search.dispose();
    super.dispose();
  }

  (String?, String?) get _range {
    switch (_preset) {
      case '7d':
        final now = DateTime.now().toUtc().add(const Duration(hours: 7));
        final start = now.subtract(const Duration(days: 6));
        String d(DateTime x) =>
            '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
        return (d(start), d(now));
      case '30d':
        final now = DateTime.now().toUtc().add(const Duration(hours: 7));
        final start = now.subtract(const Duration(days: 29));
        String d(DateTime x) =>
            '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
        return (d(start), d(now));
      case 'kemarin':
        final now = DateTime.now().toUtc().add(const Duration(hours: 7));
        String d(DateTime x) =>
            '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
        final y = now.subtract(const Duration(days: 1));
        return (d(y), d(y));
      case 'bulan':
        final now = DateTime.now().toUtc().add(const Duration(hours: 7));
        String d(DateTime x) =>
            '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
        return (
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
          d(now)
        );
      case 'bulan_lalu':
        final now = DateTime.now().toUtc().add(const Duration(hours: 7));
        String d(DateTime x) =>
            '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
        final firstThis = DateTime(now.year, now.month, 1);
        final lastLast = firstThis.subtract(const Duration(days: 1));
        final firstLast = DateTime(lastLast.year, lastLast.month, 1);
        return (d(firstLast), d(lastLast));
      case 'all':
        return (null, null);
      default:
        return (todayWib(), todayWib());
    }
  }

  Future<void> _openScanner() async {
    final code = await Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => const BarcodeScannerPage()),
    );
    if (code == null || !mounted) return;
    setState(() => _search.text = code);
    _page = 1;
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final range = _range;
    final cacheKey =
        'history-${range.$1}-${range.$2}-$_status-${_search.text.trim()}-$_page';
    try {
      if (_section == 'retur') {
        final rows = await widget.api.returnsList();
        if (!mounted) return;
        setState(() {
          _returns = rows.cast<Map<String, dynamic>>();
          _loading = false;
        });
        // Simpan cache retur untuk offline.
        await OfflineStore.cacheSet(
            'history-retur', jsonEncode({'rows': rows}));
        return;
      }
      final (rows, totalPages) = await widget.api.transactionsPage(
        page: _page,
        limit: 50,
        dateFrom: range.$1,
        dateTo: range.$2,
        status: _status,
        search: _search.text.trim(),
      );
      if (!mounted) return;
      final merged = await _mergeOffline(rows.cast<Map<String, dynamic>>());
      if (!mounted) return;
      setState(() {
        _rows = merged;
        _totalPages = totalPages;
        _loading = false;
      });
      // Simpan cache riwayat untuk offline.
      await OfflineStore.cacheSet(
          cacheKey,
          jsonEncode({
            'rows': rows,
            'totalPages': totalPages,
          }));
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Offline: pakai cache riwayat/retur terakhir.
        try {
          if (_section == 'retur') {
            final cached = await OfflineStore.cacheGet('history-retur');
            if (cached != null && mounted) {
              setState(() {
                _returns = ((cached['payload'] as Map<String, dynamic>)['rows']
                            as List?)
                        ?.cast<Map<String, dynamic>>() ??
                    [];
                _error = null;
                _loading = false;
              });
              return;
            }
          } else {
            final cached = await OfflineStore.cacheGet(cacheKey);
            if (cached != null && mounted) {
              final payload = cached['payload'] as Map<String, dynamic>;
              final merged = await _mergeOffline(
                  ((payload['rows'] as List?) ?? [])
                      .cast<Map<String, dynamic>>());
              if (mounted) {
                setState(() {
                  _rows = merged;
                  _totalPages =
                      int.tryParse('${payload['totalPages'] ?? 1}') ?? 1;
                  _error = null;
                  _loading = false;
                });
              }
              return;
            }
          }
        } catch (_) {}
      }
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  /// Gabungkan transaksi offline (kuning) ke atas daftar riwayat.
  Future<List<Map<String, dynamic>>> _mergeOffline(
      List<Map<String, dynamic>> rows) async {
    try {
      final pending = await OfflineStore.pending();
      if (pending.isEmpty) return rows;
      final offlineRows = <Map<String, dynamic>>[
        for (final r in pending)
          {
            'offline': true,
            'invoice_no': r['temp_invoice_no']?.toString() ?? '-',
            'grand_total': r['grand_total'],
            'created_at': r['created_at']?.toString() ?? '',
            'status': 'offline',
            'cashier': 'Belum sync',
          },
      ];
      return [...offlineRows, ...rows];
    } catch (_) {
      return rows;
    }
  }

  Future<void> _openDetail(Map<String, dynamic> row) async {
    final id = int.tryParse('${row['id']}');
    if (id == null) return;
    Map<String, dynamic> detail;
    try {
      detail = await widget.api.transactionDetail(id);
      // Simpan cache detail transaksi untuk offline.
      await OfflineStore.cacheSet('tx-detail-$id', jsonEncode(detail));
    } on ApiException catch (e) {
      if (!e.isNetwork) {
        if (mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(e.message)));
        }
        return;
      }
      // Offline: pakai detail transaksi dari cache.
      final cached = await OfflineStore.cacheGet('tx-detail-$id');
      final payload = cached?['payload'] as Map<String, dynamic>?;
      if (payload == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'Detail transaksi belum tersimpan offline. Buka transaksi ini sekali saat online.')));
        }
        return;
      }
      detail = payload;
    }
    if (!mounted) return;
    final items =
        ((detail['items'] as List?) ?? []).cast<Map<String, dynamic>>();
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(detail['invoice_no']?.toString() ?? 'Transaksi'),
        content: SizedBox(
          width: double.maxFinite,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                          detail['invoice_no']?.toString() ?? 'Transaksi',
                          style: const TextStyle(
                              fontSize: 16, fontWeight: FontWeight.w800)),
                    ),
                    _StatusChip(detail['status']?.toString() ?? ''),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${detail['created_at'] ?? ''}${detail['cashier'] != null && (detail['cashier'] as String).isNotEmpty ? ' · Kasir: ${detail['cashier']}' : ''}',
                  style:
                      const TextStyle(fontSize: 11, color: Color(0xff8A857C)),
                ),
                const Divider(),
                for (final item in items) ...[
                  Text(item['product_name']?.toString() ?? '',
                      style: const TextStyle(
                          fontSize: 12.5, fontWeight: FontWeight.w700)),
                  if ((item['variant_detail'] ?? '').toString().isNotEmpty)
                    Text((item['variant_detail'] ?? '').toString(),
                        style: const TextStyle(
                            fontSize: 10.5, color: Color(0xff8A857C))),
                  _StrukRow(
                    '${item['quantity']} x ${fmtRp(asNum(item['price']))}'
                    '${asNum(item['cancelled_qty']) > 0 ? '  (batal ${item['cancelled_qty']})' : ''}'
                    '${asNum(item['returned_qty']) > 0 ? '  (retur ${item['returned_qty']})' : ''}',
                    fmtRp(asNum(item['subtotal'])),
                  ),
                  const SizedBox(height: 4),
                ],
                const Divider(),
                _StrukRow('Subtotal', fmtRp(asNum(detail['subtotal'] ?? 0))),
                if (asNum(detail['discount'] ?? 0) > 0)
                  _StrukRow('Diskon', '-${fmtRp(asNum(detail['discount']))}',
                      valueColor: const Color(0xffB0563A)),
                _StrukRow('Total', fmtRp(asNum(detail['grand_total'])),
                    bold: true),
                const Divider(),
                _StrukRow('Bayar', fmtRp(asNum(detail['amount_paid']))),
                if (asNum(detail['change']) > 0)
                  _StrukRow('Kembalian', fmtRp(asNum(detail['change']))),
                _StrukRow('Metode',
                    (detail['payment_method'] ?? '').toString().toUpperCase()),
                if (detail['cancelled_amount'] != null &&
                    asNum(detail['cancelled_amount']) > 0)
                  _StrukRow('Dibatalkan',
                      '-${fmtRp(asNum(detail['cancelled_amount']))}',
                      valueColor: const Color(0xffB0563A)),
              ],
            ),
          ),
        ),
        actions: [
          if (_canCancel && detail['status'] != 'cancelled')
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                _cancelFlow(id, detail, items);
              },
              child: const Text('Batalkan Item'),
            ),
          if (detail['status'] == 'completed' ||
              detail['status'] == 'partially_refunded')
            TextButton(
              onPressed: () {
                Navigator.pop(ctx);
                _returnFlow(id, items);
              },
              child: const Text('Buat Retur'),
            ),
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Tutup')),
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(ctx);
              printReceiptNow(context, () => widget.api.receipt(id));
            },
            icon: const Icon(Icons.print),
            label: const Text('Cetak Struk'),
          ),
        ],
      ),
    );
  }

  Future<void> _cancelFlow(int id, Map<String, dynamic> detail,
      List<Map<String, dynamic>> items) async {
    final controllers = <int, TextEditingController>{};
    final reasons = <int, TextEditingController>{};
    for (final item in items) {
      final itemId =
          int.tryParse('${item['transaction_item_id'] ?? item['id']}');
      if (itemId == null) continue;
      final remaining =
          (asNum(item['quantity']) - asNum(item['cancelled_qty'])).toInt();
      if (remaining > 0) {
        // Jangan prefill qty penuh: user mengetik jumlah yang dibatalkan,
        // supaya pembatalan sebagian tidak malah membatalkan seluruh item.
        controllers[itemId] = TextEditingController();
        reasons[itemId] = TextEditingController();
      }
    }
    if (controllers.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tidak ada item yang bisa dibatalkan')));
      return;
    }
    final reasonTop = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Batalkan Item'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: reasonTop,
                  decoration: const InputDecoration(
                      labelText: 'Alasan pembatalan',
                      border: OutlineInputBorder())),
              const SizedBox(height: 8),
              for (final item in items)
                if (controllers.containsKey(int.tryParse(
                    '${item['transaction_item_id'] ?? item['id']}')))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(
                            child: Text('${item['product_name']}',
                                maxLines: 1, overflow: TextOverflow.ellipsis)),
                        SizedBox(
                          width: 80,
                          child: TextField(
                              controller: controllers[int.tryParse(
                                  '${item['transaction_item_id'] ?? item['id']}')],
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                  isDense: true, labelText: 'Qty')),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Proses Batal')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final cancelItems = <Map<String, dynamic>>[];
    for (final item in items) {
      final id = int.tryParse('${item['transaction_item_id'] ?? item['id']}');
      if (id == null || !controllers.containsKey(id)) continue;
      final qty = int.tryParse(controllers[id]!.text) ?? 0;
      if (qty > 0) {
        cancelItems.add({
          'transaction_item_id': id,
          'qty': qty,
          if (reasons[id]!.text.trim().isNotEmpty)
            'reason': reasons[id]!.text.trim(),
        });
      }
    }
    if (cancelItems.isEmpty) return;
    try {
      await widget.api
          .cancelTransaction(id, cancelItems, reasonTop.text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Pembatalan diproses')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _returnFlow(int id, List<Map<String, dynamic>> items) async {
    final controllers = <int, TextEditingController>{};
    final reasons = <int, TextEditingController>{};
    for (final item in items) {
      final itemId =
          int.tryParse('${item['transaction_item_id'] ?? item['id']}');
      if (itemId == null) continue;
      final remaining =
          (asNum(item['quantity']) - asNum(item['cancelled_qty'])).toInt();
      if (remaining > 0) {
        controllers[itemId] = TextEditingController();
        reasons[itemId] = TextEditingController();
      }
    }
    if (controllers.isEmpty) return;
    var refundMethod = 'cash';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Buat Retur'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<String>(
                  initialValue: refundMethod,
                  decoration: const InputDecoration(
                      labelText: 'Metode refund', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'cash', child: Text('Cash')),
                    DropdownMenuItem(value: 'qris', child: Text('QRIS')),
                    DropdownMenuItem(
                        value: 'transfer', child: Text('Transfer')),
                    DropdownMenuItem(value: 'debit', child: Text('Debit')),
                  ],
                  onChanged: (v) =>
                      setDialogState(() => refundMethod = v ?? 'cash'),
                ),
                const SizedBox(height: 8),
                for (final item in items)
                  if (controllers.containsKey(int.tryParse(
                      '${item['transaction_item_id'] ?? item['id']}')))
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        children: [
                          Expanded(
                              child: Text('${item['product_name']}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis)),
                          SizedBox(
                            width: 80,
                            child: TextField(
                                controller: controllers[int.tryParse(
                                    '${item['transaction_item_id'] ?? item['id']}')],
                                keyboardType: TextInputType.number,
                                decoration: InputDecoration(
                                    isDense: true,
                                    labelText: 'Qty',
                                    hintText:
                                        'max ${(asNum(item['quantity']) - asNum(item['cancelled_qty'])).toInt()}')),
                          ),
                        ],
                      ),
                    ),
              ],
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Batal')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Ajukan Retur')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final returnItems = <Map<String, dynamic>>[];
    for (final item in items) {
      final iid = int.tryParse('${item['transaction_item_id'] ?? item['id']}');
      if (iid == null || !controllers.containsKey(iid)) continue;
      final qty = int.tryParse(controllers[iid]!.text) ?? 0;
      if (qty > 0) {
        returnItems.add({
          'transaction_item_id': iid,
          'quantity': qty,
          if (reasons[iid]!.text.trim().isNotEmpty)
            'reason': reasons[iid]!.text.trim(),
        });
      }
    }
    if (returnItems.isEmpty) return;
    try {
      await widget.api.createReturn({
        'transaction_id': id,
        'items': returnItems,
        'refund_method': refundMethod,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Retur berhasil dibuat & disetujui — stok kembali otomatis')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  InputDecoration _dec(String label, {bool hint = false}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: BorderSide(
          color: dark ? const Color(0xff2A3140) : const Color(0xffE7E0D6)),
    );
    return InputDecoration(
      labelText: hint ? null : label,
      hintText: hint ? label : null,
      filled: true,
      fillColor: dark ? const Color(0xff1F2530) : Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: BorderSide(
              color: dark ? const Color(0xff7FA8CF) : const Color(0xff1E3A5F),
              width: 1.4)),
    );
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
                padding: const EdgeInsets.only(top: 12, bottom: 12),
                child: PillTabs(
                  tabs: const [
                    (
                      value: 'transaksi',
                      icon: Icons.receipt_long,
                      label: 'Transaksi'
                    ),
                    (
                      value: 'retur',
                      icon: Icons.assignment_return,
                      label: 'Retur'
                    ),
                  ],
                  selected: _section,
                  onChanged: (v) {
                    setState(() => _section = v);
                    _load();
                  },
                ),
              ),
              if (_section == 'transaksi')
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _preset,
                              isExpanded: true,
                              decoration: _dec('Rentang'),
                              items: const [
                                DropdownMenuItem(
                                    value: 'today', child: Text('Hari ini')),
                                DropdownMenuItem(
                                    value: '7d', child: Text('7 hari')),
                                DropdownMenuItem(
                                    value: '30d', child: Text('30 hari')),
                                DropdownMenuItem(
                                    value: 'kemarin', child: Text('Kemarin')),
                                DropdownMenuItem(
                                    value: 'bulan', child: Text('Bulan ini')),
                                DropdownMenuItem(
                                    value: 'bulan_lalu',
                                    child: Text('Bulan kemarin')),
                                DropdownMenuItem(
                                    value: 'all', child: Text('Semua')),
                              ],
                              onChanged: (v) {
                                setState(() => _preset = v ?? 'today');
                                _load();
                              },
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _status,
                              isExpanded: true,
                              decoration: _dec('Status'),
                              items: const [
                                DropdownMenuItem(
                                    value: '', child: Text('Semua status')),
                                DropdownMenuItem(
                                    value: 'completed',
                                    child: Text('Completed')),
                                DropdownMenuItem(
                                    value: 'partially_cancelled',
                                    child: Text('Sebagian dibatalkan')),
                                DropdownMenuItem(
                                    value: 'cancelled',
                                    child: Text('Dibatalkan')),
                                DropdownMenuItem(
                                    value: 'refunded', child: Text('Refunded')),
                              ],
                              onChanged: (v) {
                                setState(() => _status = v ?? '');
                                _load();
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _search,
                        decoration:
                            _dec('Cari invoice / nama', hint: true).copyWith(
                          suffixIcon: IconButton(
                            onPressed: _openScanner,
                            icon: const Icon(Icons.qr_code_scanner),
                            tooltip: 'Scan barcode invoice',
                          ),
                        ),
                        onSubmitted: (_) {
                          _page = 1;
                          _load();
                        },
                      ),
                    ],
                  ),
                ),
              Expanded(child: _buildBody()),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
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
    if (_section == 'retur') {
      if (_returns.isEmpty) {
        return const Center(child: Text('Belum ada retur'));
      }
      return ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
        itemCount: _returns.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final row = _returns[i];
          final status = row['status']?.toString() ?? '';
          return _TxCard(
            icon: Icons.assignment_return,
            iconBg: const Color(0xffE3EAF2),
            iconFg: const Color(0xff2E5D8F),
            title: row['return_no']?.toString() ?? '-',
            subtitle: '${row['invoice_no'] ?? ''} · ${row['created_at'] ?? ''}',
            trailing: fmtRp(asNum(row['refund_amount'])),
            status: status,
            // Retur otomatis disetujui backend — tidak perlu tombol Setujui.
            extra: null,
          );
        },
      );
    }
    if (_rows.isEmpty) {
      return const Center(child: Text('Tidak ada transaksi'));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
        itemCount: _rows.length + 1,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          if (i == _rows.length) {
            return Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: _page > 1
                      ? () {
                          _page--;
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('Halaman $_page'),
                IconButton(
                  onPressed: _page < _totalPages
                      ? () {
                          _page++;
                          _load();
                        }
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            );
          }
          final row = _rows[i];
          final isOffline = row['offline'] == true;
          final status = (row['status'] ?? '').toString();
          return _TxCard(
            icon: isOffline ? Icons.cloud_off : Icons.receipt,
            iconBg:
                isOffline ? const Color(0xFFF5E1A8) : const Color(0xffE3EAF2),
            iconFg:
                isOffline ? const Color(0xFF8A6D1A) : const Color(0xff1E3A5F),
            title: row['invoice_no']?.toString() ?? '-',
            subtitle:
                '${row['created_at'] ?? ''} · ${isOffline ? 'Belum tersinkron' : (row['payment_method'] ?? '').toString().toUpperCase()}'
                '${row['cashier'] != null && (row['cashier'] as String).isNotEmpty ? ' · Kasir: ${row['cashier']}' : ''}',
            trailing: fmtRp(asNum(row['grand_total'])),
            status: isOffline ? 'offline' : status,
            offline: isOffline,
            onTap: isOffline
                ? () {
                    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                        content: Text(
                            'Transaksi offline belum tersinkron — akan tampil lengkap setelah internet kembali.')));
                  }
                : () => _openDetail(row),
          );
        },
      ),
    );
  }
}

class _TxCard extends StatelessWidget {
  const _TxCard(
      {required this.icon,
      required this.iconBg,
      required this.iconFg,
      required this.title,
      required this.subtitle,
      required this.trailing,
      this.status,
      this.extra,
      this.onTap,
      this.offline = false});
  final IconData icon;
  final Color iconBg;
  final Color iconFg;
  final String title;
  final String subtitle;
  final String trailing;
  final String? status;
  final Widget? extra;
  final VoidCallback? onTap;
  final bool offline;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final chipBg = dark ? const Color(0xff26303F) : iconBg;
    final chipFg = dark ? const Color(0xffDDE6F2) : iconFg;
    // Transaksi offline ditandai latar kuning.
    const offlineBg = Color(0xFFFFF3CD);
    return GlassCard(
      radius: 24,
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: ColoredBox(
        color: offline ? offlineBg : Colors.transparent,
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: chipBg,
                borderRadius: BorderRadius.circular(15),
              ),
              child: Icon(icon, size: 20, color: chipFg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                  const SizedBox(height: 3),
                  Text(subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 10, color: Color(0xff8A857C))),
                ],
              ),
            ),
            SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(trailing,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                if (status != null && status!.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  _StatusChip(status!),
                ],
                if (extra != null) extra!,
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Baris label-nilai ala struk (kiri/kanan rapi).
class _StrukRow extends StatelessWidget {
  const _StrukRow(this.label, this.value, {this.bold = false, this.valueColor});
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1.5),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: 12,
                    color: const Color(0xff5f5f5d),
                    fontWeight: bold ? FontWeight.w800 : FontWeight.w400)),
          ),
          Text(value,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                  color: valueColor ?? ink(context))),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final (label, bg, fg) = switch (status) {
      'completed' => (
          'Selesai',
          dark ? const Color(0xff243047) : const Color(0xffE3EAF2),
          dark ? const Color(0xffA9C4E8) : const Color(0xff1E3A5F)
        ),
      'pending' => (
          'Menunggu',
          dark ? const Color(0xff243047) : const Color(0xffE3EAF2),
          dark ? const Color(0xffA9C4E8) : const Color(0xff2E5D8F)
        ),
      'partially_cancelled' => (
          'Sebagian dibatalkan',
          dark ? const Color(0xff2A2C31) : const Color(0xffE6ECF3),
          dark ? const Color(0xffC3C9D2) : const Color(0xff8A857C)
        ),
      'cancelled' => (
          'Dibatalkan',
          dark ? const Color(0xff3A2622) : const Color(0xffF3DDD8),
          dark ? const Color(0xffF2B8A5) : const Color(0xffB0563A)
        ),
      'offline' => (
          'OFFLINE',
          dark ? const Color(0xff3A3320) : const Color(0xFFF5E1A8),
          dark ? const Color(0xffE8C96A) : const Color(0xFF8A6D1A)
        ),
      'partially_refunded' => (
          'Retur sebagian',
          dark ? const Color(0xff243047) : const Color(0xffE3EAF2),
          dark ? const Color(0xffA9C4E8) : const Color(0xff2E5D8F)
        ),
      'refunded' => (
          'Retur penuh',
          dark ? const Color(0xff243047) : const Color(0xffE3EAF2),
          dark ? const Color(0xffA9C4E8) : const Color(0xff1E3A5F)
        ),
      _ => (
          status,
          dark ? const Color(0xff2A2C31) : const Color(0xffE6ECF3),
          dark ? const Color(0xffC3C9D2) : const Color(0xff8A857C)
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label,
          style:
              TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}
