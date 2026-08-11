import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'printer_service.dart';

class InventoryPage extends StatefulWidget {
  const InventoryPage({super.key, required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  String _section = 'stok';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'stok', label: Text('Stok')),
              ButtonSegment(value: 'mutasi', label: Text('Mutasi')),
              ButtonSegment(value: 'transfer', label: Text('Transfer')),
              ButtonSegment(value: 'opname', label: Text('Opname')),
              ButtonSegment(value: 'barcode', label: Text('Barcode')),
            ],
            selected: {_section},
            onSelectionChanged: (s) => setState(() => _section = s.first),
          ),
        ),
        Expanded(
          child: switch (_section) {
            'stok' => _StockSection(api: widget.api, branchId: widget.branchId),
            'mutasi' =>
              _MutasiSection(api: widget.api, branchId: widget.branchId),
            'transfer' =>
              _TransferSection(api: widget.api, branchId: widget.branchId),
            'opname' =>
              _OpnameSection(api: widget.api, branchId: widget.branchId),
            _ => _BarcodeSection(api: widget.api),
          },
        ),
      ],
    );
  }
}

class _StockSection extends StatefulWidget {
  const _StockSection({required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<_StockSection> createState() => _StockSectionState();
}

class _StockSectionState extends State<_StockSection> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic> _summary = {};
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
      final data = await widget.api
          .stockTotal(branchId: widget.branchId, search: _search.text.trim());
      if (!mounted) return;
      setState(() {
        _summary = (data['summary'] as Map<String, dynamic>?) ?? {};
        _rows =
            ((data['products'] as List?) ?? []).cast<Map<String, dynamic>>();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: TextField(
            controller: _search,
            decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                isDense: true,
                hintText: 'Cari produk / SKU',
                border: OutlineInputBorder()),
            onSubmitted: (_) => _load(),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(12),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _Chip('Produk', '${_summary['total_products'] ?? 0}'),
              _Chip('Stok', '${_summary['total_stock'] ?? 0}'),
              _Chip('Stok rendah', '${_summary['low_stock'] ?? 0}', warn: true),
              _Chip('Habis', '${_summary['out_of_stock'] ?? 0}', warn: true),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _rows.isEmpty
                      ? const Center(child: Text('Tidak ada produk'))
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final low = asNum(r['total_stock']) <=
                                asNum(r['min_stock']);
                            return Card(
                              child: ListTile(
                                title: Text(r['name']?.toString() ?? '',
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700)),
                                subtitle: Text(
                                    '${r['sku'] ?? ''} · ${r['colors'] ?? ''}'),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('Stok ${r['total_stock'] ?? 0}',
                                        style: TextStyle(
                                            fontWeight: FontWeight.w800,
                                            color: low
                                                ? Theme.of(context)
                                                    .colorScheme
                                                    .error
                                                : null)),
                                    if (low)
                                      Text('min ${r['min_stock'] ?? 0}',
                                          style: const TextStyle(fontSize: 11)),
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

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.value, {this.warn = false});
  final String label;
  final String value;
  final bool warn;

  @override
  Widget build(BuildContext context) => Chip(
        label: Text('$label: $value',
            style: TextStyle(
                fontWeight: FontWeight.w700,
                color: warn ? Theme.of(context).colorScheme.error : null)),
      );
}

class _MutasiSection extends StatefulWidget {
  const _MutasiSection({required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<_MutasiSection> createState() => _MutasiSectionState();
}

class _MutasiSectionState extends State<_MutasiSection> {
  List<Map<String, dynamic>> _rows = [];
  String _filter = '';
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
      final rows = await widget.api.mutations(
          type: _filter.isEmpty ? null : _filter,
          dateFrom: todayWib(),
          dateTo: todayWib());
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openForm() async {
    final kind = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.move_to_inbox),
              title: const Text('Stok Masuk (incoming)'),
              onTap: () => Navigator.pop(ctx, 'incoming'),
            ),
            ListTile(
              leading: const Icon(Icons.move_to_inbox),
              title: const Text('Stok Keluar (outgoing)'),
              onTap: () => Navigator.pop(ctx, 'outgoing'),
            ),
          ],
        ),
      ),
    );
    if (kind == null || !mounted) return;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) =>
          _InOutForm(api: widget.api, branchId: widget.branchId, kind: kind),
    ));
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: DropdownButtonFormField<String>(
            initialValue: _filter,
            decoration: const InputDecoration(
                isDense: true,
                labelText: 'Jenis mutasi',
                border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: '', child: Text('Semua')),
              DropdownMenuItem(
                  value: 'purchase', child: Text('Pembelian masuk')),
              DropdownMenuItem(value: 'adjustment', child: Text('Penyesuaian')),
              DropdownMenuItem(value: 'sale', child: Text('Penjualan')),
              DropdownMenuItem(value: 'sale_return', child: Text('Retur')),
              DropdownMenuItem(value: 'damage', child: Text('Rusak')),
              DropdownMenuItem(value: 'loss', child: Text('Hilang')),
              DropdownMenuItem(value: 'gift', child: Text('Hadiah')),
              DropdownMenuItem(
                  value: 'transfer_in', child: Text('Transfer masuk')),
              DropdownMenuItem(
                  value: 'transfer_out', child: Text('Transfer keluar')),
            ],
            onChanged: (v) {
              setState(() => _filter = v ?? '');
              _load();
            },
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _rows.isEmpty
                      ? const Center(child: Text('Belum ada mutasi hari ini'))
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final positive = asNum(r['qty']) >= 0;
                            return Card(
                              child: ListTile(
                                leading: CircleAvatar(
                                  child: Text(() {
                                    final t = (r['type'] ?? '').toString();
                                    return t.isEmpty
                                        ? '?'
                                        : t
                                            .split('_')
                                            .first
                                            .toUpperCase()
                                            .substring(0, 1);
                                  }()),
                                ),
                                title:
                                    Text(r['product_name']?.toString() ?? ''),
                                subtitle: Text(
                                    '${r['type'] ?? ''} · ${r['warehouse_name'] ?? ''} · ${r['created_at'] ?? ''}'),
                                trailing: Text(
                                  '${positive ? '+' : ''}${r['qty']}',
                                  style: TextStyle(
                                      fontWeight: FontWeight.w800,
                                      color:
                                          positive ? Colors.green : Colors.red),
                                ),
                              ),
                            );
                          },
                        ),
        ),
        FloatingActionButton.extended(
          onPressed: _openForm,
          icon: const Icon(Icons.add),
          label: const Text('Mutasi Stok'),
        ),
      ],
    );
  }
}

