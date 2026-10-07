import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;

import 'api_client.dart';
import 'format.dart';
import 'printer_service.dart';
import 'product_form_page.dart';
import 'task_ui.dart';
import 'media_helpers.dart';
import 'ui_kit.dart';

export 'media_helpers.dart';

const _inventorySections = <({String value, IconData icon, String label})>[
  (value: 'stok', icon: Icons.inventory_2, label: 'Stok'),
  (value: 'mutasi', icon: Icons.swap_vert, label: 'Mutasi'),
  (value: 'transfer', icon: Icons.swap_horiz, label: 'Transfer'),
  (value: 'opname', icon: Icons.fact_check, label: 'Opname'),
  (value: 'barcode', icon: Icons.qr_code_scanner, label: 'Barcode'),
];

String _inventorySectionSubtitle(String value) => switch (value) {
      'stok' => 'Data stok dan produk',
      'mutasi' => 'Input stok masuk dan keluar',
      'transfer' => 'Kirim stok ke cabang lain',
      'opname' => 'Stok opname / stok fisik',
      'barcode' => 'Cetak label produk',
      _ => 'Kelola inventori',
    };

enum InventoryStockLevel { good, low, empty }

InventoryStockLevel inventoryStockLevel(num stock, num minStock) {
  if (stock <= 0) return InventoryStockLevel.empty;
  if (stock <= minStock) return InventoryStockLevel.low;
  return InventoryStockLevel.good;
}

Color inventoryStockColor(InventoryStockLevel level) => switch (level) {
      InventoryStockLevel.good => kTaskStockGood,
      InventoryStockLevel.low => kTaskStockLow,
      InventoryStockLevel.empty => kTaskStockEmpty,
    };

Color inventoryStockSurface(BuildContext context, InventoryStockLevel level) {
  final color = inventoryStockColor(level);
  return Theme.of(context).brightness == Brightness.dark
      ? color.withValues(alpha: .24)
      : switch (level) {
          InventoryStockLevel.good => kTaskStockGoodSurface,
          InventoryStockLevel.low => kTaskStockLowSurface,
          InventoryStockLevel.empty => kTaskStockEmptySurface,
        };
}

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
              _InventorySectionSelector(
                selected: _section,
                onChanged: (v) => setState(() => _section = v),
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
                      key: ValueKey(widget.branchId),
                      api: widget.api,
                      branchId: widget.branchId,
                      isOwner: widget.isOwner),
                  'opname' => _OpnameSection(
                      key: ValueKey(widget.branchId),
                      api: widget.api,
                      branchId: widget.branchId),
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

