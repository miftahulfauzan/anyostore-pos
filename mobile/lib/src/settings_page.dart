// ignore_for_file: prefer_const_constructors

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'dart:convert';

import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'backup_service.dart';
import 'category_settings_card.dart';
import 'font_scale_controller.dart';
import 'media_mime.dart';
import 'notification_service.dart';
import 'printer_service.dart';
import 'printer_setup.dart';
import 'task_ui.dart';
import 'theme_controller.dart';

/// Batasi input teks ke sejumlah baris (Enter berlebih diabaikan).
TextInputFormatter maxLinesFormatter(int maxLines) =>
    TextInputFormatter.withFunction((oldValue, newValue) {
      if (newValue.text.split('\n').length <= maxLines) return newValue;
      return oldValue;
    });

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.api,
    this.role,
    this.section,
  });
  final ApiClient api;
  final String? role;
  final String? section;

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
  final _receiptContacts = TextEditingController();
  final _receiptFooter = TextEditingController();
  final _receiptNote = TextEditingController();
  String _printerSize = '80';
  bool _autoPrint = true;
  bool _backingUp = false;
  bool _autoBackup = false;
  bool _notifyLowStock = true;

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
    _receiptContacts.dispose();
    _receiptFooter.dispose();
    _receiptNote.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        widget.role == 'owner'
            ? widget.api.branches()
            : Future.value(<dynamic>[]),
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
        _receiptContacts.text = settings['receipt_contacts']?.toString() ?? '';
        _receiptFooter.text = settings['receipt_footer']?.toString() ?? '';
        _receiptNote.text = settings['receipt_note']?.toString() ?? '';
        _printerSize = settings['printer_size']?.toString() ?? '80';
        final autoPrint = settings['auto_print'];
        _autoPrint = autoPrint == null ||
            autoPrint == '1' ||
            autoPrint == true ||
            autoPrint == 'true';
      });
      final prefs = await SharedPreferences.getInstance();
      final autoBackup = prefs.getBool('pos_auto_backup') ?? false;
      final notifyLowStock = prefs.getBool('pos_notify_low_stock') ?? true;
      final savedPrinter = await PrinterService().savedPrinter();
      if (mounted) {
        setState(() {
          _autoBackup = autoBackup;
          _notifyLowStock = notifyLowStock;
          _printerLabel = savedPrinter == null
              ? ''
              : '${savedPrinter.name} (${savedPrinter.address})';
        });
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
        'receipt_contacts': _receiptContacts.text.trim(),
        'receipt_footer': _receiptFooter.text.trim(),
        'receipt_note': _receiptNote.text.trim(),
        'printer_size': _printerSize,
        'auto_print': _autoPrint ? '1' : '0',
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

  Future<void> _pickLogo({String key = 'store_logo'}) async {
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
      final mime = detectImageMime(bytes);
      if (mime == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'Format logo tidak didukung. Pilih JPG, PNG, atau WebP.')));
        }
        return;
      }
      setState(() => _uploadingLogo = true);
      await widget.api.uploadLogo(mime, base64Encode(bytes), key: key);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(key == 'invoice_logo'
              ? 'Logo toko untuk invoice berhasil diganti'
              : 'Logo aplikasi berhasil diganti')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Gagal ganti logo: $e')));
    } finally {
      if (mounted) setState(() => _uploadingLogo = false);
    }
  }

  Future<void> _removeInvoiceLogo() async {
    final path = _settings['invoice_logo']?.toString().trim() ?? '';
    if (path.isEmpty || _uploadingLogo) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus logo invoice?'),
        content: const Text(
            'Logo akan dihapus dari kepala struk. Logo bisa diunggah kembali kapan saja.'),
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
    if (confirmed != true || !mounted) return;
    setState(() => _uploadingLogo = true);
    try {
      await widget.api.deleteInvoiceLogo();
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Logo invoice dihapus')));
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _uploadingLogo = false);
    }
  }

  Widget _logoPreview(String path) {
    if (path.isEmpty) {
      return Container(
        width: 64,
        height: 64,
        decoration: BoxDecoration(
          color: kTaskSand,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: taskBorder(context)),
        ),
        child: Icon(Icons.store, color: ink(context)),
      );
    }
    final base = widget.api.baseUrl.split('/api').first;
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: Image.network(base + path,
          width: 64, height: 64, fit: BoxFit.cover, cacheWidth: 192),
    );
  }

  int? get _settingBranchId => int.tryParse('${_settings['branch_id']}');

  Future<void> _refreshPrinter() async {
    final savedPrinter =
        await PrinterService().savedPrinter(branchId: _settingBranchId);
    if (!mounted) return;
    setState(() => _printerLabel = savedPrinter == null
        ? ''
        : '${savedPrinter.name} (${savedPrinter.address})');
  }

  Future<void> _choosePrinter() async {
    final bid = _settingBranchId;
    if (bid != null) await PrinterService.setActiveBranch(bid);
    if (!mounted) return;
    await showPrinterJobSheet(
      context,
      (printer, device) => printer.printTest(),
      title: 'Pilih & Simpan Printer',
      autoScan: true,
      autoPrintOnDetect: true,
    );
    await _refreshPrinter();
  }

  Future<void> _testPrinter() async {
    await printNow(context, (printer, device) => printer.printTest(),
        title: 'Uji Cetak');
  }

  Future<void> _clearPrinter() async {
    await PrinterService().clearPrinter(branchId: _settingBranchId);
    await _refreshPrinter();
  }

  Future<void> _backupNow() async {
    setState(() => _backingUp = true);
    try {
      final file = await BackupService.runBackup(widget.api);
      if (!mounted) return;
      if (file == null) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Backup gagal: data kosong')));
        return;
      }
      final size = file.lengthSync();
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Backup Berhasil'),
          content: Text('File: ${file.path.split('/').last}\n'
              'Ukuran: ${asSize(size)}\n\n'
              'Pilih "Bagikan" untuk menyimpan ke Google Drive, email, atau WhatsApp.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Tutup')),
            FilledButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  Share.shareXFiles([XFile(file.path)],
                      subject:
                          'Backup Anyostore ${DateTime.now().toIso8601String().split('T').first}');
                },
                child: const Text('Bagikan')),
          ],
        ),
      );
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _backingUp = false);
    }
  }

  Future<void> _setTheme(ThemeMode m) async {
    await ThemeController.set(m);
    if (mounted) setState(() {});
  }

  Future<void> _toggleAutoBackup(bool v) async {
    setState(() => _autoBackup = v);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('pos_auto_backup', v);
    if (v) await NotificationService.scheduleDailyReminder();
  }

  Future<void> _toggleNotifyLowStock(bool v) async {
    setState(() => _notifyLowStock = v);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('pos_notify_low_stock', v);
    if (v) {
      await NotificationService.scheduleDailyReminder();
      await BackupService.checkLowStock(widget.api);
    }
  }

  String asSize(dynamic v) {
    final b = double.tryParse('$v') ?? 0;
    if (b >= 1048576) return '${(b / 1048576).toStringAsFixed(1)} MB';
    if (b >= 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
    return '${b.toStringAsFixed(0)} B';
  }

  bool get _canManageStore =>
      ['owner', 'manager', 'admin'].contains(widget.role);

  Widget _detailCard({required String title, required Widget child}) {
    return GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title,
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 10),
            child,
          ],
        ),
      ),
    );
  }

  Widget _profileDetailCard() {
    return _detailCard(
      title: 'Identitas toko & struk',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
              controller: _name,
              decoration: const InputDecoration(
                  labelText: 'Nama toko', border: OutlineInputBorder())),
          const SizedBox(height: 8),
          TextField(
              controller: _address,
              minLines: 1,
              maxLines: 3,
              keyboardType: TextInputType.multiline,
              inputFormatters: [maxLinesFormatter(3)],
              decoration: const InputDecoration(
                  labelText: 'Alamat',
                  helperText: 'Maksimal 3 baris, tampil apa adanya di invoice',
                  border: OutlineInputBorder())),
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
              minLines: 1,
              maxLines: 4,
              decoration: const InputDecoration(
                  labelText: 'Header struk (maks 4 baris)',
                  border: OutlineInputBorder())),
          const SizedBox(height: 8),
          TextField(
              controller: _receiptContacts,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                  labelText: 'Kontak kepala nota',
                  hintText: 'WA 1: 08...\nWA 2: 08...\nInstagram: @...',
                  helperText: 'Satu baris untuk setiap kontak.',
                  border: OutlineInputBorder())),
          const SizedBox(height: 8),
          TextField(
              controller: _receiptFooter,
              decoration: const InputDecoration(
                  labelText: 'Footer struk', border: OutlineInputBorder())),
          const SizedBox(height: 8),
          TextField(
              controller: _receiptNote,
              decoration: const InputDecoration(
                  labelText: 'Catatan struk', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _saving ? null : _saveSettings,
            child: Text(_saving ? 'Menyimpan...' : 'Simpan Perubahan'),
          ),
        ],
      ),
    );
  }

  Widget _displayDetailCard() {
    return _detailCard(
      title: 'Tampilan aplikasi',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ValueListenableBuilder<ThemeMode>(
            valueListenable: ThemeController.mode,
            builder: (context, mode, _) => SegmentedButton<ThemeMode>(
              segments: const [
                ButtonSegment(
                    value: ThemeMode.light,
                    icon: Icon(Icons.light_mode_outlined),
                    label: Text('Terang')),
                ButtonSegment(
                    value: ThemeMode.dark,
                    icon: Icon(Icons.dark_mode_outlined),
                    label: Text('Gelap')),
                ButtonSegment(
                    value: ThemeMode.system,
                    icon: Icon(Icons.brightness_auto_outlined),
                    label: Text('Sistem')),
              ],
              selected: {mode},
              onSelectionChanged: (s) => _setTheme(s.first),
            ),
          ),
          const SizedBox(height: 16),
          const Text('Ukuran teks',
              style: TextStyle(
                  fontWeight: FontWeight.w700, fontSize: TaskTypography.label)),
          const SizedBox(height: 8),
          ValueListenableBuilder<double>(
            valueListenable: FontScaleController.scale,
            builder: (context, selected, _) => Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final value in FontScaleController.options)
                  ChoiceChip(
                    label: Text(FontScaleController.label(value)),
                    selected: (selected - value).abs() < .001,
                    onSelected: (_) =>
                        unawaited(FontScaleController.set(value)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text('Berlaku ke seluruh halaman aplikasi',
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  color: taskMuted(context))),
        ],
      ),
    );
  }

  Widget _backupDetailCard() {
    return _detailCard(
      title: 'Backup data',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
              'Simpan snapshot seluruh database ke perangkat sebelum perubahan besar.',
              style: TextStyle(fontSize: TaskTypography.secondary)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Backup otomatis harian',
                style: TextStyle(fontSize: TaskTypography.label)),
            subtitle: const Text(
                'Berjalan saat app dibuka bila backup terakhir lebih dari 24 jam.',
                style: TextStyle(fontSize: TaskTypography.secondary)),
            value: _autoBackup,
            onChanged: _toggleAutoBackup,
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _backingUp ? null : _backupNow,
            icon: _backingUp
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_alt, size: 18),
            label: Text(_backingUp ? 'Membackup...' : 'Backup Sekarang'),
          ),
        ],
      ),
    );
  }

  Widget _notificationsDetailCard() {
    return _detailCard(
      title: 'Notifikasi',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Notifikasi stok menipis',
                style: TextStyle(fontSize: TaskTypography.label)),
            subtitle: const Text('Beri tahu saat produk di bawah stok minimum.',
                style: TextStyle(fontSize: TaskTypography.secondary)),
            value: _notifyLowStock,
            onChanged: _toggleNotifyLowStock,
          ),
          Text('Pengingat harian dijadwalkan jam 09.00 WIB.',
              style: TextStyle(
                  fontSize: TaskTypography.secondary,
                  color: taskMuted(context))),
        ],
      ),
    );
  }

  Widget _logoApplicationDetailCard() {
    return _detailCard(
      title: 'Logo aplikasi',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              BrandLogo(api: widget.api, size: 64, radius: 16),
              const SizedBox(width: 14),
              const Expanded(
                child: Text(
                    'Tampil di splash, login, dan header menu. JPG/PNG/WebP maksimal 3 MB.',
                    style: TextStyle(fontSize: TaskTypography.secondary)),
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
    );
  }

  Widget _invoiceLogoDetailCard() {
    return _detailCard(
      title: 'Logo invoice',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _logoPreview(_settings['invoice_logo']?.toString() ?? ''),
              const SizedBox(width: 14),
              const Expanded(
                child: Text(
                    'Logo ini dipakai di kepala struk/invoice toko atau gudang. JPG/PNG/WebP maksimal 3 MB.',
                    style: TextStyle(fontSize: TaskTypography.secondary)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed:
                _uploadingLogo ? null : () => _pickLogo(key: 'invoice_logo'),
            icon: _uploadingLogo
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.receipt_long, size: 18),
            label:
                Text(_uploadingLogo ? 'Mengunggah...' : 'Ganti Logo Invoice'),
          ),
          if ((_settings['invoice_logo']?.toString().trim().isNotEmpty ??
              false)) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _uploadingLogo ? null : _removeInvoiceLogo,
              icon: const Icon(Icons.delete_outline),
              label: const Text('Hapus Logo Invoice'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _printerDetailCard() {
    return _detailCard(
      title: 'POS & Printer',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_canManageStore) ...[
            DropdownButtonFormField<String>(
              initialValue: _printerSize,
              decoration: const InputDecoration(
                  labelText: 'Ukuran printer', border: OutlineInputBorder()),
              items: const [
                DropdownMenuItem(value: '58', child: Text('58 mm')),
                DropdownMenuItem(value: '80', child: Text('80 mm')),
              ],
              onChanged: (v) => setState(() => _printerSize = v ?? '80'),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Auto-print struk setelah bayar',
                  style: TextStyle(fontSize: TaskTypography.label)),
              value: _autoPrint,
              onChanged: (v) => setState(() => _autoPrint = v),
            ),
            FilledButton(
              onPressed: _saving ? null : _saveSettings,
              child: Text(_saving ? 'Menyimpan...' : 'Simpan Pengaturan POS'),
            ),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              Icon(Icons.print, size: 18, color: ink(context)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  _printerLabel.isEmpty
                      ? 'Belum ada printer tersimpan.'
                      : 'Printer aktif: $_printerLabel',
                  style: TextStyle(fontSize: 12, color: taskMuted(context)),
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
              'Printer yang dipilih tersimpan otomatis dan dipakai untuk struk, barcode, dan penutupan.',
              style: TextStyle(fontSize: TaskTypography.secondary)),
        ],
      ),
    );
  }

  Widget _branchesDetailCard() {
    return _detailCard(
      title: 'Cabang & Gudang (${_branches.length})',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton.icon(
              onPressed: _createBranch,
              icon: const Icon(Icons.add),
              label: const Text('Tambah Cabang'),
            ),
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
    );
  }

  Widget _buildDetailSection(BuildContext context, String section) {
    final children = <Widget>[];
    switch (section) {
      case 'store':
        if (_canManageStore) {
          children.addAll([
            _profileDetailCard(),
            const SizedBox(height: 10),
            _logoApplicationDetailCard(),
            const SizedBox(height: 10),
            _invoiceLogoDetailCard(),
          ]);
        }
        break;
      case 'category':
        if (_canManageStore) {
          children.add(CategorySettingsCard(
              api: widget.api, canDelete: widget.role == 'owner'));
        }
        break;
      case 'printer':
        children.add(_printerDetailCard());
        break;
      case 'display':
        children.add(_displayDetailCard());
        break;
      case 'data':
        if (widget.role == 'owner') children.add(_backupDetailCard());
        children
            .addAll([const SizedBox(height: 10), _notificationsDetailCard()]);
        break;
      case 'notifications':
        children.add(_notificationsDetailCard());
        break;
      case 'branches':
        if (widget.role == 'owner') children.add(_branchesDetailCard());
        break;
    }
    if (children.isEmpty) {
      children.add(_detailCard(
          title: 'Tidak tersedia',
          child: const Text('Pengaturan ini tidak tersedia untuk akun Anda.')));
    }
    return ListView(
      key: ValueKey('settings-detail-$section'),
      padding: const EdgeInsets.all(12),
      children: children,
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    if (widget.section != null) {
      return _buildDetailSection(context, widget.section!);
    }
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        if (['owner', 'manager', 'admin'].contains(widget.role))
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
                          labelText: 'Nama toko',
                          border: OutlineInputBorder())),
                  const SizedBox(height: 8),
                  TextField(
                      controller: _address,
                      minLines: 1,
                      maxLines: 3,
                      keyboardType: TextInputType.multiline,
                      inputFormatters: [maxLinesFormatter(3)],
                      decoration: const InputDecoration(
                          labelText: 'Alamat',
                          helperText: 'Maksimal 3 baris',
                          border: OutlineInputBorder())),
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
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                          labelText:
                              'Header struk (maks 4 baris, bisa beberapa no HP)',
                          border: OutlineInputBorder())),
                  const SizedBox(height: 8),
                  TextField(
                      controller: _receiptContacts,
                      minLines: 2,
                      maxLines: 5,
                      decoration: const InputDecoration(
                          labelText: 'Kontak kepala nota',
                          hintText: 'WA 1: 08...\nWA 2: 08...\nInstagram: @...',
                          helperText: 'Satu baris untuk setiap kontak.',
                          border: OutlineInputBorder())),
                  const SizedBox(height: 8),
                  TextField(
                      controller: _receiptFooter,
                      decoration: const InputDecoration(
                          labelText: 'Footer struk',
                          border: OutlineInputBorder())),
                  const SizedBox(height: 8),
                  TextField(
                      controller: _receiptNote,
                      decoration: const InputDecoration(
                          labelText: 'Catatan struk',
                          border: OutlineInputBorder())),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _printerSize,
                    decoration: const InputDecoration(
                        labelText: 'Ukuran printer',
                        border: OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(value: '58', child: Text('58 mm')),
                      DropdownMenuItem(value: '80', child: Text('80 mm')),
                    ],
                    onChanged: (v) => setState(() => _printerSize = v ?? '80'),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Auto-print struk setelah bayar',
                        style: TextStyle(fontSize: 13)),
                    value: _autoPrint,
                    onChanged: (v) => setState(() => _autoPrint = v),
                  ),
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
        if (['owner', 'manager', 'admin'].contains(widget.role))
          CategorySettingsCard(
            api: widget.api,
            canDelete: widget.role == 'owner',
          ),
        const SizedBox(height: 10),
        GlassCard(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text('Tampilan',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: TaskTypography.cardTitle)),
                const SizedBox(height: 8),
                ValueListenableBuilder<ThemeMode>(
                  valueListenable: ThemeController.mode,
                  builder: (context, mode, _) => SegmentedButton<ThemeMode>(
                    segments: const [
                      ButtonSegment(
                          value: ThemeMode.light,
                          icon: Icon(Icons.light_mode_outlined),
                          label: Text('Terang')),
                      ButtonSegment(
                          value: ThemeMode.dark,
                          icon: Icon(Icons.dark_mode_outlined),
                          label: Text('Gelap')),
                      ButtonSegment(
                          value: ThemeMode.system,
                          icon: Icon(Icons.brightness_auto_outlined),
                          label: Text('Sistem')),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) => _setTheme(s.first),
                  ),
                ),
                const SizedBox(height: 14),
                const Text('Ukuran teks',
                    style: TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: TaskTypography.label)),
                const SizedBox(height: 8),
                ValueListenableBuilder<double>(
                  valueListenable: FontScaleController.scale,
                  builder: (context, selected, _) => Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final value in FontScaleController.options)
                        ChoiceChip(
                          label: Text(FontScaleController.label(value)),
                          selected: (selected - value).abs() < .001,
                          onSelected: (_) =>
                              unawaited(FontScaleController.set(value)),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text('Berlaku ke seluruh halaman aplikasi',
                    style: TextStyle(
                        fontSize: TaskTypography.secondary,
                        color: taskMuted(context))),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (widget.role == 'owner')
          GlassCard(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Backup Data',
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: TaskTypography.cardTitle)),
                  const SizedBox(height: 6),
                  const Text(
                      'Simpan snapshot seluruh database ke perangkat. Disarankan rutin sebelum update besar.',
                      style: TextStyle(fontSize: TaskTypography.secondary)),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Backup otomatis harian',
                        style: TextStyle(fontSize: TaskTypography.label)),
                    subtitle: const Text(
                        'Saat app dibuka, otomatis backup bila > 24 jam sejak terakhir.',
                        style: TextStyle(fontSize: TaskTypography.secondary)),
                    value: _autoBackup,
                    onChanged: _toggleAutoBackup,
                  ),
                  const SizedBox(height: 8),
                  FilledButton.icon(
                    onPressed: _backingUp ? null : _backupNow,
                    icon: _backingUp
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.save_alt, size: 18),
                    label:
                        Text(_backingUp ? 'Membackup...' : 'Backup Sekarang'),
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
                const Text('Notifikasi',
                    style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: TaskTypography.cardTitle)),
                const SizedBox(height: 6),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Notifikasi stok menipis',
                      style: TextStyle(fontSize: TaskTypography.label)),
                  subtitle: const Text(
                      'Muncul saat ada produk di bawah stok minimum.',
                      style: TextStyle(fontSize: TaskTypography.secondary)),
                  value: _notifyLowStock,
                  onChanged: _toggleNotifyLowStock,
                ),
                const Text(
                    'Pengingat harian jam 09.00 WIB otomatis dijadwalkan untuk cek stok & backup.',
                    style: TextStyle(fontSize: TaskTypography.secondary)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (['owner', 'manager', 'admin'].contains(widget.role))
          GlassCard(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Logo Aplikasi',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      BrandLogo(api: widget.api, size: 64, radius: 16),
                      const SizedBox(width: 14),
                      const Expanded(
                        child: Text(
                            'Logo tampil di splash, halaman login, dan header menu. Format JPG/PNG/WebP maks 3 MB.',
                            style: TextStyle(fontSize: 12)),
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
                    label:
                        Text(_uploadingLogo ? 'Mengunggah...' : 'Ganti Logo'),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 10),
        if (['owner', 'manager', 'admin'].contains(widget.role))
          GlassCard(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Logo Toko (Kepala Invoice)',
                      style:
                          TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _logoPreview(_settings['invoice_logo']?.toString() ?? ''),
                      const SizedBox(width: 14),
                      const Expanded(
                        child: Text(
                            'Logo ini dipakai di kepala struk/invoice toko & gudang ini. Format JPG/PNG/WebP maks 3 MB.',
                            style: TextStyle(fontSize: 12)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  FilledButton.icon(
                    onPressed: _uploadingLogo
                        ? null
                        : () => _pickLogo(key: 'invoice_logo'),
                    icon: _uploadingLogo
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.receipt_long, size: 18),
                    label: Text(
                        _uploadingLogo ? 'Mengunggah...' : 'Ganti Logo Toko'),
                  ),
                  if ((_settings['invoice_logo']
                          ?.toString()
                          .trim()
                          .isNotEmpty ??
                      false)) ...[
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _uploadingLogo ? null : _removeInvoiceLogo,
                      icon: const Icon(Icons.delete_outline),
                      label: const Text('Hapus Logo Invoice'),
                    ),
                  ],
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
                    style:
                        TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.print, size: 18, color: ink(context)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _printerLabel.isEmpty
                            ? 'Belum ada printer tersimpan.'
                            : 'Printer aktif: $_printerLabel',
                        style:
                            TextStyle(fontSize: 12, color: taskMuted(context)),
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
                    style: TextStyle(fontSize: 12)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (widget.role == 'owner')
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
