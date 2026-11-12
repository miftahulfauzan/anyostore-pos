import 'dart:convert';

import 'package:flutter/material.dart';

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

  @override
  Widget build(BuildContext context) {
    final visibleCategories = _visibleCategories;
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
                    child: DropdownButtonFormField<String>(
                      initialValue: _preset,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Periode',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      items: [
                        for (final option in kMobileDateFilterOptions)
                          DropdownMenuItem(
                              value: option.value, child: Text(option.label)),
                      ],
                      onChanged: (value) {
                        final next = value ?? 'month';
                        setState(() => _preset = next);
                        if (next == 'custom') {
                          _pickCustomRange();
                        } else {
                          _page = 1;
                          _load();
                        }
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: visibleCategories.any(
                              (category) => '${category['id']}' == _categoryId)
                          ? _categoryId
                          : '',
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Kategori',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      items: [
                        const DropdownMenuItem(
                            value: '', child: Text('Semua kategori')),
                        for (final category in visibleCategories)
                          DropdownMenuItem(
                            value: '${category['id']}',
                            child: Text(category['name']?.toString() ?? ''),
                          ),
                      ],
                      onChanged: (value) {
                        setState(() => _categoryId = value ?? '');
                        _page = 1;
                        _load();
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _paymentMethod,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Metode',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      items: const [
                        DropdownMenuItem(
                            value: '', child: Text('Semua metode')),
                        DropdownMenuItem(value: 'cash', child: Text('Tunai')),
                        DropdownMenuItem(
                            value: 'transfer', child: Text('Transfer')),
                        DropdownMenuItem(value: 'debit', child: Text('Debit')),
                      ],
                      onChanged: (value) {
                        setState(() => _paymentMethod = value ?? '');
                        _page = 1;
                        _load();
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: TextField(
                      controller: _search,
                      textInputAction: TextInputAction.search,
                      decoration: const InputDecoration(
                        labelText: 'Cari keterangan',
                        border: OutlineInputBorder(),
                        isDense: true,
                        prefixIcon: Icon(Icons.search),
                      ),
                      onSubmitted: (_) {
                        _page = 1;
                        _load();
                      },
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _form,
                icon: const Icon(Icons.add),
                label: Text(_tab == 'income'
                    ? 'Tambah Pemasukan'
                    : 'Tambah Pengeluaran'),
              ),
              if (_canManageCategories)
                OutlinedButton.icon(
                  onPressed: _addExpenseCategory,
                  icon: const Icon(Icons.category_outlined),
                  label: const Text('Kategori'),
                ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(
                  child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(),
                    SizedBox(height: 12),
                    Text('Memuat keuangan…')
                  ],
                ))
              : _error != null
                  ? Center(
                      child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(_error!),
                        const SizedBox(height: 12),
                        FilledButton(
                            onPressed: _load, child: const Text('Coba lagi')),
                      ]),
                    ))
                  : _rows.isEmpty
                      ? Center(
                          child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Text(_tab == 'income'
                              ? 'Belum ada pemasukan pada toko ini.'
                              : 'Belum ada pengeluaran pada toko ini.'),
                        ))
                      : ListView.separated(
                          padding: EdgeInsets.fromLTRB(12, 12, 12,
                              16 + MediaQuery.of(context).padding.bottom),
                          itemCount: _rows.length + (_totalPages > 1 ? 2 : 1),
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            if (i == 0) {
                              return GlassCard(
                                key: const ValueKey('finance-summary'),
                                radius: 20,
                                padding: const EdgeInsets.all(20),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                        _tab == 'income'
                                            ? 'Catatan pemasukan'
                                            : 'Catatan pengeluaran',
                                        style: TextStyle(
                                            color: taskMuted(context))),
                                    const SizedBox(height: 6),
                                    Text('$_total catatan',
                                        style: const TextStyle(
                                            fontSize: TaskTypography.display,
                                            fontWeight: FontWeight.w800,
                                            color: kTaskPurple)),
                                  ],
                                ),
                              );
                            }
                            if (i == _rows.length + 1) {
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
                              );
                            }
                            final row = _rows[i - 1];
                            final subtitle = [
                              if (row['offline'] == true) 'OFFLINE',
                              row['category']?.toString() ?? '',
                              row['expense_date']?.toString() ?? '',
                              row['payment_method']?.toString() ?? '',
                              row['notes']?.toString() ?? '',
                            ]
                                .where((value) => value.trim().isNotEmpty)
                                .join(' · ');
                            return GlassCard(
                              padding: EdgeInsets.zero,
                              child: ListTile(
                                tileColor: row['offline'] == true
                                    ? (Theme.of(context).brightness ==
                                            Brightness.dark
                                        ? kTaskDarkBg
                                        : kTaskSurfaceMuted)
                                    : null,
                                title: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(fmtRp(asNum(row['amount'])),
                                        style: TextStyle(
                                            fontSize:
                                                TaskTypography.sectionTitle,
                                            fontWeight: FontWeight.w800,
                                            color: ink(context))),
                                    Text(row['name']?.toString() ?? '',
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w700)),
                                  ],
                                ),
                                subtitle: Text(subtitle),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      onPressed: () => _form(row),
                                      icon: const Icon(Icons.edit_outlined,
                                          size: 18),
                                      tooltip: 'Edit',
                                    ),
                                    IconButton(
                                      onPressed: () => _delete(row),
                                      icon: const Icon(Icons.delete_outline,
                                          size: 18, color: kTaskTerracotta),
                                      tooltip: 'Hapus',
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
        ),
      ],
    );
  }
}
