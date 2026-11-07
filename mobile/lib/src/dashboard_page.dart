// ignore_for_file: prefer_const_constructors

import 'dart:async';
import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'branch_scope.dart';
import 'report_filter.dart';
import 'format.dart';
import 'task_ui.dart';

Color _stockLowColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xffFDBA74)
        : kTaskStockLow;
Color _stockEmptyColor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
        ? const Color(0xffFCA5A5)
        : kTaskStockEmpty;

const _months = [
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

const _dashboardPalette = <Color>[
  kTaskAccent,
  kTaskTeal,
  kTaskTerracotta,
  kTaskPurple,
  kTaskWarning,
];

Color _dashboardColor(int index) =>
    _dashboardPalette[index % _dashboardPalette.length];

/// Server MySQL dapat mengirim DATE sebagai string ISO lengkap atau tanggal
/// biasa. Grafik memakai kunci tanggal YYYY-MM-DD agar titik harian tidak
/// hilang hanya karena perbedaan format serialisasi.
String dashboardDateKey(Object? value) {
  final raw = value?.toString().trim() ?? '';
  return raw.length >= 10 ? raw.substring(0, 10) : raw;
}

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  String _preset = '7d'; // today | yesterday | 7d | 30d | month | lastmonth
  DateTime? _from;
  DateTime? _to;
  bool _loading = true;
  String? _error;
  String? _branchError;
  int _requestVersion = 0;
  bool _isOwner = false;
  List<Map<String, dynamic>> _branches = [];
  String _branchMode = 'own'; // own | all | branch-<id>

  // Data
  double _masuk = 0;
  double _keluar = 0;
  List<({String label, double masuk, double keluar})> _daily = [];
  int _aman = 0;
  int _hampir = 0;
  int _kosong = 0;
  int _totalProduk = 0;

  List<(String, double)> _categories = [];
  List<(String, double)> _topProducts = [];

  @override
  void initState() {
    super.initState();
    _isOwner = context.read<AuthStore>().role == 'owner';
    if (_isOwner) {
      final activeBranch = BranchScope.active.value;
      final accountBranch = context.read<AuthStore>().branchId;
      _branchMode = activeBranch == null
          ? 'all'
          : activeBranch == accountBranch
              ? 'own'
              : 'branch-$activeBranch';
      widget.api.activeBranchId = activeBranch;
      BranchScope.active.addListener(_onSharedBranchChanged);
      _loadBranches();
    }
    _load();
  }

  void _onSharedBranchChanged() {
    if (!_isOwner) return;
    final branchId = BranchScope.active.value;
    final accountBranch = context.read<AuthStore>().branchId;
    final mode = branchId == null
        ? 'all'
        : branchId == accountBranch
            ? 'own'
            : 'branch-$branchId';
    if (mode == _branchMode) return;
    _branchMode = mode;
    widget.api.activeBranchId = branchId;
    setState(() {});
    _load();
  }

  @override
  void dispose() {
    if (_isOwner) BranchScope.active.removeListener(_onSharedBranchChanged);
    super.dispose();
  }

  Future<void> _loadBranches() async {
    try {
      final rows = await widget.api.branches();
      if (mounted) {
        setState(() {
          _branches = rows.cast<Map<String, dynamic>>();
          _branchError = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _branchError = 'Gagal memuat pilihan toko/gudang.');
      }
    }
  }

  /// Owner: 'all' / branch-N / null (cabang owner sendiri).
  /// Non-owner: null -> server pakai cabang masing-masing.
  String? get _branchParam {
    if (!_isOwner) return null;
    if (_branchMode == 'all') return 'all';
    if (_branchMode == 'own') {
      return context.read<AuthStore>().branchId?.toString();
    }
    if (_branchMode.startsWith('branch-')) {
      return _branchMode.replaceFirst('branch-', '');
    }
    return null;
  }

  (String, String) get _rangeDates {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    final range = mobileDateFilterRange(
      preset: _preset,
      now: now,
      customStart: _from,
      customEnd: _to,
    );
    return (d(range.start), d(range.end));
  }

  String get _activeLabel {
    final (start, end) = _rangeDates;
    return start == end ? start : '$start s/d $end';
  }

  Future<void> _load() async {
    final requestVersion = ++_requestVersion;
    setState(() {
      _loading = true;
      _error = null;
      _masuk = _keluar = 0;
      _aman = _hampir = _kosong = _totalProduk = 0;
      _daily = [];
      _categories = [];
      _topProducts = [];
    });
    try {
      final (start, end) = _rangeDates;
      final branch = context.read<AuthStore>().branchId ?? 0;
      final bp = _branchParam;
      final stockAll = _isOwner && _branchMode == 'all';
      final stockBranch = int.tryParse(bp ?? '') ?? branch;
      late final Map<String, dynamic> mutSummary;
      late final Map<String, dynamic> stockSummary;
      late final List<Map<String, dynamic>> catRows;
      late final List<Map<String, dynamic>> topRows;

      final results = await Future.wait([
        widget.api.mutationsSummary(start: start, end: end, branchId: bp),
        widget.api.stockTotal(branchId: stockBranch, allBranches: stockAll),
        widget.api.stockByCategory(branchId: bp).catchError((_) => <dynamic>[]),
        widget.api
            .topProductsOut(start: start, end: end, branchId: bp)
            .catchError((_) => <dynamic>[]),
      ]);
      mutSummary = (results[0] as Map<String, dynamic>?) ?? {};
      stockSummary = ((results[1] as Map<String, dynamic>?)?['summary']
              as Map<String, dynamic>?) ??
          {};
      catRows = (results[2] as List?)?.cast<Map<String, dynamic>>() ?? [];
      topRows = (results[3] as List?)?.cast<Map<String, dynamic>>() ?? [];

      if (!mounted || requestVersion != _requestVersion) return;
      if (mutSummary['daily'] is! List ||
          ['total_in', 'total_out'].any(
              (key) => num.tryParse('${mutSummary[key]}')?.isFinite != true) ||
          ['total_products', 'low_stock', 'out_of_stock']
              .any((key) => int.tryParse('${stockSummary[key]}') == null)) {
        throw const FormatException('Respons ringkasan tidak lengkap');
      }

      // Ringkasan masuk/keluar/selisih dari SEMUA mutasi periode terpilih.
      final masuk = asNum(mutSummary['total_in']);
      final keluar = asNum(mutSummary['total_out']);

      // Grafik harian dari ringkasan mutasi (hari kosong diisi 0).
      final dailyList =
          ((mutSummary['daily'] as List?) ?? []).cast<Map<String, dynamic>>();
      final byDate = <String, Map<String, dynamic>>{
        for (final d in dailyList) dashboardDateKey(d['date']): d,
      };
      final startDate = DateTime.parse(start);
      final endDate = DateTime.parse(end);
      String key(DateTime x) =>
          '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
      final daily = <({String label, double masuk, double keluar})>[
        if (dailyList.isNotEmpty)
          for (var day = startDate;
              !day.isAfter(endDate);
              day = day.add(const Duration(days: 1)))
            (
              label: '${day.day} ${_months[day.month - 1]}',
              masuk: asNum(byDate[key(day)]?['in']),
              keluar: asNum(byDate[key(day)]?['out']),
            ),
      ];

      // Status stok dari summary stock-total.
      var aman = 0, hampir = 0, kosong = 0, total = 0;
      total = int.tryParse('${stockSummary['total_products'] ?? 0}') ?? 0;
      final low = int.tryParse('${stockSummary['low_stock'] ?? 0}') ?? 0;
      final out = int.tryParse('${stockSummary['out_of_stock'] ?? 0}') ?? 0;
      if (total > 0) {
        kosong = (out / total * 100).round();
        hampir = (low / total * 100).round();
        aman = math.max(0, 100 - kosong - hampir);
      }

      setState(() {
        _masuk = masuk;
        _keluar = keluar;
        _daily = daily;
        _aman = aman;
        _hampir = hampir;
        _kosong = kosong;
        _totalProduk = total;
        _categories = [
          for (final c in catRows)
            (c['name']?.toString() ?? '-', asNum(c['total']))
        ];
        _topProducts = [
          for (final t in topRows)
            (t['name']?.toString() ?? '-', asNum(t['total']))
        ];
      });
    } catch (e) {
      if (mounted && requestVersion == _requestVersion) {
        setState(() => _error = e is ApiException
            ? e.message
            : 'Respons ringkasan tidak valid. Silakan coba lagi.');
      }
    } finally {
      if (mounted && requestVersion == _requestVersion) {
        setState(() => _loading = false);
      }
    }
  }

  double get _selisih => _masuk - _keluar;

  /// Format angka polos dengan pemisah ribuan (tanpa Rp).
  String _fmtNum(double v) {
    final text = v.round().toString();
    return text.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => '.');
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
              if (_loading)
                const LinearProgressIndicator(minHeight: 2)
              else
                const SizedBox(height: 2),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                      12, 12, 12, 16 + MediaQuery.of(context).padding.bottom),
                  children: [
                    _buildHeader(),
                    const SizedBox(height: 12),
                    if (_loading)
                      _DashboardLoading()
                    else if (_error != null)
                      _DashboardMessage(
                        title: 'Gagal memuat ringkasan',
                        message: _error!,
                        onRetry: _load,
                      )
                    else ...[
                      Row(
                        children: [
                          Expanded(
                              child: _SummaryCard(
                                  label: 'Masuk',
                                  value: _fmtNum(_masuk),
                                  icon: Icons.south_west,
                                  color: kTaskTeal)),
                          const SizedBox(width: 8),
                          Expanded(
                              child: _SummaryCard(
                                  label: 'Keluar',
                                  value: _fmtNum(_keluar),
                                  icon: Icons.north_east,
                                  color: kTaskTerracotta)),
                          const SizedBox(width: 8),
                          Expanded(
                              child: _SummaryCard(
                                  label: 'Selisih',
                                  value: _fmtNum(_selisih),
                                  icon: Icons.swap_vert,
                                  color: kTaskPurple)),
                        ],
                      ),
                      const SizedBox(height: 12),
                      _MovementCard(
                          daily: _daily,
                          totalMasuk:
                              _daily.fold<double>(0, (s, d) => s + d.masuk),
                          totalKeluar:
                              _daily.fold<double>(0, (s, d) => s + d.keluar)),
                      const SizedBox(height: 12),
                      _StatusCard(
                          aman: _aman,
                          hampir: _hampir,
                          kosong: _kosong,
                          totalProduk: _totalProduk),
                      const SizedBox(height: 12),
                      _CategoryCard(categories: _categories),
                      const SizedBox(height: 12),
                      _TopProductsCard(products: _topProducts),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return GlassCard(
      padding: const EdgeInsets.all(12),
      radius: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_isOwner) _buildOwnerBranchSelector(),
          if (_isOwner) const SizedBox(height: 10),
          const SizedBox(height: 10),
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
                  key: const ValueKey('dashboard-filter-button'),
                  onPressed: _openFilterSheet,
                  icon: const Icon(Icons.tune_outlined),
                  tooltip: 'Buka filter',
                  color: ink(context),
                ),
              ),
              IconButton(
                onPressed: _load,
                icon: const Icon(Icons.refresh),
                tooltip: 'Muat ulang',
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('Periode: $_presetLabel · $_activeLabel',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: taskMuted(context))),
          if (_branchError != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(child: Text(_branchError!)),
                TextButton(
                  onPressed: _loadBranches,
                  child: const Text('Muat ulang'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOwnerBranchSelector() {
    final branchItems = <DropdownMenuItem<String>>[
      const DropdownMenuItem(value: 'own', child: Text('Toko saya (default)')),
      const DropdownMenuItem(value: 'all', child: Text('Semua toko/gudang')),
      for (final branch in _branches)
        DropdownMenuItem(
          value: 'branch-${branch['id']}',
          child: Text(branch['name']?.toString() ?? ''),
        ),
    ];
    if (_branchMode.startsWith('branch-') &&
        !branchItems.any((item) => item.value == _branchMode)) {
      branchItems.add(const DropdownMenuItem(
          value: 'selected', child: Text('Toko/gudang dipilih')));
    }
    final value = branchItems.any((item) => item.value == _branchMode)
        ? _branchMode
        : 'all';
    return Container(
      key: const ValueKey('dashboard-branch-selector'),
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: taskSurface(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: taskBorder(context)),
      ),
      child: Row(
        children: [
          Icon(Icons.store_outlined,
              size: 19, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 10),
          Expanded(
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: value,
                isExpanded: true,
                icon: const Icon(Icons.keyboard_arrow_down),
                onChanged: (next) {
                  if (next == null || next == 'selected') return;
                  final branchId = next == 'all'
                      ? null
                      : next == 'own'
                          ? context.read<AuthStore>().branchId
                          : int.tryParse(next.replaceFirst('branch-', ''));
                  unawaited(BranchScope.set(branchId));
                },
                selectedItemBuilder: (_) => [
                  for (final item in branchItems)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                          item.value == value
                              ? (item.value == 'all'
                                  ? 'Semua toko/gudang'
                                  : item.value == 'own'
                                      ? 'Toko saya (default)'
                                      : _selectedBranchLabel)
                              : item.child is Text
                                  ? (item.child as Text).data ?? ''
                                  : '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: ink(context))),
                    ),
                ],
                items: branchItems,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String get _presetLabel {
    return mobileDateFilterLabel(_preset);
  }

  String get _selectedBranchLabel {
    if (_branchMode == 'all') return 'Semua toko/gudang';
    final id = _branchMode.replaceFirst('branch-', '');
    final branch = _branches.firstWhere(
      (item) => item['id']?.toString() == id,
      orElse: () => <String, dynamic>{},
    );
    return branch['name']?.toString() ?? 'Toko/gudang dipilih';
  }

  Future<void> _selectPreset(String? value) async {
    if (value == null) return;
    if (value == 'custom') {
      final now = DateTime.now();
      final picked = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: now,
        initialDateRange: _from != null && _to != null
            ? DateTimeRange(start: _from!, end: _to!)
            : DateTimeRange(
                start: now.subtract(const Duration(days: 6)), end: now),
        helpText: 'Pilih rentang tanggal',
      );
      if (picked == null || !mounted) return;
      setState(() {
        _preset = value;
        _from = picked.start;
        _to = picked.end;
      });
    } else {
      setState(() {
        _preset = value;
        _from = null;
        _to = null;
      });
    }
    _load();
  }

  Widget _buildPeriodSelector(BuildContext context) {
    return Container(
      key: const ValueKey('dashboard-period-selector'),
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
                child: Text('$_presetLabel · $_activeLabel',
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

  Future<void> _openFilterSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _DashboardFilterSheet(
        isOwner: _isOwner,
        initialBranchMode: _branchMode,
        branches: _branches,
        branchError: _branchError,
        onRetryBranches: _loadBranches,
        onApply: (branchMode) {
          final selectedBranch = branchMode == 'all'
              ? null
              : branchMode == 'own'
                  ? context.read<AuthStore>().branchId
                  : int.tryParse(branchMode.replaceFirst('branch-', ''));
          unawaited(BranchScope.set(selectedBranch));
        },
      ),
    );
  }
}

typedef _DashboardFilterApply = void Function(String branchMode);

class _DashboardFilterSheet extends StatefulWidget {
  const _DashboardFilterSheet({
    required this.isOwner,
    required this.initialBranchMode,
    required this.branches,
    required this.branchError,
    required this.onRetryBranches,
    required this.onApply,
  });

  final bool isOwner;
  final String initialBranchMode;
  final List<Map<String, dynamic>> branches;
  final String? branchError;
  final Future<void> Function() onRetryBranches;
  final _DashboardFilterApply onApply;

  @override
  State<_DashboardFilterSheet> createState() => _DashboardFilterSheetState();
}

class _DashboardFilterSheetState extends State<_DashboardFilterSheet> {
  late String _branchMode;

  @override
  void initState() {
    super.initState();
    _branchMode = widget.initialBranchMode;
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
            16, 4, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
        child: ConstrainedBox(
          constraints:
              BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * .9),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('Filter dashboard',
                          style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                    ),
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.close),
                      tooltip: 'Tutup',
                    ),
                  ],
                ),
                if (widget.isOwner) ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _branchMode,
                    isExpanded: true,
                    decoration: const InputDecoration(
                      labelText: 'Toko / Gudang',
                      prefixIcon: Icon(Icons.store_outlined),
                    ),
                    items: [
                      const DropdownMenuItem(
                          value: 'own', child: Text('Toko saya (default)')),
                      const DropdownMenuItem(
                          value: 'all', child: Text('Semua toko/gudang')),
                      for (final branch in widget.branches)
                        DropdownMenuItem(
                          value: 'branch-${branch['id']}',
                          child: Text(branch['name']?.toString() ?? ''),
                        ),
                    ],
                    onChanged: (value) =>
                        setState(() => _branchMode = value ?? 'own'),
                  ),
                  if (widget.branchError != null)
                    Row(
                      children: [
                        Expanded(child: Text(widget.branchError!)),
                        TextButton(
                          onPressed: widget.onRetryBranches,
                          child: const Text('Muat ulang'),
                        ),
                      ],
                    ),
                ],
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => setState(() => _branchMode = 'own'),
                        child: const Text('Reset'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: () {
                          widget.onApply(_branchMode);
                          Navigator.pop(context);
                        },
                        child: const Text('Terapkan Filter'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DashboardLoading extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Memuat ringkasan',
        child: GlassCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Memuat ringkasan…'),
              for (final height in [64.0, 150.0, 120.0])
                Container(
                  height: height,
                  margin: const EdgeInsets.only(top: 12),
                  decoration: BoxDecoration(
                    color: ink(context).withValues(alpha: .07),
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
            ],
          ),
        ),
      );
}

class _DashboardMessage extends StatelessWidget {
  const _DashboardMessage({
    required this.title,
    required this.message,
    this.onRetry,
  });
  final String title;
  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => GlassCard(
        padding: const EdgeInsets.all(16),
        radius: 16,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
            const SizedBox(height: 12),
            Text(message),
            if (onRetry != null) ...[
              const SizedBox(height: 12),
              FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Coba lagi')),
            ],
          ],
        ),
      );
}

