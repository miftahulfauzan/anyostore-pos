// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

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
    final expedition =
        TextEditingController(text: existing?['expedition']?.toString() ?? '');
    var tier = existing?['price_tier']?.toString() ?? 'reguler';

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
                          color: Theme.of(ctx)
                              .colorScheme
                              .primary
                              .withValues(alpha: .1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(Icons.person_add_alt_1_outlined,
                            size: 18, color: Theme.of(ctx).colorScheme.primary),
                      ),
                      const SizedBox(width: 9),
                      Expanded(
                        child: Text(
                            existing == null
                                ? 'Tambah Pelanggan'
                                : 'Edit Pelanggan',
                            style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: ink(ctx))),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AppField(
                      controller: name,
                      label: 'Nama pelanggan',
                      icon: Icons.person_outline,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: phone,
                      label: 'No. HP',
                      icon: Icons.phone_outlined,
                      keyboard: TextInputType.phone,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: email,
                      label: 'Email',
                      icon: Icons.mail_outline,
                      keyboard: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: address,
                      label: 'Alamat',
                      icon: Icons.location_on_outlined,
                      maxLines: 2,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: expedition,
                      label: 'Ekspedisi',
                      hint: 'JNE / J&T / SiCepat / Ambil di toko',
                      icon: Icons.local_shipping_outlined),
                  const SizedBox(height: 12),
                  Text('Tipe harga',
                      style: TextStyle(
                          fontSize: TaskTypography.micro,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .5,
                          color: taskMuted(ctx))),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final option in const [
                        ('reguler', 'Reguler'),
                        ('semi_grosir', 'Semi Grosir'),
                        ('grosir_seri', 'Grosir Seri'),
                      ])
                        ChoiceChip(
                          label: Text(option.$2),
                          selected: tier == option.$1,
                          showCheckmark: false,
                          onSelected: (_) => setSheet(() => tier = option.$1),
                        ),
                    ],
                  ),
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
      'expedition': expedition.text.trim(),
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
            style: FilledButton.styleFrom(backgroundColor: kTaskTerracotta),
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

  Widget _customerCard(Map<String, dynamic> row) {
    final name = row['name']?.toString() ?? '-';
    final phone = row['phone']?.toString().trim() ?? '';
    final address = row['address']?.toString().trim() ?? '';
    final expedition = row['expedition']?.toString().trim() ?? '';
    final tierStyle = appTierStyle(context, row['price_tier']);
    final detail =
        [phone, address].where((part) => part.isNotEmpty).join(' · ');
    return AppListCard(
      onTap: () => _edit(row),
      tint: taskSurface(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(text: appInitial(name), fg: tierStyle.fg, bg: tierStyle.bg),
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
                      style: TextStyle(
                          fontSize: TaskTypography.micro,
                          color: taskMuted(context))),
                ],
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: [
                    AppStatusPill(
                        label: tierStyle.label.toUpperCase(),
                        fg: tierStyle.fg,
                        bg: tierStyle.bg),
                    if (expedition.isNotEmpty)
                      AppStatusPill(
                        label: expedition.toUpperCase(),
                        fg: _isDark
                            ? const Color(0xFFFCD34D)
                            : const Color(0xFFB45309),
                        bg: _isDark
                            ? const Color(0x2EFCD34D)
                            : const Color(0xFFFEF3C7),
                        icon: Icons.local_shipping_outlined,
                      ),
                  ],
                ),
              ],
            ),
          ),
          AppKebab(
            tooltip: 'Aksi pelanggan',
            onSelected: (value) {
              if (value == 'edit') {
                _edit(row);
              } else if (value == 'delete') {
                _delete(row);
              }
            },
            items: const [
              PopupMenuItem(value: 'edit', child: Text('Edit')),
              PopupMenuItem(value: 'delete', child: Text('Hapus')),
            ],
          ),
        ],
      ),
    );
  }

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  @override
  Widget build(BuildContext context) {
    final wholesale = _rows
        .where((row) =>
            row['price_tier'] != null && row['price_tier'] != 'reguler')
        .length;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: AppSearchField(
                  controller: _search,
                  hint: 'Cari nama / nomor HP',
                  onSubmitted: (_) => _load(),
                  onClear: _load,
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                width: 46,
                height: 46,
                child: FilledButton(
                  onPressed: _edit,
                  style: FilledButton.styleFrom(
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Icon(Icons.person_add_alt_1_outlined, size: 21),
                ),
              ),
            ],
          ),
        ),
        if (!_loading && _error == null && _rows.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              children: [
                Icon(Icons.people_outline, size: 14, color: taskMuted(context)),
                const SizedBox(width: 6),
                Flexible(
                  child: Text('${_rows.length} pelanggan',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: TaskTypography.micro,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                ),
                if (wholesale > 0) ...[
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text('· $wholesale grosir/semi',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: TaskTypography.micro,
                            color: taskMuted(context))),
                  ),
                ],
              ],
            ),
          ),
        Expanded(
          child: _loading
              ? const UiLoadingState(label: 'Memuat pelanggan…')
              : _error != null
                  ? UiErrorState(message: _error!, onRetry: _load)
                  : _rows.isEmpty
                      ? AppEmptyState(
                          icon: Icons.person_search_outlined,
                          title: 'Belum ada pelanggan',
                          message:
                              'Tambahkan pelanggan agar tier harga dan ekspedisi tersimpan otomatis.',
                          actionLabel: 'Tambah pelanggan',
                          onAction: _edit,
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
                          children: [
                            for (final row in _rows) _customerCard(row),
                          ],
                        ),
        ),
      ],
    );
  }
}
