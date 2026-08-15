import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;

import 'api_client.dart';
import 'format.dart';
import 'printer_service.dart';
import 'task_ui.dart';

class InventoryPage extends StatefulWidget {
  const InventoryPage(
      {super.key, required this.api, required this.branchId, this.role});
  final ApiClient api;
  final int branchId;
  final String? role;

  bool get isOwner => role == 'owner';

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  String _section = 'stok';

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                child: PillTabs(
                  tabs: const [
                    (value: 'stok', icon: Icons.inventory_2, label: 'Stok'),
                    (value: 'mutasi', icon: Icons.swap_vert, label: 'Mutasi'),
                    (
                      value: 'transfer',
                      icon: Icons.swap_horiz,
                      label: 'Transfer'
                    ),
                    (value: 'opname', icon: Icons.fact_check, label: 'Opname'),
                    (
                      value: 'barcode',
                      icon: Icons.qr_code_scanner,
                      label: 'Barcode'
                    ),
                  ],
                  selected: _section,
                  onChanged: (v) => setState(() => _section = v),
                ),
              ),
              Expanded(
                child: switch (_section) {
                  'stok' => _StockSection(
                      api: widget.api,
                      branchId: widget.branchId,
                      isOwner: widget.isOwner),
                  'mutasi' =>
                    _MutasiSection(api: widget.api, branchId: widget.branchId),
                  'transfer' => _TransferSection(
                      api: widget.api,
                      branchId: widget.branchId,
                      isOwner: widget.isOwner),
                  'opname' =>
                    _OpnameSection(api: widget.api, branchId: widget.branchId),
                  _ => _BarcodeSection(api: widget.api),
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StockSection extends StatefulWidget {
  const _StockSection(
      {required this.api, required this.branchId, this.isOwner = false});
  final ApiClient api;
  final int branchId;
  final bool isOwner;

  @override
  State<_StockSection> createState() => _StockSectionState();
}

class _StockSectionState extends State<_StockSection> {
  final _search = TextEditingController();
  String _branchMode = 'this'; // this | all
  List<Map<String, dynamic>> _branches = [];
  int? _branchId;
  List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic> _summary = {};
  bool _loading = true;
  String? _error;
  bool _grid = false; // false = card (list), true = grid
  String _sort = 'nama'; // nama | nama_desc | stok_asc | stok_desc
  bool _searchOpen = false; // accordion Cari (owner)

  String _mediaUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    final base = widget.api.baseUrl.split('/api').first;
    return path.startsWith('http') ? path : base + path;
  }

  /// Pilih toko/gudang yang ingin dilihat lewat bottom sheet.
  Future<void> _pickBranch() async {
    final v = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Text('Pilih Toko/Gudang',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: ink(ctx))),
            ),
            for (final b in _branches)
              ListTile(
                leading: const Icon(Icons.store, size: 18),
                title: Text(b['name']?.toString() ?? ''),
                onTap: () => Navigator.pop(ctx, 'branch-${b['id']}'),
              ),
            ListTile(
              leading: const Icon(Icons.all_inclusive, size: 18),
              title: const Text('Semua toko/gudang'),
              onTap: () => Navigator.pop(ctx, 'all'),
            ),
          ],
        ),
      ),
    );
    if (v == null || !mounted) return;
    setState(() {
      _branchMode = v;
      _branchId =
          v == 'all' ? null : int.tryParse(v.replaceFirst('branch-', ''));
    });
    _load();
  }

  @override
  void initState() {
    super.initState();
    _loadBranches();
    _load();
  }

  List<Map<String, dynamic>> get _sorted {
    final rows = List<Map<String, dynamic>>.of(_rows);
    switch (_sort) {
      case 'nama_desc':
        rows.sort((a, b) => (b['name'] ?? '')
            .toString()
            .toLowerCase()
            .compareTo((a['name'] ?? '').toString().toLowerCase()));
        break;
      case 'stok_asc':
        rows.sort((a, b) =>
            asNum(a['total_stock']).compareTo(asNum(b['total_stock'])));
        break;
      case 'stok_desc':
        rows.sort((a, b) =>
            asNum(b['total_stock']).compareTo(asNum(a['total_stock'])));
        break;
      default:
        rows.sort((a, b) => (a['name'] ?? '')
            .toString()
            .toLowerCase()
            .compareTo((b['name'] ?? '').toString().toLowerCase()));
    }
    return rows;
  }

  Future<void> _loadBranches() async {
    if (!widget.isOwner) return;
    try {
      final rows = await widget.api.branches();
      if (!mounted) return;
      setState(() {
        _branches = rows.cast<Map<String, dynamic>>();
        _branchId ??= widget.branchId;
      });
    } catch (_) {}
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.api.stockTotal(
          branchId: _branchId ?? widget.branchId,
          search: _search.text.trim(),
          allBranches: _branchMode == 'all');
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
        if (widget.isOwner)
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
            // Saat fitur cari aktif, baris diganti total dengan field cari
            // (toko/gudang tertutup) — persis perilaku POS.
            child: _searchOpen
                ? TextField(
                    controller: _search,
                    autofocus: true,
                    decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.search),
                        suffixIcon: IconButton(
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: () => setState(() => _searchOpen = false),
                        ),
                        isDense: true,
                        hintText: 'Cari produk / SKU',
                        border: const OutlineInputBorder()),
                    onSubmitted: (_) => _load(),
                  )
                : Row(
                    children: [
                      Expanded(
                        child: _InvHeaderSegment(
                          icon: Icons.store,
                          label: 'Toko / Gudang',
                          active: false,
                          onTap: () => _pickBranch(),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _InvHeaderSegment(
                          icon: Icons.search,
                          label: 'Cari produk',
                          active: false,
                          onTap: () => setState(() => _searchOpen = true),
                        ),
                      ),
                    ],
                  ),
          )
        else
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
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _sort,
                  isExpanded: true,
                  decoration: const InputDecoration(
                      isDense: true,
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(
                        value: 'nama', child: Text('Urut: Nama A–Z')),
                    DropdownMenuItem(
                        value: 'nama_desc', child: Text('Urut: Nama Z–A')),
                    DropdownMenuItem(
                        value: 'stok_asc', child: Text('Urut: Stok terendah')),
                    DropdownMenuItem(
                        value: 'stok_desc',
                        child: Text('Urut: Stok tertinggi')),
                  ],
                  onChanged: (v) => setState(() => _sort = v ?? 'nama'),
                ),
              ),
              const SizedBox(width: 10),
              // Toggle ikon Card/Grid dengan ruang proporsional.
              SizedBox(
                width: 104,
                child: _ViewToggle(
                  grid: _grid,
                  onChanged: (g) => setState(() => _grid = g),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 10),
          child: Row(
            children: [
              _StatCell('Produk', '${_summary['total_products'] ?? 0}',
                  icon: Icons.inventory_2),
              const SizedBox(width: 8),
              _StatCell('Stok', '${_summary['total_stock'] ?? 0}',
                  icon: Icons.storage),
              const SizedBox(width: 8),
              _StatCell('Stok rendah', '${_summary['low_stock'] ?? 0}',
                  icon: Icons.warning_amber_rounded, warn: true),
              const SizedBox(width: 8),
              _StatCell('Habis', '${_summary['out_of_stock'] ?? 0}',
                  icon: Icons.block, warn: true),
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
                      : _grid
                          ? GridView.builder(
                              padding:
                                  const EdgeInsets.fromLTRB(12, 0, 12, 104),
                              itemCount: _sorted.length,
                              gridDelegate:
                                  const SliverGridDelegateWithFixedCrossAxisCount(
                                crossAxisCount: 2,
                                mainAxisSpacing: 10,
                                crossAxisSpacing: 10,
                                childAspectRatio: 0.8,
                              ),
                              itemBuilder: (_, i) {
                                final r = _sorted[i];
                                final low = asNum(r['total_stock']) <=
                                    asNum(r['min_stock']);
                                final photo =
                                    _mediaUrl(r['photo_path']?.toString());
                                return GlassCard(
                                  padding: EdgeInsets.zero,
                                  radius: 18,
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Expanded(
                                        child: photo.isEmpty
                                            ? Container(
                                                color: const Color(0xffE6ECF3),
                                                alignment: Alignment.center,
                                                child: const Icon(
                                                    Icons.image_not_supported,
                                                    size: 22,
                                                    color: Color(0xff9AA5B1)),
                                              )
                                            : CachedNetworkImage(
                                                imageUrl: photo,
                                                fit: BoxFit.cover,
                                                memCacheWidth: 420,
                                                fadeInDuration: Duration.zero,
                                                fadeOutDuration: Duration.zero,
                                                placeholder: (_, __) => Container(
                                                    color:
                                                        const Color(0xffE6ECF3),
                                                    child: const Icon(
                                                        Icons
                                                            .image_not_supported,
                                                        size: 22,
                                                        color:
                                                            Color(0xff9AA5B1))),
                                                errorWidget: (_, __, ___) =>
                                                    Container(
                                                        color: const Color(
                                                            0xffE6ECF3),
                                                        child: const Icon(
                                                            Icons
                                                                .image_not_supported,
                                                            size: 22,
                                                            color: Color(
                                                                0xff9AA5B1))),
                                              ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.all(10),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(r['name']?.toString() ?? '',
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontSize: 12,
                                                    fontWeight:
                                                        FontWeight.w700)),
                                            const SizedBox(height: 4),
                                            Row(
                                              children: [
                                                Expanded(
                                                  child: Text(
                                                      'Stok ${r['total_stock'] ?? 0}',
                                                      style: TextStyle(
                                                          fontWeight:
                                                              FontWeight.w800,
                                                          fontSize: 14,
                                                          color: low
                                                              ? Theme.of(
                                                                      context)
                                                                  .colorScheme
                                                                  .error
                                                              : null)),
                                                ),
                                                if (low)
                                                  Text(
                                                      'min ${r['min_stock'] ?? 0}',
                                                      style: const TextStyle(
                                                          fontSize: 10,
                                                          color: Color(
                                                              0xffB0563A))),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              },
                            )
                          : ListView.separated(
                              padding:
                                  const EdgeInsets.fromLTRB(12, 0, 12, 104),
                              itemCount: _sorted.length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(height: 8),
                              itemBuilder: (_, i) {
                                final r = _sorted[i];
                                final low = asNum(r['total_stock']) <=
                                    asNum(r['min_stock']);
                                final photo =
                                    _mediaUrl(r['photo_path']?.toString());
                                return GlassCard(
                                  padding: const EdgeInsets.all(10),
                                  radius: 18,
                                  child: Row(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: SizedBox(
                                          width: 48,
                                          height: 48,
                                          child: photo.isEmpty
                                              ? const ColoredBox(
                                                  color: Color(0xffE6ECF3),
                                                  child: Icon(Icons.inventory_2,
                                                      color: Color(0xff9AA5B1)),
                                                )
                                              : CachedNetworkImage(
                                                  imageUrl: photo,
                                                  fit: BoxFit.cover,
                                                  memCacheWidth: 120,
                                                  fadeInDuration: Duration.zero,
                                                  fadeOutDuration:
                                                      Duration.zero,
                                                  errorWidget: (_, __, ___) =>
                                                      const ColoredBox(
                                                    color: Color(0xffE6ECF3),
                                                    child: Icon(
                                                        Icons.inventory_2,
                                                        color:
                                                            Color(0xff9AA5B1)),
                                                  ),
                                                ),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(r['name']?.toString() ?? '',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 13)),
                                            const SizedBox(height: 2),
                                            Text(
                                                '${r['sku'] ?? ''}${r['colors'] != null && r['colors'] != '' ? ' · ${r['colors']}' : ''}${r['branch_name'] != null ? ' · ${r['branch_name']}' : ''}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontSize: 10.5,
                                                    color: Color(0xff8A857C))),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.end,
                                        children: [
                                          Text('Stok ${r['total_stock'] ?? 0}',
                                              style: TextStyle(
                                                  fontWeight: FontWeight.w800,
                                                  fontSize: 13,
                                                  color: low
                                                      ? Theme.of(context)
                                                          .colorScheme
                                                          .error
                                                      : null)),
                                          if (low)
                                            Text('min ${r['min_stock'] ?? 0}',
                                                style: const TextStyle(
                                                    fontSize: 10,
                                                    color: Color(0xffB0563A))),
                                        ],
                                      ),
                                    ],
                                  ),
                                );
                              },
                            ),
        ),
      ],
    );
  }
}