/// Kartu ringkasan kecil (Masuk/Keluar/Selisih).
class _SummaryCard extends StatelessWidget {
  const _SummaryCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 148,
      child: GlassCard(
        padding: const EdgeInsets.all(12),
        radius: 16,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withValues(alpha: .14),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, size: 18, color: color),
            ),
            const SizedBox(height: 10),
            Text(label,
                style: TextStyle(fontSize: 12, color: taskMuted(context))),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(value,
                  style: TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800, color: color)),
            ),
          ],
        ),
      ),
    );
  }
}

/// Line chart pergerakan stok pada rentang terpilih.
class _MovementCard extends StatelessWidget {
  const _MovementCard(
      {required this.daily,
      required this.totalMasuk,
      required this.totalKeluar});
  final List<({String label, double masuk, double keluar})> daily;
  final double totalMasuk;
  final double totalKeluar;

  @override
  Widget build(BuildContext context) {
    if (daily.isEmpty) {
      return const _DashboardMessage(
        title: 'Pergerakan Stok',
        message: 'Belum ada pergerakan stok pada rentang ini.',
      );
    }
    final maxV = daily.fold<double>(
        0, (s, d) => math.max(s, math.max(d.masuk, d.keluar)));
    final limit = maxV <= 0 ? 10.0 : maxV * 1.2;
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeading(
              icon: Icons.swap_vert,
              title: 'Pergerakan Stok',
              color: kTaskAccent),
          const SizedBox(height: 6),
          Text('Masuk ${totalMasuk.round()} / Keluar ${totalKeluar.round()}',
              style: TextStyle(fontSize: 12, color: taskMuted(context))),
          const SizedBox(height: 14),
          SizedBox(
            height: 210,
            child: LineChart(
              LineChartData(
                minY: 0,
                maxY: limit,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(
                      color: taskBorder(context).withValues(alpha: .55),
                      strokeWidth: 0.6),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 34,
                      interval: limit / 4,
                      getTitlesWidget: (v, meta) => Text('${v.round()}',
                          style: TextStyle(
                              fontSize: 10, color: taskMuted(context))),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 26,
                      interval: 1,
                      getTitlesWidget: (v, meta) {
                        final i = v.toInt();
                        if (i < 0 || i >= daily.length) {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(daily[i].label,
                              style: TextStyle(
                                  fontSize: 10, color: taskMuted(context))),
                        );
                      },
                    ),
                  ),
                ),
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    getTooltipItems: (spots) => spots.map((s) {
                      final name = s.barIndex == 0 ? 'Masuk' : 'Keluar';
                      return LineTooltipItem(
                          '$name: ${s.y.round()}',
                          const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 11));
                    }).toList(),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: [
                      for (var i = 0; i < daily.length; i++)
                        FlSpot(i.toDouble(), daily[i].masuk)
                    ],
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: kTaskTeal,
                    barWidth: 2.4,
                    dotData: FlDotData(
                      show: true,
                      getDotPainter: (s, p, b, i) => FlDotCirclePainter(
                        radius: 3,
                        color: taskSurface(context),
                        strokeWidth: 2,
                        strokeColor: kTaskTeal,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          kTaskTeal.withValues(alpha: .16),
                          kTaskTeal.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                  LineChartBarData(
                    spots: [
                      for (var i = 0; i < daily.length; i++)
                        FlSpot(i.toDouble(), daily[i].keluar)
                    ],
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: kTaskTerracotta,
                    barWidth: 2.4,
                    dotData: FlDotData(
                      show: true,
                      getDotPainter: (s, p, b, i) => FlDotCirclePainter(
                        radius: 3,
                        color: taskSurface(context),
                        strokeWidth: 2,
                        strokeColor: kTaskTerracotta,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          kTaskTerracotta.withValues(alpha: .20),
                          kTaskTerracotta.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              _LegendDot(color: kTaskTeal, label: 'Stok Masuk'),
              _LegendDot(color: kTaskTerracotta, label: 'Stok Keluar'),
            ],
          ),
        ],
      ),
    );
  }
}

