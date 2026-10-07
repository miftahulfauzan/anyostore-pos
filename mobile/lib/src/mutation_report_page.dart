// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'media_helpers.dart';
import 'report_filter.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

String _reportDate(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';

String _displayReportDate(Object? value) {
  final parts = value?.toString().split('-') ?? const <String>[];
  if (parts.length == 3) return '${parts[2]}-${parts[1]}-${parts[0]}';
  return value?.toString() ?? '-';
}

int _reportInt(Object? value) =>
    value is num ? value.toInt() : int.tryParse(value?.toString() ?? '') ?? 0;

class MutationReportPage extends StatefulWidget {
  const MutationReportPage(
      {super.key, required this.api, this.showPageTitle = true});
  final ApiClient api;
  final bool showPageTitle;

  @override
  State<MutationReportPage> createState() => _MutationReportPageState();
}

class _MutationReportPageState extends State<MutationReportPage> {
  String _type = 'in';
  String _preset = '7d';
  bool _isOwner = false;
  String _branchMode = 'own'; // own | all | branch-<id>
  int? _accountBranchId;
  List<Map<String, dynamic>> _stores = [];
  List<Map<String, dynamic>> _batches = [];
  List<Map<String, dynamic>> _breakdown = [];
  Map<String, dynamic> _summary = {};
  bool _loading = true;
  String? _error;
  DateTime? _customStart;
  DateTime? _customEnd;
  String _appliedDescription = '';
  int _visibleCount = 6;
  int _loadGeneration = 0;

  (String, String) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    final range = mobileDateFilterRange(
      preset: _preset,
      now: now,
      customStart: _customStart,
      customEnd: _customEnd,
    );
    return (_reportDate(range.start), _reportDate(range.end));
  }

  @override
  void initState() {
    super.initState();
    final auth = Provider.of<AuthStore?>(context, listen: false);
    _isOwner = auth?.role == 'owner';
    _accountBranchId = auth?.branchId;
    _loadTargets();
    _load();
  }

  /// Sama dengan Dashboard: owner mulai dari toko/cabangnya sendiri, dapat
  /// memilih semua, atau memilih satu toko/gudang. Tanpa branch_id, ApiClient
  /// tetap bisa menerapkan scope aktif yang dipilih owner.
  String? get _branchParam {
    if (!_isOwner) return null;
    if (_branchMode == 'all') return 'all';
    if (_branchMode.startsWith('branch-')) {
      return _branchMode.replaceFirst('branch-', '');
    }
    // Endpoint riwayat mutasi menganggap branch_id tanpa nilai sebagai semua
    // cabang untuk owner. Kirim cabang akun (atau scope aktif) agar "Toko
    // saya" benar-benar sama dengan Dashboard.
    final ownBranch = widget.api.activeBranchId ?? _accountBranchId;
    return ownBranch?.toString();
  }

  Future<void> _loadTargets() async {
    try {
      final targets = await widget.api.mutationReportTargets(all: true);
      if (!mounted) return;
      setState(() {
        _stores = targets
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      });
    } on ApiException catch (e) {
      if (mounted && _error == null) setState(() => _error = e.message);
    }
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    final (start, end) = _range;
    final branch = _branchParam;
    final description = _appliedDescription;
    setState(() {
      _loading = true;
      _error = null;
      _batches = [];
      _breakdown = [];
      _summary = {};
      _visibleCount = 6;
    });
    try {
      final response = await widget.api.mutationReport(
        type: _type,
        start: start,
        end: end,
        branchId: branch,
        description: description,
        limit: 500,
      );
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _batches = ((response['data'] as List?) ?? [])
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
        _summary = _mapValue(response['summary']);
        _breakdown = ((response['breakdown'] as List?) ?? [])
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList();
      });
    } on ApiException catch (e) {
      if (mounted && generation == _loadGeneration) {
        setState(() => _error = e.message);
      }
    } finally {
      if (mounted && generation == _loadGeneration) {
        setState(() => _loading = false);
      }
    }
  }

  Map<String, dynamic> _mapValue(Object? value) =>
      value is Map ? Map<String, dynamic>.from(value) : <String, dynamic>{};

  String _presetLabel(String preset) {
    return mobileDateFilterLabel(preset);
  }

  String _periodSummary() {
    final (start, end) = _range;
    final startLabel = _shortReportDate(start);
    final endLabel = _shortReportDate(end);
    if (start == end) return '${_presetLabel(_preset)} · $startLabel';
    return '${_presetLabel(_preset)} · $startLabel–$endLabel';
  }

  String _shortReportDate(Object? value) {
    final parts = value?.toString().split('-') ?? const <String>[];
    if (parts.length != 3) return value?.toString() ?? '-';
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
    final month = int.tryParse(parts[1]);
    return month == null || month < 1 || month > months.length
        ? _displayReportDate(value)
        : '${parts[2]} ${months[month - 1]}';
  }

  Future<void> _selectPreset(String? value) async {
    if (value == null) return;
    if (value == 'custom') {
      final picked = await _pickCustomRange();
      if (picked == null || !mounted) return;
      setState(() {
        _preset = value;
        _customStart = picked.start;
        _customEnd = picked.end;
      });
      _load();
      return;
    }
    setState(() {
      _preset = value;
      _customStart = null;
      _customEnd = null;
    });
    _load();
  }

  Future<DateTimeRange?> _pickCustomRange() async {
    final now = DateTime.now();
    return showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: now,
      initialDateRange: _customStart != null && _customEnd != null
          ? DateTimeRange(start: _customStart!, end: _customEnd!)
          : DateTimeRange(
              start: now.subtract(const Duration(days: 6)), end: now),
      helpText: 'Pilih rentang tanggal',
    );
  }

  String _branchLabel(String branchMode) {
    if (branchMode == 'own') return 'Toko saya (default)';
    if (branchMode == 'all') return 'Semua toko/gudang';
    final branchId = branchMode.replaceFirst('branch-', '');
    final store = _stores.cast<Map<String, dynamic>?>().firstWhere(
          (item) => item?['id']?.toString() == branchId,
          orElse: () => null,
        );
    if (store == null) return 'Toko/gudang dipilih';
    final suffix = store['type']?.toString() == 'gudang' ? ' (Gudang)' : '';
    return '${store['name'] ?? '-'}$suffix';
  }

  Future<void> _openFilterSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _MutationFilterSheet(
        type: _type,
        isOwner: _isOwner,
        initialBranchMode: _branchMode,
        initialDescription: _appliedDescription,
        stores: _stores,
        onApply: (branchMode, description) {
          setState(() {
            _branchMode = branchMode;
            _appliedDescription = description;
          });
          _load();
        },
      ),
    );
  }

  List<Map<String, dynamic>> _products(Map<String, dynamic> batch) =>
      ((batch['products'] as List?) ?? [])
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();

  String _batchDestination(Map<String, dynamic> batch) =>
      batch['destination']?.toString().trim().isNotEmpty == true
          ? batch['destination'].toString()
          : '-';

  String _batchDescription(Map<String, dynamic> batch) =>
      batch['description']?.toString().trim().isNotEmpty == true
          ? batch['description'].toString()
          : '-';

  String _batchFlow(Map<String, dynamic> batch, bool isOut) {
    final warehouse = batch['warehouse']?.toString().trim();
    final location =
        warehouse == null || warehouse.isEmpty ? 'Gudang' : warehouse;
    if (isOut) return '$location → ${_batchDestination(batch)}';
    final description = _batchDescription(batch);
    final source = description == '-' ? 'Supplier' : description;
    return '$source → $location';
  }

  String _batchChannel(Map<String, dynamic> batch) {
    for (final key in ['channel_name', 'channel']) {
      final value = batch[key]?.toString().trim();
      if (value != null && value.isNotEmpty) return value;
    }
    return '';
  }

  Future<void> _deleteBatch(Map<String, dynamic> batch) async {
    final number = batch['number']?.toString() ?? 'batch ini';
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Hapus batch?'),
        content: Text(
            'Hapus $number? Stok akan dikembalikan seperti sebelum mutasi.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await widget.api.deleteMutationBatch(
        type: _type,
        batchId: batch['id'].toString(),
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Batch dihapus dan stok dikembalikan.')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
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
              if (widget.showPageTitle)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 2),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Mutasi',
                        style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ),
                ),
              _buildTypeTabs(context),
              _buildFilterBar(context),
              _buildSummary(context),
              Expanded(child: _buildBatchList(context)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTypeTabs(BuildContext context) {
    final activeColor = _type == 'out' ? kTaskTerracotta : kTaskTeal;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, widget.showPageTitle ? 6 : 12, 12, 0),
      child: Container(
        height: 46,
        decoration: BoxDecoration(
          color: taskSurface(context),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: taskBorder(context)),
        ),
        child: Row(
          children: [
            _typeTab(context, 'in', 'Masuk', activeColor),
            _typeTab(context, 'out', 'Keluar', activeColor),
          ],
        ),
      ),
    );
  }

  Widget _typeTab(
      BuildContext context, String value, String label, Color activeColor) {
    final active = _type == value;
    return Expanded(
      child: Semantics(
        button: true,
        selected: active,
        label: label,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: active
                ? null
                : () {
                    setState(() => _type = value);
                    _load();
                  },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              margin: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                color: active ? activeColor : Colors.transparent,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Center(
                child: Text(label,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: active ? Colors.white : taskMuted(context))),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFilterBar(BuildContext context) {
    final chips = <Widget>[];
    if (_isOwner && _branchMode != 'own') {
      chips.add(InputChip(
        label: Text('Lokasi: ${_branchLabel(_branchMode)}'),
        onDeleted: () {
          setState(() => _branchMode = 'own');
          _load();
        },
      ));
    }
    if (_appliedDescription.isNotEmpty) {
      chips.add(InputChip(
        label: Text('Cari: $_appliedDescription'),
        onDeleted: () {
          setState(() => _appliedDescription = '');
          _load();
        },
      ));
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: _buildPeriodSelector(context),
              ),
              const SizedBox(width: 8),
              DecoratedBox(
                decoration: BoxDecoration(
                  color: taskSurface(context),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: taskBorder(context)),
                ),
                child: IconButton(
                  key: const ValueKey('mutation-filter-button'),
                  tooltip: 'Buka filter',
                  onPressed: _openFilterSheet,
                  icon: const Icon(Icons.tune_outlined),
                  color: ink(context),
                ),
              ),
            ],
          ),
          if (chips.isNotEmpty) ...[
            const SizedBox(height: 4),
            SizedBox(
              height: 48,
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (var index = 0; index < chips.length; index++) ...[
                      if (index > 0) const SizedBox(width: 6),
                      chips[index],
                    ],
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildPeriodSelector(BuildContext context) {
    return Container(
      key: const ValueKey('mutation-period-selector'),
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: taskSurface(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: taskBorder(context)),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _preset,
          isExpanded: true,
          icon: const Icon(Icons.keyboard_arrow_down),
          selectedItemBuilder: (_) => [
            for (final _ in kMobileDateFilterOptions)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(_periodSummary(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: ink(context))),
              ),
          ],
          items: [
            for (final option in kMobileDateFilterOptions)
              DropdownMenuItem<String>(
                value: option.value,
                child: Text(option.label),
              ),
          ],
          onChanged: _selectPreset,
        ),
      ),
    );
  }

  Widget _buildSummary(BuildContext context) {
    final isOut = _type == 'out';
    final total = _reportInt(_summary['total_qty']);
    final color = isOut ? kTaskTerracotta : kTaskTeal;
    final sign = isOut ? '−' : '+';
    final breakdownTitle = isOut ? 'Ringkasan Tujuan' : 'Ringkasan Keterangan';
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: GlassCard(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
        radius: 18,
        child: Column(
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: .14),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                      isOut
                          ? Icons.north_east_rounded
                          : Icons.south_west_rounded,
                      color: color,
                      size: 23),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Semantics(
                    label: isOut ? 'Total stok keluar' : 'Total stok masuk',
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('$sign$total pcs',
                            style: TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: color)),
                        Text('${_batches.length} batch',
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: taskMuted(context))),
                      ],
                    ),
                  ),
                ),
              ],
            ),
            if (_breakdown.isNotEmpty) ...[
              const Divider(height: 18),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const ValueKey('mutation-breakdown-button'),
                  onPressed: _showBreakdown,
                  icon: const Icon(Icons.summarize_outlined, size: 17),
                  label: Text(breakdownTitle),
                  style: TextButton.styleFrom(
                      padding: EdgeInsets.zero, minimumSize: const Size(0, 36)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _showBreakdown() async {
    final title = _type == 'out' ? 'Ringkasan Tujuan' : 'Ringkasan Keterangan';
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      useSafeArea: true,
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: ConstrainedBox(
          constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheetContext).height * .62),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(title,
                        style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: ink(sheetContext))),
                  ),
                  IconButton(
                    tooltip: 'Tutup ringkasan',
                    onPressed: () => Navigator.of(sheetContext).pop(),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Expanded(
                child: ListView.separated(
                  itemCount: _breakdown.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, index) {
                    final item = _breakdown[index];
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      child: Row(
                        children: [
                          Expanded(
                              child: Text(
                                  item['label']?.toString() ?? 'Lainnya',
                                  style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w600,
                                      color: ink(sheetContext)))),
                          Text('${_reportInt(item['total_qty'])} pcs',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: ink(sheetContext))),
                        ],
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBatchList(BuildContext context) {
    if (_loading) return const UiLoadingState(label: 'Memuat riwayat mutasi…');
    if (_error != null && _batches.isEmpty) {
      return UiErrorState(message: _error!, onRetry: () => _load());
    }
    if (_batches.isEmpty) {
      return const UiEmptyState(
          title: 'Belum ada data periode ini',
          message:
              'Coba ubah periode atau buka filter untuk mencari data lain.',
          icon: Icons.history);
    }
    final count = _visibleCount.clamp(0, _batches.length);
    final hasMore = count < _batches.length;
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
      itemCount: count + (hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, index) {
        if (index == count) {
          final remaining = _batches.length - count;
          return OutlinedButton(
            onPressed: () => setState(() => _visibleCount += 6),
            child:
                Text('Lihat ${remaining < 6 ? remaining : 6} batch berikutnya'),
          );
        }
        return _buildBatchCard(context, _batches[index]);
      },
    );
  }

  Widget _buildBatchCard(BuildContext context, Map<String, dynamic> batch) {
    final isOut = _type == 'out';
    final total = _reportInt(batch['total_qty']);
    final products = _products(batch);
    final destination = _batchDestination(batch);
    final flow = _batchFlow(batch, isOut);
    final channel = _batchChannel(batch);
    final showChannel = isOut &&
        channel.isNotEmpty &&
        channel.toLowerCase() != destination.toLowerCase();
    return GlassCard(
      padding: EdgeInsets.zero,
      radius: 20,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
          title: Row(
            children: [
              const Icon(Icons.calendar_today_outlined, size: 16),
              const SizedBox(width: 7),
              Text(_shortReportDate(batch['date']),
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: ink(context))),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 5),
                child: Text('·', style: TextStyle(color: kTaskGray)),
              ),
              Expanded(
                  child: Text(batch['number']?.toString() ?? '-',
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: ink(context)))),
              Text('$total pcs',
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w800,
                      color: ink(context))),
            ],
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 7),
            child: _directionPill(context, flow, channel,
                showChannel: showChannel, isOut: isOut),
          ),
          children: [
            _buildFacts(context, batch, isOut, total, destination),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: Text('Produk (${products.length})',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                ),
                Text('Total: $total pcs',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: taskMuted(context))),
              ],
            ),
            const SizedBox(height: 4),
            const Divider(height: 1),
            if (products.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Text('Tidak ada detail produk.',
                    style: TextStyle(color: kTaskGray)),
              )
            else
              for (final product in products)
                _buildProductRow(context, product),
            if (batch['deletable'] == true) ...[
              const SizedBox(height: 10),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: () => _deleteBatch(batch),
                  icon: const Icon(Icons.delete_outline, size: 18),
                  label: const Text('Hapus batch'),
                  style: OutlinedButton.styleFrom(
                      foregroundColor: kTaskTerracotta),
                ),
              ),
            ] else
              const Padding(
                padding: EdgeInsets.only(top: 10),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Data import',
                      style: TextStyle(color: kTaskGray, fontSize: 12)),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _directionPill(BuildContext context, String flow, String channel,
      {required bool showChannel, required bool isOut}) {
    final color = isOut ? kTaskTerracotta : kTaskTeal;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(11),
        border: Border.all(color: color.withValues(alpha: .30)),
      ),
      child: Row(
        children: [
          Icon(Icons.local_shipping_outlined, size: 17, color: color),
          const SizedBox(width: 7),
          Expanded(
            child: Text(flow,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: ink(context))),
          ),
          if (showChannel) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                color: Theme.of(context).brightness == Brightness.dark
                    ? const Color(0xff334155)
                    : const Color(0xffE5EEF7),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Text(channel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: ink(context))),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildFacts(BuildContext context, Map<String, dynamic> batch,
      bool isOut, int total, String destination) {
    final facts = <(String, String)>[
      ('Tanggal', _displayReportDate(batch['date'])),
      ('Nomor batch', batch['number']?.toString() ?? '-'),
      (
        isOut ? 'Keluar dari' : 'Masuk ke',
        batch['warehouse']?.toString() ?? '-'
      ),
      (
        isOut ? 'Keluar ke' : 'Keterangan',
        isOut ? destination : _batchDescription(batch)
      ),
      ('Admin', batch['admin']?.toString() ?? '-'),
      ('Total', '$total pcs'),
    ];
    final channel = _batchChannel(batch);
    if (isOut && channel.isNotEmpty) facts.add(('Saluran', channel));
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: facts.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 8,
          mainAxisSpacing: 8,
          mainAxisExtent: 58),
      itemBuilder: (_, index) => DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark
              ? kTaskDarkSurface
              : kTaskSand,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Padding(
          padding: const EdgeInsets.all(9),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(facts[index].$1,
                  style: const TextStyle(
                      color: kTaskGray,
                      fontSize: 9,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 3),
              Expanded(
                child: Text(facts[index].$2,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: ink(context))),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProductRow(BuildContext context, Map<String, dynamic> product) {
    final name = product['name']?.toString().trim();
    final photo = stockProductMediaUrl(product['photo_path']?.toString(),
        baseUrl: widget.api.baseUrl);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          _MutationProductThumbnail(
            key: ValueKey('mutation-product-thumbnail-${name ?? ''}'),
            path: photo,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(productDisplayName(product),
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: ink(context))),
          ),
          Text('${_reportInt(product['qty'])} pcs',
              style: const TextStyle(
                  fontSize: 12, color: kTaskGray, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class _MutationProductThumbnail extends StatelessWidget {
  const _MutationProductThumbnail({super.key, required this.path});
  final String path;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: UiProductPhoto(
        path: path,
        baseUrl: '',
        width: 34,
        height: 42,
        fit: BoxFit.cover,
      ),
    );
  }
}

typedef _MutationFilterApply = void Function(
    String branchMode, String description);

class _MutationFilterSheet extends StatefulWidget {
  const _MutationFilterSheet({
    required this.type,
    required this.isOwner,
    required this.initialBranchMode,
    required this.initialDescription,
    required this.stores,
    required this.onApply,
  });

  final String type;
  final bool isOwner;
  final String initialBranchMode;
  final String initialDescription;
  final List<Map<String, dynamic>> stores;
  final _MutationFilterApply onApply;

  @override
  State<_MutationFilterSheet> createState() => _MutationFilterSheetState();
}

class _MutationFilterSheetState extends State<_MutationFilterSheet> {
  late String _branchMode;
  late final TextEditingController _descriptionController;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialBranchMode;
    final validBranch = initial.startsWith('branch-') &&
        widget.stores.any((store) =>
            store['id']?.toString() == initial.replaceFirst('branch-', ''));
    _branchMode =
        initial == 'all' || initial == 'own' || validBranch ? initial : 'own';
    _descriptionController =
        TextEditingController(text: widget.initialDescription);
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
          16, 4, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('Filter laporan',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                ),
                IconButton(
                  tooltip: 'Tutup filter',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (widget.isOwner) ...[
              DropdownButtonFormField<String>(
                initialValue: _branchMode,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Toko / Gudang',
                  prefixIcon: Icon(Icons.storefront_outlined),
                ),
                items: [
                  const DropdownMenuItem<String>(
                      value: 'own', child: Text('Toko saya (default)')),
                  const DropdownMenuItem<String>(
                      value: 'all', child: Text('Semua toko/gudang')),
                  ...widget.stores.map((store) {
                    final id = store['id']?.toString() ?? '';
                    final suffix = store['type']?.toString() == 'gudang'
                        ? ' (Gudang)'
                        : '';
                    return DropdownMenuItem<String>(
                      value: 'branch-$id',
                      child: Text('${store['name'] ?? '-'}$suffix'),
                    );
                  }),
                ],
                onChanged: (value) {
                  if (value != null) setState(() => _branchMode = value);
                },
              ),
            ],
            const SizedBox(height: 10),
            TextField(
              controller: _descriptionController,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                labelText: widget.type == 'out'
                    ? 'Cari tujuan / saluran'
                    : 'Cari keterangan',
                hintText: widget.type == 'out'
                    ? 'Contoh: Shopee, Toko B…'
                    : 'Contoh: Konveksi, Retur…',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _descriptionController.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Hapus pencarian',
                        onPressed: () {
                          _descriptionController.clear();
                          setState(() {});
                        },
                        icon: const Icon(Icons.clear),
                      ),
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      setState(() {
                        _branchMode = 'own';
                        _descriptionController.clear();
                      });
                    },
                    child: const Text('Reset'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: FilledButton.icon(
                    onPressed: () {
                      widget.onApply(
                          _branchMode, _descriptionController.text.trim());
                      Navigator.of(context).pop();
                    },
                    icon: const Icon(Icons.filter_alt_outlined, size: 18),
                    label: const Text('Terapkan Filter'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