/// Statistik stok padat: 1 baris dibagi 4, font kecil seragam supaya muat.
class _StatCell extends StatelessWidget {
  const _StatCell(this.label, this.value,
      {this.icon = Icons.circle, this.warn = false});
  final String label;
  final String value;
  final IconData icon;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final color = warn ? Theme.of(context).colorScheme.error : kTaskDark;
    return Expanded(
      child: GlassCard(
        radius: 14,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
        child: Column(
          children: [
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: kTaskGray)),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 12, color: color),
                  const SizedBox(width: 3),
                  Text(value,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: color)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
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
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            final positive = asNum(r['qty']) >= 0;
                            return GlassCard(
                              padding: EdgeInsets.zero,
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
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 104),
          child: FilledButton.icon(
            onPressed: _openForm,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xff1E3A5F),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(28)),
              minimumSize: const Size.fromHeight(50),
            ),
            icon: const Icon(Icons.add, size: 20),
            label: const Text('Mutasi Stok'),
          ),
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

/// Warna pembeda: hijau untuk Stok Masuk, oranye untuk Stok Keluar.
Color _inOutAccent(String kind) =>
    kind == 'incoming' ? const Color(0xFF2E7D4F) : const Color(0xFFC2410C);

String _inOutLabel(String kind) =>
    kind == 'incoming' ? 'Stok Masuk' : 'Stok Keluar';

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
          accent: _inOutAccent(widget.kind),
          title: _inOutLabel(widget.kind),
          mediaUrl: _mediaUrl,
        ),
      ),
    );
    if (result == null || result.isEmpty) return;
    setState(() => _items.addAll(result));
  }

  String _mediaUrl(String? path) {
    if (path == null || path.isEmpty) return '';
    final base = widget.api.baseUrl.replaceAll(RegExp(r'/api$'), '');
    return path.startsWith('http') ? path : base + path;
  }

  Future<void> _addChannel() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Channel'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
              hintText: 'Nama channel', border: OutlineInputBorder()),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, controller.text.trim()),
              child: const Text('Tambah')),
        ],
      ),
    );
    if (name == null || name.isEmpty || !mounted) return;
    try {
      await widget.api.createChannel(name);
      final ch = await widget.api.channels();
      if (!mounted) return;
      setState(() {
        _channels = ch.cast<Map<String, dynamic>>();
        _channel = name;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
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
    final accent = _inOutAccent(widget.kind);
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        foregroundColor: Colors.white,
        // Judul dijamin putih (theme global memakai denim).
        titleTextStyle: const TextStyle(
            color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
        flexibleSpace: Container(color: accent),
        title: Text(_inOutLabel(widget.kind)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: EdgeInsets.fromLTRB(
                  12,
                  MediaQuery.of(context).padding.top + kToolbarHeight + 12,
                  12,
                  12),
              children: [
                // Banner pembeda warna solid + teks putih.
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: accent,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Icon(
                          widget.kind == 'incoming'
                              ? Icons.move_to_inbox
                              : Icons.move_to_inbox_outlined,
                          size: 20,
                          color: Colors.white),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          widget.kind == 'incoming'
                              ? 'Barang MASUK ke gudang'
                              : 'Barang KELUAR dari gudang',
                          style: const TextStyle(
                              fontSize: 12.5,
                              fontWeight: FontWeight.w800,
                              color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
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
                    decoration: InputDecoration(
                        labelText: 'Channel',
                        border: const OutlineInputBorder(),
                        suffixIcon: IconButton(
                          onPressed: _addChannel,
                          icon: const Icon(Icons.add_circle_outline,
                              size: 20, color: Color(0xFFC2410C)),
                          tooltip: 'Tambah channel',
                        )),
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
                  style: FilledButton.styleFrom(backgroundColor: accent),
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
                  GlassCard(
                    padding: EdgeInsets.zero,
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
                      minimumSize: const Size.fromHeight(50),
                      backgroundColor: accent),
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
  const _CatalogPicker(
      {required this.products,
      required this.withCost,
      required this.accent,
      required this.title,
      required this.mediaUrl});
  final List<Map<String, dynamic>> products;
  final bool withCost;
  final Color accent;
  final String title;
  final String Function(String?) mediaUrl;

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
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        foregroundColor: Colors.white,
        titleTextStyle: const TextStyle(
            color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
        flexibleSpace: Container(color: widget.accent),
        title: Text('Pilih Produk — ${widget.title}'),
        actions: [
          TextButton(
            onPressed:
                _added.isEmpty ? null : () => Navigator.pop(context, _added),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: Text('Selesai (${_added.length})'),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(
                12,
                MediaQuery.of(context).padding.top + kToolbarHeight + 12,
                12,
                0),
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
            child: _filtered.isEmpty
                ? const Center(child: Text('Produk tidak ditemukan'))
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                    itemCount: _filtered.length,
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.85,
                    ),
                    itemBuilder: (_, i) {
                      final p = _filtered[i];
                      final photo =
                          widget.mediaUrl(p['photo_path']?.toString());
                      return GlassCard(
                        padding: EdgeInsets.zero,
                        radius: 18,
                        onTap: () => _add(p),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: photo.isEmpty
                                  ? Container(
                                      color: const Color(0xffE6ECF3),
                                      alignment: Alignment.center,
                                      child: const Icon(
                                          Icons.image_not_supported,
                                          size: 22,
                                          color: Color(0xff9AA5B1)),
                                    )
                                  : CachedNetworkImage(
                                      imageUrl: photo,
                                      fit: BoxFit.cover,
                                      memCacheWidth: 420,
                                      fadeInDuration: Duration.zero,
                                      fadeOutDuration: Duration.zero,
                                      placeholder: (_, __) => Container(
                                        color: const Color(0xffE6ECF3),
                                        alignment: Alignment.center,
                                        child: const Icon(
                                            Icons.image_not_supported,
                                            size: 22,
                                            color: Color(0xff9AA5B1)),
                                      ),
                                      errorWidget: (_, __, ___) => Container(
                                        color: const Color(0xffE6ECF3),
                                        alignment: Alignment.center,
                                        child: const Icon(
                                            Icons.image_not_supported,
                                            size: 22,
                                            color: Color(0xff9AA5B1)),
                                      ),
                                    ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(p['name']?.toString() ?? '',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 2),
                                  Text(
                                      'SKU ${p['sku'] ?? ''} · stok ${p['stock'] ?? 0}',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontSize: 10,
                                          color: Color(0xff8A857C))),
                                ],
                              ),
                            ),
                          ],
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
  const _TransferSection(
      {required this.api, required this.branchId, this.isOwner = false});
  final ApiClient api;
  final int branchId;
  final bool isOwner;

  @override
  State<_TransferSection> createState() => _TransferSectionState();
}

class _TransferSectionState extends State<_TransferSection> {
  List<Map<String, dynamic>> _warehouses = [];
  List<Map<String, dynamic>> _targets = [];
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
        }
      });
      final targets = await widget.api.storeTargets();
      if (!mounted) return;
      setState(() {
        _targets = targets.cast<Map<String, dynamic>>();
        if (_targets.isNotEmpty && _to.isEmpty) {
          _to = '${_targets.first['warehouse_id']}';
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
            products: catalog.cast<Map<String, dynamic>>(),
            withCost: false,
            accent: const Color(0xff1E3A5F),
            title: 'Transfer Stok',
            mediaUrl: (path) {
              if (path == null || path.isEmpty) return '';
              final base = widget.api.baseUrl.replaceAll(RegExp(r'/api$'), '');
              return path.startsWith('http') ? path : base + path;
            }),
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
      final body = {
        'from_warehouse_id': int.parse(_from),
        'to_warehouse_id': int.parse(_to),
        if (_notes.trim().isNotEmpty) 'notes': _notes.trim(),
        'items': _items,
      };
      await widget.api.createInterStoreTransfer(body);
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
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
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
                    labelText: 'Ke toko/gudang tujuan',
                    border: OutlineInputBorder()),
                items: [
                  for (final t in _targets)
                    DropdownMenuItem<String>(
                        value: '${t['warehouse_id']}',
                        child: Text('${t['name']} · ${t['warehouse_name']}')),
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
                GlassCard(
                  padding: EdgeInsets.zero,
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

  Future<void> _editItem(Map<String, dynamic> item) async {
    final ctrl = TextEditingController(text: '${item['physical_stock'] ?? 0}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Edit stok fisik · ${item['name'] ?? ''}'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
              labelText: 'Stok fisik (dihitung)', border: OutlineInputBorder()),
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
    );
    if (ok != true || !mounted) return;
    final value = int.tryParse(ctrl.text) ?? -1;
    if (value < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Jumlah harus angka 0 atau lebih')));
      return;
    }
    setState(() => item['physical_stock'] = value);
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
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
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
                GlassCard(
                  padding: EdgeInsets.zero,
                  child: ListTile(
                    dense: true,
                    onTap: () => _editItem(item),
                    title: Text(item['name']?.toString() ?? ''),
                    subtitle: Text(
                        '${item['variant_label'] ?? ''} · fisik ${item['physical_stock']} · ketuk untuk edit'),
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
                return GlassCard(
                  padding: EdgeInsets.zero,
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
                          padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
                          itemCount: _rows.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final r = _rows[i];
                            return GlassCard(
                              padding: EdgeInsets.zero,
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

/// Segmen header Toko/Gudang & Cari ala POS (kiri/kanan satu baris).
class _InvHeaderSegment extends StatelessWidget {
  const _InvHeaderSegment({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = Theme.of(context).colorScheme.primary;
    return Material(
      color: dark ? const Color(0xff1F2530) : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            border: Border.all(
                color: active
                    ? fg
                    : (dark
                        ? const Color(0xff2A3140)
                        : const Color(0xffE7E0D6)),
                width: active ? 1.5 : 1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(icon, size: 17, color: fg),
              const SizedBox(width: 6),
              Expanded(
                child: Text(label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        color: fg)),
              ),
              const Icon(Icons.expand_more, size: 18, color: Color(0xff8A857C)),
            ],
          ),
        ),
      ),
    );
  }
}

/// Toggle Card/Grid bergaya pill (senada dengan PillTabs & desain halaman lain).
class _ViewToggle extends StatelessWidget {
  const _ViewToggle({required this.grid, required this.onChanged});
  final bool grid;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: 46,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: dark ? const Color(0xff1F2530) : const Color(0xffF0EEE8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: dark ? const Color(0xff2A3140) : const Color(0xffE7E0D6)),
      ),
      child: Row(
        children: [
          _opt(Icons.view_agenda_outlined, !grid,
              tooltip: 'Tampilan kartu', onTap: () => onChanged(false)),
          _opt(Icons.grid_view_outlined, grid,
              tooltip: 'Tampilan grid', onTap: () => onChanged(true)),
        ],
      ),
    );
  }

  Widget _opt(IconData icon, bool active,
      {required String tooltip, required VoidCallback onTap}) {
    return Expanded(
      child: Tooltip(
        message: tooltip,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(13),
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: active ? const Color(0xff1E3A5F) : Colors.transparent,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(icon,
                size: 19,
                color: active ? Colors.white : const Color(0xff8A857C)),
          ),
        ),
      ),
    );
  }
}
