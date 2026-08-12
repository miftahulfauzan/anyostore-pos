import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'task_ui.dart';

class HistoryTab extends StatefulWidget {
  const HistoryTab({super.key, required this.api, required this.role});
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
  bool get _canApprove => _canCancel;

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
      case 'all':
        return (null, null);
      default:
        return (todayWib(), todayWib());
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_section == 'retur') {
        final rows = await widget.api.returnsList();
        if (!mounted) return;
        setState(() {
          _returns = rows.cast<Map<String, dynamic>>();
          _loading = false;
        });
        return;
      }
      final range = _range;
      final (rows, totalPages) = await widget.api.transactionsPage(
        page: _page,
        limit: 50,
        dateFrom: range.$1,
        dateTo: range.$2,
        status: _status,
        search: _search.text.trim(),
      );
      if (!mounted) return;
      setState(() {
        _rows = rows.cast<Map<String, dynamic>>();
        _totalPages = totalPages;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  Future<void> _openDetail(Map<String, dynamic> row) async {
    final id = int.tryParse('${row['id']}');
    if (id == null) return;
    try {
      final detail = await widget.api.transactionDetail(id);
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
                  Text('Total: ${fmtRp(asNum(detail['grand_total']))}',
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                  Text(
                      'Bayar: ${fmtRp(asNum(detail['amount_paid']))}  Kembalian: ${fmtRp(asNum(detail['change']))}'),
                  Text(
                      'Metode: ${detail['payment_method']?.toString().toUpperCase()}'),
                  Text('Status: ${detail['status'] ?? ''}'),
                  const Divider(),
                  for (final item in items)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child:
                          Text('${item['product_name']}  x${item['quantity']}\n'
                              '  ${fmtRp(asNum(item['subtotal']))}'),
                    ),
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
            if (detail['status'] == 'completed')
              TextButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  _returnFlow(id, items);
                },
                child: const Text('Buat Retur'),
              ),
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Tutup')),
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
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
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
        controllers[itemId] = TextEditingController(text: '$remaining');
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
          content: Text('Retur diajukan (menunggu persetujuan)')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _approveReturn(Map<String, dynamic> row) async {
    final controller = TextEditingController();
    final ok = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Setujui Retur'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
              labelText: 'ID gudang tujuan',
              helperText: 'Cek daftar gudang di menu Kasir > Gudang',
              border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          FilledButton(
              onPressed: () =>
                  Navigator.pop(ctx, int.tryParse(controller.text)),
              child: const Text('Setujui')),
        ],
      ),
    );
    if (ok == null || !mounted) return;
    try {
      await widget.api.approveReturn(int.parse('${row['id']}'), ok);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Retur disetujui, stok kembali')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  InputDecoration _dec(String label, {bool hint = false}) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: Color(0xffE7E0D6)),
    );
    return InputDecoration(
      labelText: hint ? null : label,
      hintText: hint ? label : null,
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: const BorderSide(color: Color(0xff1E3A5F), width: 1.4)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: const Color(0xffF5F1EA),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: PillTabs(
              tabs: const [
                (value: 'transaksi', icon: Icons.receipt_long, label: 'Transaksi'),
                (value: 'retur', icon: Icons.assignment_return, label: 'Retur'),
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
                        decoration: _dec('Rentang'),
                        items: const [
                          DropdownMenuItem(
                              value: 'today', child: Text('Hari ini')),
                          DropdownMenuItem(
                              value: '7d', child: Text('7 hari')),
                          DropdownMenuItem(
                              value: '30d', child: Text('30 hari')),
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
                        decoration: _dec('Status'),
                        items: const [
                          DropdownMenuItem(
                              value: '', child: Text('Semua status')),
                          DropdownMenuItem(
                              value: 'completed', child: Text('Completed')),
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
                  decoration: _dec('Cari invoice / nama', hint: true),
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
        padding: const EdgeInsets.all(12),
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
            extra: _canApprove && status == 'pending'
                ? TextButton(
                    onPressed: () => _approveReturn(row),
                    style: TextButton.styleFrom(
                        foregroundColor: const Color(0xff1E3A5F)),
                    child: const Text('Setujui'),
                  )
                : null,
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
        padding: const EdgeInsets.all(12),
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
          final status = (row['status'] ?? '').toString();
          return _TxCard(
            icon: Icons.receipt,
            iconBg: const Color(0xffE3EAF2),
            iconFg: const Color(0xff1E3A5F),
            title: row['invoice_no']?.toString() ?? '-',
            subtitle:
                '${row['created_at'] ?? ''} · ${(row['payment_method'] ?? '').toString().toUpperCase()}'
                '${row['cashier'] != null && (row['cashier'] as String).isNotEmpty ? ' · Kasir: ${row['cashier']}' : ''}',
            trailing: fmtRp(asNum(row['grand_total'])),
            status: status,
            onTap: () => _openDetail(row),
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
      this.onTap});
  final IconData icon;
  final Color iconBg;
  final Color iconFg;
  final String title;
  final String subtitle;
  final String trailing;
  final String? status;
  final Widget? extra;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      radius: 24,
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: iconBg,
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(icon, size: 20, color: iconFg),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: Color(0xff1E3A5F))),
                    const SizedBox(height: 3),
                    Text(subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 10, color: Color(0xff8A857C))),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(trailing,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: Color(0xff1E3A5F))),
                  if (status != null && status!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    _StatusChip(status!),
                  ],
                  if (extra != null) extra!,
                ],
              ),
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
    final (label, bg, fg) = switch (status) {
      'completed' => ('Selesai', const Color(0xffE3EAF2), const Color(0xff1E3A5F)),
      'pending' => ('Menunggu', const Color(0xffE3EAF2), const Color(0xff2E5D8F)),
      'partially_cancelled' => ('Sebagian dibatalkan', const Color(0xffE6ECF3), const Color(0xff8A857C)),
      'cancelled' => ('Dibatalkan', const Color(0xffF3DDD8), const Color(0xffB0563A)),
      _ => (status, const Color(0xffE6ECF3), const Color(0xff8A857C)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: fg)),
    );
  }
}
