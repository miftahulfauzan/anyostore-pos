import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'task_ui.dart';

class PromotionsPage extends StatefulWidget {
  const PromotionsPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<PromotionsPage> createState() => _PromotionsPageState();
}

class _PromotionsPageState extends State<PromotionsPage> {
  List<Map<String, dynamic>> _rows = [];
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
      final rows = await widget.api.promotions();
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _form() async {
    final code = TextEditingController();
    final name = TextEditingController();
    final value = TextEditingController();
    final minPurchase = TextEditingController();
    final maxDiscount = TextEditingController();
    final usageLimit = TextEditingController();
    var type = 'percentage';
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Tambah Promo'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: code,
                    decoration: const InputDecoration(
                        labelText: 'Kode *', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: name,
                    decoration: const InputDecoration(
                        labelText: 'Nama *', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: type,
                  decoration: const InputDecoration(
                      labelText: 'Jenis', border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(
                        value: 'percentage', child: Text('Persen (%)')),
                    DropdownMenuItem(
                        value: 'nominal', child: Text('Nominal (Rp)')),
                  ],
                  onChanged: (v) =>
                      setDialogState(() => type = v ?? 'percentage'),
                ),
                const SizedBox(height: 8),
                TextField(
                    controller: value,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Nilai diskon',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: minPurchase,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Min. pembelian (opsional)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: maxDiscount,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Maks diskon (opsional)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: usageLimit,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Batas pemakaian (opsional)',
                        border: OutlineInputBorder())),
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
    if (code.text.trim().isEmpty ||
        name.text.trim().isEmpty ||
        value.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Kode, nama, dan nilai wajib diisi')));
      return;
    }
    try {
      await widget.api.createPromotion({
        'code': code.text.trim(),
        'name': name.text.trim(),
        'discount_type': type,
        'discount_value': double.tryParse(value.text.replaceAll('.', '')) ?? 0,
        if (minPurchase.text.trim().isNotEmpty)
          'min_purchase':
              double.tryParse(minPurchase.text.replaceAll('.', '')) ?? 0,
        if (maxDiscount.text.trim().isNotEmpty)
          'max_discount':
              double.tryParse(maxDiscount.text.replaceAll('.', '')) ?? 0,
        if (usageLimit.text.trim().isNotEmpty)
          'usage_limit': int.tryParse(usageLimit.text) ?? 0,
      });
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _toggle(Map<String, dynamic> row) async {
    try {
      await widget.api.togglePromotion(int.parse('${row['id']}'));
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
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: Text('Promo (${_rows.length})',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
              ),
              FilledButton.icon(
                onPressed: _form,
                icon: const Icon(Icons.add),
                label: const Text('Tambah'),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _rows.isEmpty
                      ? const Center(child: Text('Belum ada promo'))
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final row = _rows[i];
                            final active = row['is_active'] != false;
                            final value = row['discount_value'];
                            final label = row['discount_type'] == 'percentage'
                                ? '$value%'
                                : fmtRp(asNum(value));
                            return GlassCard(
                              padding: EdgeInsets.zero,
                              child: ListTile(
                                leading: CircleAvatar(
                                  child: Text(() {
                                    final code = row['code']?.toString() ?? '';
                                    return code.isEmpty
                                        ? 'P'
                                        : code.substring(0, 1);
                                  }()),
                                ),
                                title: Text(row['name']?.toString() ?? '',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                    '${row['code']} · $label · ${row['usage_count'] ?? 0}/${row['usage_limit'] ?? '∞'}'),
                                trailing: IconButton(
                                  onPressed: () => _toggle(row),
                                  icon: Icon(active
                                      ? Icons.toggle_on
                                      : Icons.toggle_off),
                                  tooltip: active ? 'Nonaktifkan' : 'Aktifkan',
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
