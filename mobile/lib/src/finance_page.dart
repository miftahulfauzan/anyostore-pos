import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'task_ui.dart';

class FinancePage extends StatefulWidget {
  const FinancePage({super.key, required this.api});
  final ApiClient api;

  @override
  State<FinancePage> createState() => _FinancePageState();
}

class _FinancePageState extends State<FinancePage> {
  String _tab = 'expense';
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _categories = [];
  Map<String, dynamic>? _profitLoss;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.api.expenses(type: _tab),
        widget.api.expenseCategories(),
        widget.api.profitLoss(start: todayWib(), end: todayWib()),
      ]);
      if (!mounted) return;
      setState(() {
        _rows = (results[0] as List).cast<Map<String, dynamic>>();
        _categories = (results[1] as List).cast<Map<String, dynamic>>();
        _profitLoss = results[2] as Map<String, dynamic>;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _form([Map<String, dynamic>? existing]) async {
    final name = TextEditingController(text: existing?['name']?.toString() ?? '');
    final amount = TextEditingController(
        text: existing == null ? '' : '${asNum(existing['amount'])}');
    final date = TextEditingController(
        text: existing?['expense_date']?.toString() ?? todayWib());
    var categoryId = existing == null
        ? (_categories.isEmpty ? null : _categories.first['id'] as int?)
        : int.tryParse('${existing['category_id']}');
    var method = existing?['payment_method']?.toString() ?? 'cash';
    final type = existing?['type']?.toString() ?? _tab;
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
                DropdownButtonFormField<int?>(
                  initialValue: categoryId,
                  decoration: const InputDecoration(
                      labelText: 'Kategori', border: OutlineInputBorder()),
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
                        labelText: 'Nama *', border: OutlineInputBorder())),
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
    if (saved != true || !mounted) return;
    if (categoryId == null ||
        name.text.trim().isEmpty ||
        amount.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Kategori, nama, dan nominal wajib diisi')));
      return;
    }
    try {
      final body = {
        'category_id': categoryId,
        'name': name.text.trim(),
        'amount': double.tryParse(amount.text.replaceAll('.', '')) ?? 0,
        'payment_method': method,
        'expense_date': date.text.trim(),
        'type': type,
      };
      if (isEdit) {
        await widget.api
            .updateExpense(int.parse('${existing['id']}'), body);
      } else {
        await widget.api.createExpense(body);
      }
      _load();
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

  Widget _plMini(String label, String value) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: Colors.white)),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(
                fontSize: 9, color: Color(0xffB9C9DC))),
      ],
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
              (value: 'expense', icon: Icons.trending_down, label: 'Pengeluaran'),
              (value: 'income', icon: Icons.trending_up, label: 'Pemasukan'),
            ],
            selected: _tab,
            onChanged: (v) {
              setState(() => _tab = v);
              _load();
            },
          ),
        ),
        if (_profitLoss != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            child: GlassCard(
              dark: true,
              padding: const EdgeInsets.all(18),
              radius: 24,
              child: Column(
                children: [
                  const Text('LABA RUGI HARI INI',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1,
                          color: Color(0xffB9C9DC))),
                  const SizedBox(height: 8),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(
                        fmtRp(asNum(_profitLoss?['net_profit'])),
                        style: const TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: Colors.white)),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _plMini('Pendapatan',
                          fmtRp(asNum(_profitLoss?['revenue']))),
                      const SizedBox(width: 14),
                      _plMini('Pengeluaran',
                          fmtRp(asNum(_profitLoss?['expenses']))),
                      const SizedBox(width: 14),
                      _plMini('Pemasukan',
                          fmtRp(asNum(_profitLoss?['income']))),
                    ],
                  ),
                ],
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: Align(
            alignment: Alignment.center,
            child: FilledButton.icon(
              onPressed: _form,
              icon: const Icon(Icons.add),
              label: Text(
                  _tab == 'income' ? 'Tambah Pemasukan' : 'Tambah Pengeluaran'),
            ),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _rows.isEmpty
                      ? const Center(child: Text('Belum ada data'))
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final row = _rows[i];
                            return GlassCard(
                              padding: EdgeInsets.zero,
                              child: ListTile(
                                title: Text(row['name']?.toString() ?? '',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                    '${row['category'] ?? ''} · ${row['expense_date'] ?? ''} · ${row['payment_method'] ?? ''}'),
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
                                      icon: const Icon(
                                          Icons.delete_outline,
                                          size: 18,
                                          color: Color(0xFFC2410C)),
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
