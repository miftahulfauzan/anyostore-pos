// ignore_for_file: prefer_const_constructors

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'dart:convert';

import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'backup_service.dart';
import 'category_settings_card.dart';
import 'font_scale_controller.dart';
import 'media_mime.dart';
import 'notification_service.dart';
import 'opname_reminder.dart';
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
  double? _draftScale;
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
  final _receiptFooter = TextEditingController();
  final _receiptNote = TextEditingController();
  String _printerSize = '80';
  bool _autoPrint = true;
  bool _backingUp = false;
  bool _autoBackup = false;
  bool _notifyLowStock = true;
  bool _opnameEnabled = false;
  Set<int> _opnameDays = {1};
  List<TimeOfDay> _opnameTimes = const [TimeOfDay(hour: 9, minute: 0)];

  @override
  void initState() {
    super.initState();
    // Halaman Tampilan hanya memakai preferensi lokal (tema & ukuran teks),
    // jadi tidak perlu menunggu setelan toko dari server.
    if (widget.section == 'display') {
      _loading = false;
      return;
    }
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
      final opname = await OpnameReminderSettings.load();
      final savedPrinter = await PrinterService().savedPrinter();
      if (mounted) {
        setState(() {
          _autoBackup = autoBackup;
          _notifyLowStock = notifyLowStock;
          _opnameEnabled = opname.enabled;
          _opnameDays = {...opname.days};
          _opnameTimes = [...opname.times];
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
  bool get _dark => Theme.of(context).brightness == Brightness.dark;

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

  Widget _storeSectionCard(
    BuildContext context, {
    required String title,
    required String hint,
    required IconData icon,
    required Color color,
    required List<Widget> children,
  }) {
    return GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, size: 14, color: color),
                ),
                const SizedBox(width: 8),
                Text(title,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                const Spacer(),
                Flexible(
                  child: Text(hint,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w600,
                          color: taskMuted(context))),
                ),
              ],
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _storeField(
    TextEditingController controller,
    String label, {
    String? hint,
    IconData? icon,
    int maxLines = 1,
    List<TextInputFormatter>? formatters,
    String? helper,
    TextInputType? keyboard,
  }) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: taskBorder(context)),
    );
    return TextField(
      controller: controller,
      minLines: 1,
      maxLines: maxLines,
      keyboardType: keyboard,
      inputFormatters: formatters,
      style: TextStyle(fontSize: 12, color: ink(context)),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        helperText: helper,
        isDense: true,
        filled: true,
        fillColor: _dark ? const Color(0xFF162132) : const Color(0xFFFBFCFE),
        prefixIcon: icon == null
            ? null
            : Icon(icon, size: 17, color: taskMuted(context)),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
        border: border,
        enabledBorder: border,
        focusedBorder: border.copyWith(
            borderSide: BorderSide(
                color: Theme.of(context).colorScheme.primary, width: 1.6)),
        labelStyle: TextStyle(fontSize: 11.5, color: taskMuted(context)),
        hintStyle: TextStyle(
            fontSize: 11.5, color: taskMuted(context).withValues(alpha: .72)),
        helperStyle: TextStyle(fontSize: 9.5, color: taskMuted(context)),
      ),
    );
  }

  Widget _storeHeroCard() {
    return AnimatedBuilder(
      animation: Listenable.merge([_name, _address, _phone, _email]),
      builder: (context, _) {
        final name =
            _name.text.trim().isEmpty ? 'Nama toko' : _name.text.trim();
        final address = _address.text.trim();
        final phone = _phone.text.trim();
        final email = _email.text.trim();
        return Container(
          padding: const EdgeInsets.fromLTRB(14, 13, 14, 13),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF1E3A5F), Color(0xFF2B5688)],
            ),
            borderRadius: BorderRadius.circular(16),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x261E3A5F),
                  blurRadius: 16,
                  offset: Offset(0, 6)),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  BrandLogo(api: widget.api, size: 46, radius: 13),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -.2,
                                color: Colors.white)),
                        if (address.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(address,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontSize: 9.5,
                                  height: 1.4,
                                  color: Color(0xC7FFFFFF))),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (phone.isNotEmpty || email.isNotEmpty) ...[
                const SizedBox(height: 9),
                Wrap(
                  spacing: 5,
                  runSpacing: 5,
                  children: [
                    if (phone.isNotEmpty)
                      _heroChip(Icons.phone_outlined, phone),
                    if (email.isNotEmpty) _heroChip(Icons.mail_outline, email),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _heroChip(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(
          color: const Color(0x24FFFFFF),
          borderRadius: BorderRadius.circular(99),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 10, color: const Color(0xE6FFFFFF)),
            const SizedBox(width: 4),
            Text(text,
                style: const TextStyle(
                    fontSize: 8.5,
                    fontWeight: FontWeight.w700,
                    color: Color(0xF2FFFFFF))),
          ],
        ),
      );

  Widget _identityDetailCard() {
    return _storeSectionCard(
      context,
      title: 'Identitas toko',
      hint: 'Tampil di invoice',
      icon: Icons.storefront_outlined,
      color: _dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8),
      children: [
        _storeField(_name, 'Nama toko', icon: Icons.storefront_outlined),
        const SizedBox(height: 8),
        _storeField(_address, 'Alamat',
            maxLines: 3,
            formatters: [maxLinesFormatter(3)],
            helper: 'Maksimal 3 baris, tampil apa adanya di invoice'),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: _storeField(_phone, 'Telepon',
                  icon: Icons.phone_outlined, keyboard: TextInputType.phone),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _storeField(_npwp, 'NPWP', icon: Icons.badge_outlined),
            ),
          ],
        ),
        const SizedBox(height: 8),
        _storeField(_email, 'Email',
            icon: Icons.mail_outline, keyboard: TextInputType.emailAddress),
      ],
    );
  }

  Widget _invoiceTextDetailCard() {
    return _storeSectionCard(
      context,
      title: 'Invoice & struk',
      hint: 'Teks cetak',
      icon: Icons.receipt_long_outlined,
      color: const Color(0xFFB45309),
      children: [
        _storeField(_invoicePrefix, 'Prefix invoice',
            hint: 'INV', icon: Icons.tag_rounded),
        const SizedBox(height: 8),
        _storeField(_receiptHeader, 'Header struk',
            maxLines: 4,
            formatters: [maxLinesFormatter(4)],
            helper: 'Maksimal 4 baris'),
        const SizedBox(height: 8),
        _storeField(_receiptFooter, 'Footer struk'),
        const SizedBox(height: 8),
        _storeField(_receiptNote, 'Catatan struk'),
      ],
    );
  }

  Widget _logoRowCard() {
    final invoiceLogo = _settings['invoice_logo']?.toString().trim() ?? '';
    return GlassCard(
      child: Padding(
        padding: const EdgeInsets.all(13),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: const Color(0xFF6D28D9).withValues(alpha: .12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.image_outlined,
                      size: 14, color: Color(0xFF6D28D9)),
                ),
                const SizedBox(width: 8),
                Text('Logo',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                const Spacer(),
                Flexible(
                  child: Text('JPG / PNG maks 3 MB',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 8.5,
                          fontWeight: FontWeight.w600,
                          color: taskMuted(context))),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: _logoTile(
                    label: 'Logo aplikasi',
                    preview: BrandLogo(api: widget.api, size: 56, radius: 14),
                    actions: [
                      _logoAction('Ganti', _uploadingLogo ? null : _pickLogo),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _logoTile(
                    label: 'Logo invoice',
                    preview: _logoPreview(invoiceLogo),
                    actions: [
                      _logoAction(
                          'Ganti',
                          _uploadingLogo
                              ? null
                              : () => _pickLogo(key: 'invoice_logo')),
                      if (invoiceLogo.isNotEmpty)
                        _logoAction(
                            'Hapus', _uploadingLogo ? null : _removeInvoiceLogo,
                            danger: true),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _logoTile(
      {required String label,
      required Widget preview,
      required List<Widget> actions}) {
    return Container(
      padding: const EdgeInsets.all(9),
      decoration: BoxDecoration(
        color: _dark ? const Color(0xFF162132) : const Color(0xFFFBFCFE),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        children: [
          SizedBox(height: 58, child: Center(child: preview)),
          const SizedBox(height: 6),
          Text(label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          const SizedBox(height: 3),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: actions,
          ),
        ],
      ),
    );
  }

  Widget _logoAction(String label, VoidCallback? onTap,
          {bool danger = false}) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
          child: Text(label,
              style: TextStyle(
                  fontSize: 8.5,
                  fontWeight: FontWeight.w800,
                  color: danger
                      ? kTaskTerracotta
                      : Theme.of(context).colorScheme.primary)),
        ),
      );

  Widget _receiptPreviewCard() {
    return AnimatedBuilder(
      animation: Listenable.merge([_name, _address]),
      builder: (context, _) {
        final name =
            _name.text.trim().isEmpty ? 'Nama toko' : _name.text.trim();
        final address = _address.text.trim();
        return _storeSectionCard(
          context,
          title: 'Pratinjau struk',
          hint: '$_printerSize mm',
          icon: Icons.point_of_sale_outlined,
          color: const Color(0xFF0F766E),
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
              decoration: BoxDecoration(
                color:
                    _dark ? const Color(0xFF162132) : const Color(0xFFF8FAFC),
                border: Border.all(color: taskBorder(context)),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                children: [
                  Text(name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                  if (address.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(address,
                        maxLines: 2,
                        textAlign: TextAlign.center,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 8.5, color: taskMuted(context))),
                  ],
                  const SizedBox(height: 7),
                  Text('Kemeja Denim A100',
                      style:
                          TextStyle(fontSize: 8.5, color: taskMuted(context))),
                  const SizedBox(height: 1),
                  Text('Rp130.000',
                      style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _storeSaveCard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _saving ? null : _saveSettings,
            icon: const Icon(Icons.save_outlined, size: 18),
            label: Text(_saving ? 'Menyimpan...' : 'Simpan Perubahan'),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 46),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('Perubahan langsung dipakai di struk & invoice berikutnya.',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: TaskTypography.micro, color: taskMuted(context))),
      ],
    );
  }

  Widget _displayDetailCard() {
    return _detailCard(
      title: 'Tampilan aplikasi',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _displaySectionLabel('TEMA', Theme.of(context).colorScheme.primary),
          const SizedBox(height: 8),
          ValueListenableBuilder<ThemeMode>(
            valueListenable: ThemeController.mode,
            builder: (context, mode, _) => Row(
              children: [
                _themeCard(mode, ThemeMode.light, 'Terang'),
                const SizedBox(width: 8),
                _themeCard(mode, ThemeMode.dark, 'Gelap'),
                const SizedBox(width: 8),
                _themeCard(mode, ThemeMode.system, 'Sistem'),
              ],
            ),
          ),
          const SizedBox(height: 18),
          ValueListenableBuilder<double>(
            valueListenable: FontScaleController.scale,
            builder: (context, saved, _) {
              final value = _draftScale ?? saved;
              final primary = Theme.of(context).colorScheme.primary;
              const options = FontScaleController.options;
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      _displaySectionLabel('UKURAN TEKS', kTaskTeal),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: primary.withValues(alpha: .1),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: Text(FontScaleController.label(value),
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: primary)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  SliderTheme(
                    data: SliderTheme.of(context).copyWith(
                      trackHeight: 4,
                      activeTrackColor: primary,
                      inactiveTrackColor: taskBorder(context),
                      thumbColor: Colors.white,
                      overlayColor: primary.withValues(alpha: .12),
                      thumbShape: const RoundSliderThumbShape(
                          enabledThumbRadius: 8, elevation: 2),
                      overlayShape:
                          const RoundSliderOverlayShape(overlayRadius: 16),
                      tickMarkShape:
                          const RoundSliderTickMarkShape(tickMarkRadius: 0),
                    ),
                    child: Slider(
                      value: value.clamp(options.first, options.last),
                      min: options.first,
                      max: options.last,
                      divisions: options.length - 1,
                      onChanged: (v) => setState(() => _draftScale = v),
                      onChangeEnd: (v) async {
                        await FontScaleController.set(v);
                        if (mounted) setState(() => _draftScale = null);
                      },
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Row(
                      children: [
                        Text('A',
                            style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w800,
                                color: taskMuted(context))),
                        for (final option in options)
                          Expanded(
                            child: Text(FontScaleController.label(option),
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                    fontSize: 8,
                                    fontWeight: FontWeight.w700,
                                    color: (option - value).abs() < .001
                                        ? primary
                                        : taskMuted(context))),
                          ),
                        Text('A',
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: taskMuted(context))),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  _textPreview(value),
                ],
              );
            },
          ),
          const SizedBox(height: 10),
          Text('Berlaku ke seluruh halaman aplikasi.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: TaskTypography.micro, color: taskMuted(context))),
        ],
      ),
    );
  }

  Widget _displaySectionLabel(String text, Color dotColor) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
                color: dotColor, borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(width: 6),
          Text(text,
              style: TextStyle(
                  fontSize: 9,
                  letterSpacing: 1,
                  fontWeight: FontWeight.w800,
                  color: taskMuted(context))),
        ],
      );

  Widget _themeCard(ThemeMode mode, ThemeMode value, String label) {
    final selected = mode == value;
    final primary = Theme.of(context).colorScheme.primary;
    return Expanded(
      child: InkWell(
        onTap: () => _setTheme(value),
        borderRadius: BorderRadius.circular(13),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.all(7),
          decoration: BoxDecoration(
            color: taskSurface(context),
            borderRadius: BorderRadius.circular(13),
            border: Border.all(
                color: selected ? primary : taskBorder(context),
                width: selected ? 1.5 : 1),
            boxShadow: selected
                ? [
                    BoxShadow(
                        color: primary.withValues(alpha: .12),
                        blurRadius: 10,
                        offset: const Offset(0, 3)),
                  ]
                : null,
          ),
          child: Stack(
            children: [
              Column(
                children: [
                  _themePreview(value),
                  const SizedBox(height: 6),
                  Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: ink(context))),
                ],
              ),
              if (selected)
                Positioned(
                  top: 0,
                  right: 0,
                  child: Container(
                    width: 16,
                    height: 16,
                    decoration:
                        BoxDecoration(color: primary, shape: BoxShape.circle),
                    child: const Icon(Icons.check_rounded,
                        size: 10, color: Colors.white),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _themePreview(ThemeMode mode) {
    if (mode == ThemeMode.system) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: SizedBox(
          height: 50,
          child: Row(
            children: [
              Expanded(child: _miniPreview(dark: false)),
              Expanded(child: _miniPreview(dark: true)),
            ],
          ),
        ),
      );
    }
    return _miniPreview(dark: mode == ThemeMode.dark);
  }

  Widget _miniPreview({required bool dark}) => Container(
        height: 50,
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: dark ? const Color(0xFF101A2B) : const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(9),
          border: Border.all(
              color: dark ? const Color(0xFF243B53) : const Color(0xFFE2E8F0)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 6,
              decoration: BoxDecoration(
                  color: dark ? const Color(0xFF2E5D8F) : kTaskDark,
                  borderRadius: BorderRadius.circular(3)),
            ),
            const SizedBox(height: 4),
            Container(
              height: 4,
              decoration: BoxDecoration(
                  color:
                      dark ? const Color(0xFF334155) : const Color(0xFFDBE3EE),
                  borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 3),
            FractionallySizedBox(
              widthFactor: .6,
              child: Container(
                height: 4,
                decoration: BoxDecoration(
                    color: dark
                        ? const Color(0xFF334155)
                        : const Color(0xFFDBE3EE),
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
          ],
        ),
      );

  Widget _textPreview(double scale) {
    final primary = Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.all(11),
      decoration: BoxDecoration(
        color: taskSurface(context),
        borderRadius: BorderRadius.circular(13),
        border: Border.all(color: taskBorder(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('PRATINJAU',
              style: TextStyle(
                  fontSize: 8,
                  letterSpacing: .9,
                  fontWeight: FontWeight.w800,
                  color: taskMuted(context))),
          const SizedBox(height: 8),
          MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                      color: primary.withValues(alpha: .1),
                      borderRadius: BorderRadius.circular(9)),
                  child: Icon(Icons.receipt_long_outlined,
                      size: 16, color: primary),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Kemeja Denim A100',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 11.5,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                      const SizedBox(height: 1),
                      Text('Selesai · Tunai',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 9, color: taskMuted(context))),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                Text('Rp130.000',
                    style: TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
              ],
            ),
          ),
          const SizedBox(height: 6),
          Text('Contoh tampilan mengikuti ukuran teks yang dipilih.',
              style: TextStyle(
                  fontSize: TaskTypography.micro, color: taskMuted(context))),
        ],
      ),
    );
  }

  Widget _backupDetailCard() {
    return AppSectionCard(
      icon: Icons.cloud_upload_outlined,
      color: const Color(0xFF1D4ED8),
      title: 'Backup data',
      hint: 'Snapshot database',
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFF1D4ED8).withValues(alpha: _dark ? .16 : .07),
            border: Border.all(
                color: const Color(0xFF1D4ED8).withValues(alpha: .18)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Icon(Icons.shield_outlined,
                  size: 18,
                  color: _dark
                      ? const Color(0xFF93C5FD)
                      : const Color(0xFF1D4ED8)),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                    'Simpan snapshot seluruh database ke perangkat sebelum perubahan besar.',
                    style: TextStyle(
                        fontSize: 10.5, height: 1.45, color: ink(context))),
              ),
            ],
          ),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Backup otomatis harian',
              style: TextStyle(
                  fontSize: TaskTypography.label, fontWeight: FontWeight.w700)),
          subtitle: const Text(
              'Berjalan saat app dibuka bila backup terakhir lebih dari 24 jam.',
              style: TextStyle(fontSize: TaskTypography.secondary)),
          value: _autoBackup,
          onChanged: _toggleAutoBackup,
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _backingUp ? null : _backupNow,
            icon: _backingUp
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.save_alt, size: 18),
            label: Text(_backingUp ? 'Membackup...' : 'Backup Sekarang'),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _notificationsDetailCard() {
    final primary = Theme.of(context).colorScheme.primary;
    return _storeSectionCard(
      context,
      title: 'Notifikasi',
      hint: 'Pengingat operasional',
      icon: Icons.notifications_active_outlined,
      color: const Color(0xFFB45309),
      children: [
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Stok menipis',
              style: TextStyle(
                  fontSize: TaskTypography.label, fontWeight: FontWeight.w700)),
          subtitle: const Text('Beri tahu saat produk di bawah stok minimum.',
              style: TextStyle(fontSize: TaskTypography.secondary)),
          value: _notifyLowStock,
          onChanged: _toggleNotifyLowStock,
        ),
        Divider(height: 14, color: taskBorder(context)),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Jadwal Stock Opname',
              style: TextStyle(
                  fontSize: TaskTypography.label, fontWeight: FontWeight.w700)),
          subtitle: const Text('Pengingat rutin untuk menghitung stok fisik.',
              style: TextStyle(fontSize: TaskTypography.secondary)),
          value: _opnameEnabled,
          onChanged: (value) async {
            setState(() => _opnameEnabled = value);
            if (value) return;
            final settings = OpnameReminderSettings(
                enabled: false, days: _opnameDays, times: _opnameTimes);
            await settings.save();
            await NotificationService.scheduleOpnameReminder(settings);
            if (!mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                content: Text('Pengingat stock opname dimatikan.')));
          },
        ),
        if (_opnameEnabled) _opnameEditor(primary),
        const SizedBox(height: 6),
        Text('Pengingat harian lain dijadwalkan jam 09.00 WIB.',
            style: TextStyle(
                fontSize: TaskTypography.secondary, color: taskMuted(context))),
      ],
    );
  }

  Widget _opnameEditor(Color primary) {
    final days = _opnameDays.toList()..sort();
    final settings = OpnameReminderSettings(
        enabled: _opnameEnabled, days: _opnameDays, times: _opnameTimes);
    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: _dark ? const Color(0xFF162132) : const Color(0xFFFBFCFE),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('TANGGAL (SETIAP BULAN)', style: _opnameCapStyle),
          const SizedBox(height: 6),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              for (final day in days)
                Container(
                  width: 28,
                  height: 28,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                      color: primary, borderRadius: BorderRadius.circular(9)),
                  child: Text('$day',
                      style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                ),
              InkWell(
                onTap: _pickOpnameDays,
                borderRadius: BorderRadius.circular(9),
                child: Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: taskSurface(context),
                    border: Border.all(color: taskBorder(context)),
                    borderRadius: BorderRadius.circular(9),
                  ),
                  child: Icon(Icons.add, size: 15, color: taskMuted(context)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text('BERAPA KALI SEHARI', style: _opnameCapStyle),
          const SizedBox(height: 6),
          Row(
            children: [
              for (var count = 1;
                  count <= OpnameReminderSettings.maxTimesPerDay;
                  count++) ...[
                if (count > 1) const SizedBox(width: 5),
                Expanded(
                  child: InkWell(
                    onTap: () => _setOpnameTimesCount(count),
                    borderRadius: BorderRadius.circular(9),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      decoration: BoxDecoration(
                        color: _opnameTimes.length == count
                            ? primary
                            : taskSurface(context),
                        border: Border.all(
                            color: _opnameTimes.length == count
                                ? primary
                                : taskBorder(context)),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: Text('$count×',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: _opnameTimes.length == count
                                  ? Theme.of(context).colorScheme.onPrimary
                                  : taskMuted(context))),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Text('JAM', style: _opnameCapStyle),
          const SizedBox(height: 6),
          Wrap(
            spacing: 5,
            runSpacing: 5,
            children: [
              for (var index = 0; index < _opnameTimes.length; index++)
                InkWell(
                  onTap: () => _pickOpnameTime(index),
                  borderRadius: BorderRadius.circular(9),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: taskSurface(context),
                      border: Border.all(color: primary.withValues(alpha: .4)),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text(
                        OpnameReminderSettings.formatTime(_opnameTimes[index]),
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: primary)),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
            decoration: BoxDecoration(
              color: primary.withValues(alpha: _dark ? .16 : .08),
              border: Border.all(color: primary.withValues(alpha: .2)),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Text(settings.summary,
                style:
                    TextStyle(fontSize: 9, height: 1.45, color: ink(context))),
          ),
          const SizedBox(height: 9),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _saveOpnameReminder,
              icon: const Icon(Icons.notifications_active_outlined, size: 18),
              label: const Text('Simpan & Jadwalkan'),
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 42),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(11)),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text('Notifikasi muncul di HP walau aplikasi ditutup.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 8.5, color: taskMuted(context))),
        ],
      ),
    );
  }

  TextStyle get _opnameCapStyle => TextStyle(
        fontSize: 8.5,
        fontWeight: FontWeight.w800,
        letterSpacing: .7,
        color: taskMuted(context),
      );

  void _setOpnameTimesCount(int count) {
    final times = [..._opnameTimes];
    const defaults = [
      TimeOfDay(hour: 9, minute: 0),
      TimeOfDay(hour: 16, minute: 0),
      TimeOfDay(hour: 12, minute: 0),
      TimeOfDay(hour: 18, minute: 0),
    ];
    while (times.length < count) {
      times.add(defaults[times.length % defaults.length]);
    }
    if (times.length > count) times.removeRange(count, times.length);
    setState(() => _opnameTimes = times);
  }

  Future<void> _pickOpnameTime(int index) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _opnameTimes[index],
      helpText: 'Jam pengingat stock opname',
    );
    if (picked == null || !mounted) return;
    final times = [..._opnameTimes];
    times[index] = picked;
    setState(() => _opnameTimes = times);
  }

  Future<void> _pickOpnameDays() async {
    final selected = {..._opnameDays};
    final result = await showModalBottomSheet<Set<int>>(
      context: context,
      showDragHandle: true,
      backgroundColor: taskSurface(context),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Tanggal stock opname',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: ink(ctx))),
                const SizedBox(height: 3),
                Text(
                    'Pilih satu atau beberapa tanggal. Pengingat berulang setiap bulan.',
                    style: TextStyle(fontSize: 10.5, color: taskMuted(ctx))),
                const SizedBox(height: 10),
                ConstrainedBox(
                  constraints: BoxConstraints(
                      maxHeight: MediaQuery.sizeOf(ctx).height * .5),
                  child: SingleChildScrollView(
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (var day = 1; day <= 31; day++)
                          ChoiceChip(
                            label: Text('$day'),
                            selected: selected.contains(day),
                            showCheckmark: false,
                            onSelected: (on) => setSheet(() {
                              if (on) {
                                selected.add(day);
                              } else {
                                selected.remove(day);
                              }
                            }),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Batal'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: FilledButton(
                        onPressed: selected.isEmpty
                            ? null
                            : () => Navigator.pop(ctx, selected),
                        child: const Text('Terapkan'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (result == null || result.isEmpty || !mounted) return;
    setState(() => _opnameDays = result);
  }

  Future<void> _saveOpnameReminder() async {
    if (_opnameDays.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Pilih minimal satu tanggal')));
      return;
    }
    final settings = OpnameReminderSettings(
        enabled: _opnameEnabled, days: _opnameDays, times: _opnameTimes);
    await settings.save();
    await NotificationService.scheduleOpnameReminder(settings);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(_opnameEnabled
            ? 'Pengingat stock opname dijadwalkan.'
            : 'Pengingat stock opname dimatikan.')));
  }

  Widget _printerDetailCard() {
    final connected = _printerLabel.isNotEmpty;
    final teal = _dark ? const Color(0xFF6EE7B7) : const Color(0xFF0F766E);
    return AppSectionCard(
      icon: Icons.print_outlined,
      color: teal,
      title: 'POS & Printer',
      hint: '$_printerSize mm',
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: _dark ? const Color(0xFF162132) : const Color(0xFFFBFCFE),
            border: Border.all(color: taskBorder(context)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: teal.withValues(alpha: _dark ? .2 : .12),
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(Icons.print_outlined, size: 17, color: teal),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(connected ? 'Printer aktif' : 'Belum ada printer',
                        style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                    const SizedBox(height: 1),
                    Text(
                        connected
                            ? _printerLabel
                            : 'Pilih printer Bluetooth untuk mencetak struk.',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                            fontSize: 9.5, color: taskMuted(context))),
                  ],
                ),
              ),
              AppStatusPill(
                label: connected ? 'TERHUBUNG' : 'BELUM',
                fg: connected
                    ? (_dark
                        ? const Color(0xFF86EFAC)
                        : const Color(0xFF137A43))
                    : (_dark
                        ? const Color(0xFFCBD5E1)
                        : const Color(0xFF334155)),
                bg: connected
                    ? (_dark
                        ? const Color(0x2E86EFAC)
                        : const Color(0xFFDCFCE7))
                    : (_dark
                        ? const Color(0x2ECBD5E1)
                        : const Color(0xFFE2E8F0)),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Text('UKURAN KERTAS',
            style: TextStyle(
                fontSize: 8.5,
                fontWeight: FontWeight.w800,
                letterSpacing: .7,
                color: taskMuted(context))),
        const SizedBox(height: 6),
        Row(
          children: [
            for (final size in const ['58', '80']) ...[
              if (size != '58') const SizedBox(width: 6),
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _printerSize = size),
                  borderRadius: BorderRadius.circular(9),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: _printerSize == size
                          ? Theme.of(context).colorScheme.primary
                          : taskSurface(context),
                      border: Border.all(
                          color: _printerSize == size
                              ? Theme.of(context).colorScheme.primary
                              : taskBorder(context)),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text('$size mm',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: _printerSize == size
                                ? Theme.of(context).colorScheme.onPrimary
                                : taskMuted(context))),
                  ),
                ),
              ),
            ],
          ],
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Auto-print struk setelah bayar',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          value: _autoPrint,
          onChanged: (v) => setState(() => _autoPrint = v),
        ),
        const SizedBox(height: 4),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _choosePrinter,
                icon: const Icon(Icons.bluetooth, size: 16),
                label: const Text('Pilih Printer'),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 42),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10))),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _testPrinter,
                icon: const Icon(Icons.print, size: 16),
                label: const Text('Uji Cetak'),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 42),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10))),
              ),
            ),
          ],
        ),
        if (connected)
          TextButton(
            onPressed: _clearPrinter,
            child: const Text('Hapus printer tersimpan'),
          ),
        const SizedBox(height: 6),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _saving ? null : _saveSettings,
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11)),
            ),
            child: Text(_saving ? 'Menyimpan...' : 'Simpan Pengaturan POS'),
          ),
        ),
      ],
    );
  }

  Widget _branchesDetailCard() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text('Cabang & Gudang',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
            const SizedBox(width: 7),
            AppStatusPill(
              label: '${_branches.length}',
              fg: _dark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
              bg: _dark ? const Color(0x2ECBD5E1) : const Color(0xFFE2E8F0),
            ),
            const Spacer(),
            FilledButton.icon(
              onPressed: _createBranch,
              icon: const Icon(Icons.add, size: 18),
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
        const SizedBox(height: 8),
        for (final branch in _branches) _branchRow(branch),
      ],
    );
  }

  Widget _branchRow(Map<String, dynamic> branch) {
    final isWarehouse = branch['type'] == 'gudang';
    final active = branch['is_active'] != false;
    final isCurrent = '${branch['id']}' == '${_settings['branch_id']}';
    final color = isWarehouse
        ? (_dark ? const Color(0xFFFCD34D) : const Color(0xFFB45309))
        : (_dark ? const Color(0xFF93C5FD) : const Color(0xFF1D4ED8));
    final activeStyle = active
        ? (
            label: 'AKTIF',
            fg: _dark ? const Color(0xFF86EFAC) : const Color(0xFF137A43),
            bg: _dark ? const Color(0x2E86EFAC) : const Color(0xFFDCFCE7),
          )
        : (
            label: 'NONAKTIF',
            fg: _dark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C),
            bg: _dark ? const Color(0x2EFDA4AF) : const Color(0xFFFFE4E6),
          );
    return AppListCard(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(
              text: appInitial(branch['name']?.toString() ?? ''),
              fg: color,
              bg: color.withValues(alpha: _dark ? .2 : .12)),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(branch['name']?.toString() ?? '-',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                const SizedBox(height: 1),
                Text(
                    '${branch['product_count'] ?? 0} produk · ${branch['user_count'] ?? 0} pegawai',
                    style:
                        TextStyle(fontSize: 10.5, color: taskMuted(context))),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 4,
                  runSpacing: 4,
                  children: [
                    AppStatusPill(
                      label: isWarehouse ? 'GUDANG' : 'TOKO',
                      fg: color,
                      bg: color.withValues(alpha: _dark ? .2 : .12),
                    ),
                    AppStatusPill(
                        label: activeStyle.label,
                        fg: activeStyle.fg,
                        bg: activeStyle.bg),
                    if (isCurrent)
                      AppStatusPill(
                        label: 'CABANG AKTIF',
                        fg: _dark
                            ? const Color(0xFFCBD5E1)
                            : const Color(0xFF334155),
                        bg: _dark
                            ? const Color(0x2ECBD5E1)
                            : const Color(0xFFE2E8F0),
                      ),
                  ],
                ),
              ],
            ),
          ),
          if (!isCurrent)
            IconButton(
              onPressed: () => _deleteBranch(branch),
              icon: const Icon(Icons.delete_outline, size: 19),
              color: kTaskTerracotta,
              tooltip: 'Hapus cabang',
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
            _storeHeroCard(),
            const SizedBox(height: 10),
            _identityDetailCard(),
            const SizedBox(height: 10),
            _invoiceTextDetailCard(),
            const SizedBox(height: 10),
            _logoRowCard(),
            const SizedBox(height: 10),
            _receiptPreviewCard(),
            const SizedBox(height: 12),
            _storeSaveCard(),
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
                          labelText: 'Header struk (maks 4 baris)',
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
