import 'package:flutter/material.dart';

import 'api_client.dart';

class UsersPage extends StatefulWidget {
  const UsersPage(
      {super.key, required this.api, required this.branchId, this.role});
  final ApiClient api;
  final int branchId;
  final String? role;

  bool get isOwner => role == 'owner';

  @override
  State<UsersPage> createState() => _UsersPageState();
}

class _UsersPageState extends State<UsersPage> {
  static const roles = [
    'owner',
    'manager',
    'admin',
    'kasir',
    'gudang',
    'host',
  ];
  List<Map<String, dynamic>> _rows = [];
  List<Map<String, dynamic>> _branches = [];
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
        widget.api.users(branchId: widget.branchId),
        if (widget.isOwner) widget.api.branches(),
      ]);
      final rows = results[0];
      if (!mounted) return;
      setState(() {
        _rows = rows.cast<Map<String, dynamic>>();
        if (widget.isOwner) {
          _branches = results[1].cast<Map<String, dynamic>>();
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _form([Map<String, dynamic>? existing]) async {
    final name =
        TextEditingController(text: existing?['name']?.toString() ?? '');
    final email =
        TextEditingController(text: existing?['email']?.toString() ?? '');
    final password = TextEditingController();
    final pin = TextEditingController();
    var role = existing?['role']?.toString() ?? 'kasir';
    var branchId = existing?['branch_id'] != null
        ? int.tryParse('${existing?['branch_id']}')
        : widget.branchId;

    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(existing == null ? 'Tambah Pegawai' : 'Edit Pegawai'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(
                        labelText: 'Nama *', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                        labelText: 'Email *', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                if (existing == null)
                  TextField(
                      controller: password,
                      obscureText: true,
                      decoration: const InputDecoration(
                          labelText: 'Password (min. 8)',
                          border: OutlineInputBorder())),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  initialValue: role,
                  decoration: const InputDecoration(
                      labelText: 'Role', border: OutlineInputBorder()),
                  items: [
                    for (final r in roles)
                      DropdownMenuItem(value: r, child: Text(r.toUpperCase())),
                  ],
                  onChanged: (v) => setDialogState(() => role = v ?? 'kasir'),
                ),
                if (widget.isOwner) ...[
                  const SizedBox(height: 8),
                  DropdownButtonFormField<int?>(
                    initialValue: branchId,
                    decoration: const InputDecoration(
                        labelText: 'Toko', border: OutlineInputBorder()),
                    items: [
                      for (final b in _branches)
                        DropdownMenuItem<int?>(
                            value: int.tryParse('${b['id']}'),
                            child: Text(b['name']?.toString() ?? '')),
                    ],
                    onChanged: (v) => setDialogState(() => branchId = v),
                  ),
                ],
                const SizedBox(height: 8),
                TextField(
                    controller: pin,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    decoration: const InputDecoration(
                        labelText: 'PIN 6 digit (opsional)',
                        counterText: '',
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
    if (name.text.trim().isEmpty || email.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nama dan email wajib diisi')));
      return;
    }
    final body = <String, dynamic>{
      'name': name.text.trim(),
      'email': email.text.trim(),
      'role': role,
      if (widget.isOwner && branchId != null) 'branch_id': branchId,
      if (pin.text.trim().isNotEmpty) 'pin': pin.text.trim(),
    };
    if (existing == null) {
      if (password.text.length < 8) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Password minimal 8 karakter')));
        return;
      }
      body['password'] = password.text;
    }
    try {
      if (existing == null) {
        await widget.api.createUser(body);
      } else {
        await widget.api.updateUser(int.parse('${existing['id']}'), body);
      }
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _password(Map<String, dynamic> row) async {
    final controller = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Reset password ${row['name']}'),
        content: TextField(
            controller: controller,
            obscureText: true,
            decoration: const InputDecoration(
                labelText: 'Password baru (min. 8)',
                border: OutlineInputBorder())),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    if (controller.text.length < 8) return;
    try {
      await widget.api
          .resetPassword(int.parse('${row['id']}'), controller.text);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('Password direset')));
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _toggle(Map<String, dynamic> row) async {
    try {
      await widget.api.toggleUser(int.parse('${row['id']}'));
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
                child: Text('Pegawai (${_rows.length})',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
              ),
              FilledButton.icon(
                onPressed: _form,
                icon: const Icon(Icons.person_add),
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
                      ? const Center(child: Text('Belum ada pegawai'))
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final row = _rows[i];
                            final active = row['is_active'] != false;
                            return Card(
                              child: ListTile(
                                title: Text(row['name']?.toString() ?? '',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                    '${row['role'] ?? ''} · ${row['email'] ?? ''}${row['has_pin'] == true ? ' · PIN ✓' : ''}'),
                                trailing: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      onPressed: () => _password(row),
                                      icon: const Icon(Icons.key),
                                      tooltip: 'Reset password',
                                    ),
                                    IconButton(
                                      onPressed: () => _toggle(row),
                                      icon: Icon(active
                                          ? Icons.toggle_on
                                          : Icons.toggle_off),
                                      tooltip:
                                          active ? 'Nonaktifkan' : 'Aktifkan',
                                    ),
                                    IconButton(
                                      onPressed: () => _form(row),
                                      icon: const Icon(Icons.edit_outlined),
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