/// Donut chart status stok.
class _StatusCard extends StatelessWidget {
  const _StatusCard(
      {required this.aman,
      required this.hampir,
      required this.kosong,
      required this.totalProduk});
  final int aman;
  final int hampir;
  final int kosong;
  final int totalProduk;

  @override
  Widget build(BuildContext context) {
    if (totalProduk == 0) {
      return const _DashboardMessage(
        title: 'Status Stok',
        message: 'Belum ada produk pada toko/gudang ini.',
      );
    }
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeading(
              icon: Icons.inventory_2_outlined,
              title: 'Status Stok',
              color: kTaskPurple),
          if (totalProduk > 0) ...[
            const SizedBox(height: 2),
            Text('$totalProduk produk',
                style: TextStyle(fontSize: 12, color: taskMuted(context))),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 150,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      PieChart(PieChartData(
                        sectionsSpace: 2,
                        centerSpaceRadius: 46,
                        sections: [
                          PieChartSectionData(
                              value: aman.toDouble(),
                              color: kTaskTeal,
                              radius: 36,
                              showTitle: false),
                          PieChartSectionData(
                              value: hampir.toDouble(),
                              color: _stockLowColor(context),
                              radius: 36,
                              showTitle: false),
                          PieChartSectionData(
                              value: kosong.toDouble(),
                              color: _stockEmptyColor(context),
                              radius: 36,
                              showTitle: false),
                        ],
                      )),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('$aman%',
                              style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: ink(context))),
                          Text('Aman',
                              style: TextStyle(
                                  fontSize: 11, color: taskMuted(context))),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  children: [
                    _RingIndicator(
                        percent: aman, color: kTaskTeal, label: 'Aman'),
                    const SizedBox(height: 10),
                    _RingIndicator(
                        percent: hampir,
                        color: _stockLowColor(context),
                        label: 'Hampir Habis'),
                    const SizedBox(height: 10),
                    _RingIndicator(
                        percent: kosong,
                        color: _stockEmptyColor(context),
                        label: 'Kosong'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 12,
            runSpacing: 8,
            children: [
              _LegendDot(color: kTaskTeal, label: 'Aman'),
              _LegendDot(color: _stockLowColor(context), label: 'Hampir Habis'),
              _LegendDot(color: _stockEmptyColor(context), label: 'Kosong'),
            ],
          ),
        ],
      ),
    );
  }
}