class _InventorySectionSelector extends StatelessWidget {
  const _InventorySectionSelector(
      {required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final item = _inventorySections.firstWhere(
      (entry) => entry.value == selected,
      orElse: () => _inventorySections.first,
    );
    final accent = _sectionColor(item);
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: PopupMenuButton<String>(
        key: const ValueKey('inventory-section-selector'),
        tooltip: 'Pilih halaman stok',
        offset: const Offset(0, 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        onSelected: onChanged,
        itemBuilder: (context) => [
          for (final entry in _inventorySections)
            PopupMenuItem<String>(
              value: entry.value,
              child: Row(
                children: [
                  Icon(entry.icon, size: 20, color: _sectionColor(entry)),
                  const SizedBox(width: 12),
                  Expanded(child: Text(entry.label)),
                  if (entry.value == selected)
                    const Icon(Icons.check, size: 18, color: kTaskTeal),
                ],
              ),
            ),
        ],
        child: Container(
          constraints: const BoxConstraints(minHeight: 58),
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: .12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(item.icon, size: 23, color: accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.label,
                        style: TextStyle(
                            color: ink(context),
                            fontSize: 22,
                            height: 1.05,
                            fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(_inventorySectionSubtitle(item.value),
                        style: TextStyle(
                            color: taskMuted(context),
                            fontSize: 12,
                            fontWeight: FontWeight.w500)),
                  ],
                ),
              ),
              Icon(Icons.keyboard_arrow_down,
                  size: 24, color: taskMuted(context)),
            ],
          ),
        ),
      ),
    );
  }

  Color _sectionColor(({String value, IconData icon, String label}) entry) =>
      entry.value == 'mutasi' ? kTaskTeal : kTaskDark;
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
  final _searchFocus = FocusNode();
  String _branchMode = 'this'; // this | all
  List<Map<String, dynamic>> _branches = [];
  List<Map<String, dynamic>> _warehouses = [];
  String _warehouseId = '';
  int? _branchId;
  List<Map<String, dynamic>> _rows = [];
  Map<String, dynamic> _summary = {};
  bool _loading = true;
  String? _error;
  bool _grid = false; // false = card (list), true = grid
  String _sort = 'nama'; // nama | nama_desc | stok_asc | stok_desc
  bool _searchOpen = false; // accordion Cari (owner)

  @override
  void dispose() {
    _search.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  String get _selectedWarehouseName {
    for (final warehouse in _warehouses) {
      if ('${warehouse['id']}' == _warehouseId) {
        return warehouse['name']?.toString() ?? 'Gudang';
      }
    }
    return 'Gudang';
  }

  void _openSearch() {
    setState(() => _searchOpen = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _searchFocus.requestFocus();
    });
  }

  void _closeSearch() {
    _searchFocus.unfocus();
    setState(() => _searchOpen = false);
  }

  Widget _searchField({
    required bool showWarehouseChip,
    bool autofocus = false,
    bool allowClose = false,
  }) {
    return TextField(
      key: const ValueKey('inventory-stock-search-field'),
      controller: _search,
      focusNode: _searchFocus,
      autofocus: autofocus,
      maxLines: 1,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.search),
        prefix: showWarehouseChip && _warehouses.isNotEmpty
            ? Padding(
                padding: const EdgeInsets.only(right: 8),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
                  decoration: BoxDecoration(
                    color: kTaskDark.withValues(alpha: .10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(_selectedWarehouseName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: ink(context))),
                ),
              )
            : null,
        suffixIcon: allowClose
            ? IconButton(
                key: const ValueKey('inventory-stock-search-close'),
                icon: const Icon(Icons.close, size: 18),
                tooltip: 'Tutup pencarian',
                onPressed: _closeSearch,
              )
            : null,
        isDense: true,
        hintText: 'Cari produk / SKU',
        border: const OutlineInputBorder(),
      ),
      onSubmitted: (_) => _load(),
    );
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
      _warehouseId = '';
    });
    await _loadWarehouses();
    _load();
  }

  @override
  void initState() {
    super.initState();
    _loadBranches();
    _initializeStockScope();
  }

  Future<void> _initializeStockScope() async {
    await _loadWarehouses();
    if (mounted) _load();
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

  Future<void> _loadWarehouses() async {
    if (_branchMode == 'all') {
      if (mounted) {
        setState(() {
          _warehouses = [];
          _warehouseId = '';
        });
      }
      return;
    }
    try {
      final rows = await widget.api.warehouses(_branchId ?? widget.branchId);
      if (!mounted) return;
      final warehouses = rows.cast<Map<String, dynamic>>();
      setState(() {
        _warehouses = warehouses;
        if (!warehouses.any((row) => '${row['id']}' == _warehouseId)) {
          _warehouseId = warehouses.isEmpty ? '' : '${warehouses.first['id']}';
        }
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
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
          allBranches: _branchMode == 'all',
          warehouseId:
              _branchMode == 'all' ? null : int.tryParse(_warehouseId));
      var rows =
          ((data['products'] as List?) ?? []).cast<Map<String, dynamic>>();

      // Older backend releases did not include photo_path in stock-total.
      // Enrich the same product rows from the catalog so the mobile stock
      // screen does not lose photos while the server is being rolled out.
      if (_branchMode != 'all' &&
          rows.any((row) => stockProductPhotoPath(row).isEmpty)) {
        try {
          final catalog = await widget.api.products(
            branchId: _branchId ?? widget.branchId,
            search: _search.text.trim(),
          );
          final byId = <String, Map<String, dynamic>>{};
          final byName = <String, Map<String, dynamic>>{};
          for (final item in catalog) {
            if (item is! Map) continue;
            final product = item.cast<String, dynamic>();
            final photo = stockProductPhotoPath(product);
            if (photo.isEmpty) continue;
            final id = product['id']?.toString();
            if (id != null && id.isNotEmpty) byId[id] = product;
            final name = product['name']?.toString().trim().toLowerCase();
            if (name != null && name.isNotEmpty) byName[name] = product;
          }
          final enrichedRows = <Map<String, dynamic>>[];
          for (final row in rows) {
            if (stockProductPhotoPath(row).isNotEmpty) {
              enrichedRows.add(row);
              continue;
            }
            final rowId =
                row['id']?.toString() ?? row['product_id']?.toString() ?? '';
            final rowName = row['name']?.toString().trim().toLowerCase() ?? '';
            final match = byId[rowId] ?? byName[rowName];
            enrichedRows.add(match == null
                ? row
                : {...row, 'photo_path': stockProductPhotoPath(match)});
          }
          rows = enrichedRows;
        } catch (_) {
          // The stock data remains usable if the compatibility lookup fails.
        }
      }
      if (!mounted) return;
      setState(() {
        _summary = (data['summary'] as Map<String, dynamic>?) ?? {};
        _rows = rows;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openProductEditor(Map<String, dynamic> row) async {
    final id = int.tryParse('${row['id'] ?? row['product_id']}');
    if (id == null) return;
    final productBranchId =
        int.tryParse('${row['branch_id']}') ?? _branchId ?? widget.branchId;
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ProductFormPage(
        api: widget.api,
        branchId: productBranchId,
        existing: {...row, 'id': id},
      ),
    ));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final ownerScope = widget.isOwner;
    final warehouseScope = _warehouses.isNotEmpty;
    return Column(
      children: [
        Padding(
          key: const ValueKey('inventory-stock-controls'),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: _searchOpen
              ? _searchField(
                  showWarehouseChip: warehouseScope,
                  autofocus: true,
                  allowClose: true,
                )
              : _stockToolbar(
                  ownerScope: ownerScope, warehouseScope: warehouseScope),
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
                  icon: Icons.warning_amber_rounded, color: kTaskStockLow),
              const SizedBox(width: 8),
              _StatCell('Habis', '${_summary['out_of_stock'] ?? 0}',
                  icon: Icons.block, color: kTaskStockEmpty),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const UiLoadingState(label: 'Memuat stok…')
              : _error != null
                  ? UiErrorState(message: _error!, onRetry: _load)
                  : _rows.isEmpty
                      ? const UiEmptyState(
                          title: 'Belum ada produk',
                          message: 'Coba ganti gudang atau kata pencarian.')
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
                                final stockLevel = inventoryStockLevel(
                                    asNum(r['total_stock']),
                                    asNum(r['min_stock']));
                                final stockColor =
                                    inventoryStockColor(stockLevel);
                                final stockSurface =
                                    inventoryStockSurface(context, stockLevel);
                                return GlassCard(
                                  padding: EdgeInsets.zero,
                                  radius: 18,
                                  onTap: () => _openProductEditor(r),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                                      Expanded(
                                        child: Stack(
                                          fit: StackFit.expand,
                                          children: [
                                            UiProductPhoto(
                                              path: stockProductPhotoPath(r),
                                              baseUrl: widget.api.baseUrl,
                                              fit: BoxFit.cover,
                                              label:
                                                  'Foto ${productDisplayName(r)}',
                                            ),
                                            const Positioned(
                                              top: 8,
                                              right: 8,
                                              child: _StockEditBadge(),
                                            ),
                                          ],
                                        ),
                                      ),
                                      Padding(
                                        padding: const EdgeInsets.all(10),
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(productDisplayName(r),
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
                                                  child: Container(
                                                    padding: const EdgeInsets
                                                        .symmetric(
                                                        horizontal: 8,
                                                        vertical: 5),
                                                    decoration: BoxDecoration(
                                                      color: stockSurface,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                              10),
                                                    ),
                                                    child: Text(
                                                        'Stok ${r['total_stock'] ?? 0}',
                                                        style: TextStyle(
                                                            fontWeight:
                                                                FontWeight.w800,
                                                            fontSize: 12,
                                                            color: stockColor)),
                                                  ),
                                                ),
                                                if (stockLevel ==
                                                    InventoryStockLevel.low)
                                                  Text(
                                                      'min ${r['min_stock'] ?? 0}',
                                                      style: TextStyle(
                                                          fontSize: 10,
                                                          color: stockColor)),
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
                                final stockLevel = inventoryStockLevel(
                                    asNum(r['total_stock']),
                                    asNum(r['min_stock']));
                                final stockColor =
                                    inventoryStockColor(stockLevel);
                                final stockSurface =
                                    inventoryStockSurface(context, stockLevel);
                                return GlassCard(
                                  padding: const EdgeInsets.all(10),
                                  radius: 18,
                                  onTap: () => _openProductEditor(r),
                                  child: Row(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: SizedBox(
                                          width: 48,
                                          height: 48,
                                          child: UiProductPhoto(
                                            path: stockProductPhotoPath(r),
                                            baseUrl: widget.api.baseUrl,
                                            width: 48,
                                            height: 48,
                                            fit: BoxFit.cover,
                                            label:
                                                'Foto ${productDisplayName(r)}',
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          children: [
                                            Text(productDisplayName(r),
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 13)),
                                            const SizedBox(height: 2),
                                            Text(
                                                '${productSecondaryLabel(r).isNotEmpty ? '${productSecondaryLabel(r)} · ' : ''}${r['branch_name'] ?? ''}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontSize: 10.5,
                                                    color: kTaskSecondary)),
                                          ],
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.end,
                                        children: [
                                          Container(
                                            padding: const EdgeInsets.symmetric(
                                                horizontal: 8, vertical: 5),
                                            decoration: BoxDecoration(
                                              color: stockSurface,
                                              borderRadius:
                                                  BorderRadius.circular(10),
                                            ),
                                            child: Text(
                                                'Stok ${r['total_stock'] ?? 0}',
                                                style: TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 12,
                                                    color: stockColor)),
                                          ),
                                          if (stockLevel ==
                                              InventoryStockLevel.low)
                                            Text('min ${r['min_stock'] ?? 0}',
                                                style: TextStyle(
                                                    fontSize: 10,
                                                    color: stockColor)),
                                        ],
                                      ),
                                      const SizedBox(width: 8),
                                      const _StockEditBadge(),
                                    ],
                                  ),
                                );
                              },
                            ),
        ),
      ],
    );
  }

  Widget _stockToolbar(
      {required bool ownerScope, required bool warehouseScope}) {
    final searchControl = _InvHeaderSegment(
      icon: Icons.search,
      label: 'Cari produk',
      active: false,
      onTap: _openSearch,
    );
    final searchField = _searchField(showWarehouseChip: false);
    final warehouseControl = _WarehouseMenuButton(
      warehouses: _warehouses,
      selectedId: _warehouseId,
      onChanged: (value) {
        setState(() => _warehouseId = value);
        _load();
      },
    );

    return Row(
      children: [
        if (ownerScope) ...[
          _BranchIconButton(onTap: _pickBranch),
          const SizedBox(width: 8),
        ],
        if (warehouseScope) ...[
          Expanded(child: warehouseControl),
          const SizedBox(width: 8),
        ],
        Expanded(child: warehouseScope ? searchControl : searchField),
        const SizedBox(width: 6),
        _SortMenuButton(
          sort: _sort,
          onChanged: (v) => setState(() => _sort = v),
        ),
        const SizedBox(width: 6),
        _ViewModeButton(
          grid: _grid,
          onChanged: (g) => setState(() => _grid = g),
        ),
      ],
    );
  }
}

