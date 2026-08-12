import 'package:flutter/material.dart';

import 'dart:convert';

import 'package:image_picker/image_picker.dart';

import 'api_client.dart';
import 'printer_service.dart';
import 'printer_setup.dart';
import 'task_ui.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  List<Map<String, dynamic>> _branches = [];
  Map<String, dynamic> _settings = {};
  bool _loading = true;
  bool _saving = false;
  bool _uploadingLogo = false;
  String _printerLabel = '';
  String? _error;

  final _name = TextEditingController();
  final _address = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _npwp = TextEditingController();
  final _invoicePrefix = TextEditingController();
  final _receiptHeader = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    _phone.dispose();
    _email.dispose();
    _npwp.dispose();
    _invoicePrefix.dispose();
    _receiptHeader.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.api.branches(),
        widget.api.storeSettings(),
      ]);
      if (!mounted) return;
      final settings = results[1] as Map<String, dynamic>;
      setState(() {
        _branches = (results[0] as List).cast<Map<String, dynamic>>();
        _settings = settings;
        _name.text = settings['store_name']?.toString() ?? '';
        _address.text = settings['store_address']?.toString() ?? '';
        _phone.text = settings['store_phone']?.toString() ?? '';
        _email.text = settings['store_email']?.toString() ?? '';
        _npwp.text = settings['store_tax_id']?.toString() ?? '';
        _invoicePrefix.text = settings['invoice_prefix']?.toString() ?? '';
        _receiptHeader.text = settings['receipt_header']?.toString() ?? '';
      });
      final savedPrinter = await PrinterService().savedPrinter();
      if (mounted) {
        setState(() => _printerLabel = savedPrinter == null
            ? ''
            : '${savedPrinter.name} (${savedPrinter.address})');
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _saveSettings() async {
    setState(() => _saving = true);
    try {
      await widget.api.updateStoreSettings({
        'store_name': _name.text.trim(),
        'store_address': _address.text.trim(),
        'store_phone': _phone.text.trim(),
        'store_email': _email.text.trim(),
        'store_tax_id': _npwp.text.trim(),
        'invoice_prefix': _invoicePrefix.text.trim(),
        'receipt_header': _receiptHeader.text.trim(),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Pengaturan disimpan')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _createBranch() async {
    final name = TextEditingController();
    final address = TextEditingController();
    final phone = TextEditingController();
    final multiplier = TextEditingController(text: '1');
    var sourceId = _branches.isEmpty ? null : _branches.first['id'] as int?;
    var clonePhotos = true;
    var pricingTier = true;
    var isGudang = false;
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Tambah Cabang'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(
                        labelText: 'Nama cabang *',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: address,
                    decoration: const InputDecoration(
                        labelText: 'Alamat', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: phone,
                    decoration: const InputDecoration(
                        labelText: 'Telepon', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                DropdownButtonFormField<int?>(
                  initialValue: sourceId,
                  decoration: const InputDecoration(
                      labelText: 'Sumber katalog',
                      border: OutlineInputBorder()),
                  items: [
                    const DropdownMenuItem<int?>(
                        value: null, child: Text('Kosong (tanpa clone)')),
                    for (final b in _branches)
                      DropdownMenuItem<int?>(
                          value: int.tryParse('${b['id']}'),
                          child: Text(b['name']?.toString() ?? '')),
                  ],
                  onChanged: (v) => setDialogState(() => sourceId = v),
                ),
                const SizedBox(height: 8),
                TextField(
                    controller: multiplier,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Pengali harga (clone)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Clone foto produk'),
                  value: clonePhotos,
                  onChanged: (v) => setDialogState(() => clonePhotos = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Tier harga aktif'),
                  value: pricingTier,
                  onChanged: (v) => setDialogState(() => pricingTier = v),
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Tipe gudang (tanpa POS)'),
                  value: isGudang,
                  onChanged: (v) => setDialogState(() => isGudang = v),
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
                child: const Text('Buat')),
          ],
        ),
      ),
    );
    if (saved != true || !mounted) return;
    if (name.text.trim().isEmpty) return;
    try {
      await widget.api.createBranch({
        'name': name.text.trim(),
        'address': address.text.trim(),
        'phone': phone.text.trim(),
        'source_branch_id': sourceId,
        'price_multiplier':
            double.tryParse(multiplier.text.replaceAll(',', '.')) ?? 1,
        'clone_photos': clonePhotos,
        'pricing_tier_enabled': pricingTier,
        'type': isGudang ? 'gudang' : 'toko',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Cabang dibuat')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _deleteBranch(Map<String, dynamic> branch) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus cabang?'),
        content: Text(
            '${branch['name']} akan dinonaktifkan/dihapus. Hanya bisa dihapus penuh jika belum ada transaksi.'),
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
      await widget.api.deleteBranch(int.parse('${branch['id']}'));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _pickLogo() async {
    try {
      final picked = await ImagePicker().pickImage(
          source: ImageSource.gallery,
          maxWidth: 1024,
          maxHeight: 1024,
          imageQuality: 90);
      if (picked == null || !mounted) return;
      final bytes = await picked.readAsBytes();
      if (bytes.length > 3 * 1024 * 1024) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Ukuran logo maksimal 3 MB')));
        }
        return;
      }
      setState(() => _uploadingLogo = true);
      await widget.api.uploadLogo(picked.mimeType ?? 'image/png',
          base64Encode(bytes));
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Logo berhasil diganti')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Gagal ganti logo: $e')));
    } finally {
      if (mounted) setState(() => _uploadingLogo = false);
    }
  }

  Future<void> _refreshPrinter() async {
    final savedPrinter = await PrinterService().savedPrinter();
    if (!mounted) return;
    setState(() => _printerLabel = savedPrinter == null
        ? ''
        : '${savedPrinter.name} (${savedPrinter.address})');
  }

  Future<void> _choosePrinter() async {
    await showPrinterJobSheet(context,
        (printer, device) => printer.printTest(),
        title: 'Pilih & Simpan Printer');
    await _refreshPrinter();
  }

  Future<void> _testPrinter() async {
    await printNow(context, (printer, device) => printer.printTest(),
        title: 'Uji Cetak');
  }

  Future<void> _clearPrinter() async {
    await PrinterService().clearPrinter();
    await _refreshPrinter();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Profil Toko',
                    style:
                        TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 8),
                TextField(
                    controller: _name,
                    decoration: const InputDecoration(
                        labelText: 'Nama toko', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: _address,
                    decoration: const InputDecoration(
                        labelText: 'Alamat', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: _phone,
                    decoration: const InputDecoration(
                        labelText: 'Telepon', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: _email,
                    decoration: const InputDecoration(
                        labelText: 'Email', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: _npwp,
                    decoration: const InputDecoration(
                        labelText: 'NPWP', border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: _invoicePrefix,
                    decoration: const InputDecoration(
                        labelText: 'Prefix invoice (INV)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: _receiptHeader,
                    decoration: const InputDecoration(
                        labelText: 'Header struk',
                        border: OutlineInputBorder())),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: _saving ? null : _saveSettings,
                  child: Text(_saving ? 'Menyimpan...' : 'Simpan Pengaturan'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Logo Aplikasi',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    BrandLogo(api: widget.api, size: 64, radius: 16),
                    const SizedBox(width: 14),
                    const Expanded(
                      child: Text(
                          'Logo tampil di splash, halaman login, dan header menu. Format JPG/PNG/WebP maks 3 MB.',
                          style: TextStyle(fontSize: 11, color: kTaskGray)),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                FilledButton.icon(
                  onPressed: _uploadingLogo ? null : _pickLogo,
                  icon: _uploadingLogo
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.image_outlined, size: 18),
                  label: Text(_uploadingLogo ? 'Mengunggah...' : 'Ganti Logo'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Printer Thermal',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.print, size: 18, color: kTaskDark),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _printerLabel.isEmpty
                            ? 'Belum ada printer tersimpan.'
                            : 'Printer aktif: $_printerLabel',
                        style: const TextStyle(fontSize: 12, color: kTaskGray),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _choosePrinter,
                        icon: const Icon(Icons.bluetooth, size: 16),
                        label: const Text('Pilih Printer'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _testPrinter,
                        icon: const Icon(Icons.print, size: 16),
                        label: const Text('Uji Cetak'),
                      ),
                    ),
                  ],
                ),
                if (_printerLabel.isNotEmpty)
                  TextButton(
                    onPressed: _clearPrinter,
                    child: const Text('Hapus Printer Tersimpan'),
                  ),
                const SizedBox(height: 2),
                const Text(
                    'Printer yang dipilih tersimpan otomatis dan dipakai tanpa konek ulang untuk struk, barcode, dan penutupan.',
                    style: TextStyle(fontSize: 10, color: kTaskGray)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text('Cabang (${_branches.length})',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 15)),
                    ),
                    FilledButton.icon(
                      onPressed: _createBranch,
                      icon: const Icon(Icons.add),
                      label: const Text('Tambah'),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                for (final b in _branches)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(b['name']?.toString() ?? '',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text(
                        '${b['type'] ?? ''} · ${b['product_count'] ?? 0} produk · ${b['user_count'] ?? 0} pegawai'),
                    trailing: b['id'] == _settings['branch_id']
                        ? null
                        : IconButton(
                            onPressed: () => _deleteBranch(b),
                            icon: const Icon(Icons.delete_outline),
                          ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
