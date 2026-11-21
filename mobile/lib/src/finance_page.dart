import 'dart:convert';

import 'package:flutter/material.dart';

import 'app_ui.dart';

import 'api_client.dart';
import 'branch_scope.dart';
import 'format.dart';
import 'offline_status.dart';
import 'offline_store.dart';
import 'report_filter.dart';
import 'task_ui.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({super.key, required this.api, this.role});
  static final ValueNotifier<int> reloadTick = ValueNotifier(0);
  final ApiClient api;
  final String? role;

  @override
  State<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends State<FinancePage> {
  String _tab = 'expense';
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _categories = [];
  bool _loading = true;
  String? _error;
  int? _branchId;
  String _preset = 'month';
  DateTime? _customStart;
  DateTime? _customEnd;
  String _categoryId = '';
  String _paymentMethod = '';
  final _search = TextEditingController();
  bool _searchOpen = false;
  int _page = 1;
  int _totalPages = 1;
  int _total = 0;
  int _loadGeneration = 0;
  bool get _isOwner => widget.role == 'owner';
  bool get _canManageCategories =>
      ['owner', 'manager', 'admin'].contains(widget.role);

  DateTimeRange get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    return mobileDateFilterRange(
      preset: _preset,
      now: now,
      customStart: _customStart,
      customEnd: _customEnd,
    );
  }

  String _dateString(DateTime value) =>
      '${value.year.toString().padLeft(4, '0')}-${value.month.toString().padLeft(2, '0')}-${value.day.toString().padLeft(2, '0')}';

  List<Map<String, dynamic>> get _visibleCategories => _categories
      .where((category) => (category['type'] ?? 'expense') == _tab)
      .toList();

  @override
  void initState() {
    super.initState();
    if (_isOwner) {
      _branchId = BranchScope.active.value;
      widget.api.activeBranchId = _branchId;
      BranchScope.active.addListener(_onBranchChanged);
    }
    _load();
    // Saat internet kembali: otomatis muat ulang dari server (normal setelah sync).
    OfflineStatus.syncTick.addListener(_onSyncTick);
    FinancePage.reloadTick.addListener(_onReloadTick);
  }

  void _onBranchChanged() {
    if (!_isOwner) return;
    final branchId = BranchScope.active.value;
    if (branchId == _branchId) return;
    _branchId = branchId;
    widget.api.activeBranchId = branchId;
    _page = 1;
    _load();
  }

  void _onReloadTick() => _load(silent: true);

  void _onSyncTick() {
    _load(silent: true);
  }

  @override
  void dispose() {
    OfflineStatus.syncTick.removeListener(_onSyncTick);
    FinancePage.reloadTick.removeListener(_onReloadTick);
    if (_isOwner) BranchScope.active.removeListener(_onBranchChanged);
    _search.dispose();
    super.dispose();
  }

  Future<List<Map<String, dynamic>>> _offlineRows({
    required int? activeBranch,
    required String dateFrom,
    required String dateTo,
  }) async {
    final pending = await OfflineStore.pendingExpenses();
    final search = _search.text.trim().toLowerCase();
    final categoryId = int.tryParse(_categoryId);
    final localRows = <Map<String, dynamic>>[];
    for (final row in pending) {
      try {
        final payload = jsonDecode(row['payload'] as String? ?? '{}')
            as Map<String, dynamic>;
        if (payload['type']?.toString() != _tab) continue;
        final branch = payload['branch_id'] == null
            ? null
            : int.tryParse('${payload['branch_id']}');
        if (activeBranch != null && branch != activeBranch) continue;
        final explicitDate = payload['expense_date']?.toString() ?? '';
        final created = DateTime.tryParse(row['created_at']?.toString() ?? '');
        final date = RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(explicitDate)
            ? explicitDate
            : created == null
                ? ''
                : _dateString(created.toUtc().add(const Duration(hours: 7)));
        if (date.isEmpty ||
            date.compareTo(dateFrom) < 0 ||
            date.compareTo(dateTo) > 0) {
          continue;
        }
        final payloadCategory = int.tryParse('${payload['category_id']}');
        if (categoryId != null && payloadCategory != categoryId) continue;
        if (_paymentMethod.isNotEmpty &&
            payload['payment_method']?.toString() != _paymentMethod) {
          continue;
        }
        if (search.isNotEmpty) {
          final haystack = [
            payload['name'],
            payload['notes'],
            payload['category'],
          ].whereType<Object>().join(' ').toLowerCase();
          if (!haystack.contains(search)) continue;
        }
        localRows.add({
          ...payload,
          'expense_date': date,
          'offline': true,
          'local_id': row['id'],
        });
      } catch (_) {}
    }
    return localRows;
  }

  Future<void> _load({bool silent = false}) async {
    final generation = ++_loadGeneration;
    bool isCurrent() => mounted && generation == _loadGeneration;
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final range = _range;
    final dateFrom = _dateString(range.start);
    final dateTo = _dateString(range.end);
    final cacheKey =
        'finance-$_tab-${widget.api.activeBranchId ?? 'all'}-$dateFrom-$dateTo-$_categoryId-$_paymentMethod-${_search.text.trim()}-$_page';
    try {
      final results = await Future.wait([
        widget.api.expensesPage(
          type: _tab,
          dateFrom: dateFrom,
          dateTo: dateTo,
          categoryId: int.tryParse(_categoryId),
          paymentMethod: _paymentMethod,
          search: _search.text.trim(),
          page: _page,
          limit: 20,
        ),
        widget.api.expenseCategories(),
      ]);
      if (!isCurrent()) return;
      final activeBranch = widget.api.activeBranchId;
      final response = results[0] as Map<String, dynamic>;
      final serverRows =
          ((response['data'] as List?) ?? []).cast<Map<String, dynamic>>();
      final localRows = await _offlineRows(
        activeBranch: activeBranch,
        dateFrom: dateFrom,
        dateTo: dateTo,
      );
      if (!isCurrent()) return;
      setState(() {
        _rows = [...localRows, ...serverRows];
        _categories = (results[1] as List).cast<Map<String, dynamic>>();
        final serverTotal = int.tryParse('${response['total']}');
        _total = (serverTotal ?? serverRows.length) + localRows.length;
        _totalPages = int.tryParse('${response['totalPages'] ?? 1}') ?? 1;
      });
      // Simpan cache keuangan untuk mode offline.
      await OfflineStore.cacheSet(
          cacheKey,
          jsonEncode({
            'response': response,
            'categories': results[1],
          }));
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Offline: pakai cache keuangan terakhir.
        try {
          final cached = await OfflineStore.cacheGet(cacheKey);
          if (cached != null && isCurrent()) {
            final payload = cached['payload'] as Map<String, dynamic>;
            final response = (payload['response'] as Map<String, dynamic>?) ??
                {
                  'data': payload['rows'] ?? [],
                  'total': (payload['rows'] as List?)?.length ?? 0,
                  'totalPages': 1,
                };
            final localRows = await _offlineRows(
              activeBranch: widget.api.activeBranchId,
              dateFrom: dateFrom,
              dateTo: dateTo,
            );
            if (!isCurrent()) return;
            setState(() {
              _rows = [
                ...localRows,
                ...((response['data'] as List?) ?? [])
                    .cast<Map<String, dynamic>>()
              ];
              _categories = ((payload['categories'] as List?) ?? [])
                  .cast<Map<String, dynamic>>();
              final cachedRows = ((response['data'] as List?) ?? []).length;
              final cachedTotal = int.tryParse('${response['total']}');
              _total = cachedTotal ?? cachedRows;
              _totalPages = int.tryParse('${response['totalPages'] ?? 1}') ?? 1;
              _error = null;
            });
            return;
          }
        } catch (_) {}
      }
      if (isCurrent()) setState(() => _error = e.message);
    } finally {
      if (isCurrent()) setState(() => _loading = false);
    }
  }

  Future<void> _pickCustomRange() async {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: DateTimeRange(
        start: _customStart ?? now.subtract(const Duration(days: 6)),
        end: _customEnd ?? now,
      ),
      helpText: 'Pilih rentang keuangan',
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

  Future<void> _form([Map<String, dynamic>? existing]) async {
    if (existing?['offline'] == true) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Data offline belum bisa diedit. Tunggu sampai tersinkron.')));
      return;
    }
    if (_isOwner && widget.api.activeBranchId == null && existing == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Pilih satu toko sebelum menambah data keuangan.')));
      return;
    }
    final name =
        TextEditingController(text: existing?['name']?.toString() ?? '');
    final notes =
        TextEditingController(text: existing?['notes']?.toString() ?? '');
    final amount = TextEditingController(
        text: existing == null ? '' : '${asNum(existing['amount'])}');
    final date = TextEditingController(
        text: existing?['expense_date']?.toString() ?? todayWib());
    final type = existing?['type']?.toString() ?? _tab;
    final matchingCategories =
        _categories.where((c) => (c['type'] ?? '') == type).toList();
    var categoryId = existing == null
        ? (matchingCategories.isEmpty
            ? null
            : int.tryParse('${matchingCategories.first['id']}'))
        : int.tryParse('${existing['category_id']}');
    var method = existing?['payment_method']?.toString() ?? 'cash';
    final isEdit = existing != null;
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(isEdit
              ? (type == 'income' ? 'Edit Pemasukan' : 'Edit Pengeluaran')
              : (type == 'income' ? 'Tambah Pemasukan' : 'Tambah Pengeluaran')),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _categories.where((c) => (c['type'] ?? '') == type).isEmpty
                    ? const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                            'Kategori: Umum (otomatis). Kategori belum tersedia offline',
                            style:
                                TextStyle(fontSize: TaskTypography.secondary)),
                      )
                    : DropdownButtonFormField<int?>(
                        dropdownColor: appDropdownColor(context),
                        borderRadius: BorderRadius.circular(14),
                        menuMaxHeight: 320,
                        isExpanded: true,
                        initialValue: categoryId,
                        decoration: const InputDecoration(
                            labelText: 'Kategori',
                            border: OutlineInputBorder()),
                        items: [
                          for (final c in _categories)
                            if ((c['type'] ?? '') == type)
                              DropdownMenuItem<int?>(
                                  value: int.tryParse('${c['id']}'),
                                  child: Text(c['name']?.toString() ?? '')),
                        ],
                        onChanged: (v) => setDialogState(() => categoryId = v),
                      ),
                const SizedBox(height: 8),
                TextField(
                    controller: name,
                    decoration: const InputDecoration(
                        labelText: 'Keterangan (opsional)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: amount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Nominal',
                        border: OutlineInputBorder(),
                        prefixText: 'Rp ')),
                const SizedBox(height: 8),
                TextField(
                    controller: date,
                    decoration: const InputDecoration(
                        labelText: 'Tanggal (YYYY-MM-DD)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  dropdownColor: appDropdownColor(context),
                  borderRadius: BorderRadius.circular(14),
                  menuMaxHeight: 320,
                  isExpanded: true,
                  initialValue: method,
                  decoration: const InputDecoration(
                      labelText: 'Metode', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'cash', child: Text('Tunai')),
                    DropdownMenuItem(
                        value: 'transfer', child: Text('Transfer')),
                    DropdownMenuItem(value: 'debit', child: Text('Debit')),
                  ],
                  onChanged: (v) => setDialogState(() => method = v ?? 'cash'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: notes,
                  minLines: 2,
                  maxLines: 4,
                  decoration: const InputDecoration(
                    labelText: 'Catatan (opsional)',
                    border: OutlineInputBorder(),
                    alignLabelWithHint: true,
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
                child: const Text('Simpan')),
          ],
        ),
      ),
    );
    name.dispose();
    notes.dispose();
    amount.dispose();
    date.dispose();
    if (saved != true || !mounted) return;
    if (amount.text.trim().isEmpty || date.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nominal dan tanggal wajib diisi')));
      return;
    }
    try {
      final body = {
        'category_id': categoryId,
        'name': name.text.trim(),
        'amount': double.tryParse(amount.text.replaceAll('.', '')) ?? 0,
        'payment_method': method,
        'expense_date': date.text.trim(),
        'notes': notes.text.trim(),
        'type': type,
        if (widget.api.activeBranchId != null)
          'branch_id': widget.api.activeBranchId,
      };
      if (isEdit) {
        await widget.api.updateExpense(int.parse('${existing['id']}'), body);
      } else {
        try {
          await widget.api.createExpense(body);
        } on ApiException catch (e) {
          if (!e.isNetwork) rethrow;
          // Offline: simpan ke antrean lokal, muncul kuning, sync nanti.
          await OfflineStore.insertExpense(body);
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text(
                    'Disimpan offline. Data akan tersinkron saat internet kembali.')));
          }
        }
      }
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _addExpenseCategory() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(_tab == 'income'
            ? 'Tambah Kategori Pemasukan'
            : 'Tambah Kategori Pengeluaran'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Nama kategori',
            hintText: 'Contoh: Transportasi',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('Simpan')),
        ],
      ),
    );
    controller.dispose();
    if (name == null || name.isEmpty || !mounted) return;
    try {
      await widget.api.createExpenseCategory({'name': name, 'type': _tab});
      await _load(silent: true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Kategori "$name" ditambahkan')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
            'Hapus ${row['type'] == 'income' ? 'pemasukan' : 'pengeluaran'}?'),
        content: Text('${row['name']} sebesar ${fmtRp(asNum(row['amount']))}'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Hapus')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    if (row['offline'] == true) {
      await OfflineStore.removeExpense(int.parse('${row['local_id']}'));
      _load();
      return;
    }
    try {
      await widget.api.deleteExpense(int.parse('${row['id']}'));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  bool get _dark => Theme.of(context).brightness == Brightness.dark;

  String get _periodLabel => kMobileDateFilterOptions
      .firstWhere((option) => option.value == _preset,
          orElse: () => kMobileDateFilterOptions.last)
      .label;

  String get _categoryLabel {
    for (final category in _visibleCategories) {
      if ('${category['id']}' == _categoryId) {
        return category['name']?.toString() ?? 'Kategori';
      }
    }
    return 'Kategori';
  }

  String get _methodLabel => switch (_paymentMethod) {
        'cash' => 'Tunai',
        'transfer' => 'Transfer',
        'debit' => 'Debit',
        _ => 'Metode',
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
                        fontSize: 10.5,
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

  Future<void> _choosePeriod() async {
    final picked = await _showChoiceSheet(
      'Periode',
      [
        for (final option in kMobileDateFilterOptions)
          (option.value, option.label)
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

  Future<void> _chooseCategory() async {
    final picked = await _showChoiceSheet(
      'Kategori',
      [
        ('', 'Semua kategori'),
        for (final category in _visibleCategories)
          ('${category['id']}', category['name']?.toString() ?? ''),
      ],
      _categoryId,
    );
    if (picked == null || !mounted) return;
    setState(() => _categoryId = picked);
    _page = 1;
    _load();
  }

  Future<void> _chooseMethod() async {
    final picked = await _showChoiceSheet(
      'Metode',
      const [
        ('', 'Semua metode'),
        ('cash', 'Tunai'),
        ('transfer', 'Transfer'),
        ('debit', 'Debit'),
      ],
      _paymentMethod,
    );
    if (picked == null || !mounted) return;
    setState(() => _paymentMethod = picked);
    _page = 1;
    _load();
  }

  String _financeDayKey(Map<String, dynamic> row) {
    final raw = (row['expense_date'] ?? row['income_date'] ?? '').toString();
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

  String _financeDayLabel(String key) {
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

  String _financeTime(Map<String, dynamic> row) {
    // Data Olsera menaruh jam transaksi pada expense_date; pakai apa adanya
    // (jangan digeser 7 jam). created_at hanya cadangan bila tanggal polos.
    final expense =
        (row['expense_date'] ?? row['income_date'] ?? '').toString().trim();
    if (expense.contains('T')) {
      final date = DateTime.tryParse(expense);
      if (date != null) {
        return '${date.hour.toString().padLeft(2, '0')}:'
            '${date.minute.toString().padLeft(2, '0')}';
      }
    }
    final created = (row['created_at'] ?? '').toString().trim();
    if (created.isNotEmpty) {
      final date = DateTime.tryParse(created);
      if (date != null) {
        final wib = date.toUtc().add(const Duration(hours: 7));
        return '${wib.hour.toString().padLeft(2, '0')}:'
            '${wib.minute.toString().padLeft(2, '0')}';
      }
    }
    return '';
  }

  IconData _expenseIcon(String name) {
    final value = name.toLowerCase();
    if (value.contains('gudang')) return Icons.warehouse_outlined;
    if (value.contains('trip') ||
        value.contains('transport') ||
        value.contains('bensin')) {
      return Icons.local_shipping_outlined;
    }
    if (value.contains('makan') || value.contains('minum')) {
      return Icons.local_cafe_outlined;
    }
    if (value.contains('porter') || value.contains('gaji')) {
      return Icons.person_outline;
    }
    if (value.contains('listrik') || value.contains('air')) {
      return Icons.bolt_outlined;
    }
    return Icons.receipt_long_outlined;
  }

  Color get _financeAccent => _tab == 'income'
      ? (_dark ? const Color(0xFF6EE7B7) : const Color(0xFF137A43))
      : (_dark ? const Color(0xFFFCD34D) : const Color(0xFFB45309));

  Widget _financeSummary() {
    final total = _rows.fold<num>(0, (sum, row) => sum + asNum(row['amount']));
    final accent = _financeAccent;
    return Container(
      key: const ValueKey('finance-summary'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: taskSurface(context),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(Icons.receipt_long_outlined, size: 14, color: accent),
          const SizedBox(width: 7),
          Expanded(
            child: Text('$_total catatan',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text('Halaman $_page · ${fmtRp(total)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
        ],
      ),
    );
  }

  Widget _financeDayHeader(String key, List<Map<String, dynamic>> rows) {
    final total = rows.fold<num>(0, (sum, row) => sum + asNum(row['amount']));
    final accent = _financeAccent;
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
            child: Text(_financeDayLabel(key),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ),
          Flexible(
            child: Text('${rows.length} catatan · ${fmtRp(total)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 9.5,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
          ),
        ],
      ),
    );
  }

  Widget _financeRow(Map<String, dynamic> row) {
    final isOffline = row['offline'] == true;
    final category = (row['category'] ?? '').toString().trim();
    final description = (row['name'] ?? '').toString().trim();
    // Kategori selalu diisi; jadikan judul. Keterangan (opsional) di bawahnya.
    final title = category.isEmpty
        ? 'Tanpa kategori'
        : '${category[0].toUpperCase()}${category.substring(1)}';
    final color = _financeAccent;
    final rawMethod = (row['payment_method'] ?? '').toString();
    final method = switch (rawMethod) {
      'cash' => 'Tunai',
      'transfer' => 'Transfer',
      'debit' => 'Debit',
      _ => rawMethod.isEmpty ? 'Tunai' : rawMethod,
    };
    final meta = [
      if (description.isNotEmpty) description,
      if (isOffline) 'OFFLINE',
      method,
      _financeTime(row),
    ].where((part) => part.trim().isNotEmpty).join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Container(
        padding: const EdgeInsets.fromLTRB(9, 8, 6, 8),
        decoration: BoxDecoration(
          color: isOffline
              ? (_dark ? kTaskDarkBg : kTaskSurfaceMuted)
              : taskSurface(context),
          border: Border.all(color: taskBorder(context)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: color.withValues(alpha: _dark ? .2 : .12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(_expenseIcon(title), size: 16, color: color),
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
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                  const SizedBox(height: 2),
                  Text(meta,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(fontSize: 9.5, color: taskMuted(context))),
                ],
              ),
            ),
            const SizedBox(width: 6),
            Text(fmtRp(asNum(row['amount'])),
                style: TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
            PopupMenuButton<String>(
              tooltip: 'Aksi',
              padding: EdgeInsets.zero,
              icon: Icon(Icons.more_vert, size: 18, color: taskMuted(context)),
              onSelected: (value) {
                if (value == 'edit') {
                  _form(row);
                } else if (value == 'delete') {
                  _delete(row);
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'edit', child: Text('Edit')),
                PopupMenuItem(value: 'delete', child: Text('Hapus')),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _financeBody() {
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 12),
            Text('Memuat keuangan…')
          ],
        ),
      );
    }
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
    if (_rows.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_tab == 'income'
              ? 'Belum ada pemasukan pada toko ini.'
              : 'Belum ada pengeluaran pada toko ini.'),
        ),
      );
    }
    final groups = <String, List<Map<String, dynamic>>>{};
    for (final row in _rows) {
      groups.putIfAbsent(_financeDayKey(row), () => []).add(row);
    }
    final keys = groups.keys.toList()..sort((a, b) => b.compareTo(a));
    final items = <Widget>[_financeSummary()];
    for (final key in keys) {
      items.add(_financeDayHeader(key, groups[key]!));
      for (final row in groups[key]!) {
        items.add(_financeRow(row));
      }
    }
    if (_totalPages > 1) {
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
              Text('Halaman $_page dari $_totalPages'),
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
    }
    return ListView(
      padding: EdgeInsets.fromLTRB(
          12, 10, 12, 16 + MediaQuery.of(context).padding.bottom),
      children: items,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: PillTabs(
            tabs: const [
              (
                value: 'expense',
                icon: Icons.trending_down,
                label: 'Pengeluaran'
              ),
              (value: 'income', icon: Icons.trending_up, label: 'Pemasukan'),
            ],
            selected: _tab,
            onChanged: (v) {
              setState(() {
                _tab = v;
                _categoryId = '';
                _page = 1;
              });
              _load();
            },
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 0),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _filterChip(_periodLabel, _choosePeriod),
                          const SizedBox(width: 6),
                          _filterChip(_categoryLabel, _chooseCategory),
                          const SizedBox(width: 6),
                          _filterChip(_methodLabel, _chooseMethod),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  _roundIcon(
                    Icons.search_rounded,
                    active: _searchOpen,
                    onTap: () => setState(() => _searchOpen = !_searchOpen),
                  ),
                  if (_canManageCategories) ...[
                    const SizedBox(width: 4),
                    PopupMenuButton<String>(
                      tooltip: 'Menu lain',
                      padding: EdgeInsets.zero,
                      icon: Icon(Icons.more_vert,
                          size: 18, color: taskMuted(context)),
                      onSelected: (value) {
                        if (value == 'category') _addExpenseCategory();
                      },
                      itemBuilder: (_) => const [
                        PopupMenuItem(
                            value: 'category', child: Text('Tambah kategori')),
                      ],
                    ),
                  ],
                  const SizedBox(width: 4),
                  Tooltip(
                    message: _tab == 'income'
                        ? 'Tambah Pemasukan'
                        : 'Tambah Pengeluaran',
                    child: Material(
                      color: Theme.of(context).colorScheme.primary,
                      borderRadius: BorderRadius.circular(10),
                      child: InkWell(
                        onTap: _form,
                        borderRadius: BorderRadius.circular(10),
                        child: SizedBox(
                          width: 34,
                          height: 34,
                          child: Icon(Icons.add,
                              size: 18,
                              color: Theme.of(context).colorScheme.onPrimary),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              if (_searchOpen) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: _search,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: 'Cari keterangan',
                    border: OutlineInputBorder(),
                    isDense: true,
                    prefixIcon: Icon(Icons.search),
                  ).copyWith(
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
        Expanded(child: _financeBody()),
      ],
    );
  }
}