/// Affordance visual untuk kartu stok yang seluruh areanya membuka editor.
/// Badge tidak mengambil alih gesture kartu agar ketuk di foto maupun teks
/// tetap membuka halaman edit produk.
class _StockEditBadge extends StatelessWidget {
  const _StockEditBadge();

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      label: 'Edit produk',
      child: IgnorePointer(
        child: Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: dark ? const Color(0xff263241) : kTaskSurface,
            borderRadius: BorderRadius.circular(10),
            border:
                Border.all(color: dark ? const Color(0xff475569) : kTaskBorder),
            boxShadow: const [
              BoxShadow(
                  color: Color(0x180F172A), blurRadius: 5, offset: Offset(0, 2))
            ],
          ),
          child: Icon(Icons.edit_outlined,
              size: 16, color: dark ? Colors.white : kTaskDark),
        ),
      ),
    );
  }
}

/// Statistik stok padat: 1 baris dibagi 4, font kecil seragam supaya muat.
class _StatCell extends StatelessWidget {
  const _StatCell(this.label, this.value,
      {this.icon = Icons.circle, this.color});
  final String label;
  final String value;
  final IconData icon;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final valueColor = color ?? kTaskDark;
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
                  Icon(icon, size: 12, color: valueColor),
                  const SizedBox(width: 3),
                  Text(value,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: valueColor)),
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
              title: const Text('Stok Masuk'),
              onTap: () => Navigator.pop(ctx, 'incoming'),
            ),
            ListTile(
              leading: const Icon(Icons.outbox),
              title: const Text('Stok Keluar'),
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
              ? const UiLoadingState(label: 'Memuat mutasi…')
              : _error != null
                  ? UiErrorState(message: _error!, onRetry: _load)
                  : _rows.isEmpty
                      ? const UiEmptyState(
                          title: 'Belum ada mutasi hari ini',
                          message:
                              'Mutasi yang dicatat hari ini akan tampil di sini.',
                          icon: Icons.swap_vert)
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
                                      color: positive
                                          ? kTaskTeal
                                          : kTaskTerracotta),
                                ),
                              ),
                            );
                          },
                        ),
        ),
        Padding(
          // Tambah padding bawah area aman (home indicator iPhone) supaya
          // tombol tidak mepet navbar.
          padding: EdgeInsets.fromLTRB(
              12, 4, 12, 104 + MediaQuery.of(context).padding.bottom),
          child: FilledButton.icon(
            onPressed: _openForm,
            style: FilledButton.styleFrom(
              backgroundColor: kTaskDark,
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
    kind == 'incoming' ? kTaskTeal : kTaskTerracotta;

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
    return stockProductMediaUrl(path, baseUrl: widget.api.baseUrl);
  }

  Future<void> _addChannel() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Saluran'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(
              hintText: 'Nama saluran', border: OutlineInputBorder()),
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

  /// Edit jumlah (dan harga beli untuk masuk) item yang sudah dipilih.
  Future<void> _editItem(Map<String, dynamic> item,
      {bool withCost = false}) async {
    final qty = TextEditingController(text: '${item['quantity']}');
    final cost = TextEditingController(
        text: withCost ? '${asNum(item['cost'] ?? 0)}' : '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(item['name']?.toString() ?? 'Ubah Produk'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((item['variant_label'] ?? '').toString().isNotEmpty)
                Text((item['variant_label'] ?? '').toString(),
                    style:
                        const TextStyle(fontSize: 11, color: kTaskSecondary)),
              const SizedBox(height: 10),
              TextField(
                controller: qty,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Jumlah *', border: OutlineInputBorder()),
              ),
              if (withCost) ...[
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
    final newQty = int.tryParse(qty.text) ?? 0;
    if (newQty <= 0) return;
    setState(() {
      item['quantity'] = newQty;
      if (withCost) {
        item['cost'] = double.tryParse(cost.text.replaceAll('.', '')) ?? 0;
      }
    });
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
          ? const UiLoadingState(label: 'Memuat formulir…')
          : (_error != null && _warehouses.isEmpty)
              ? UiErrorState(message: _error!, onRetry: () => _load())
              : ListView(
                  padding: EdgeInsets.fromLTRB(
                      12,
                      MediaQuery.of(context).padding.top + kToolbarHeight + 12,
                      12,
                      12),
                  children: [
                    // Banner pembeda warna solid + teks putih.
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 10),
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
                            labelText: 'Saluran',
                            border: const OutlineInputBorder(),
                            suffixIcon: IconButton(
                              onPressed: _addChannel,
                              icon: const Icon(Icons.add_circle_outline,
                                  size: 20, color: kTaskTerracotta),
                              tooltip: 'Tambah saluran',
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
                        onChanged: (v) =>
                            setState(() => _channel = v ?? 'toko'),
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
                          labelText: 'Keterangan',
                          border: OutlineInputBorder()),
                      onChanged: (v) => _notes = v,
                    ),
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: _pickItem,
                      style: FilledButton.styleFrom(backgroundColor: accent),
                      icon: const Icon(Icons.add),
                      label: const Text('Tambah Produk'),
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
                          onTap: () => _editItem(item,
                              withCost: widget.kind == 'incoming'),
                          title: Text(item['name']?.toString() ?? ''),
                          subtitle: Text(
                              '${item['variant_label'] ?? ''} · ${item['quantity']} pcs · ketuk untuk ubah'),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                onPressed: () => _editItem(item,
                                    withCost: widget.kind == 'incoming'),
                                icon: const Icon(Icons.edit_outlined, size: 18),
                                tooltip: 'Ubah jumlah',
                              ),
                              IconButton(
                                onPressed: () =>
                                    setState(() => _items.remove(item)),
                                icon: const Icon(Icons.delete_outline),
                              ),
                            ],
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

class _InventoryThumbnail extends StatelessWidget {
  const _InventoryThumbnail(
      {required this.path, this.size = const Size(48, 56)});
  final String path;
  final Size size;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: UiProductPhoto(
        path: path,
        baseUrl: '',
        width: size.width,
        height: size.height,
        fit: BoxFit.cover,
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
        title: Text('Pilih Produk: ${widget.title}'),
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
                      return GlassCard(
                        padding: EdgeInsets.zero,
                        radius: 18,
                        onTap: () => _add(p),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Expanded(
                              child: UiProductPhoto(
                                path: widget.mediaUrl(stockProductPhotoPath(p)),
                                baseUrl: '',
                                fit: BoxFit.cover,
                                label: 'Foto ${productDisplayName(p)}',
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(8),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(productDisplayName(p),
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
                                          fontSize: 10, color: kTaskSecondary)),
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
      {super.key,
      required this.api,
      required this.branchId,
      this.isOwner = false});
  final ApiClient api;
  final int branchId;
  final bool isOwner;

  @override
  State<_TransferSection> createState() => _TransferSectionState();
}

class _TransferSectionState extends State<_TransferSection> {
  String? _clientTransferId;
  String? _transferFingerprint;
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
            accent: kTaskDark,
            title: 'Transfer Stok',
            mediaUrl: (path) =>
                stockProductMediaUrl(path, baseUrl: widget.api.baseUrl)),
      ),
    );
    if (result == null || result.isEmpty) return;
    setState(() => _items.addAll(result));
  }

  /// Edit jumlah (dan harga beli untuk masuk) item yang sudah dipilih.
  Future<void> _editItem(Map<String, dynamic> item,
      {bool withCost = false}) async {
    final qty = TextEditingController(text: '${item['quantity']}');
    final cost = TextEditingController(
        text: withCost ? '${asNum(item['cost'] ?? 0)}' : '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(item['name']?.toString() ?? 'Ubah Produk'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if ((item['variant_label'] ?? '').toString().isNotEmpty)
                Text((item['variant_label'] ?? '').toString(),
                    style:
                        const TextStyle(fontSize: 11, color: kTaskSecondary)),
              const SizedBox(height: 10),
              TextField(
                controller: qty,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Jumlah *', border: OutlineInputBorder()),
              ),
              if (withCost) ...[
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
    final newQty = int.tryParse(qty.text) ?? 0;
    if (newQty <= 0) return;
    setState(() {
      item['quantity'] = newQty;
      if (withCost) {
        item['cost'] = double.tryParse(cost.text.replaceAll('.', '')) ?? 0;
      }
    });
  }

  Future<void> _submit() async {
    if (_saving) return;
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
        'items': [
          for (final item in _items)
            {
              'product_id': item['product_id'],
              if (item['variant_id'] != null) 'variant_id': item['variant_id'],
              'quantity': item['quantity'],
            },
        ],
      };
      final fingerprint = jsonEncode(body);
      if (_transferFingerprint != fingerprint) {
        _transferFingerprint = fingerprint;
        _clientTransferId = uuidV4();
      }
      body['client_transfer_id'] = _clientTransferId!;
      await widget.api.createInterStoreTransfer(body);
      if (!mounted) return;
      setState(() {
        _items.clear();
        _clientTransferId = null;
        _transferFingerprint = null;
      });
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
    if (_loading) {
      return const UiLoadingState(label: 'Memuat pilihan transfer…');
    }
    if (_error != null && _warehouses.isEmpty) {
      return UiErrorState(message: _error!, onRetry: () => _load());
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
      children: [
        DropdownButtonFormField<String>(
          initialValue: _from.isEmpty ? null : _from,
          decoration: const InputDecoration(
              labelText: 'Dari lokasi', border: OutlineInputBorder()),
          items: [
            for (final w in _warehouses)
              DropdownMenuItem(
                  value: '${w['id']}',
                  child: Text(w['name']?.toString() ?? '')),
          ],
          onChanged: _saving
              ? null
              : (v) => setState(() {
                    _from = v ?? '';
                    _items.clear();
                    _error = null;
                  }),
        ),
        const SizedBox(height: 8),
        DropdownButtonFormField<String>(
          initialValue: _to.isEmpty ? null : _to,
          decoration: const InputDecoration(
              labelText: 'Ke lokasi tujuan', border: OutlineInputBorder()),
          items: [
            for (final t in _targets)
              DropdownMenuItem<String>(
                  value: '${t['warehouse_id']}',
                  child: Text('${t['name']} · ${t['warehouse_name']}')),
          ],
          onChanged: _saving ? null : (v) => setState(() => _to = v ?? ''),
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
          label: const Text('Tambah Produk'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        for (final item in _items)
          GlassCard(
            padding: EdgeInsets.zero,
            child: ListTile(
              dense: true,
              onTap: () => _editItem(item, withCost: false),
              title: Text(item['name']?.toString() ?? ''),
              subtitle: Text(
                  '${item['variant_label'] ?? ''} · ${item['quantity']} pcs · ketuk untuk ubah'),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconButton(
                    onPressed: () => _editItem(item, withCost: false),
                    icon: const Icon(Icons.edit_outlined, size: 18),
                    tooltip: 'Ubah jumlah',
                  ),
                  IconButton(
                    onPressed: () => setState(() => _items.remove(item)),
                    icon: const Icon(Icons.delete_outline),
                  ),
                ],
              ),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
          onPressed: _saving ? null : _submit,
          child: _saving
              ? const SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Buat Transfer'),
        ),
      ],
    );
  }
}

class _OpnameSection extends StatefulWidget {
  const _OpnameSection({super.key, required this.api, required this.branchId});
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
    final warehouse = _warehouseId;
    if (_saving || warehouse.isEmpty) return;
    setState(() => _error = null);
    try {
      final rows = await widget.api.stockSnapshot(
          branchId: widget.branchId, warehouseId: int.parse(warehouse));
      if (!mounted || warehouse != _warehouseId) return;
      final result =
          await Navigator.of(context).push<List<Map<String, dynamic>>>(
        MaterialPageRoute(
          builder: (_) => _OpnamePicker(
              products: rows.cast<Map<String, dynamic>>(),
              baseUrl: widget.api.baseUrl),
        ),
      );
      if (!mounted || warehouse != _warehouseId || result == null) return;
      setState(() {
        for (final item in result) {
          _items.removeWhere((existing) =>
              existing['product_id'] == item['product_id'] &&
              existing['variant_id'] == item['variant_id']);
          _items.add(item);
        }
      });
    } catch (e) {
      if (mounted && warehouse == _warehouseId) {
        setState(() => _error = e is ApiException
            ? e.message
            : 'Gagal memuat stok. Coba tambah item kembali.');
      }
    }
  }

  Future<void> _editItem(Map<String, dynamic> item) async {
    final ctrl = TextEditingController(text: '${item['physical_stock'] ?? 0}');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Ubah stok fisik · ${item['name'] ?? ''}'),
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
    if (_saving) return;
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
        'branch_id': widget.branchId,
        'items': [
          for (final item in _items)
            {
              'product_id': item['product_id'],
              if (item['variant_id'] != null) 'variant_id': item['variant_id'],
              'physical_stock': item['physical_stock'],
              'expected_stock': item['expected_stock'],
              'expected_revision': item['expected_revision'],
            },
        ],
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
    if (_loading) return const UiLoadingState(label: 'Memuat opname…');
    if (_error != null && _warehouses.isEmpty) {
      return UiErrorState(message: _error!, onRetry: () => _load());
    }
    return ListView(
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
          onChanged: _saving
              ? null
              : (v) => setState(() {
                    _warehouseId = v ?? '';
                    _items.clear();
                    _error = null;
                  }),
        ),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _pickItem,
          icon: const Icon(Icons.add),
          label: const Text('Tambah Produk'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        for (final item in _items)
          GlassCard(
            padding: EdgeInsets.zero,
            child: ListTile(
              dense: true,
              leading: _InventoryThumbnail(
                path: stockProductMediaUrl(
                  stockProductPhotoPath(item),
                  baseUrl: widget.api.baseUrl,
                ),
                size: const Size(42, 52),
              ),
              onTap: () => _editItem(item),
              title: Text(item['name']?.toString() ?? ''),
              subtitle: Text(
                  '${item['variant_label'] ?? ''} · fisik ${item['physical_stock']} · ketuk untuk ubah'),
              trailing: IconButton(
                onPressed: () => setState(() => _items.remove(item)),
                icon: const Icon(Icons.delete_outline),
              ),
            ),
          ),
        const SizedBox(height: 16),
        FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
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
  const _OpnamePicker({required this.products, required this.baseUrl});
  final List<Map<String, dynamic>> products;
  final String baseUrl;

  @override
  State<_OpnamePicker> createState() => _OpnamePickerState();
}

class _OpnamePickerState extends State<_OpnamePicker> {
  final List<Map<String, dynamic>> _added = [];
  String _q = '';

  Future<void> _add(Map<String, dynamic> product) async {
    if (product['stock_revision'] == null) {
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Informasi'),
          content: const Text(
              'Snapshot stok tidak lengkap. Muat ulang daftar item.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Tutup')),
          ],
        ),
      );
      return;
    }
    final variants =
        ((product['variants'] as List?) ?? []).cast<Map<String, dynamic>>();
    var variantId = product['variant_id'] is num
        ? (product['variant_id'] as num).toInt()
        : (variants.isEmpty ? null : variants.first['id'] as int?);
    final physical = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(product['name']?.toString() ?? ''),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (variants.isNotEmpty && product['variant_id'] == null) ...[
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
    if (value < 0) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Periksa stok fisik'),
          content: const Text('Isi stok fisik dengan angka 0 atau lebih.'),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Tutup')),
          ],
        ),
      );
      return;
    }
    final variantLabel = variants
        .where((v) => v['id'] == variantId)
        .map((v) => v['color']?.toString() ?? '')
        .join(', ');
    setState(() {
      _added.add({
        'product_id': product['product_id'] ?? product['id'],
        if (variantId != null) 'variant_id': variantId,
        'name': product['name'],
        'photo_path': stockProductPhotoPath(product),
        'variant_label': product['variant_color'] != null
            ? '${product['variant_color']}${product['variant_size'] == null ? '' : ' · ${product['variant_size']}'}'
            : variantLabel,
        'physical_stock': value,
        'expected_stock': int.tryParse('${product['quantity'] ?? 0}') ?? 0,
        'expected_revision': product['stock_revision'],
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
        title: const Text('Pilih Produk Opname'),
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
                final photo = stockProductMediaUrl(stockProductPhotoPath(p),
                    baseUrl: widget.baseUrl);
                return GlassCard(
                  padding: EdgeInsets.zero,
                  child: ListTile(
                    leading: _InventoryThumbnail(path: photo),
                    title: Text(productDisplayName(p)),
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
              ? const UiLoadingState(label: 'Memuat barcode…')
              : _error != null
                  ? UiErrorState(message: _error!, onRetry: _load)
                  : _rows.isEmpty
                      ? const UiEmptyState(
                          title: 'Belum ada barcode',
                          message: 'Produk dengan barcode akan tampil di sini.',
                          icon: Icons.qr_code_2)
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

/// Segmen header ringkas untuk scope dan pencarian stok.
class _InvHeaderSegment extends StatelessWidget {
  const _InvHeaderSegment({
    required this.icon,
    required this.label,
    required this.active,
    this.onTap,
    this.showChevron = false,
  });

  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback? onTap;
  final bool showChevron;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final fg = Theme.of(context).colorScheme.primary;
    final content = Container(
      height: 48,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        border: Border.all(
            color: active ? fg : (dark ? const Color(0xff334155) : kTaskBorder),
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
                    fontSize: 12.5, fontWeight: FontWeight.w700, color: fg)),
          ),
          if (showChevron)
            const Icon(Icons.expand_more, size: 18, color: kTaskSecondary),
        ],
      ),
    );
    return Material(
      color: dark ? kTaskDarkSurface : kTaskSurface,
      borderRadius: BorderRadius.circular(12),
      child: onTap == null
          ? content
          : InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onTap,
              child: content,
            ),
    );
  }
}

