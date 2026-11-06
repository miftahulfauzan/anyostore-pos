import 'dart:convert';

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'branch_scope.dart';
import 'format.dart';
import 'offline_status.dart';
import 'offline_store.dart';
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
  bool get _isOwner => widget.role == 'owner';
  bool get _canManageCategories =>
      ['owner', 'manager', 'admin'].contains(widget.role);

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
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    final cacheKey = 'finance-$_tab-${widget.api.activeBranchId ?? 'default'}';
    try {
      final results = await Future.wait([
        widget.api.expenses(type: _tab),
        widget.api.expenseCategories(),
      ]);
      if (!mounted) return;
      // Tampilkan antrean offline dan batasi menurut cabang aktif.
      final activeBranch = widget.api.activeBranchId;
      final serverRows = (results[0] as List).cast<Map<String, dynamic>>();
      final rawPending = await OfflineStore.pendingExpenses();
      final pending = activeBranch == null
          ? rawPending
          : rawPending.where((r) {
              try {
                final p = jsonDecode(r['payload'] as String? ?? '{}')
                    as Map<String, dynamic>;
                final b = p['branch_id'] == null
                    ? null
                    : int.tryParse('${p['branch_id']}');
                if (b == null) return false;
                return b == activeBranch;
              } catch (_) {
                return false;
              }
            }).toList();
      final localRows = <Map<String, dynamic>>[
        for (final r in pending)
          if ((jsonDecode(r['payload'] as String? ?? '{}')
                  as Map<String, dynamic>)['type'] ==
              _tab) ...[
            {
              ...(jsonDecode(r['payload'] as String? ?? '{}')
                  as Map<String, dynamic>),
              'offline': true,
              'local_id': r['id'],
            },
          ],
      ];
      setState(() {
        _rows = [...localRows, ...serverRows];
        _categories = (results[1] as List).cast<Map<String, dynamic>>();
      });
      // Simpan cache keuangan untuk mode offline.
      await OfflineStore.cacheSet(
          cacheKey,
          jsonEncode({
            'rows': results[0],
            'categories': results[1],
          }));
    } on ApiException catch (e) {
      if (e.isNetwork) {
        // Offline: pakai cache keuangan terakhir.
        try {
          final cached = await OfflineStore.cacheGet(cacheKey);
          if (cached != null && mounted) {
            final payload = cached['payload'] as Map<String, dynamic>;
            setState(() {
              _rows = ((payload['rows'] as List?) ?? [])
                  .cast<Map<String, dynamic>>();
              _categories = ((payload['categories'] as List?) ?? [])
                  .cast<Map<String, dynamic>>();
              _error = null;
            });
            return;
          }
        } catch (_) {}
      }
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
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
                            style: TextStyle(fontSize: 12)),
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
        title: const Text('Tambah Kategori Pengeluaran'),
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
      await widget.api.createExpenseCategory({'name': name, 'type': 'expense'});
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
              setState(() => _tab = v);
              _load();
            },
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
              if (_canManageCategories && _tab == 'expense')
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
                          itemCount: _rows.length + 1,
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
                                    Text('${_rows.length} catatan',
                                        style: const TextStyle(
                                            fontSize: 32,
                                            fontWeight: FontWeight.w800,
                                            color: kTaskPurple)),
                                  ],
                                ),
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
                                            fontSize: 22,
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