/// Vertical bar chart stok per kategori.
class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.categories});
  final List<(String, double)> categories;

  @override
  Widget build(BuildContext context) {
    if (categories.isEmpty) {
      return const _DashboardMessage(
        title: 'Stok per Kategori',
        message: 'Belum ada data stok per kategori.',
      );
    }
    final maxV = categories.fold<double>(0, (s, c) => math.max(s, c.$2));
    final limit = maxV <= 0 ? 10.0 : maxV * 1.15;
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeading(
              icon: Icons.category_outlined,
              title: 'Stok per Kategori',
              color: kTaskTeal),
          const SizedBox(height: 14),
          SizedBox(
            height: 230,
            child: BarChart(
              BarChartData(
                maxY: limit,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(
                      color: taskBorder(context).withValues(alpha: .55),
                      strokeWidth: 0.6),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 34,
                      interval: limit / 4,
                      getTitlesWidget: (v, meta) {
                        final val = v;
                        final text = val >= 1000
                            ? '${(val / 1000).toStringAsFixed(1)}k'
                            : '${val.round()}';
                        return Text(text,
                            style: TextStyle(
                                fontSize: 10, color: taskMuted(context)));
                      },
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 52,
                      interval: 1,
                      getTitlesWidget: (v, meta) {
                        final i = v.toInt();
                        if (i < 0 || i >= categories.length) {
                          return const SizedBox.shrink();
                        }
                        final label = categories[i].$1;
                        return Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Transform.rotate(
                            angle: -0.7854,
                            child: Text(label,
                                maxLines: 1,
                                style: TextStyle(
                                    fontSize: 10, color: taskMuted(context))),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipItem: (group, gi, rod, ri) => BarTooltipItem(
                      '${categories[group.x].$1}\n${rod.toY.round()}',
                      const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 11),
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < categories.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: categories[i].$2,
                          color: _dashboardColor(i),
                          width: 18,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(5)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Horizontal bar chart top produk keluar.
class _TopProductsCard extends StatelessWidget {
  const _TopProductsCard({required this.products});
  final List<(String, double)> products;

  @override
  Widget build(BuildContext context) {
    if (products.isEmpty) {
      return const _DashboardMessage(
        title: 'Top Produk Keluar',
        message: 'Belum ada produk keluar pada rentang ini.',
      );
    }
    final maxV = products.fold<double>(0, (s, p) => math.max(s, p.$2));
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 16,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeading(
              icon: Icons.local_fire_department_outlined,
              title: 'Top Produk Keluar',
              color: kTaskTerracotta),
          const SizedBox(height: 14),
          for (var i = 0; i < products.length; i++)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  SizedBox(
                    width: 92,
                    child: Text(products[i].$1,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: taskMuted(context))),
                  ),
                  Expanded(
                    child: Container(
                      height: 14,
                      decoration: BoxDecoration(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? kTaskDarkSurface
                            : kTaskSand,
                        borderRadius: BorderRadius.circular(7),
                      ),
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: maxV <= 0 ? 0 : products[i].$2 / maxV,
                        child: Container(
                          decoration: BoxDecoration(
                            color: _dashboardColor(i),
                            borderRadius: BorderRadius.circular(7),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 42,
                    child: Text('${products[i].$2.round()}',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading({
    required this.icon,
    required this.title,
    required this.color,
  });

  final IconData icon;
  final String title;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(
            color: color.withValues(alpha: .12),
            borderRadius: BorderRadius.circular(11),
          ),
          child: Icon(icon, size: 18, color: color),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(title,
              style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w800, color: color)),
        ),
      ],
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 5),
        Text(label, style: TextStyle(fontSize: 11, color: taskMuted(context))),
      ],
    );
  }
}

/// Indikator persentase melingkar.
class _RingIndicator extends StatelessWidget {
  const _RingIndicator(
      {required this.percent, required this.color, required this.label});
  final int percent;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 42,
          height: 42,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 42,
                height: 42,
                child: CircularProgressIndicator(
                  value: percent / 100,
                  strokeWidth: 5,
                  backgroundColor:
                      Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xff334155)
                          : kTaskBlueLight,
                  valueColor: AlwaysStoppedAnimation(color),
                ),
              ),
              Text('$percent%',
                  style: const TextStyle(
                      fontSize: 9.5, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(label,
              style: TextStyle(fontSize: 12, color: taskMuted(context))),
        ),
      ],
    );
  }
}
