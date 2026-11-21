// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

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
  int? _selectedBranchId;
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
        widget.api.users(branchId: _selectedBranchId ?? widget.branchId),
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
    final username =
        TextEditingController(text: existing?['username']?.toString() ?? '');
    final email =
        TextEditingController(text: existing?['email']?.toString() ?? '');
    final password = TextEditingController();
    final pin = TextEditingController();
    var role = existing?['role']?.toString() ?? 'kasir';
    var branchId = existing?['branch_id'] != null
        ? int.tryParse('${existing?['branch_id']}')
        : _selectedBranchId ?? widget.branchId;

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: taskSurface(context),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: const Color(0xFF6D28D9).withValues(alpha: .12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.badge_outlined,
                            size: 18, color: Color(0xFF6D28D9)),
                      ),
                      const SizedBox(width: 9),
                      Text(existing == null ? 'Tambah Pegawai' : 'Edit Pegawai',
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: ink(ctx))),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AppField(
                      controller: name,
                      label: 'Nama',
                      icon: Icons.person_outline,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: username,
                      label: 'Username',
                      hint: 'contoh: nining',
                      icon: Icons.alternate_email,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: email,
                      label: 'Email',
                      icon: Icons.mail_outline,
                      keyboard: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next),
                  if (existing == null) ...[
                    const SizedBox(height: 8),
                    AppField(
                        controller: password,
                        label: 'Password (min. 8)',
                        icon: Icons.lock_outline,
                        obscure: true),
                  ],
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: role,
                    isExpanded: true,
                    decoration: appFieldDecoration(ctx,
                        label: 'Role',
                        icon: Icons.admin_panel_settings_outlined),
                    items: [
                      for (final r in roles)
                        DropdownMenuItem(
                            value: r, child: Text(r.toUpperCase())),
                    ],
                    onChanged: (v) => setSheet(() => role = v ?? 'kasir'),
                  ),
                  if (widget.isOwner) ...[
                    const SizedBox(height: 8),
                    DropdownButtonFormField<int?>(
                      initialValue: branchId,
                      isExpanded: true,
                      decoration: appFieldDecoration(ctx,
                          label: 'Toko', icon: Icons.storefront_outlined),
                      items: [
                        for (final b in _branches)
                          DropdownMenuItem<int?>(
                              value: int.tryParse('${b['id']}'),
                              child: Text(b['name']?.toString() ?? '')),
                      ],
                      onChanged: (v) => setSheet(() => branchId = v),
                    ),
                  ],
                  const SizedBox(height: 8),
                  AppField(
                      controller: pin,
                      label: 'PIN 6 digit (opsional)',
                      icon: Icons.pin_outlined,
                      keyboard: TextInputType.number),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            foregroundColor: taskMuted(ctx),
                            side: BorderSide(color: taskBorder(ctx)),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(11)),
                          ),
                          child: const Text('Batal'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(11)),
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
    if (name.text.trim().isEmpty ||
        username.text.trim().isEmpty ||
        email.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Nama, username, dan email wajib diisi')));
      return;
    }
    final body = <String, dynamic>{
      'name': name.text.trim(),
      'username': username.text.trim(),
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
        content: AppField(
            controller: controller,
            label: 'Password baru (min. 8)',
            icon: Icons.lock_outline,
            obscure: true),
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

  Widget _userCard(Map<String, dynamic> row) {
    final active = row['is_active'] != false;
    final name = row['name']?.toString() ?? '-';
    final username = row['username']?.toString() ?? '';
    final email = row['email']?.toString() ?? '';
    final roleStyle = appRoleStyle(context, row['role']);
    final activeStyle = appActiveStyle(context, active);
    final hasPin = row['has_pin'] == true;
    final detail = [username.isEmpty ? '' : '@$username', email]
        .where((part) => part.isNotEmpty)
        .join(' · ');
    return AppListCard(
      onTap: () => _form(row),
      tint: taskSurface(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(text: appInitial(name), fg: roleStyle.fg, bg: roleStyle.bg),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                if (detail.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(detail,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(fontSize: 10.5, color: taskMuted(context))),
                ],
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: [
                    AppStatusPill(
                        label: roleStyle.label.toUpperCase(),
                        fg: roleStyle.fg,
                        bg: roleStyle.bg),
                    AppStatusPill(
                        label: activeStyle.label.toUpperCase(),
                        fg: activeStyle.fg,
                        bg: activeStyle.bg),
                    if (hasPin)
                      AppStatusPill(
                        label: 'PIN',
                        fg: _isDark
                            ? const Color(0xFFCBD5E1)
                            : const Color(0xFF334155),
                        bg: _isDark
                            ? const Color(0x2ECBD5E1)
                            : const Color(0xFFE2E8F0),
                        icon: Icons.pin_outlined,
                      ),
                  ],
                ),
              ],
            ),
          ),
          AppKebab(
            tooltip: 'Aksi pegawai',
            onSelected: (value) {
              if (value == 'password') {
                _password(row);
              } else if (value == 'toggle') {
                _toggle(row);
              } else if (value == 'edit') {
                _form(row);
              }
            },
            items: [
              const PopupMenuItem(
                  value: 'password', child: Text('Reset password')),
              PopupMenuItem(
                  value: 'toggle',
                  child: Text(active ? 'Nonaktifkan' : 'Aktifkan')),
              const PopupMenuItem(value: 'edit', child: Text('Edit')),
            ],
          ),
        ],
      ),
    );
  }

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (widget.isOwner)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: DropdownButtonFormField<int?>(
              initialValue: _selectedBranchId ?? widget.branchId,
              isExpanded: true,
              decoration: appFieldDecoration(context,
                  label: 'Toko / Gudang', icon: Icons.storefront_outlined),
              items: [
                for (final b in _branches)
                  DropdownMenuItem<int?>(
                      value: int.tryParse('${b['id']}'),
                      child: Text(b['name']?.toString() ?? '')),
              ],
              onChanged: (v) {
                setState(() => _selectedBranchId = v);
                _load();
              },
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Text('Pegawai',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: ink(context))),
              const SizedBox(width: 7),
              AppStatusPill(
                label: '${_rows.length}',
                fg: _isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                bg: _isDark ? const Color(0x2ECBD5E1) : const Color(0xFFE2E8F0),
              ),
              const Spacer(),
              FilledButton.icon(
                onPressed: _form,
                icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
                label: const Text('Tambah'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 38),
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const UiLoadingState(label: 'Memuat pegawai…')
              : _error != null
                  ? UiErrorState(message: _error!, onRetry: _load)
                  : _rows.isEmpty
                      ? AppEmptyState(
                          icon: Icons.badge_outlined,
                          title: 'Belum ada pegawai',
                          message: 'Tambahkan pegawai dan atur role aksesnya.',
                          actionLabel: 'Tambah pegawai',
                          onAction: _form,
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
                          children: [
                            for (final row in _rows) _userCard(row),
                          ],
                        ),
        ),
      ],
    );
  }
}
