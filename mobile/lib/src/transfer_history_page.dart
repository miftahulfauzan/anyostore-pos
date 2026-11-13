import 'package:flutter/material.dart';

import 'api_client.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

/// Tanggal + jam lokal dari string timestamp server (dipakai kartu & detail).
String transferDateLabel(Object? raw) {
  final parsed = DateTime.tryParse('${raw ?? ''}'.replaceFirst(' ', 'T'));
  if (parsed == null) return '${raw ?? ''}';
  final date = parsed.toLocal();
  return '${date.day.toString().padLeft(2, '0')}/'
      '${date.month.toString().padLeft(2, '0')}/${date.year} '
      '${date.hour.toString().padLeft(2, '0')}:'
      '${date.minute.toString().padLeft(2, '0')}';
}

class TransferHistoryPage extends StatefulWidget {
  const TransferHistoryPage({super.key, required this.api, this.role});
  final ApiClient api;
  final String? role;

  @override
  State<TransferHistoryPage> createState() => _TransferHistoryPageState();
}

class _TransferHistoryPageState extends State<TransferHistoryPage> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  String _status = '';
  String _direction = '';
  int _page = 1;
  int _totalPages = 1;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  int? _cancellingId;
  int _generation = 0;

  bool get _canCancel => widget.role == 'owner' || widget.role == 'gudang';

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

  Future<void> _load({bool more = false}) async {
    final generation = ++_generation;
    final nextPage = more ? _page + 1 : 1;
    setState(() {
      if (more) {
        _loadingMore = true;
      } else {
        _loading = true;
        _error = null;
      }
    });
    try {
      final result = await widget.api.transferHistory(
        page: nextPage,
        search: _search.text.trim(),
        status: _status,
        direction: _direction,
      );
      if (!mounted || generation != _generation) return;
      final rows = (result['data'] as List? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      setState(() {
        _page = nextPage;
        _totalPages = (result['totalPages'] as num?)?.toInt() ?? 1;
        _rows = more ? [..._rows, ...rows] : rows;
      });
    } on ApiException catch (e) {
      if (mounted && generation == _generation) {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() {
          _loading = false;
          _loadingMore = false;
        });
      }
    }
  }

  Future<void> _cancelTransfer(Map<String, dynamic> transfer) async {
    final id = int.tryParse('${transfer['id'] ?? ''}');
    if (id == null || id <= 0) return;
    var reasonValue = '';
    final reason = await showDialog<String?>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Batalkan transfer?'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                  'Stok akan dikembalikan ke lokasi asal. Transfer tetap tersimpan di riwayat.'),
              const SizedBox(height: 12),
              TextField(
                key: const ValueKey('transfer-cancel-reason'),
                maxLength: 255,
                textCapitalization: TextCapitalization.sentences,
                onChanged: (value) => reasonValue = value,
                decoration: const InputDecoration(
                  labelText: 'Alasan (opsional)',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Kembali')),
          FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(reasonValue.trim()),
              child: const Text('Batalkan')),
        ],
      ),
    );
    if (reason == null || !mounted) return;

    setState(() {
      _cancellingId = id;
      _error = null;
    });
    try {
      await widget.api.cancelTransfer(id, reason: reason);
      if (mounted) await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _cancellingId = null);
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
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                child: Column(
                  children: [
                    TextField(
                      controller: _search,
                      textInputAction: TextInputAction.search,
                      onSubmitted: (_) => _load(),
                      decoration: InputDecoration(
                        labelText: 'Cari nomor atau produk',
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: IconButton(
                          tooltip: 'Cari',
                          onPressed: _load,
                          icon: const Icon(Icons.arrow_forward),
                        ),
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: _direction,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'Arah',
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                            items: const [
                              DropdownMenuItem(value: '', child: Text('Semua')),
                              DropdownMenuItem(
                                  value: 'outgoing', child: Text('Keluar')),
                              DropdownMenuItem(
                                  value: 'incoming', child: Text('Masuk')),
                            ],
                            onChanged: (value) {
                              setState(() => _direction = value ?? '');
                              _load();
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: DropdownButtonFormField<String>(
                            initialValue: _status,
                            isExpanded: true,
                            decoration: const InputDecoration(
                              labelText: 'Status',
                              border: OutlineInputBorder(),
                              isDense: true,
                            ),
                            items: const [
                              DropdownMenuItem(value: '', child: Text('Semua')),
                              DropdownMenuItem(
                                  value: 'completed', child: Text('Selesai')),
                              DropdownMenuItem(
                                  value: 'pending', child: Text('Menunggu')),
                              DropdownMenuItem(
                                  value: 'cancelled',
                                  child: Text('Dibatalkan')),
                            ],
                            onChanged: (value) {
                              setState(() => _status = value ?? '');
                              _load();
                            },
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _loading
                    ? const UiLoadingState(label: 'Memuat transfer…')
                    : _error != null
                        ? UiErrorState(message: _error!, onRetry: _load)
                        : _rows.isEmpty
                            ? const UiEmptyState(
                                title: 'Belum ada transfer',
                                message:
                                    'Riwayat transfer antar gudang atau toko akan tampil di sini.',
                                icon: Icons.swap_horiz)
                            : RefreshIndicator(
                                onRefresh: _load,
                                child: ListView.separated(
                                  physics:
                                      const AlwaysScrollableScrollPhysics(),
                                  padding:
                                      const EdgeInsets.fromLTRB(12, 4, 12, 16),
                                  itemCount: _rows.length +
                                      (_page < _totalPages ? 1 : 0),
                                  separatorBuilder: (_, __) =>
                                      const SizedBox(height: 8),
                                  itemBuilder: (context, index) {
                                    if (index == _rows.length) {
                                      return OutlinedButton(
                                        onPressed: _loadingMore
                                            ? null
                                            : () => _load(more: true),
                                        child: Text(_loadingMore
                                            ? 'Memuat…'
                                            : 'Muat riwayat berikutnya'),
                                      );
                                    }
                                    return _transferCard(_rows[index]);
                                  },
                                ),
                              ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _transferCard(Map<String, dynamic> transfer) {
    final status = '${transfer['status'] ?? ''}';
    final from = transfer['source'] as Map<String, dynamic>? ?? const {};
    final to = transfer['destination'] as Map<String, dynamic>? ?? const {};
    final details = transfer['details'] as Map<String, dynamic>? ?? const {};
    final lines = (details['from'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final color = status == 'completed'
        ? kTaskTeal
        : status == 'cancelled'
            ? kTaskTerracotta
            : kTaskSecondary;
    final label = switch (status) {
      'completed' => 'Selesai',
      'cancelled' => 'Dibatalkan',
      'pending' => 'Menunggu',
      'approved' => 'Disetujui',
      _ => status.isEmpty ? 'Tidak diketahui' : status,
    };
    return GlassCard(
      padding: const EdgeInsets.all(14),
      radius: 18,
      child: InkWell(
        key: ValueKey('transfer-card-${transfer['id']}'),
        borderRadius: BorderRadius.circular(18),
        onTap: () => _showTransferDetail(transfer),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('${transfer['number'] ?? 'Transfer'}',
                      style: TextStyle(
                          color: ink(context), fontWeight: FontWeight.w800)),
                ),
                Chip(
                  label: Text(label),
                  visualDensity: VisualDensity.compact,
                  side: BorderSide.none,
                  backgroundColor: color.withValues(alpha: .12),
                  labelStyle: TextStyle(
                      color: color,
                      fontSize: TaskTypography.badge,
                      fontWeight: FontWeight.w700),
                ),
              ],
            ),
            Text(transferDateLabel(transfer['created_at']),
                style: TextStyle(
                    color: taskMuted(context),
                    fontSize: TaskTypography.secondary)),
            const SizedBox(height: 8),
            Text(
                '${from['branch_name'] ?? from['warehouse_name'] ?? '-'}  →  '
                '${to['branch_name'] ?? to['warehouse_name'] ?? '-'}',
                style: TextStyle(
                    color: ink(context), fontWeight: FontWeight.w600)),
            Text(
                '${transfer['product_count'] ?? 0} produk · '
                '${transfer['total_qty'] ?? 0} pcs · ${transfer['admin'] ?? 'Sistem'}',
                style: TextStyle(
                    color: taskMuted(context),
                    fontSize: TaskTypography.secondary)),
            if ('${transfer['notes'] ?? ''}'.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('${transfer['notes']}',
                  style: TextStyle(
                      color: taskMuted(context),
                      fontSize: TaskTypography.secondary)),
            ],
            if (lines.isNotEmpty) ...[
              const Divider(height: 18),
              for (final line in lines.take(5))
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${line['name'] ?? 'Produk'}'
                          '${line['variant_color'] == null ? '' : ' · ${line['variant_color']}'}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              color: ink(context),
                              fontSize: TaskTypography.secondary),
                        ),
                      ),
                      Text('${line['qty'] ?? 0} pcs',
                          style: TextStyle(
                              color: ink(context),
                              fontSize: TaskTypography.secondary,
                              fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
              if (lines.length > 5)
                InkWell(
                  key: ValueKey('transfer-more-${transfer['id']}'),
                  onTap: () => _showTransferDetail(transfer),
                  borderRadius: BorderRadius.circular(6),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text('+${lines.length - 5} produk lain',
                            style: const TextStyle(
                                color: kTaskAccent,
                                fontSize: TaskTypography.micro,
                                fontWeight: FontWeight.w700)),
                        const SizedBox(width: 2),
                        const Icon(Icons.chevron_right,
                            size: 14, color: kTaskAccent),
                      ],
                    ),
                  ),
                ),
            ],
            if (status == 'cancelled' &&
                '${transfer['cancellation_reason'] ?? ''}'
                    .trim()
                    .isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Alasan pembatalan: ${transfer['cancellation_reason']}',
                style: TextStyle(
                    color: taskMuted(context),
                    fontSize: TaskTypography.secondary),
              ),
            ],
            if (_canCancel && status == 'completed') ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerRight,
                child: OutlinedButton(
                  key: ValueKey('transfer-cancel-${transfer['id']}'),
                  onPressed: _cancellingId == int.tryParse('${transfer['id']}')
                      ? null
                      : () => _cancelTransfer(transfer),
                  child: Text(_cancellingId == int.tryParse('${transfer['id']}')
                      ? 'Membatalkan…'
                      : 'Batalkan transfer'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Rincian lengkap satu transfer (semua produk, bukan hanya 5 teratas).
  void _showTransferDetail(Map<String, dynamic> transfer) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => TransferDetailSheet(transfer: transfer),
    );
  }
}

/// Isi sheet "Detail Transfer" — dipisah supaya mudah diuji.
class TransferDetailSheet extends StatelessWidget {
  const TransferDetailSheet({super.key, required this.transfer});

  final Map<String, dynamic> transfer;

  @override
  Widget build(BuildContext context) {
    final from = transfer['source'] as Map<String, dynamic>? ?? const {};
    final to = transfer['destination'] as Map<String, dynamic>? ?? const {};
    final details = transfer['details'] as Map<String, dynamic>? ?? const {};
    final lines = (details['from'] as List? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();
    final status = '${transfer['status'] ?? ''}';
    final label = switch (status) {
      'completed' => 'Selesai',
      'cancelled' => 'Dibatalkan',
      'pending' => 'Menunggu',
      'approved' => 'Disetujui',
      _ => status.isEmpty ? 'Tidak diketahui' : status,
    };
    final muted = taskMuted(context);
    return Container(
      constraints:
          BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .86),
      decoration: BoxDecoration(
        color: pageBg(context),
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
                color: muted.withValues(alpha: .35),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Detail Transfer',
                            style: TextStyle(
                                color: ink(context),
                                fontSize: TaskTypography.sectionTitle,
                                fontWeight: FontWeight.w800)),
                        Text('${transfer['number'] ?? 'Transfer'} · $label',
                            style: TextStyle(
                                color: muted,
                                fontSize: TaskTypography.secondary)),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Tutup',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
                children: [
                  Text(
                    '${from['branch_name'] ?? from['warehouse_name'] ?? '-'}  →  '
                    '${to['branch_name'] ?? to['warehouse_name'] ?? '-'}',
                    style: TextStyle(
                        color: ink(context), fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${transferDateLabel(transfer['created_at'])} · '
                    '${transfer['product_count'] ?? lines.length} produk · '
                    '${transfer['total_qty'] ?? 0} pcs · ${transfer['admin'] ?? 'Sistem'}',
                    style: TextStyle(
                        color: muted, fontSize: TaskTypography.secondary),
                  ),
                  if ('${transfer['notes'] ?? ''}'.trim().isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text('Catatan: ${transfer['notes']}',
                        style: TextStyle(
                            color: muted, fontSize: TaskTypography.secondary)),
                  ],
                  if (status == 'cancelled' &&
                      '${transfer['cancellation_reason'] ?? ''}'
                          .trim()
                          .isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                        'Alasan pembatalan: ${transfer['cancellation_reason']}',
                        style: const TextStyle(
                            color: kTaskTerracotta,
                            fontSize: TaskTypography.secondary)),
                  ],
                  const Divider(height: 22),
                  // ignore: prefer_const_constructors
                  Text('Daftar produk (${lines.length})',
                      style: TextStyle(
                          color: ink(context),
                          fontSize: TaskTypography.secondary,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  if (lines.isEmpty)
                    Text('Tidak ada rincian produk.',
                        style: TextStyle(
                            color: muted, fontSize: TaskTypography.secondary)),
                  for (var index = 0; index < lines.length; index++)
                    Padding(
                      key: ValueKey('transfer-detail-item-$index'),
                      padding: const EdgeInsets.symmetric(vertical: 3),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${lines[index]['name'] ?? 'Produk'}'
                              '${lines[index]['variant_color'] == null ? '' : ' · ${lines[index]['variant_color']}'}',
                              style: TextStyle(
                                  color: ink(context),
                                  fontSize: TaskTypography.secondary),
                            ),
                          ),
                          Text('${lines[index]['qty'] ?? 0} pcs',
                              style: TextStyle(
                                  color: ink(context),
                                  fontSize: TaskTypography.secondary,
                                  fontWeight: FontWeight.w700)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
