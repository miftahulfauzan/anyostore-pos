import 'dart:convert';

import 'package:flutter/material.dart';

import 'api_client.dart';
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
  List<Map<String, dynamic>> _records = [];
  Map<String, dynamic>? _report;
  Map<String, dynamic>? _mine;
  bool _loading = true;
  String? _error;
  bool _generating = false;
  String _preset = 'bulan';
  String? _customStart;
  String? _customEnd;
  List<Map<String, dynamic>> _branches = [];
  int? _branchId;

  bool get _isOwner => widget.role == 'owner';

  /// Manager/Admin juga boleh melihat Laporan komisi semua pegawai.
  bool get _canManage =>
      ['owner', 'manager', 'admin'].contains(widget.role);
  List<String> get _tabs =>
      _canManage ? ['saya', 'rules', 'records', 'report'] : ['saya'];

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
    final initial = DateTime.tryParse(
            start ? (_customStart ?? '') : (_customEnd ?? '')) ??
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
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_isOwner && _branches.isEmpty) {
        try {
          _branches =
              (await widget.api.branches()).cast<Map<String, dynamic>>();
          _branchId ??= _branches.isEmpty
              ? null
              : int.tryParse('${_branches.first['id']}');
        } catch (_) {}
      }
      final (start, end) = _range;
      if (_tab == 'saya') {
        final data = await widget.api
            .commissionMine(start: start, end: end, branchId: _branchId);
        debugPrint('KOMISI_MINE branch=$_branchId range=$start..$end => ${jsonEncode(data)}');
        if (!mounted) return;
        setState(() => _mine = data);
      } else if (_tab == 'report') {
        final data = await widget.api
            .commissionReport(start: start, end: end, branchId: _branchId);
        debugPrint('KOMISI_REPORT branch=$_branchId range=$start..$end => ${jsonEncode(data)}');
        if (!mounted) return;
        setState(() => _report = data);
      } else {
        final data = await widget.api.commissions();
        if (!mounted) return;
        setState(() {
          _rules =
              ((data['rules'] as List?) ?? []).cast<Map<String, dynamic>>();
          _records =
              ((data['records'] as List?) ?? []).cast<Map<String, dynamic>>();
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addRule() async {
    final name = TextEditingController();
    final reguler = TextEditingController(text: '0');
    final semi = TextEditingController(text: '0');
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
                    controller: semi,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                        labelText: 'Semi Grosir (Rp/pcs)',
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
        'commission_semi_grosir_per_pcs':
            double.tryParse(semi.text.replaceAll('.', '')) ?? 0,
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

  Future<void> _generate() async {
    setState(() => _generating = true);
    try {
      final (start, end) = _range;
      final result = await widget.api
          .generateCommissions({'period_start': start, 'period_end': end});
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text('Komisi dibuat: ${result['created'] ?? 0} catatan')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _generating = false);
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
                  DropdownButtonFormField<int?>(
                    initialValue: _branchId,
                    isExpanded: true,
                    decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Toko',
                        border: OutlineInputBorder()),
                    items: [
                      const DropdownMenuItem<int?>(
                          value: null,
                          child: Text('Cabang default saya')),
                      for (final b in _branches)
                        DropdownMenuItem<int?>(
                            value: int.tryParse('${b['id']}'),
                            child: Text(b['name']?.toString() ?? '')),
                    ],
                    onChanged: (v) {
                      setState(() => _branchId = v);
                      _load();
                    },
                  ),
                if (_isOwner && _branches.isNotEmpty && _tab == 'report')
                  const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<String>(
                        initialValue: _preset,
                        isExpanded: true,
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
                    if (_tab == 'report') ...[
                      const SizedBox(width: 10),
                      FilledButton.icon(
                        onPressed: _generating ? null : _generate,
                        icon: _generating
                            ? const SizedBox(
                                width: 16,
                                height: 16,
                                child:
                                    CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.play_arrow),
                        label: const Text('Generate'),
                      ),
                    ],
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
                          controller: TextEditingController(
                              text: _customStart ?? ''),
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
                          controller: TextEditingController(
                              text: _customEnd ?? ''),
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

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text(_error!));
    switch (_tab) {
      case 'saya':
        // Backend mengembalikan data di objek `live`; fallback ke root.
        final raw = _mine ?? {};
        final mine =
            (raw['live'] as Map<String, dynamic>?) ?? raw;
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            _Card('Komisi Saya', [
              _Row('Estimasi komisi', fmtRp(asNum(mine['estimated']))),
              _Row('Penjualan', fmtRp(asNum(mine['total_sales']))),
              _Row('Transaksi', '${mine['total_transactions'] ?? 0}'),
            ]),
            _Card('Jumlah pcs (per tier)', [
              _Row('Reguler', '${mine['qty_reguler'] ?? 0} pcs'),
              _Row('Semi Grosir', '${mine['qty_semi_grosir'] ?? 0} pcs'),
              _Row('Grosir Seri', '${mine['qty_grosir_seri'] ?? 0} pcs'),
            ]),
            _Card('Periode', [
              _Row('Dari', '${mine['period_start'] ?? ''}'),
              _Row('Sampai', '${mine['period_end'] ?? ''}'),
            ]),
          ],
        );
      case 'records':
        if (_records.isEmpty) {
          return const Center(child: Text('Belum ada catatan komisi'));
        }
        return ListView.separated(
          padding: const EdgeInsets.all(12),
          itemCount: _records.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final r = _records[i];
            return GlassCard(
              padding: EdgeInsets.zero,
              child: ListTile(
                title: Text(r['staff_name']?.toString() ?? ''),
                subtitle:
                    Text('${r['rule_name'] ?? ''} · ${r['created_at'] ?? ''}'),
                trailing: Text(fmtRp(asNum(r['commission_amount'])),
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            );
          },
        );
      case 'report':
        final accounts = ((_report?['per_account'] as List?) ?? [])
            .cast<Map<String, dynamic>>();
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            GlassCard(
              padding: EdgeInsets.zero,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                        'Total komisi: ${fmtRp(asNum(_report?['total_commission']))}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16)),
                    Text(
                        'Periode ${_report?['period_start']} s.d. ${_report?['period_end']}'),
                  ],
                ),
              ),
            ),
            for (final a in accounts)
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  title: Text(a['name']?.toString() ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                      '${a['total_qty'] ?? 0} pcs (R ${a['qty_reguler'] ?? 0} / SG ${a['qty_semi'] ?? 0} / GS ${a['qty_grosir'] ?? 0})'),
                  trailing: Text(fmtRp(asNum(a['commission'])),
                      style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
              ),
          ],
        );
      default:
        return ListView(
          padding: const EdgeInsets.all(12),
          children: [
            FilledButton.icon(
              onPressed: _addRule,
              icon: const Icon(Icons.add),
              label: const Text('Tambah Aturan (per pcs)'),
            ),
            const SizedBox(height: 8),
            for (final rule in _rules)
              GlassCard(
                padding: EdgeInsets.zero,
                child: ListTile(
                  title: Text(rule['name']?.toString() ?? '',
                      style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(
                      '${rule['calculation_type'] ?? ''} · ${rule['branch_id'] == null ? 'Global' : 'Toko ${rule['branch_id']}'}'),
                  trailing: IconButton(
                    onPressed: () => _deleteRule(rule),
                    icon: const Icon(Icons.delete_outline),
                  ),
                ),
              ),
          ],
        );
    }
  }
}

class _Card extends StatelessWidget {
  const _Card(this.title, this.rows);
  final String title;
  final List<Widget> rows;

  @override
  Widget build(BuildContext context) => GlassCard(
        padding: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 10),
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0)
                  const Divider(
                      height: 14, thickness: 1, color: Color(0x14E7E0D6)),
                rows[i],
              ],
            ],
          ),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 7),
        child: Row(
          children: [
            Expanded(
              child: Text(label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context).colorScheme.outline)),
            ),
            const SizedBox(width: 14),
            Text(value,
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
