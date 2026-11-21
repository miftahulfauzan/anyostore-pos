import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'format.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

/// Tanggal + jam lokal dari string timestamp server (dipakai kartu & detail).
String transferDateLabel(Object? raw) => formatWibDateTime(raw);

/// Warna pill status transfer yang sama untuk kartu dan sheet detail.
({String label, Color fg, Color bg}) transferStatusStyle(
    BuildContext context, String status) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return switch (status) {
    'completed' => (
        label: 'Selesai',
        fg: dark ? const Color(0xFF86EFAC) : const Color(0xFF137A43),
        bg: dark ? const Color(0x2E86EFAC) : const Color(0xFFDCFCE7),
      ),
    'cancelled' => (
        label: 'Dibatalkan',
        fg: dark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C),
        bg: dark ? const Color(0x2EFDA4AF) : const Color(0xFFFFE4E6),
      ),
    'pending' => (
        label: 'Menunggu',
        fg: dark ? const Color(0xFFFCD34D) : const Color(0xFFB45309),
        bg: dark ? const Color(0x2EFCD34D) : const Color(0xFFFEF3C7),
      ),
    'approved' => (
        label: 'Disetujui',
        fg: dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8),
        bg: dark ? const Color(0x2E93C5FD) : const Color(0xFFDBEAFE),
      ),
    _ => (
        label: status.trim().isEmpty ? 'Tidak diketahui' : status,
        fg: dark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
        bg: dark ? const Color(0x2ECBD5E1) : const Color(0xFFE2E8F0),
      ),
  };
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
                child: GlassCard(
                  padding: const EdgeInsets.all(10),
                  child: Column(
                    children: [
                      AppSearchField(
                        controller: _search,
                        hint: 'Cari nomor atau produk',
                        onSubmitted: (_) => _load(),
                        onClear: _load,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _direction,
                              isExpanded: true,
                              decoration: appFieldDecoration(context,
                                  label: 'Arah',
                                  icon: Icons.swap_horiz_rounded),
                              items: const [
                                DropdownMenuItem(
                                    value: '', child: Text('Semua')),
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
                              decoration: appFieldDecoration(context,
                                  label: 'Status',
                                  icon: Icons.filter_alt_outlined),
                              items: const [
                                DropdownMenuItem(
                                    value: '', child: Text('Semua')),
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
    final style = transferStatusStyle(context, status);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final accent = dark ? kTaskAccentDark : kTaskAccent;
    final fromLabel =
        (from['branch_name'] ?? from['warehouse_name'] ?? '-').toString();
    final toLabel =
        (to['branch_name'] ?? to['warehouse_name'] ?? '-').toString();
    final notes = '${transfer['notes'] ?? ''}'.trim();
    final reason = '${transfer['cancellation_reason'] ?? ''}'.trim();
    final meta =
        '${transfer['product_count'] ?? 0} produk · ${transfer['total_qty'] ?? 0} pcs';
    return AppListCard(
      key: ValueKey('transfer-card-${transfer['id']}'),
      onTap: () => _showTransferDetail(transfer),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: style.fg.withValues(alpha: dark ? .2 : .1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child:
                    Icon(Icons.swap_horiz_rounded, size: 18, color: style.fg),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${transfer['number'] ?? 'Transfer'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 1),
                    Text(transferDateLabel(transfer['created_at']),
                        style: TextStyle(
                            fontSize: 9.5, color: taskMuted(context))),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              AppStatusPill(label: style.label, fg: style.fg, bg: style.bg),
            ],
          ),
          const SizedBox(height: 9),
          Container(
            padding: const EdgeInsets.fromLTRB(9, 7, 9, 7),
            decoration: BoxDecoration(
              color: taskSurface(context),
              border: Border.all(color: taskBorder(context)),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Row(
              children: [
                Icon(Icons.warehouse_outlined,
                    size: 14, color: taskMuted(context)),
                const SizedBox(width: 5),
                Expanded(
                  child: Text(fromLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: ink(context))),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: Icon(Icons.arrow_forward_rounded,
                      size: 13, color: accent),
                ),
                Expanded(
                  child: Text(toLabel,
                      maxLines: 1,
                      textAlign: TextAlign.right,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: ink(context))),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: Text(meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 9.5, color: taskMuted(context))),
              ),
              Text('${transfer['admin'] ?? 'Sistem'}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w600,
                      color: taskMuted(context))),
            ],
          ),
          if (notes.isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(notes,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 9.5,
                    fontStyle: FontStyle.italic,
                    color: taskMuted(context))),
          ],
          if (lines.isNotEmpty) ...[
            const Divider(height: 16),
            for (final line in lines.take(5))
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '${line['name'] ?? 'Produk'}'
                        '${line['variant_color'] == null ? '' : ' · ${line['variant_color']}'}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 10, color: ink(context)),
                      ),
                    ),
                    Text('${line['qty'] ?? 0} pcs',
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: ink(context))),
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
                          style: TextStyle(
                              color: accent,
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(width: 2),
                      Icon(Icons.chevron_right, size: 14, color: accent),
                    ],
                  ),
                ),
              ),
          ],
          if (status == 'cancelled' && reason.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                color: kTaskTerracotta.withValues(alpha: dark ? .16 : .08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('Alasan pembatalan: $reason',
                  style: TextStyle(
                      fontSize: 9.5,
                      color: dark ? const Color(0xFFF2B8A5) : kTaskTerracotta)),
            ),
          ],
          if (_canCancel && status == 'completed') ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: OutlinedButton.icon(
                key: ValueKey('transfer-cancel-${transfer['id']}'),
                onPressed: _cancellingId == int.tryParse('${transfer['id']}')
                    ? null
                    : () => _cancelTransfer(transfer),
                icon: const Icon(Icons.undo_rounded, size: 16),
                label: Text(_cancellingId == int.tryParse('${transfer['id']}')
                    ? 'Membatalkan…'
                    : 'Batalkan transfer'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(0, 36),
                  foregroundColor: kTaskTerracotta,
                  side:
                      BorderSide(color: kTaskTerracotta.withValues(alpha: .35)),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(9)),
                ),
              ),
            ),
          ],
        ],
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
    final style = transferStatusStyle(context, status);
    final dark = Theme.of(context).brightness == Brightness.dark;
    final accent = dark ? kTaskAccentDark : kTaskAccent;
    final muted = taskMuted(context);
    final fromLabel =
        (from['branch_name'] ?? from['warehouse_name'] ?? '-').toString();
    final toLabel =
        (to['branch_name'] ?? to['warehouse_name'] ?? '-').toString();
    final notes = '${transfer['notes'] ?? ''}'.trim();
    final reason = '${transfer['cancellation_reason'] ?? ''}'.trim();
    final statusLabel = switch (status) {
      'completed' => 'Selesai',
      'cancelled' => 'Dibatalkan',
      'pending' => 'Menunggu',
      'approved' => 'Disetujui',
      _ => status.isEmpty ? 'Tidak diketahui' : status,
    };
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
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: style.fg.withValues(alpha: dark ? .2 : .1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.swap_horiz_rounded,
                        size: 18, color: style.fg),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Detail Transfer',
                            style: TextStyle(
                                color: ink(context),
                                fontSize: 18,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -.2)),
                        Text(
                            '${transfer['number'] ?? 'Transfer'} · $statusLabel',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(color: muted, fontSize: 10)),
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
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 18),
                children: [
                  Container(
                    padding: const EdgeInsets.all(11),
                    decoration: BoxDecoration(
                      color: taskSurface(context),
                      border: Border.all(color: taskBorder(context)),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(fromLabel,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      color: ink(context))),
                            ),
                            Padding(
                              padding:
                                  const EdgeInsets.symmetric(horizontal: 5),
                              child: Icon(Icons.arrow_forward_rounded,
                                  size: 13, color: accent),
                            ),
                            Expanded(
                              child: Text(toLabel,
                                  maxLines: 1,
                                  textAlign: TextAlign.right,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      color: ink(context))),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 5,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            AppStatusPill(
                                label: style.label, fg: style.fg, bg: style.bg),
                            _SheetMeta(
                                icon: Icons.calendar_today_outlined,
                                text:
                                    transferDateLabel(transfer['created_at'])),
                            _SheetMeta(
                                icon: Icons.inventory_2_outlined,
                                text:
                                    '${transfer['product_count'] ?? lines.length} produk · ${transfer['total_qty'] ?? 0} pcs'),
                            _SheetMeta(
                                icon: Icons.person_outline,
                                text: '${transfer['admin'] ?? 'Sistem'}'),
                          ],
                        ),
                        if (notes.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text('Catatan: $notes',
                              style: TextStyle(
                                  fontSize: 10.5, height: 1.4, color: muted)),
                        ],
                        if (status == 'cancelled' && reason.isNotEmpty) ...[
                          const SizedBox(height: 7),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 6),
                            decoration: BoxDecoration(
                              color: kTaskTerracotta.withValues(
                                  alpha: dark ? .16 : .08),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text('Alasan pembatalan: $reason',
                                style: TextStyle(
                                    fontSize: 10,
                                    color: dark
                                        ? const Color(0xFFF2B8A5)
                                        : kTaskTerracotta)),
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text('Daftar produk (${lines.length})',
                      style: TextStyle(
                          color: ink(context),
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  if (lines.isEmpty)
                    Text('Tidak ada rincian produk.',
                        style: TextStyle(color: muted, fontSize: 11))
                  else
                    for (var index = 0; index < lines.length; index++)
                      Container(
                        key: ValueKey('transfer-detail-item-$index'),
                        margin: const EdgeInsets.only(bottom: 5),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 9, vertical: 8),
                        decoration: BoxDecoration(
                          color: taskSurface(context),
                          border: Border.all(color: taskBorder(context)),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 24,
                              height: 24,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: accent.withValues(alpha: .12),
                                borderRadius: BorderRadius.circular(7),
                              ),
                              child: Text('${index + 1}',
                                  style: TextStyle(
                                      fontSize: 9.5,
                                      fontWeight: FontWeight.w800,
                                      color: accent)),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '${lines[index]['name'] ?? 'Produk'}'
                                '${lines[index]['variant_color'] == null ? '' : ' · ${lines[index]['variant_color']}'}',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 11, color: ink(context)),
                              ),
                            ),
                            const SizedBox(width: 6),
                            AppStatusPill(
                              label: '${lines[index]['qty'] ?? 0} pcs',
                              fg: accent,
                              bg: accent.withValues(alpha: .12),
                            ),
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

class _SheetMeta extends StatelessWidget {
  const _SheetMeta({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 240),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: taskMuted(context).withValues(alpha: .09),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 11, color: taskMuted(context)),
            const SizedBox(width: 3),
            Flexible(
              child: Text(text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w600,
                      color: taskMuted(context))),
            ),
          ],
        ),
      ),
    );
  }
}