/// Pemilih cabang owner tetap tersedia tanpa mengambil lebar dari kontrol
/// gudang dan pencarian. Nama lengkapnya dibaca dari tooltip/semantics.
class _BranchIconButton extends StatelessWidget {
  const _BranchIconButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Semantics(
      button: true,
      label: 'Pilih Toko / Gudang',
      child: Tooltip(
        message: 'Pilih Toko / Gudang',
        child: Material(
          color: dark ? kTaskDarkSurface : kTaskSurface,
          borderRadius: BorderRadius.circular(12),
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: onTap,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: dark ? const Color(0xff334155) : kTaskBorder),
              ),
              child: Icon(Icons.store_outlined,
                  size: 20, color: Theme.of(context).colorScheme.primary),
            ),
          ),
        ),
      ),
    );
  }
}

/// Dropdown gudang langsung di titik yang ditekan. Menu melayang sehingga
/// tidak menambah baris maupun menggeser daftar stok.
class _WarehouseMenuButton extends StatelessWidget {
  const _WarehouseMenuButton({
    required this.warehouses,
    required this.selectedId,
    required this.onChanged,
  });

  final List<Map<String, dynamic>> warehouses;
  final String selectedId;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      key: const ValueKey('inventory-warehouse-menu'),
      tooltip: 'Pilih gudang',
      padding: EdgeInsets.zero,
      offset: const Offset(0, 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      onSelected: onChanged,
      itemBuilder: (context) => [
        for (final warehouse in warehouses)
          PopupMenuItem<String>(
            value: '${warehouse['id']}',
            child: Row(
              children: [
                const Icon(Icons.warehouse_outlined, size: 18),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(warehouse['name']?.toString() ?? 'Gudang'),
                ),
                if ('${warehouse['id']}' == selectedId)
                  const Icon(Icons.check, size: 18, color: kTaskStockGood),
              ],
            ),
          ),
      ],
      child: _InvHeaderSegment(
        icon: Icons.warehouse_outlined,
        label: _selectedName,
        active: false,
        showChevron: true,
      ),
    );
  }

  String get _selectedName {
    for (final warehouse in warehouses) {
      if ('${warehouse['id']}' == selectedId) {
        return warehouse['name']?.toString() ?? 'Gudang';
      }
    }
    return 'Gudang';
  }
}

