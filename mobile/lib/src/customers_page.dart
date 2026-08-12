import 'package:flutter/material.dart';

import 'api_client.dart';
import 'task_ui.dart';

class CustomersPage extends StatefulWidget {
  const CustomersPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<CustomersPage> createState() => _CustomersPageState();
}

class _CustomersPageState extends State<CustomersPage> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;

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

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await widget.api.customers(search: _search.text.trim());
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _edit([Map<String, dynamic>? existing]) async {
    final name =
        TextEditingController(text: existing?['name']?.toString() ?? '');
    final phone =
        TextEditingController(text: existing?['phone']?.toString() ?? '');
    final email =
        TextEditingController(text: existing?['email']?.toString() ?? '');
    final address =
        TextEditingController(text: existing?['address']?.toString() ?? '');
    var tier = existing?['price_tier']?.toString() ?? 'reguler';

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => Dialog(
          backgroundColor: const Color(0xF2FFFFFF),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xffeceae4)),
          ),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(existing == null ? 'Tambah Pelanggan' : 'Edit Pelanggan',
                      style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: Color(0xff1E3A5F))),
                  const SizedBox(height: 4),
                  const Text('Lengkapi data pelanggan di bawah ini.',
                      style: TextStyle(fontSize: 12, color: Color(0xff5f5f5d))),
                  const SizedBox(height: 18),
                  _label('Nama *'),
                  _field(name, 'Nama pelanggan'),
                  const SizedBox(height: 12),
                  _label('No. HP'),
                  _field(phone, '08xxxxxxxxxx',
                      keyboard: TextInputType.phone),
                  const SizedBox(height: 12),
                  _label('Email'),
                  _field(email, 'nama@email.com',
                      keyboard: TextInputType.emailAddress),
                  const SizedBox(height: 12),
                  _label('Alamat'),
                  _field(address, 'Alamat lengkap'),
                  const SizedBox(height: 12),
                  _label('Tipe harga'),
                  DropdownButtonFormField<String>(
                    initialValue: tier,
                    decoration: _decoration(),
                    items: const [
                      DropdownMenuItem(
                          value: 'reguler', child: Text('Reguler')),
                      DropdownMenuItem(
                          value: 'semi_grosir', child: Text('Semi Grosir')),
                      DropdownMenuItem(
                          value: 'grosir_seri', child: Text('Grosir Seri')),
                    ],
                    onChanged: (v) =>
                        setDialogState(() => tier = v ?? 'reguler'),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            foregroundColor: const Color(0xff5f5f5d),
                            side: const BorderSide(color: Color(0xffeceae4)),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('Batal'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            backgroundColor: const Color(0xff1E3A5F),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                          ),
                          child: const Text('Simpan'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (saved != true || !mounted) return;
    if (name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nama pelanggan wajib diisi')));
      return;
    }
    final body = {
      'name': name.text.trim(),
      'phone': phone.text.trim(),
      'email': email.text.trim(),
      'address': address.text.trim(),
      'price_tier': tier,
    };
    try {
      if (existing == null) {
        await widget.api.createCustomer(body);
      } else {
        await widget.api.updateCustomer(int.parse('${existing['id']}'), body);
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
        title: const Text('Hapus pelanggan?'),
        content: Text('${row['name']} akan dinonaktifkan.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await widget.api.deleteCustomer(int.parse('${row['id']}'));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }


  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Color(0xff334155))),
      );

  InputDecoration _decoration() {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xffe2e8f0)),
    );
    return InputDecoration(
      filled: true,
      fillColor: const Color(0xfff8fafc),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: const BorderSide(color: Color(0xff1E3A5F), width: 1.4)),
    );
  }

  Widget _field(TextEditingController controller, String hint,
          {TextInputType? keyboard}) =>
      TextField(
          controller: controller,
          keyboardType: keyboard,
          decoration: _decoration().copyWith(hintText: hint));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _search,
                  decoration: const InputDecoration(
                      prefixIcon: Icon(Icons.search),
                      isDense: true,
                      hintText: 'Cari nama / nomor HP',
                      border: OutlineInputBorder()),
                  onSubmitted: (_) => _load(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _edit,
                icon: const Icon(Icons.person_add),
                tooltip: 'Tambah pelanggan',
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_error!),
                            const SizedBox(height: 12),
                            FilledButton(
                                onPressed: _load,
                                child: const Text('Coba lagi')),
                          ],
                        ),
                      ),
                    )
                  : _rows.isEmpty
                      ? const Center(child: Text('Belum ada pelanggan'))
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
                                subtitle: Text([
                                  row['phone']?.toString() ?? '',
                                  (row['price_tier'] ?? '').toString(),
                                ].where((e) => e.isNotEmpty).join(' · ')),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      onPressed: () => _edit(row),
                                      icon: const Icon(Icons.edit_outlined),
                                    ),
                                    IconButton(
                                      onPressed: () => _delete(row),
                                      icon: const Icon(Icons.delete_outline),
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
