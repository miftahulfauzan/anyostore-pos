import 'dart:convert';

// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'branch_scope.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'barcode_scanner_page.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

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

  String _preset =
      'thisMonth'; // today | yesterday | last7 | last30 | thisMonth | previousMonth | custom | all
  DateTime? _customStart;
  DateTime? _customEnd;
  String _status = '';
  bool _searchOpen = false;
  int _loadGeneration = 0;
  int? _scopeBranchId;
  final _search = TextEditingController();

  bool get _canCancel => ['owner', 'manager', 'admin'].contains(widget.role);
  bool get _dark => Theme.of(context).brightness == Brightness.dark;
  bool get _isOwner => widget.role == 'owner';

  @override
  void initState() {
    super.initState();
    if (_isOwner) {
      _scopeBranchId = BranchScope.active.value;
      widget.api.activeBranchId = _scopeBranchId;
      BranchScope.active.addListener(_onBranchScopeChanged);
    }
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

  void _onBranchScopeChanged() {
    if (!_isOwner) return;
    final branchId = BranchScope.active.value;
    widget.api.activeBranchId = branchId;
    if (branchId == _scopeBranchId) return;
    _scopeBranchId = branchId;
    _page = 1;
    _load();
  }

  @override
  void dispose() {
    OfflineStatus.syncTick.removeListener(_onSyncTick);
    HistoryTab.reloadTick.removeListener(_onReloadTick);
    if (_isOwner) BranchScope.active.removeListener(_onBranchScopeChanged);
    _search.dispose();
    super.dispose();
  }

  (String?, String?) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    switch (_preset) {
      case 'last7':
      case '7d':
        return (d(now.subtract(const Duration(days: 6))), d(now));
      case 'last30':
      case '30d':
        return (d(now.subtract(const Duration(days: 29))), d(now));
      case 'yesterday':
      case 'kemarin':
        final y = now.subtract(const Duration(days: 1));
        return (d(y), d(y));
      case 'thisMonth':
      case 'bulan':
        return (
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
          d(now)
        );
      case 'previousMonth':
      case 'bulan_lalu':
        final firstThis = DateTime(now.year, now.month, 1);
        final lastLast = firstThis.subtract(const Duration(days: 1));
        final firstLast = DateTime(lastLast.year, lastLast.month, 1);
        return (d(firstLast), d(lastLast));
      case 'custom':
        return (
          _customStart == null ? null : d(_customStart!),
          _customEnd == null ? null : d(_customEnd!)
        );
      case 'all':
        return (null, null);
      default:
        return (d(now), d(now));
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

  Future<void> _pickCustomRange() async {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    final fallbackStart = now.subtract(const Duration(days: 6));
    final currentStart = _customStart ?? fallbackStart;
    final currentEnd = _customEnd ?? now;
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: DateTimeRange(
        start: currentStart.isAfter(currentEnd) ? currentEnd : currentStart,
        end: currentEnd,
      ),
      helpText: 'Pilih rentang transaksi',
    );
    if (picked == null || !mounted) return;
    setState(() {
      _customStart = picked.start;
      _customEnd = picked.end;
      _preset = 'custom';
    });
    _page = 1;
    _load();
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_loadGeneration;
    final branchId =
        _isOwner ? BranchScope.active.value : widget.api.activeBranchId;
    if (_isOwner) widget.api.activeBranchId = branchId;
    bool isCurrent() => mounted && generation == _loadGeneration;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final range = _range;
    final branchKey = branchId?.toString() ?? 'all';
    final cacheKey =
        'history-$branchKey-${range.$1}-${range.$2}-$_status-${_search.text.trim()}-$_page';
    final returnCacheKey = 'history-retur-$branchKey';
    try {
      if (_section == 'retur') {
        final rows = await widget.api.returnsList();
        if (!isCurrent()) return;
        setState(() {
          _returns = rows.cast<Map<String, dynamic>>();
          _loading = false;
        });
        // Simpan cache retur untuk offline.
        await OfflineStore.cacheSet(returnCacheKey, jsonEncode({'rows': rows}));
        return;
      }
      final (rows, totalPages) = await widget.api.transactionsPage(
        page: _page,
        limit: 20,
        allBranches: _isOwner && branchId == null,
        dateFrom: range.$1,
        dateTo: range.$2,
        status: _status,
        search: _search.text.trim(),
      );
      if (!isCurrent()) return;
      final merged = await _mergeOffline(rows.cast<Map<String, dynamic>>(),
          branchId: branchId);
      if (!isCurrent()) return;
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
            final cached = await OfflineStore.cacheGet(returnCacheKey);
            if (cached != null && isCurrent()) {
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
            if (cached != null && isCurrent()) {
              final payload = cached['payload'] as Map<String, dynamic>;
              final merged = await _mergeOffline(
                  ((payload['rows'] as List?) ?? [])
                      .cast<Map<String, dynamic>>(),
                  branchId: branchId);
              if (isCurrent()) {
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
        if (!isCurrent()) return;
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    }
  }

  /// Gabungkan transaksi offline (kuning) ke atas daftar riwayat.
  Future<List<Map<String, dynamic>>> _mergeOffline(
      List<Map<String, dynamic>> rows,
      {int? branchId}) async {
    try {
      final pending = await OfflineStore.pending();
      if (pending.isEmpty) return rows;
      final offlineRows = <Map<String, dynamic>>[];
      final selectedRange = _range;
      String dateOnly(DateTime value) =>
          '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';
      String? businessDate(Map<String, dynamic> payload, String createdAt) {
        final explicit = payload['transaction_date']?.toString().trim() ?? '';
        if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(explicit)) {
          return explicit;
        }
        final parsed = DateTime.tryParse(createdAt);
        if (parsed == null) return null;
        final wib = parsed.toUtc().add(const Duration(hours: 7));
        return dateOnly(wib);
      }

      for (final r in pending) {
        final payload =
            jsonDecode(r['payload'] as String? ?? '{}') as Map<String, dynamic>;
        if (branchId != null &&
            int.tryParse('${payload['branch_id']}') != branchId) {
          continue;
        }
        final createdAt = r['created_at']?.toString() ?? '';
        final transactionDate = businessDate(payload, createdAt);
        if (selectedRange.$1 != null &&
            (transactionDate == null ||
                transactionDate.compareTo(selectedRange.$1!) < 0)) {
          continue;
        }
        if (selectedRange.$2 != null &&
            (transactionDate == null ||
                transactionDate.compareTo(selectedRange.$2!) > 0)) {
          continue;
        }
        if (_status.isNotEmpty) continue;
        final search = _search.text.trim().toLowerCase();
        if (search.isNotEmpty) {
          final haystack = [
            r['temp_invoice_no'],
            payload['invoice_no'],
            payload['customer_name'],
            payload['customer'],
          ].whereType<Object>().join(' ').toLowerCase();
          if (!haystack.contains(search)) continue;
        }
        offlineRows.add({
          'offline': true,
          'branch_id': payload['branch_id'],
          'invoice_no': r['temp_invoice_no']?.toString() ?? '-',
          'grand_total': r['grand_total'],
          'created_at': createdAt,
          'transaction_date': transactionDate,
          'status': 'offline',
          'cashier': 'Belum sync',
        });
      }
      return [...offlineRows, ...rows];
    } catch (_) {
      return rows;
    }
  }

  Future<void> _openDetail(Map<String, dynamic> row) async {
    final id = int.tryParse('${row['id']}');
    if (id == null) return;
    Map<String, dynamic> detail;
    final branchId = int.tryParse('${row['branch_id']}');
    try {
      detail = await widget.api.transactionDetail(id, branchId: branchId);
      if (detail['payment_method'] == 'split') {
        try {
          final receipt = await widget.api.receipt(id);
          detail['payments'] = receipt['payments'];
        } catch (_) {}
      }
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
    final isOffline = row['offline'] == true;
    final status = detail['status']?.toString() ?? '';
    final cashier = (detail['cashier'] ?? '').toString().trim();
    final paymentMethod =
        (detail['payment_method'] ?? '').toString().toUpperCase();
    final payments =
        ((detail['payments'] as List?) ?? []).whereType<Map>().toList();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        constraints:
            BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * .88),
        decoration: BoxDecoration(
          color: pageBg(ctx),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                  color: taskMuted(ctx).withValues(alpha: .35),
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: kTaskAccent.withValues(alpha: .12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.receipt_long_outlined,
                          size: 18, color: kTaskAccent),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(detail['invoice_no']?.toString() ?? 'Transaksi',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -.2,
                                  color: ink(ctx))),
                          Text(
                              '${formatWibDate(detail['transaction_date'])} · ${_historyTime(detail['created_at'])} WIB',
                              style: TextStyle(
                                  fontSize: TaskTypography.micro,
                                  color: taskMuted(ctx))),
                        ],
                      ),
                    ),
                    _StatusChip(status),
                    IconButton(
                      tooltip: 'Tutup',
                      onPressed: () => Navigator.pop(ctx),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
                  children: [
                    Container(
                      padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
                      decoration: BoxDecoration(
                        color: taskSurface(ctx),
                        border: Border.all(color: taskBorder(ctx)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Wrap(
                        spacing: 14,
                        runSpacing: 8,
                        children: [
                          _DetailFact(
                              label: 'TANGGAL',
                              value: formatWibDate(detail['transaction_date'])),
                          _DetailFact(
                              label: 'DICATAT',
                              value: formatWibDateTime(detail['created_at'])),
                          _DetailFact(
                              label: 'KASIR',
                              value: cashier.isEmpty ? '-' : cashier),
                          _DetailFact(
                              label: 'METODE',
                              value:
                                  paymentMethod.isEmpty ? '-' : paymentMethod),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text('Produk (${items.length})',
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: ink(ctx))),
                    const SizedBox(height: 6),
                    if (items.isEmpty)
                      Text('Tidak ada rincian produk.',
                          style:
                              TextStyle(fontSize: 11, color: taskMuted(ctx))),
                    for (final item in items)
                      Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
                        decoration: BoxDecoration(
                          color: taskSurface(ctx),
                          border: Border.all(color: taskBorder(ctx)),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                      item['product_name']?.toString() ?? '',
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w800,
                                          color: ink(ctx))),
                                ),
                                const SizedBox(width: 6),
                                Text(fmtRp(asNum(item['subtotal'])),
                                    style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w800,
                                        color: ink(ctx))),
                              ],
                            ),
                            if ((item['variant_detail'] ?? '')
                                .toString()
                                .isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 1),
                                child: Text(
                                    (item['variant_detail'] ?? '').toString(),
                                    style: TextStyle(
                                        fontSize: TaskTypography.micro,
                                        color: taskMuted(ctx))),
                              ),
                            const SizedBox(height: 3),
                            Text(
                              '${item['quantity']} x ${fmtRp(asNum(item['price']))}'
                              '${asNum(item['cancelled_qty']) > 0 ? '  · batal ${item['cancelled_qty']}' : ''}'
                              '${asNum(item['returned_qty']) > 0 ? '  · retur ${item['returned_qty']}' : ''}',
                              style: TextStyle(
                                  fontSize: TaskTypography.micro,
                                  color: taskMuted(ctx)),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.fromLTRB(11, 8, 11, 8),
                      decoration: BoxDecoration(
                        color: taskSurface(ctx),
                        border: Border.all(color: taskBorder(ctx)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          _StrukRow('Subtotal',
                              fmtRp(asNum(detail['subtotal'] ?? 0))),
                          if (asNum(detail['discount'] ?? 0) > 0)
                            _StrukRow('Diskon',
                                '-${fmtRp(asNum(detail['discount']))}',
                                valueColor: kTaskTerracotta),
                          const Divider(height: 12),
                          _StrukRow(
                              'Total', fmtRp(asNum(detail['grand_total'])),
                              bold: true),
                          _StrukRow(
                              'Bayar', fmtRp(asNum(detail['amount_paid']))),
                          if (asNum(detail['change']) > 0)
                            _StrukRow(
                                'Kembalian', fmtRp(asNum(detail['change']))),
                          for (final payment in payments)
                            _StrukRow(
                              (payment['payment_method'] ?? '')
                                  .toString()
                                  .toUpperCase(),
                              fmtRp(asNum(payment['amount'])),
                            ),
                          if (detail['cancelled_amount'] != null &&
                              asNum(detail['cancelled_amount']) > 0)
                            _StrukRow('Dibatalkan',
                                '-${fmtRp(asNum(detail['cancelled_amount']))}',
                                valueColor: kTaskTerracotta),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (_isOwner && !isOffline)
                          OutlinedButton.icon(
                            onPressed: () {
                              Navigator.pop(ctx);
                              _editTransactionDate(id, detail);
                            },
                            icon: const Icon(Icons.edit_calendar_outlined,
                                size: 16),
                            label: const Text('Ubah tanggal'),
                            style: OutlinedButton.styleFrom(
                                minimumSize: const Size(0, 38)),
                          ),
                        if (_canCancel && status != 'cancelled')
                          OutlinedButton.icon(
                            onPressed: () {
                              Navigator.pop(ctx);
                              _cancelFlow(id, detail, items,
                                  branchId:
                                      int.tryParse('${detail['branch_id']}'));
                            },
                            icon: const Icon(Icons.remove_circle_outline,
                                size: 16),
                            label: const Text('Batalkan Item'),
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 38),
                              foregroundColor: kTaskTerracotta,
                            ),
                          ),
                        if (status == 'completed' ||
                            status == 'partially_refunded')
                          OutlinedButton.icon(
                            onPressed: () {
                              Navigator.pop(ctx);
                              _returnFlow(id, items,
                                  branchId:
                                      int.tryParse('${detail['branch_id']}'));
                            },
                            icon: const Icon(Icons.assignment_return_outlined,
                                size: 16),
                            label: const Text('Buat Retur'),
                            style: OutlinedButton.styleFrom(
                              minimumSize: const Size(0, 38),
                              foregroundColor: kTaskPurple,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () {
                          Navigator.pop(ctx);
                          printReceiptNow(context,
                              () => loadReceiptForPrint(widget.api, id));
                        },
                        icon: const Icon(Icons.print_outlined, size: 18),
                        label: const Text('Cetak Struk'),
                        style: FilledButton.styleFrom(
                          minimumSize: const Size(0, 44),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(11)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _editTransactionDate(int id, Map<String, dynamic> detail) async {
    final today = DateTime.parse(todayWib());
    final current = DateTime.tryParse('${detail['transaction_date']}') ?? today;
    final selected = await showDatePicker(
      context: context,
      initialDate: current.isAfter(today) ? today : current,
      firstDate: DateTime(2020),
      lastDate: today,
      helpText: 'Pilih tanggal transaksi',
    );
    if (selected == null || !mounted) return;
    final date =
        '${selected.year.toString().padLeft(4, '0')}-${selected.month.toString().padLeft(2, '0')}-${selected.day.toString().padLeft(2, '0')}';
    try {
      await widget.api.updateTransactionDate(
        id,
        date,
        branchId: int.tryParse('${detail['branch_id']}'),
      );
      await OfflineStore.cacheSet(
          'tx-detail-$id', jsonEncode({...detail, 'transaction_date': date}));
      if (!mounted) return;
      _load(silent: true);
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tanggal transaksi diperbarui')));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  /// Detail retur ala struk (dari endpoint /returns/:id).
  Future<void> _openReturnDetail(Map<String, dynamic> row) async {
    final id = int.tryParse('${row['id']}');
    if (id == null) return;
    try {
      final detail = await widget.api.returnDetail(id);
      if (!mounted) return;
      final items =
          ((detail['items'] as List?) ?? []).cast<Map<String, dynamic>>();
      await showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(detail['return_no']?.toString() ?? 'Retur'),
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
                        child: Text(detail['return_no']?.toString() ?? 'Retur',
                            style: const TextStyle(
                                fontSize: 16, fontWeight: FontWeight.w800)),
                      ),
                      _StatusChip(detail['status']?.toString() ?? ''),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Invoice: ${detail['invoice_no'] ?? ''}\n'
                    '${detail['created_at'] ?? ''}${detail['created_by_name'] != null && (detail['created_by_name'] as String).isNotEmpty ? ' · Oleh: ${detail['created_by_name']}' : ''}'
                    '${detail['reason'] != null && (detail['reason'] as String).isNotEmpty ? '\nAlasan: ${detail['reason']}' : ''}',
                    style: TextStyle(fontSize: 12, color: taskMuted(context)),
                  ),
                  const Divider(),
                  for (final item in items) ...[
                    Text(item['product_name']?.toString() ?? '',
                        style: const TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w700)),
                    if ((item['variant_detail'] ?? '').toString().isNotEmpty)
                      Text((item['variant_detail'] ?? '').toString(),
                          style: TextStyle(
                              fontSize: 12, color: taskMuted(context))),
                    _StrukRow(
                      '${item['quantity']} x ${fmtRp(asNum(item['unit_price']))}',
                      fmtRp(asNum(item['subtotal'])),
                    ),
                    const SizedBox(height: 4),
                  ],
                  const Divider(),
                  _StrukRow(
                      'Total refund', fmtRp(asNum(detail['refund_amount'])),
                      bold: true),
                  _StrukRow(
                      'Metode',
                      detail['refund_method'] == null
                          ? 'Sesuai metode bayar'
                          : (detail['refund_method'] ?? '')
                              .toString()
                              .toUpperCase()),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Tutup')),
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

  Future<void> _cancelFlow(
      int id, Map<String, dynamic> detail, List<Map<String, dynamic>> items,
      {int? branchId}) async {
    final controllers = <int, TextEditingController>{};
    final reasons = <int, TextEditingController>{};
    for (final item in items) {
      final itemId =
          int.tryParse('${item['transaction_item_id'] ?? item['id']}');
      if (itemId == null) continue;
      final remaining = (asNum(item['quantity']) -
              asNum(item['cancelled_qty']) -
              asNum(item['returned_qty']))
          .toInt();
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
      await widget.api.cancelTransaction(id, cancelItems, reasonTop.text.trim(),
          branchId: branchId);
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

  Future<void> _returnFlow(int id, List<Map<String, dynamic>> items,
      {int? branchId}) async {
    final controllers = <int, TextEditingController>{};
    final reasons = <int, TextEditingController>{};
    for (final item in items) {
      final itemId =
          int.tryParse('${item['transaction_item_id'] ?? item['id']}');
      if (itemId == null) continue;
      final remaining = (asNum(item['quantity']) -
              asNum(item['cancelled_qty']) -
              asNum(item['returned_qty']))
          .toInt();
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
                AppSelectField<String>(
                  value: refundMethod,
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
                                        'max ${(asNum(item['quantity']) - asNum(item['cancelled_qty']) - asNum(item['returned_qty'])).toInt()}')),
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
        if (branchId != null) 'branch_id': branchId,
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Retur berhasil dibuat dan disetujui. Stok kembali otomatis')));
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
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: taskBorder(context)),
    );
    return InputDecoration(
      labelText: hint ? null : label,
      hintText: hint ? label : null,
      filled: true,
      fillColor: taskSurface(context),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: BorderSide(
              color: Theme.of(context).colorScheme.primary, width: 2)),
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
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 0),
                  child: Column(
                    children: [
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Expanded(
                            child: SingleChildScrollView(
                              scrollDirection: Axis.horizontal,
                              child: Row(
                                children: [
                                  _filterChip(_presetLabel, _choosePreset),
                                  const SizedBox(width: 6),
                                  _filterChip(_statusLabel, _chooseStatus),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          _roundIcon(
                            Icons.search_rounded,
                            active: _searchOpen,
                            onTap: () =>
                                setState(() => _searchOpen = !_searchOpen),
                          ),
                          const SizedBox(width: 6),
                          _roundIcon(Icons.qr_code_scanner_rounded,
                              onTap: _openScanner),
                        ],
                      ),
                      if (_searchOpen) ...[
                        const SizedBox(height: 8),
                        TextField(
                          controller: _search,
                          autofocus: true,
                          decoration:
                              _dec('Cari invoice / nama', hint: true).copyWith(
                            suffixIcon: IconButton(
                              onPressed: () {
                                setState(() {
                                  _search.clear();
                                  _searchOpen = false;
                                });
                                _page = 1;
                                _load();
                              },
                              icon: const Icon(Icons.close),
                              tooltip: 'Tutup pencarian',
                            ),
                          ),
                          onSubmitted: (_) {
                            _page = 1;
                            _load();
                          },
                        ),
                      ],
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

  String get _presetLabel => switch (_preset) {
        'today' => 'Hari ini',
        'yesterday' => 'Kemarin',
        'last7' || '7d' => '7 hari',
        'last30' || '30d' => '30 hari',
        'previousMonth' || 'bulan_lalu' => 'Bulan lalu',
        'custom' => 'Kustom',
        'all' => 'Semua',
        _ => 'Bulan ini',
      };

  String get _statusLabel => switch (_status) {
        'completed' => 'Selesai',
        'partially_cancelled' => 'Sebagian dibatalkan',
        'cancelled' => 'Dibatalkan',
        'refunded' => 'Retur penuh',
        'partially_refunded' => 'Retur sebagian',
        _ => 'Semua status',
      };

  Widget _filterChip(String label, VoidCallback onTap) => Material(
        color: taskSurface(context),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
          side: BorderSide(color: taskBorder(context)),
        ),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        fontWeight: FontWeight.w700,
                        color: ink(context))),
                const SizedBox(width: 5),
                Icon(Icons.keyboard_arrow_down_rounded,
                    size: 14, color: taskMuted(context)),
              ],
            ),
          ),
        ),
      );

  Widget _roundIcon(IconData icon,
          {bool active = false, required VoidCallback onTap}) =>
      Material(
        color: active
            ? Theme.of(context).colorScheme.primary.withValues(alpha: .1)
            : taskSurface(context),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
          side: BorderSide(
              color: active
                  ? Theme.of(context).colorScheme.primary
                  : taskBorder(context)),
        ),
        child: InkWell(
          onTap: onTap,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 34,
            height: 34,
            child: Icon(icon,
                size: 17,
                color: active
                    ? Theme.of(context).colorScheme.primary
                    : taskMuted(context)),
          ),
        ),
      );

  Future<String?> _showChoiceSheet(
    String title,
    List<(String, String)> options,
    String current,
  ) =>
      showModalBottomSheet<String>(
        context: context,
        showDragHandle: true,
        backgroundColor: taskSurface(context),
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.only(bottom: 12),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 2, 20, 8),
                child: Text(title,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: ink(ctx))),
              ),
              for (final option in options)
                ListTile(
                  dense: true,
                  title: Text(option.$2),
                  trailing: option.$1 == current
                      ? Icon(Icons.check_rounded,
                          color: Theme.of(ctx).colorScheme.primary)
                      : null,
                  onTap: () => Navigator.pop(ctx, option.$1),
                ),
            ],
          ),
        ),
      );

  Future<void> _choosePreset() async {
    final picked = await _showChoiceSheet(
      'Rentang transaksi',
      const [
        ('today', 'Hari ini'),
        ('yesterday', 'Kemarin'),
        ('last7', '7 hari'),
        ('last30', '30 hari'),
        ('thisMonth', 'Bulan ini'),
        ('previousMonth', 'Bulan lalu'),
        ('custom', 'Kustom'),
        ('all', 'Semua'),
      ],
      _preset,
    );
    if (picked == null || !mounted) return;
    setState(() => _preset = picked);
    if (picked == 'custom') {
      await _pickCustomRange();
    } else {
      _page = 1;
      _load();
    }
  }

  Future<void> _chooseStatus() async {
    final picked = await _showChoiceSheet(
      'Status transaksi',
      const [
        ('', 'Semua status'),
        ('completed', 'Selesai'),
        ('partially_cancelled', 'Sebagian dibatalkan'),
        ('cancelled', 'Dibatalkan'),
        ('refunded', 'Retur penuh'),
        ('partially_refunded', 'Retur sebagian'),
      ],
      _status,
    );
    if (picked == null || !mounted) return;
    setState(() => _status = picked);
    _page = 1;
    _load();
  }

  String _historyDayKey(Map<String, dynamic> row) {
    final raw = (row['transaction_date'] ?? '').toString();
    if (raw.length >= 10) return raw.substring(0, 10);
    final created = DateTime.tryParse((row['created_at'] ?? '').toString());
    if (created != null) {
      final wib = created.toUtc().add(const Duration(hours: 7));
      return '${wib.year.toString().padLeft(4, '0')}-'
          '${wib.month.toString().padLeft(2, '0')}-'
          '${wib.day.toString().padLeft(2, '0')}';
    }
    return 'unknown';
  }

  String _historyDayLabel(String key) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'Mei',
      'Jun',
      'Jul',
      'Agu',
      'Sep',
      'Okt',
      'Nov',
      'Des'
    ];
    final date = DateTime.tryParse(key);
    if (date == null) return key;
    final today = DateTime.tryParse(todayWib());
    final label = '${date.day} ${months[date.month - 1]} ${date.year}';
    if (today != null) {
      final day = DateTime(date.year, date.month, date.day);
      final now = DateTime(today.year, today.month, today.day);
      if (day == now) return 'Hari ini · $label';
      if (day == now.subtract(const Duration(days: 1))) {
        return 'Kemarin · $label';
      }
    }
    return label;
  }

  String _historyTime(Object? raw) {
    final date = DateTime.tryParse((raw ?? '').toString());
    if (date == null) return '';
    final wib = date.toUtc().add(const Duration(hours: 7));
    return '${wib.hour.toString().padLeft(2, '0')}:'
        '${wib.minute.toString().padLeft(2, '0')}';
  }

  Widget _historySummary() {
    final total =
        _rows.fold<num>(0, (sum, row) => sum + asNum(row['grand_total']));
    final accent = _dark ? kTaskAccentDark : kTaskAccent;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: accent.withValues(alpha: _dark ? .16 : .08),
        border: Border.all(color: accent.withValues(alpha: .22)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.bar_chart_rounded, size: 14, color: accent),
          const SizedBox(width: 7),
          Expanded(
            child: Text('Halaman $_page · ${_rows.length} transaksi',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(fmtRp(total),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
        ],
      ),
    );
  }

  Widget _dayHeader(String key, List<Map<String, dynamic>> rows) {
    final total =
        rows.fold<num>(0, (sum, row) => sum + asNum(row['grand_total']));
    final accent = _dark ? kTaskAccentDark : kTaskAccent;
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 10, 2, 6),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
                color: accent, borderRadius: BorderRadius.circular(3)),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(_historyDayLabel(key),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ),
          Flexible(
            child: Text('${rows.length} trx · ${fmtRp(total)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
        ],
      ),
    );
  }

  Widget _historyRow(Map<String, dynamic> row) {
    final isOffline = row['offline'] == true;
    final status = isOffline ? 'offline' : (row['status'] ?? '').toString();
    final dark = _dark;
    final (iconBg, iconFg) = switch (status) {
      'completed' => (
          dark ? const Color(0x332563EB) : kTaskBlueLight,
          dark ? kTaskAccentDark : kTaskDark
        ),
      'cancelled' => (
          dark ? const Color(0x33EA580C) : const Color(0xFFF8E9E4),
          dark ? const Color(0xFFF2B8A5) : kTaskTerracotta
        ),
      'partially_refunded' || 'refunded' => (
          dark ? const Color(0x337C3AED) : kTaskPurpleLight,
          dark ? const Color(0xFFC4B5FD) : kTaskPurple
        ),
      'offline' => (
          dark ? const Color(0x33F59E0B) : kTaskStockLowSurface,
          dark ? const Color(0xFFFCD34D) : kTaskStockLow
        ),
      _ => (
          dark ? const Color(0x33F59E0B) : kTaskStockLowSurface,
          dark ? const Color(0xFFFCD34D) : kTaskStockLow
        ),
    };
    final meta = [
      _historyTime(row['created_at']),
      (row['payment_method'] ?? '').toString().toUpperCase(),
      if ((row['cashier'] ?? '').toString().trim().isNotEmpty)
        'Kasir: ${row['cashier']}',
      if (isOffline) 'Belum tersinkron',
    ].where((part) => part.trim().isNotEmpty).join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: taskSurface(context),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: isOffline
              ? () {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text(
                          'Transaksi offline belum tersinkron. Data lengkap tampil setelah internet kembali.')));
                }
              : () => _openDetail(row),
          child: Container(
            padding: const EdgeInsets.fromLTRB(9, 8, 9, 8),
            decoration: BoxDecoration(
              border: Border.all(color: taskBorder(context)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: iconBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(isOffline ? Icons.cloud_off : Icons.receipt,
                      size: 16, color: iconFg),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(row['invoice_no']?.toString() ?? '-',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                      const SizedBox(height: 2),
                      Text(meta,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: TaskTypography.micro,
                              color: taskMuted(context))),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(fmtRp(asNum(row['grand_total'])),
                        style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 3),
                    _StatusChip(isOffline ? 'offline' : status),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const UiLoadingState(label: 'Memuat transaksi…');
    if (_error != null) {
      return UiErrorState(message: _error!, onRetry: _load);
    }
    if (_section == 'retur') {
      if (_returns.isEmpty) {
        return const AppEmptyState(
          icon: Icons.assignment_return_outlined,
          title: 'Belum ada retur',
          message: 'Retur penjualan yang disetujui akan tampil di sini.',
        );
      }
      return ListView.separated(
        padding: EdgeInsets.fromLTRB(
            12, 12, 12, 16 + MediaQuery.of(context).padding.bottom),
        itemCount: _returns.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (_, i) {
          final row = _returns[i];
          final status = row['status']?.toString() ?? '';
          return _TxCard(
            icon: Icons.assignment_return,
            iconBg: kTaskPurpleLight,
            iconFg: kTaskPurple,
            title: row['return_no']?.toString() ?? '-',
            subtitle:
                '${row['invoice_no'] ?? ''} · ${formatWibDateTime(row['created_at'])}',
            trailing: fmtRp(asNum(row['refund_amount'])),
            status: status,
            // Retur otomatis disetujui backend — tidak perlu tombol Setujui.
            extra: null,
            onTap: () => _openReturnDetail(row),
          );
        },
      );
    }
    if (_rows.isEmpty) {
      return const AppEmptyState(
        icon: Icons.receipt_long_outlined,
        title: 'Belum ada transaksi',
        message:
            'Transaksi pada periode ini akan tampil di sini. Coba ubah rentang atau status.',
      );
    }
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final row in _rows) {
      groups.putIfAbsent(_historyDayKey(row), () => []).add(row);
    }
    final keys = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final items = <Widget>[_historySummary()];
    for (final key in keys) {
      items.add(_dayHeader(key, groups[key]!));
      for (final row in groups[key]!) {
        items.add(_historyRow(row));
      }
    }
    items.add(
      Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
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
        ),
      ),
    );
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.fromLTRB(
            12, 12, 12, 16 + MediaQuery.of(context).padding.bottom),
        children: items,
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final chipBg = dark ? const Color(0xff334155) : iconBg;
    final chipFg = dark ? const Color(0xffE2E8F0) : iconFg;
    return GlassCard(
      radius: 16,
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: ColoredBox(
        color: Colors.transparent,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
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
                          style: TextStyle(
                              fontSize: 12, color: taskMuted(context))),
                    ],
                  ),
                ),
                if (status != null && status!.isNotEmpty)
                  Flexible(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: _StatusChip(status!),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                    child: Text(trailing,
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: ink(context)))),
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
                    color: taskMuted(context),
                    fontWeight: bold ? FontWeight.w800 : FontWeight.w400)),
          ),
          Flexible(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
                      color: valueColor ?? ink(context)))),
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
          dark ? const Color(0xff164E2A) : kTaskStockGoodSurface,
          dark ? const Color(0xff86EFAC) : kTaskStockGood
        ),
      'pending' => (
          'Menunggu',
          dark ? const Color(0xff4A3E2A) : kTaskStockLowSurface,
          dark ? const Color(0xffFCD34D) : kTaskStockLow
        ),
      'partially_cancelled' => (
          'Sebagian dibatalkan',
          dark ? kTaskDarkSurface : const Color(0xffF1F5F9),
          dark ? const Color(0xffCBD5E1) : kTaskSecondary
        ),
      'cancelled' => (
          'Dibatalkan',
          dark ? const Color(0xff4A2F2A) : const Color(0xffF8E9E4),
          dark ? const Color(0xffF2B8A5) : kTaskTerracotta
        ),
      'offline' => (
          'OFFLINE',
          dark ? const Color(0xff4A3E2A) : kTaskSand,
          dark ? const Color(0xffF1D08A) : kTaskTerracotta
        ),
      'approved' => (
          'Disetujui',
          dark ? const Color(0xff164E2A) : kTaskStockGoodSurface,
          dark ? const Color(0xff86EFAC) : kTaskStockGood
        ),
      'partially_refunded' => (
          'Retur sebagian',
          dark ? const Color(0xff38205F) : kTaskPurpleLight,
          dark ? const Color(0xffC4B5FD) : kTaskPurple
        ),
      'refunded' => (
          'Retur penuh',
          dark ? const Color(0xff38205F) : kTaskPurpleLight,
          dark ? const Color(0xffC4B5FD) : kTaskPurple
        ),
      _ => (
          status,
          dark ? kTaskDarkSurface : const Color(0xffF1F5F9),
          dark ? const Color(0xffCBD5E1) : kTaskSecondary
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: TaskTypography.badge,
              fontWeight: FontWeight.w700,
              color: fg)),
    );
  }
}

class _DetailFact extends StatelessWidget {
  const _DetailFact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 132,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                  fontSize: TaskTypography.micro,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .4,
                  color: taskMuted(context))),
          const SizedBox(height: 1),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: TaskTypography.micro,
                  fontWeight: FontWeight.w700,
                  color: ink(context))),
        ],
      ),
    );
  }
}