/// Menu ikon untuk urutan. Label lengkap tersedia setelah menu dibuka, tetapi
/// halaman utama hanya memakai satu tombol kecil agar ruang stok tetap lega.
class _SortMenuButton extends StatelessWidget {
  const _SortMenuButton({required this.sort, required this.onChanged});

  final String sort;
  final ValueChanged<String> onChanged;

  static const _items = [
    (value: 'nama', label: 'Nama A–Z'),
    (value: 'nama_desc', label: 'Nama Z–A'),
    (value: 'stok_asc', label: 'Stok terendah'),
    (value: 'stok_desc', label: 'Stok tertinggi'),
  ];

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return PopupMenuButton<String>(
      key: const ValueKey('inventory-sort-button'),
      tooltip: 'Urutkan stok',
      padding: EdgeInsets.zero,
      offset: const Offset(0, 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      onSelected: onChanged,
      itemBuilder: (context) => [
        for (final item in _items)
          PopupMenuItem<String>(
            value: item.value,
            child: Row(
              children: [
                const Icon(Icons.sort, size: 18),
                const SizedBox(width: 10),
                Expanded(child: Text(item.label)),
                if (item.value == sort)
                  const Icon(Icons.check, size: 18, color: kTaskDark),
              ],
            ),
          ),
      ],
      child: Container(
        width: 48,
        height: 46,
        decoration: BoxDecoration(
          color: dark ? const Color(0xff263241) : kTaskSurface,
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: dark ? const Color(0xff334155) : kTaskBorder),
        ),
        child: Icon(Icons.sort, size: 21, color: taskMuted(context)),
      ),
    );
  }
}

/// Toggle Card/Grid berbentuk ikon tunggal agar seluruh toolbar tetap satu
/// baris. Ikon menunjukkan mode yang akan dipilih saat tombol ditekan.
class _ViewModeButton extends StatelessWidget {
  const _ViewModeButton({required this.grid, required this.onChanged});
  final bool grid;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Tooltip(
      key: const ValueKey('inventory-view-mode-button'),
      message: grid ? 'Beralih ke tampilan kartu' : 'Beralih ke tampilan grid',
      child: Semantics(
        button: true,
        label: grid ? 'Tampilan grid aktif' : 'Tampilan kartu aktif',
        child: Material(
          color: dark ? const Color(0xff263241) : kTaskSurface,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => onChanged(!grid),
            child: Container(
              width: 48,
              height: 46,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                    color: dark ? const Color(0xff334155) : kTaskBorder),
              ),
              child: Icon(
                  grid ? Icons.view_agenda_outlined : Icons.grid_view_outlined,
                  size: 20,
                  color: taskMuted(context)),
            ),
          ),
        ),
      ),
    );
  }
}