class _InOutForm extends StatefulWidget {
  const _InOutForm(
      {required this.api, required this.branchId, required this.kind});
  final ApiClient api;
  final int branchId;
  final String kind; // incoming | outgoing

  @override
  State<_InOutForm> createState() => _InOutFormState();
}

class _InOutFormState extends State<_InOutForm> {
  List<Map<String, dynamic>> _warehouses = [];
  List<Map<String, dynamic>> _channels = [];
  String _warehouseId = '';
  String _channel = 'toko';
  String _batch = '';
  String _notes = '';
  final List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.api.warehouses(widget.branchId),
        if (widget.kind == 'outgoing') widget.api.channels(),
      ]);
      if (!mounted) return;
      setState(() {
        _warehouses = results[0].cast<Map<String, dynamic>>();
        if (widget.kind == 'outgoing') {
          _channels = results[1].cast<Map<String, dynamic>>();
        }
        if (_warehouses.isNotEmpty && _warehouseId.isEmpty) {
          _warehouseId = '${_warehouses.first['id']}';
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickItem() async {
    final catalog = await widget.api.incomingProducts(
        branchId: widget.branchId, warehouseId: int.tryParse(_warehouseId));
    if (!mounted) return;
    final result = await Navigator.of(context).push<List<Map<String, dynamic>>>(
      MaterialPageRoute(
        builder: (_) => _CatalogPicker(
          products: catalog.cast<Map<String, dynamic>>(),
          withCost: widget.kind == 'incoming',
        ),
      ),
    );
    if (result == null || result.isEmpty) return;
    setState(() => _items.addAll(result));
  }

  Future<void> _submit() async {
    if (_items.isEmpty || _warehouseId.isEmpty) {
      setState(() => _error = 'Pilih gudang dan minimal satu item');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final body = {
        'branch_id': widget.branchId,
        'warehouse_id': int.parse(_warehouseId),
        'transaction_date': todayWib(),
        if (_batch.trim().isNotEmpty) 'batch_number': _batch.trim(),
        if (_notes.trim().isNotEmpty) 'notes': _notes.trim(),
        'items': _items,
        if (widget.kind == 'outgoing') 'channel': _channel,
      };
      if (widget.kind == 'incoming') {
        await widget.api.createIncoming(body);
      } else {
        await widget.api.createOutgoing(body);
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(widget.kind == 'incoming'
              ? 'Stok masuk diproses'
              : 'Stok keluar diproses')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
          title:
              Text(widget.kind == 'incoming' ? 'Stok Masuk' : 'Stok Keluar')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                DropdownButtonFormField<String>(
                  initialValue: _warehouseId.isEmpty ? null : _warehouseId,
                  decoration: const InputDecoration(
                      labelText: 'Gudang', border: OutlineInputBorder()),
                  items: [
                    for (final w in _warehouses)
                      DropdownMenuItem(
                          value: '${w['id']}',
                          child: Text(w['name']?.toString() ?? '')),
                  ],
                  onChanged: (v) => setState(() => _warehouseId = v ?? ''),
                ),
                const SizedBox(height: 8),
                if (widget.kind == 'outgoing') ...[
                  DropdownButtonFormField<String>(
                    initialValue: _channel,
                    decoration: const InputDecoration(
                        labelText: 'Channel', border: OutlineInputBorder()),
                    items: [
                      for (final c in _channels)
                        DropdownMenuItem(
                            value: c['name']?.toString() ?? '',
                            child: Text(c['name']?.toString() ?? '')),
                      if (_channels.isEmpty)
                        const DropdownMenuItem(
                            value: 'toko', child: Text('toko')),
                    ],
                    onChanged: (v) => setState(() => _channel = v ?? 'toko'),
                  ),
                  const SizedBox(height: 8),
                ],
                TextField(
                  decoration: const InputDecoration(
                      labelText: 'Nomor batch / nota (opsional)',
                      border: OutlineInputBorder()),
                  onChanged: (v) => _batch = v,
                ),
                const SizedBox(height: 8),
                TextField(
                  decoration: const InputDecoration(
                      labelText: 'Keterangan', border: OutlineInputBorder()),
                  onChanged: (v) => _notes = v,
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _pickItem,
                  icon: const Icon(Icons.add),
                  label: const Text('Tambah Item'),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!,
                      style: TextStyle(
                          color: Theme.of(context).colorScheme.error)),
                ],
                const SizedBox(height: 8),
                for (final item in _items)
                  Card(
                    child: ListTile(
                      dense: true,
                      title: Text(item['name']?.toString() ?? ''),
                      subtitle: Text(
                          '${item['variant_label'] ?? ''} · ${item['quantity']} pcs'),
                      trailing: IconButton(
                        onPressed: () => setState(() => _items.remove(item)),
                        icon: const Icon(Icons.delete_outline),
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                FilledButton(
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(50)),
                  onPressed: _saving ? null : _submit,
                  child: _saving
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Simpan Mutasi'),
                ),
              ],
            ),
    );
  }
}

class _CatalogPicker extends StatefulWidget {
  const _CatalogPicker({required this.products, required this.withCost});
  final List<Map<String, dynamic>> products;
  final bool withCost;

  @override
  State<_CatalogPicker> createState() => _CatalogPickerState();
}

class _CatalogPickerState extends State<_CatalogPicker> {
  final List<Map<String, dynamic>> _added = [];
  String _q = '';

  List<Map<String, dynamic>> get _filtered {
    final q = _q.trim().toLowerCase();
    if (q.isEmpty) return widget.products;
    return widget.products.where((p) {
      return (p['name'] ?? '').toString().toLowerCase().contains(q) ||
          (p['sku'] ?? '').toString().toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _add(Map<String, dynamic> product) async {
    final variants =
        ((product['variants'] as List?) ?? []).cast<Map<String, dynamic>>();
    var variantId = variants.isEmpty ? null : variants.first['id'] as int?;
    final qty = TextEditingController(text: '1');
    final cost = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(product['name']?.toString() ?? ''),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (variants.isNotEmpty) ...[
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final v in variants)
                      ChoiceChip(
                        label: Text(v['color']?.toString() ?? ''),
                        selected: v['id'] == variantId,
                        onSelected: (_) =>
                            setDialogState(() => variantId = v['id'] as int?),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
              TextField(
                controller: qty,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Jumlah', border: OutlineInputBorder()),
              ),
              if (widget.withCost) ...[
                const SizedBox(height: 8),
                TextField(
                  controller: cost,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                      labelText: 'Harga beli (opsional)',
                      border: OutlineInputBorder(),
                      prefixText: 'Rp '),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Batal')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Tambah')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final quantity = int.tryParse(qty.text) ?? 0;
    if (quantity <= 0) return;
    final variantLabel = variants
        .where((v) => v['id'] == variantId)
        .map((v) => v['color']?.toString() ?? '')
        .join(', ');
    setState(() {
      _added.add({
        'product_id': product['id'],
        if (variantId != null) 'variant_id': variantId,
        'name': product['name'],
        'variant_label': variantLabel,
        'quantity': quantity,
        if (widget.withCost && cost.text.trim().isNotEmpty)
          'cost': double.tryParse(cost.text.replaceAll('.', '')) ?? 0,
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pilih Produk'),
        actions: [
          TextButton(
            onPressed:
                _added.isEmpty ? null : () => Navigator.pop(context, _added),
            child: Text('Selesai (${_added.length})'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              onChanged: (v) => setState(() => _q = v),
              decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  isDense: true,
                  hintText: 'Cari produk',
                  border: OutlineInputBorder()),
            ),
          ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: _filtered.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final p = _filtered[i];
                return Card(
                  child: ListTile(
                    title: Text(p['name']?.toString() ?? '',
                        style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle:
                        Text('SKU ${p['sku'] ?? ''} · stok ${p['stock'] ?? 0}'),
                    trailing: const Icon(Icons.add_circle_outline),
                    onTap: () => _add(p),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TransferSection extends StatefulWidget {
  const _TransferSection({required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<_TransferSection> createState() => _TransferSectionState();
}

class _TransferSectionState extends State<_TransferSection> {
  List<Map<String, dynamic>> _warehouses = [];
  String _from = '';
  String _to = '';
  String _notes = '';
  final List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await widget.api.warehouses(widget.branchId);
      if (!mounted) return;
      setState(() {
        _warehouses = rows.cast<Map<String, dynamic>>();
        if (_warehouses.isNotEmpty) {
          _from = '${_warehouses.first['id']}';
          if (_warehouses.length > 1) _to = '${_warehouses[1]['id']}';
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickItem() async {
    final catalog = await widget.api.incomingProducts(
        branchId: widget.branchId, warehouseId: int.tryParse(_from));
    if (!mounted) return;
    final result = await Navigator.of(context).push<List<Map<String, dynamic>>>(
      MaterialPageRoute(
        builder: (_) => _CatalogPicker(
            products: catalog.cast<Map<String, dynamic>>(), withCost: false),
      ),
    );
    if (result == null || result.isEmpty) return;
    setState(() => _items.addAll(result));
  }

  Future<void> _submit() async {
    if (_from.isEmpty || _to.isEmpty || _from == _to || _items.isEmpty) {
      setState(() => _error = 'Pilih gudang asal/tujuan dan minimal satu item');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.createTransfer({
        'from_warehouse_id': int.parse(_from),
        'to_warehouse_id': int.parse(_to),
        if (_notes.trim().isNotEmpty) 'notes': _notes.trim(),
        'items': _items,
      });
      if (!mounted) return;
      setState(() => _items.clear());
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Transfer diproses')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(12),
            children: [
              DropdownButtonFormField<String>(
                initialValue: _from.isEmpty ? null : _from,
                decoration: const InputDecoration(
                    labelText: 'Dari gudang', border: OutlineInputBorder()),
                items: [
                  for (final w in _warehouses)
                    DropdownMenuItem(
                        value: '${w['id']}',
                        child: Text(w['name']?.toString() ?? '')),
                ],
                onChanged: (v) => setState(() => _from = v ?? ''),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _to.isEmpty ? null : _to,
                decoration: const InputDecoration(
                    labelText: 'Ke gudang', border: OutlineInputBorder()),
                items: [
                  for (final w in _warehouses)
                    DropdownMenuItem(
                        value: '${w['id']}',
                        child: Text(w['name']?.toString() ?? '')),
                ],
                onChanged: (v) => setState(() => _to = v ?? ''),
              ),
              const SizedBox(height: 8),
              TextField(
                decoration: const InputDecoration(
                    labelText: 'Keterangan', border: OutlineInputBorder()),
                onChanged: (v) => _notes = v,
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _pickItem,
                icon: const Icon(Icons.add),
                label: const Text('Tambah Item'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              for (final item in _items)
                Card(
                  child: ListTile(
                    dense: true,
                    title: Text(item['name']?.toString() ?? ''),
                    subtitle: Text(
                        '${item['variant_label'] ?? ''} · ${item['quantity']} pcs'),
                    trailing: IconButton(
                      onPressed: () => setState(() => _items.remove(item)),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50)),
                onPressed: _saving ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Proses Transfer'),
              ),
            ],
          );
  }
}

class _OpnameSection extends StatefulWidget {
  const _OpnameSection({required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<_OpnameSection> createState() => _OpnameSectionState();
}

class _OpnameSectionState extends State<_OpnameSection> {
  List<Map<String, dynamic>> _warehouses = [];
  String _warehouseId = '';
  final List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await widget.api.warehouses(widget.branchId);
      if (!mounted) return;
      setState(() {
        _warehouses = rows.cast<Map<String, dynamic>>();
        if (_warehouses.isNotEmpty && _warehouseId.isEmpty) {
          _warehouseId = '${_warehouses.first['id']}';
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pickItem() async {
    final catalog = await widget.api.incomingProducts(
        branchId: widget.branchId, warehouseId: int.tryParse(_warehouseId));
    if (!mounted) return;
    final result = await Navigator.of(context).push<List<Map<String, dynamic>>>(
      MaterialPageRoute(
        builder: (_) =>
            _OpnamePicker(products: catalog.cast<Map<String, dynamic>>()),
      ),
    );
    if (result == null || result.isEmpty) return;
    setState(() => _items.addAll(result));
  }

  Future<void> _submit() async {
    if (_warehouseId.isEmpty || _items.isEmpty) {
      setState(() => _error = 'Pilih gudang dan minimal satu item');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await widget.api.createOpname({
        'warehouse_id': int.parse(_warehouseId),
        'items': _items,
      });
      if (!mounted) return;
      setState(() => _items.clear());
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Opname disimpan')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _loading
        ? const Center(child: CircularProgressIndicator())
        : ListView(
            padding: const EdgeInsets.all(12),
            children: [
              DropdownButtonFormField<String>(
                initialValue: _warehouseId.isEmpty ? null : _warehouseId,
                decoration: const InputDecoration(
                    labelText: 'Gudang', border: OutlineInputBorder()),
                items: [
                  for (final w in _warehouses)
                    DropdownMenuItem(
                        value: '${w['id']}',
                        child: Text(w['name']?.toString() ?? '')),
                ],
                onChanged: (v) => setState(() => _warehouseId = v ?? ''),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _pickItem,
                icon: const Icon(Icons.add),
                label: const Text('Tambah Item (stok fisik)'),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!,
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error)),
              ],
              for (final item in _items)
                Card(
                  child: ListTile(
                    dense: true,
                    title: Text(item['name']?.toString() ?? ''),
                    subtitle: Text(
                        '${item['variant_label'] ?? ''} · fisik ${item['physical_stock']}'),
                    trailing: IconButton(
                      onPressed: () => setState(() => _items.remove(item)),
                      icon: const Icon(Icons.delete_outline),
                    ),
                  ),
                ),
              const SizedBox(height: 16),
              FilledButton(
                style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50)),
                onPressed: _saving ? null : _submit,
                child: _saving
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Simpan Opname'),
              ),
            ],
          );
  }
}

class _OpnamePicker extends StatefulWidget {
  const _OpnamePicker({required this.products});
  final List<Map<String, dynamic>> products;

  @override
  State<_OpnamePicker> createState() => _OpnamePickerState();
}

class _OpnamePickerState extends State<_OpnamePicker> {
  final List<Map<String, dynamic>> _added = [];
  String _q = '';

  Future<void> _add(Map<String, dynamic> product) async {
    final variants =
        ((product['variants'] as List?) ?? []).cast<Map<String, dynamic>>();
    var variantId = variants.isEmpty ? null : variants.first['id'] as int?;
    final physical = TextEditingController(text: '0');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(product['name']?.toString() ?? ''),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (variants.isNotEmpty) ...[
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final v in variants)
                      ChoiceChip(
                        label: Text(v['color']?.toString() ?? ''),
                        selected: v['id'] == variantId,
                        onSelected: (_) =>
                            setDialogState(() => variantId = v['id'] as int?),
                      ),
                  ],
                ),
                const SizedBox(height: 8),
              ],
              TextField(
                controller: physical,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Stok fisik (dihitung)',
                    border: OutlineInputBorder()),
              ),
            ],
          ),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx, false),
                child: const Text('Batal')),
            FilledButton(
                onPressed: () => Navigator.pop(ctx, true),
                child: const Text('Tambah')),
          ],
        ),
      ),
    );
    if (ok != true || !mounted) return;
    final value = int.tryParse(physical.text) ?? -1;
    if (value < 0) return;
    final variantLabel = variants
        .where((v) => v['id'] == variantId)
        .map((v) => v['color']?.toString() ?? '')
        .join(', ');
    setState(() {
      _added.add({
        'product_id': product['id'],
        if (variantId != null) 'variant_id': variantId,
        'name': product['name'],
        'variant_label': variantLabel,
        'physical_stock': value,
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final filtered = widget.products
        .where((p) =>
            _q.isEmpty ||
            (p['name'] ?? '')
                .toString()
                .toLowerCase()
                .contains(_q.toLowerCase()) ||
            (p['sku'] ?? '')
                .toString()
                .toLowerCase()
                .contains(_q.toLowerCase()))
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Pilih Item Opname'),
        actions: [
          TextButton(
            onPressed:
                _added.isEmpty ? null : () => Navigator.pop(context, _added),
            child: Text('Selesai (${_added.length})'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              onChanged: (v) => setState(() => _q = v),
              decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  isDense: true,
                  hintText: 'Cari produk',
                  border: OutlineInputBorder()),
            ),
          ),
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: filtered.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final p = filtered[i];
                return Card(
                  child: ListTile(
                    title: Text(p['name']?.toString() ?? ''),
                    subtitle: Text(
                        'SKU ${p['sku'] ?? ''} · stok sistem ${p['stock'] ?? 0}'),
                    trailing: const Icon(Icons.add_circle_outline),
                    onTap: () => _add(p),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _BarcodeSection extends StatefulWidget {
  const _BarcodeSection({required this.api});
  final ApiClient api;

  @override
  State<_BarcodeSection> createState() => _BarcodeSectionState();
}

class _BarcodeSectionState extends State<_BarcodeSection> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;
  bool _printing = false;

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
      final rows = await widget.api.barcodeItems(search: _search.text.trim());
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _print(Map<String, dynamic> row) async {
    setState(() => _printing = true);
    try {
      final printer = PrinterService();
      final devices = await printer.scan();
      if (devices.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text('Tidak ada printer Bluetooth ditemukan')));
        }
        return;
      }
      await printer.connect(devices.first);
      await printer.printBarcode(
          code: row['barcode_value']?.toString() ??
              row['product_sku']?.toString() ??
              '',
          label: row['name']?.toString());
      await printer.disconnect();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Label barcode terkirim')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Cetak gagal: $e')));
      }
    } finally {
      if (mounted) setState(() => _printing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: TextField(
            controller: _search,
            decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                isDense: true,
                hintText: 'Cari produk / SKU / barcode',
                border: OutlineInputBorder()),
            onSubmitted: (_) => _load(),
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Text(_error!))
                  : _rows.isEmpty
                      ? const Center(child: Text('Tidak ada item barcode'))
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            return Card(
                              child: ListTile(
                                title: Text(r['name']?.toString() ?? ''),
                                subtitle: Text(
                                    '${r['product_sku'] ?? ''} · ${r['variant_color'] ?? ''}'),
                                trailing: _printing
                                    ? const SizedBox(
                                        width: 20,
                                        height: 20,
                                        child: CircularProgressIndicator(
                                            strokeWidth: 2))
                                    : IconButton(
                                        onPressed: () => _print(r),
                                        icon: const Icon(Icons.print),
                                        tooltip: 'Cetak barcode'),
                              ),
                            );
                          },
                        ),
        ),
      ],
    );
  }
}
