import 'dart:async';

import 'package:flutter/material.dart';

import 'app_ui.dart';

import 'api_client.dart';
import 'branch_scope.dart';
import 'format.dart';
import 'task_ui.dart';

class CommissionsPage extends StatefulWidget {
  const CommissionsPage(
      {super.key, required this.api, required this.branchId, this.role});
  final ApiClient api;
  final int branchId;
  final String? role;

  @override
  State<CommissionsPage> createState() => _CommissionsPageState();
}

class _CommissionsPageState extends State<CommissionsPage> {
  String _tab = 'saya';
  List<Map<String, dynamic>> _rules = [];
  Map<String, dynamic>? _report;
  Map<String, dynamic>? _mine;
  bool _loading = true;
  String? _error;
  String _preset = 'bulan';
  String? _customStart;
  String? _customEnd;
  List<Map<String, dynamic>> _branches = [];
  int? _branchId;
  int _loadGeneration = 0;

  bool get _isOwner => widget.role == 'owner';

  /// Manager/Admin juga boleh melihat Laporan komisi semua pegawai.
  bool get _canManage => ['owner', 'manager', 'admin'].contains(widget.role);
  List<String> get _tabs {
    if (_isOwner) return ['saya', 'rules', 'report'];
    // Manager/Admin: hanya Saya + Laporan (Aturan khusus owner).
    if (_canManage) return ['saya', 'report'];
    return ['saya'];
  }

