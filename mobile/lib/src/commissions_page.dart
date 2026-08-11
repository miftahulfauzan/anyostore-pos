import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';

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

  bool get _isOwner => widget.role == 'owner';
  List<String> get _tabs =>
      _isOwner ? ['saya', 'rules', 'records', 'report'] : ['saya'];

  (String, String) get _range {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    if (_preset == '7d') {
      return (d(now.subtract(const Duration(days: 6))), d(now));
    }
    return (
      '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
      d(now)
    );
  }

  @override
  void initState() {
    super.initState();
    if (!_isOwner) _tab = 'saya';
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final (start, end) = _range;
      if (_tab == 'saya') {
        final data = await widget.api.commissionMine(start: start, end: end);
        if (!mounted) return;
        setState(() => _mine = data);
      } else if (_tab == 'report') {
        final data = await widget.api.commissionReport(start: start, end: end);
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
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: SegmentedButton<String>(
            segments: [
              for (final t in _tabs)
                ButtonSegment(
                    value: t,
                    label: Text(switch (t) {
                      'saya' => 'Saya',
                      'rules' => 'Aturan',
                      'records' => 'Catatan',
                      _ => 'Laporan',
                    })),
            ],
            selected: {_tab},
            onSelectionChanged: (s) {
              setState(() => _tab = s.first);
              _load();
            },
          ),
        ),
        if (_tab == 'saya' || _tab == 'report')
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: _preset,
                    decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Periode',
                        border: OutlineInputBorder()),
                    items: const [
                      DropdownMenuItem(
                          value: 'bulan', child: Text('Bulan ini')),
                      DropdownMenuItem(value: '7d', child: Text('7 hari')),
                    ],
                    onChanged: (v) {
                      setState(() => _preset = v ?? 'bulan');
                      _load();
                    },
                  ),
                ),
                if (_tab == 'report') ...[
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton.icon(
                      onPressed: _generating ? null : _generate,
                      icon: _generating
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.play_arrow),
                      label: const Text('Generate'),
                    ),
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
        final mine = _mine ?? {};
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
            return Card(
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
            Card(
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
              Card(
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
              Card(
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
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
              const SizedBox(height: 8),
              ...rows,
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
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Flexible(
                child: Text(label,
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.outline))),
            Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
      );
}