  (String, String) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    switch (_preset) {
      case 'today':
        return (d(now), d(now));
      case 'yesterday':
        final y = now.subtract(const Duration(days: 1));
        return (d(y), d(y));
      case '7d':
        return (d(now.subtract(const Duration(days: 6))), d(now));
      case '30d':
        return (d(now.subtract(const Duration(days: 29))), d(now));
      case 'lastmonth':
        final first = DateTime(now.year, now.month - 1, 1);
        final last = DateTime(now.year, now.month, 0);
        return (d(first), d(last));
      case 'custom':
        return (_customStart ?? d(now), _customEnd ?? d(now));
      default:
        return (
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
          d(now)
        );
    }
  }

  Future<void> _pickDate(bool start) async {
    final initial =
        DateTime.tryParse(start ? (_customStart ?? '') : (_customEnd ?? '')) ??
            DateTime.now().toUtc().add(const Duration(hours: 7));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().toUtc().add(const Duration(hours: 7)),
    );
    if (picked == null) return;
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    setState(() {
      if (start) {
        _customStart = d(picked);
      } else {
        _customEnd = d(picked);
      }
    });
    _load();
  }

  @override
  void initState() {
    super.initState();
    if (!_canManage) _tab = 'saya';
    if (_isOwner) {
      _branchId = BranchScope.active.value ?? widget.branchId;
      widget.api.activeBranchId = _branchId;
      BranchScope.active.addListener(_onBranchScopeChanged);
    }
    _load();
  }

  void _onBranchScopeChanged() {
    if (!_isOwner || !mounted) return;
    final branchId = BranchScope.active.value ?? widget.branchId;
    widget.api.activeBranchId = branchId;
    if (branchId == _branchId) return;
    setState(() => _branchId = branchId);
    _load();
  }

  @override
  void dispose() {
    if (_isOwner) BranchScope.active.removeListener(_onBranchScopeChanged);
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    bool isCurrent() => mounted && generation == _loadGeneration;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_isOwner && _branches.isEmpty) {
        try {
          final branches =
              (await widget.api.branches()).cast<Map<String, dynamic>>();
          if (!isCurrent()) return;
          setState(() => _branches = branches);
        } catch (_) {}
      }
      final (start, end) = _range;
      if (_tab == 'saya') {
        final data = await widget.api
            .commissionMine(start: start, end: end, branchId: _branchId);
        if (!isCurrent()) return;
        setState(() => _mine = data);
      } else if (_tab == 'report') {
        final data = await widget.api
            .commissionReport(start: start, end: end, branchId: _branchId);
        if (!isCurrent()) return;
        setState(() => _report = data);
      } else {
        final data = await widget.api.commissions();
        if (!isCurrent()) return;
        setState(() {
          _rules =
              ((data['rules'] as List?) ?? []).cast<Map<String, dynamic>>();
        });
      }
    } on ApiException catch (e) {
      if (isCurrent()) setState(() => _error = e.message);
    } finally {
      if (isCurrent()) setState(() => _loading = false);
    }
  }

  Future<void> _addRule() async {
    final name = TextEditingController();
    final reguler = TextEditingController(text: '0');
    final grosir = TextEditingController(text: '0');
    var global = true;
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Aturan Komisi (per pcs)'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                    controller: name,
                    decoration: const InputDecoration(
                        labelText: 'Nama aturan *',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Berlaku global (semua toko)'),
                  value: global,
                  onChanged: (v) => setDialogState(() => global = v),
                ),
                TextField(
                    controller: reguler,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Reguler (Rp/pcs)',
                        border: OutlineInputBorder())),
                const SizedBox(height: 8),
                TextField(
                    controller: grosir,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Grosir Seri (Rp/pcs)',
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
    if (name.text.trim().isEmpty) return;
    try {
      await widget.api.createCommissionRule({
        'name': name.text.trim(),
        'branch_id': global ? '' : '${widget.branchId}',
        'applies_to': 'all',
        'calculation_type': 'per_pcs_customer_tier',
        'commission_reguler_per_pcs':
            double.tryParse(reguler.text.replaceAll('.', '')) ?? 0,
        'commission_grosir_seri_per_pcs':
            double.tryParse(grosir.text.replaceAll('.', '')) ?? 0,
        'start_date': todayWib(),
      });
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _deleteRule(Map<String, dynamic> rule) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus aturan komisi?'),
        content: Text('${rule['name'] ?? ''} akan dihapus beserta catatannya.'),
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
      await widget.api.deleteCommissionRule(int.parse('${rule['id']}'));
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
            tabs: [
              for (final t in _tabs)
                (
                  value: t,
                  icon: switch (t) {
                    'saya' => Icons.person,
                    'rules' => Icons.rule,
                    'records' => Icons.list_alt,
                    _ => Icons.bar_chart,
                  },
                  label: switch (t) {
                    'saya' => 'Saya',
                    'rules' => 'Aturan',
                    'records' => 'Catatan',
                    _ => 'Laporan',
                  },
                ),
            ],
            selected: _tab,
            onChanged: (v) {
              setState(() => _tab = v);
              _load();
            },
          ),
        ),
        if (_tab == 'saya' || _tab == 'report')
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Column(
              children: [
                if (_isOwner && _branches.isNotEmpty && _tab == 'report')
                  AppSelectField<int?>(
                    value: _branchId ?? widget.branchId,
                    decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Toko',
                        border: OutlineInputBorder()),
                    items: [
                      for (final b in _branches)
                        DropdownMenuItem<int?>(
                            value: int.tryParse('${b['id']}'),
                            child: Text(b['name']?.toString() ?? '')),
                    ],
                    onChanged: (v) {
                      if (v != null && BranchScope.active.value != v) {
                        unawaited(BranchScope.request(context, v));
                      }
                    },
                  ),
                if (_isOwner && _branches.isNotEmpty && _tab == 'report')
                  const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: AppSelectField<String>(
                        value: _preset,
                        decoration: const InputDecoration(
                            isDense: true,
                            labelText: 'Periode',
                            border: OutlineInputBorder()),
                        items: const [
                          DropdownMenuItem(
                              value: 'today', child: Text('Hari ini')),
                          DropdownMenuItem(
                              value: 'yesterday', child: Text('Kemarin')),
                          DropdownMenuItem(
                              value: '7d', child: Text('7 hari terakhir')),
                          DropdownMenuItem(
                              value: '30d', child: Text('30 hari terakhir')),
                          DropdownMenuItem(
                              value: 'bulan', child: Text('Bulan ini')),
                          DropdownMenuItem(
                              value: 'lastmonth', child: Text('Bulan lalu')),
                          DropdownMenuItem(
                              value: 'custom', child: Text('Rentang custom')),
                        ],
                        onChanged: (v) {
                          setState(() => _preset = v ?? 'bulan');
                          _load();
                        },
                      ),
                    ),
                  ],
                ),
                if (_preset == 'custom') ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          readOnly: true,
                          onTap: () => _pickDate(true),
                          controller:
                              TextEditingController(text: _customStart ?? ''),
                          decoration: const InputDecoration(
                              isDense: true,
                              labelText: 'Dari',
                              border: OutlineInputBorder()),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          readOnly: true,
                          onTap: () => _pickDate(false),
                          controller:
                              TextEditingController(text: _customEnd ?? ''),
                          decoration: const InputDecoration(
                              isDense: true,
                              labelText: 'Sampai',
                              border: OutlineInputBorder()),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        Expanded(child: _buildBody()),
      ],
    );
  }

  String get _presetLabel => switch (_preset) {
        'today' => 'Hari ini',
        'yesterday' => 'Kemarin',
        '7d' => '7 hari terakhir',
        '30d' => '30 hari terakhir',
        'lastmonth' => 'Bulan lalu',
        'custom' => 'Rentang custom',
        _ => 'Bulan ini',
      };

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 30, color: kTaskTerracotta),
              const SizedBox(height: 8),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12.5, color: ink(context))),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Coba lagi'),
              ),
            ],
          ),
        ),
      );
    }
    switch (_tab) {
      case 'saya':
        return _buildMine();
      case 'report':
        return _buildReport();
      default:
        return _buildRules();
    }
  }

  // ===== Gaya bersama =====
  // Label memakai abu tua (taskMuted) + huruf kapital kecil; nilai memakai
  // ink supaya kontras di atas kartu putih, termasuk saat mode gelap.
  bool get _dark => Theme.of(context).brightness == Brightness.dark;

  Color get _blue => _dark ? kTaskAccentDark : const Color(0xFF1D4ED8);
  Color get _amber => _dark ? const Color(0xFFFCD34D) : const Color(0xFFB45309);
  Color get _teal => _dark ? const Color(0xFF6EE7B7) : const Color(0xFF0F766E);
  Color get _purple =>
      _dark ? const Color(0xFFC4B5FD) : const Color(0xFF6D28D9);

  TextStyle get _capStyle => TextStyle(
        fontSize: TaskTypography.micro,
        fontWeight: FontWeight.w800,
        letterSpacing: .9,
        color: taskMuted(context),
      );

  TextStyle get _valueStyle => TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w800,
        color: ink(context),
      );

  TextStyle get _headingStyle => TextStyle(
        fontSize: 12.5,
        fontWeight: FontWeight.w800,
        letterSpacing: -.1,
        color: ink(context),
      );

  BoxDecoration _panelDecoration({double radius = 14}) => BoxDecoration(
        color: taskSurface(context),
        border: Border.all(color: taskBorder(context)),
        borderRadius: BorderRadius.circular(radius),
      );

  Widget _panel({required Widget child}) => Container(
        padding: const EdgeInsets.all(13),
        decoration: _panelDecoration(),
        child: child,
      );

  Widget _chip(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: _dark ? .18 : .12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: TaskTypography.micro,
                fontWeight: FontWeight.w800,
                letterSpacing: .3,
                color: color)),
      );

  Widget _hero(String caption, String amount, String meta) => Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF1E3A5F), Color(0xFF2D5D92)],
          ),
          borderRadius: BorderRadius.circular(16),
          boxShadow: const [
            BoxShadow(
                color: Color(0x331E3A5F), blurRadius: 18, offset: Offset(0, 8)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(caption.toUpperCase(),
                style: const TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.4,
                    color: Color(0xB8FFFFFF))),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(amount,
                  maxLines: 1,
                  style: const TextStyle(
                      fontSize: 29,
                      height: 1.1,
                      letterSpacing: -.6,
                      fontWeight: FontWeight.w800,
                      color: Colors.white)),
            ),
            const SizedBox(height: 7),
            Text(meta,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w600,
                    color: Color(0xBEFFFFFF))),
          ],
        ),
      );

  Widget _statTile(String label, String value, IconData icon, Color color) =>
      Container(
        padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
        decoration: _panelDecoration(radius: 13),
        child: Row(
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: color.withValues(alpha: _dark ? .2 : .12),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(icon, size: 15, color: color),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _capStyle),
                  const SizedBox(height: 2),
                  Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _valueStyle.copyWith(fontSize: 12.5)),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _tierRow(String label, num qty, Color color) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            _chip(label, color),
            const Spacer(),
            Text('${qty.toInt()}', style: _valueStyle),
            const SizedBox(width: 3),
            Text('pcs',
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w600,
                    color: taskMuted(context))),
          ],
        ),
      );

  Widget _periodCard(String caption, String value) => _panel(
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: (_dark ? kTaskAccentDark : kTaskAccent)
                    .withValues(alpha: _dark ? .2 : .1),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(Icons.calendar_month_outlined,
                  size: 16, color: _dark ? kTaskAccentDark : kTaskAccent),
            ),
            const SizedBox(width: 9),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(caption.toUpperCase(), style: _capStyle),
                  const SizedBox(height: 1),
                  Text(value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _valueStyle.copyWith(fontSize: 12)),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _buildMine() {
    final raw = _mine ?? {};
    // Backend mengembalikan data di objek `live`; fallback ke root.
    final mine = (raw['live'] as Map<String, dynamic>?) ?? raw;
    final start = _commissionDate(mine['period_start']);
    final end = _commissionDate(mine['period_end']);
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 2, 12, 16),
      children: [
        _hero('Estimasi komisi', fmtRp(asNum(mine['estimated'])),
            '$_presetLabel · $start – $end'),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: _statTile('Penjualan', fmtRp(asNum(mine['total_sales'])),
                  Icons.trending_up_rounded, _blue),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _statTile(
                  'Transaksi',
                  '${mine['total_transactions'] ?? 0}',
                  Icons.receipt_long_outlined,
                  _teal),
            ),
          ],
        ),
        const SizedBox(height: 10),
        _panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Jumlah pcs per tier', style: _headingStyle),
              const SizedBox(height: 4),
              _tierRow('Reguler', asNum(mine['qty_reguler']), _blue),
              _tierRow('Grosir Seri', asNum(mine['qty_grosir_seri']), _amber),
            ],
          ),
        ),
        const SizedBox(height: 10),
        _periodCard('Periode data', '$start → $end'),
      ],
    );
  }

  Widget _buildReport() {
    final report = _report ?? {};
    final accounts =
        ((report['per_account'] as List?) ?? []).cast<Map<String, dynamic>>();
    final start = _commissionDate(report['period_start']);
    final end = _commissionDate(report['period_end']);
    final totalQty = accounts.fold<num>(
        0, (sum, account) => sum + asNum(account['total_qty']));
    final totalReg = accounts.fold<num>(
        0, (sum, account) => sum + asNum(account['qty_reguler']));
    final totalGrosir = accounts.fold<num>(
        0, (sum, account) => sum + asNum(account['qty_grosir']));
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 2, 12, 16),
      children: [
        _hero('Total komisi', fmtRp(asNum(report['total_commission'])),
            '$start – $end · ${accounts.length} pegawai'),
        const SizedBox(height: 10),
        _panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text('Rincian pegawai', style: _headingStyle),
                  const Spacer(),
                  _chip('${accounts.length} akun', _blue),
                ],
              ),
              const SizedBox(height: 2),
              if (accounts.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text('Belum ada komisi pada periode ini.',
                      style:
                          TextStyle(fontSize: 12, color: taskMuted(context))),
                )
              else
                for (var i = 0; i < accounts.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: taskBorder(context)),
                  _accountRow(accounts[i], i),
                ],
            ],
          ),
        ),
        const SizedBox(height: 10),
        _periodCard('Total pcs',
            '${totalQty.toInt()} pcs · R ${totalReg.toInt()} / G ${totalGrosir.toInt()}'),
      ],
    );
  }

  Widget _accountRow(Map<String, dynamic> account, int index) {
    final palette = [_blue, _teal, _amber, _purple];
    final color = palette[index % palette.length];
    final name = (account['name'] ?? '').toString().trim();
    final initial = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: color.withValues(alpha: _dark ? .2 : .12),
              shape: BoxShape.circle,
            ),
            child: Text(initial,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w800, color: color)),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name.isEmpty ? '-' : name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
                const SizedBox(height: 3),
                Row(
                  children: [
                    _chip('R ${asNum(account['qty_reguler']).toInt()}', _blue),
                    const SizedBox(width: 5),
                    _chip('G ${asNum(account['qty_grosir']).toInt()}', _amber),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(fmtRp(asNum(account['commission'])),
              style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: _dark ? kTaskAccentDark : kTaskDark)),
        ],
      ),
    );
  }

  Widget _buildRules() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 2, 12, 16),
      children: [
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _addRule,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Tambah aturan (per pcs)'),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 46),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ),
        const SizedBox(height: 10),
        if (_rules.isEmpty)
          _panel(
            child: Text('Belum ada aturan komisi.',
                style: TextStyle(fontSize: 12, color: taskMuted(context))),
          )
        else
          for (final rule in _rules) ...[
            _panel(
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: _purple.withValues(alpha: _dark ? .2 : .12),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Icon(Icons.rule, size: 17, color: _purple),
                  ),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rule['name']?.toString() ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w800,
                                color: ink(context))),
                        const SizedBox(height: 2),
                        Text(
                            '${_ruleTypeLabel(rule['calculation_type'])} · '
                            '${rule['branch_id'] == null ? 'Global' : 'Toko ${rule['branch_id']}'}',
                            style: TextStyle(
                                fontSize: TaskTypography.micro, color: taskMuted(context))),
                        if ('${rule['calculation_type']}' ==
                            'per_pcs_customer_tier') ...[
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 5,
                            runSpacing: 4,
                            children: [
                              _chip(
                                  'Reguler ${fmtRp(asNum(rule['commission_reguler_per_pcs']))}/pcs',
                                  _blue),
                              _chip(
                                  'Grosir ${fmtRp(asNum(rule['commission_grosir_seri_per_pcs']))}/pcs',
                                  _amber),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => _deleteRule(rule),
                    icon: const Icon(Icons.delete_outline),
                    color: kTaskTerracotta,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
          ],
      ],
    );
  }
}

String _ruleTypeLabel(Object? type) => switch ('$type') {
      'per_pcs_customer_tier' => 'Per pcs · tier pelanggan',
      'percentage_sales' => 'Persentase penjualan',
      'percentage_profit' => 'Persentase laba',
      'per_transaction' => 'Per transaksi',
      'flat_monthly' => 'Flat bulanan',
      _ => '$type',
    };

String _commissionDate(Object? raw) {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des'
  ];
  final text = (raw ?? '').toString().trim();
  if (text.isEmpty) return '-';
  final date = DateTime.tryParse(text);
  if (date == null) return text;
  return '${date.day} ${months[date.month - 1]} ${date.year}';
}
