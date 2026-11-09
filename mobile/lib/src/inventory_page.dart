import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show SystemUiOverlayStyle;

import 'api_client.dart';
import 'app_navigation.dart';
import 'branch_scope.dart';
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

List<({String value, IconData icon, String label})> _inventorySectionsForRole(
        String? role) =>
    _inventorySections
        .where(
            (entry) => entry.value != 'mutasi' || canManageStockMutations(role))
        .toList(growable: false);

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

Color inventoryStockInk(BuildContext context, InventoryStockLevel level) =>
    Theme.of(context).brightness != Brightness.dark
        ? inventoryStockColor(level)
        : switch (level) {
            InventoryStockLevel.good => const Color(0xff86EFAC),
            InventoryStockLevel.low => const Color(0xffFDBA74),
            InventoryStockLevel.empty => const Color(0xffFCA5A5),
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
      {super.key,
      required this.api,
      required this.branchId,
      this.role,
      this.initialSection = 'stok'});
  final ApiClient api;
  final int branchId;
  final String? role;
  final String initialSection;

  bool get isOwner => role == 'owner';
  bool get canManageMutations => canManageStockMutations(role);

  @override
  State<InventoryPage> createState() => _InventoryPageState();
}

class _InventoryPageState extends State<InventoryPage> {
  String _section = 'stok';

  @override
  void initState() {
    super.initState();
    _section = widget.initialSection == 'mutasi' && !widget.canManageMutations
        ? 'stok'
        : widget.initialSection;
    if (widget.isOwner) BranchScope.active.addListener(_onBranchScopeChanged);
  }

  int get _activeBranchId => widget.isOwner
      ? BranchScope.active.value ?? widget.branchId
      : widget.branchId;

  void _onBranchScopeChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    if (widget.isOwner) {
      BranchScope.active.removeListener(_onBranchScopeChanged);
    }
    super.dispose();
  }

  void _selectSection(String value) {
    if (value == 'mutasi' && !widget.canManageMutations) return;
    if (value == 'transfer' || value == 'opname') {
      Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => Scaffold(
                backgroundColor: pageBg(context),
                appBar: AppBar(
                    title:
                        Text(value == 'transfer' ? 'Transfer stok' : 'Opname')),
                body: value == 'transfer'
                    ? _TransferSection(
                        api: widget.api,
                        branchId: _activeBranchId,
                        isOwner: widget.isOwner)
                    : _OpnameSection(
                        api: widget.api, branchId: _activeBranchId),
              )));
      return;
    }
    setState(() => _section = value);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.initialSection == 'incoming' ||
        widget.initialSection == 'outgoing') {
      if (!widget.canManageMutations) {
        return ColoredBox(
          color: pageBg(context),
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.lock_outline, size: 42, color: taskMuted(context)),
                  const SizedBox(height: 12),
                  Text('Akses mutasi stok dibatasi',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: ink(context),
                          fontSize: 18,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  Text(
                      'Hanya owner dan admin gudang yang dapat mencatat stok masuk atau stok keluar.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: taskMuted(context))),
                ],
              ),
            ),
          ),
        );
      }
      return _InOutForm(
        api: widget.api,
        branchId: _activeBranchId,
        kind: widget.initialSection,
      );
    }
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              _InventorySectionSelector(
                selected: _section,
                onChanged: _selectSection,
                sections: _inventorySectionsForRole(widget.role),
              ),
              Expanded(
                child: switch (_section) {
                  'stok' => _StockSection(
                      key: ValueKey(_activeBranchId),
                      api: widget.api,
                      branchId: _activeBranchId,
                      isOwner: widget.isOwner,
                      canViewAllWarehouses: widget.role == 'gudang'),
                  'mutasi' => _MutasiSection(
                      key: ValueKey(_activeBranchId),
                      api: widget.api,
                      branchId: _activeBranchId),
                  'transfer' => _TransferSection(
                      key: ValueKey(_activeBranchId),
                      api: widget.api,
                      branchId: _activeBranchId,
                      isOwner: widget.isOwner),
                  'opname' => _OpnameSection(
                      key: ValueKey(_activeBranchId),
                      api: widget.api,
                      branchId: _activeBranchId),
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
      {required this.selected,
      required this.onChanged,
      required this.sections});
  final String selected;
  final ValueChanged<String> onChanged;
  final List<({String value, IconData icon, String label})> sections;

  @override
  Widget build(BuildContext context) {
    final item = sections.firstWhere(
      (entry) => entry.value == selected,
      orElse: () => sections.first,
    );
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
        child: PopupMenuButton<String>(
          key: const ValueKey('inventory-section-selector'),
          tooltip: 'Pilih halaman stok',
          offset: const Offset(0, 8),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          onSelected: onChanged,
          itemBuilder: (context) => [
            for (final entry in sections)
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
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.label,
                          style: TextStyle(
                              color: ink(context),
                              fontSize: 20,
                              height: 1.05,
                              fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                Icon(Icons.keyboard_arrow_down,
                    size: 24, color: taskMuted(context)),
              ],
            ),
          ),
        ),
      ),
      Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(children: [
            for (final entry in sections)
              Expanded(
                  child: Semantics(
                      selected: entry.value == selected,
                      button: true,
                      child: InkWell(
                        onTap: () => onChanged(entry.value),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                              color: entry.value == selected
                                  ? Theme.of(context)
                                      .colorScheme
                                      .primaryContainer
                                  : Colors.transparent,
                              borderRadius: BorderRadius.circular(10)),
                          child: Column(children: [
                            Icon(entry.icon, size: 18, color: ink(context)),
                            const SizedBox(height: 4),
                            Text(entry.label,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 11, color: ink(context)))
                          ]),
                        ),
                      ))),
          ])),
      const SizedBox(height: 4)
    ]);
  }

  Color _sectionColor(({String value, IconData icon, String label}) entry) =>
      entry.value == 'mutasi' ? kTaskTeal : kTaskDark;
}

class _StockSection extends StatefulWidget {
  const _StockSection(
      {super.key,
      required this.api,
      required this.branchId,
      this.isOwner = false,
      this.canViewAllWarehouses = false});
  final ApiClient api;
  final int branchId;
  final bool isOwner;
  final bool canViewAllWarehouses;

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
    if (_warehouseId.isEmpty && widget.canViewAllWarehouses) {
      return 'Semua gudang';
    }
    for (final warehouse in _warehouses) {
      if ('${warehouse['id']}' == _warehouseId) {
        return _warehouseLabel(warehouse);
      }
    }
    return 'Gudang';
  }

  String _warehouseLabel(Map<String, dynamic> warehouse) {
    final name = warehouse['name']?.toString() ?? 'Gudang';
    final branch = warehouse['branch_name']?.toString();
    return branch == null || branch.isEmpty ? name : '$branch · $name';
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
    final selectedBranch =
        v == 'all' ? null : int.tryParse(v.replaceFirst('branch-', ''));
    setState(() {
      _branchMode = v;
      _branchId = selectedBranch;
      _warehouseId = '';
    });
    if (selectedBranch != null && BranchScope.active.value != selectedBranch) {
      await BranchScope.set(selectedBranch);
      return;
    }
    await _loadWarehouses();
    _load();
  }

  @override
  void initState() {
    super.initState();
    if (widget.canViewAllWarehouses) _branchMode = 'all';
    if (widget.isOwner) {
      _branchId = BranchScope.active.value ?? widget.branchId;
    }
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
    if (_branchMode == 'all' && !widget.canViewAllWarehouses) {
      if (mounted) {
        setState(() {
          _warehouses = [];
          _warehouseId = '';
        });
      }
      return;
    }
    try {
      final rows = widget.canViewAllWarehouses
          ? await widget.api.allWarehouses()
          : await widget.api.warehouses(_branchId ?? widget.branchId);
      if (!mounted) return;
      final warehouses = rows.cast<Map<String, dynamic>>();
      setState(() {
        _warehouses = warehouses;
        if (!widget.canViewAllWarehouses &&
            !warehouses.any((row) => '${row['id']}' == _warehouseId)) {
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
          warehouseId: int.tryParse(_warehouseId));
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
                                  const SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: 260,
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
                                    inventoryStockInk(context, stockLevel);
                                final stockSurface =
                                    inventoryStockSurface(context, stockLevel);
                                return GlassCard(
                                  padding: EdgeInsets.zero,
                                  radius: 12,
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
                                    inventoryStockInk(context, stockLevel);
                                final stockSurface =
                                    inventoryStockSurface(context, stockLevel);
                                return GlassCard(
                                  padding: const EdgeInsets.all(10),
                                  radius: 12,
                                  onTap: () => _openProductEditor(r),
                                  child: Row(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: SizedBox(
                                          width: 58,
                                          height: 72,
                                          child: UiProductPhoto(
                                            path: stockProductPhotoPath(r),
                                            baseUrl: widget.api.baseUrl,
                                            width: 58,
                                            height: 72,
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
                                                maxLines: 2,
                                                overflow: TextOverflow.ellipsis,
                                                style: const TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    fontSize: 14)),
                                            const SizedBox(height: 2),
                                            Text(
                                                '${r['sku'] ?? ''}${productSecondaryLabel(r).isNotEmpty ? ' · ${productSecondaryLabel(r)}' : ''}${(r['branch_name'] ?? '').toString().isNotEmpty ? ' · ${r['branch_name']}' : ''}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                    fontSize: 12,
                                                    color: taskMuted(context))),
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
                                          const SizedBox(height: 4),
                                          Text(
                                              switch (stockLevel) {
                                                InventoryStockLevel.good =>
                                                  'Tersedia',
                                                InventoryStockLevel.low =>
                                                  'Menipis',
                                                InventoryStockLevel.empty =>
                                                  'Habis',
                                              },
                                              style: TextStyle(
                                                  fontSize: 12,
                                                  fontWeight: FontWeight.w600,
                                                  color: Theme.of(context)
                                                              .brightness ==
                                                          Brightness.dark
                                                      ? switch (stockLevel) {
                                                          InventoryStockLevel
                                                                .good =>
                                                            const Color(
                                                                0xff86EFAC),
                                                          InventoryStockLevel
                                                                .low =>
                                                            const Color(
                                                                0xffFDBA74),
                                                          InventoryStockLevel
                                                                .empty =>
                                                            const Color(
                                                                0xffFCA5A5),
                                                        }
                                                      : stockColor)),
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
            color: dark ? kTaskDarkSurface : kTaskSurface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: dark ? kTaskDarkBorder : kTaskBorder),
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
    final dark = Theme.of(context).brightness == Brightness.dark;
    final valueColor = color == null
        ? ink(context)
        : !dark
            ? color!
            : color == kTaskStockLow
                ? const Color(0xffFDBA74)
                : const Color(0xffFCA5A5);
    return Expanded(
      child: GlassCard(
        radius: 14,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
        child: Column(
          children: [
            Text(label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: taskMuted(context))),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(value,
                      style: TextStyle(
                          fontSize: 17,
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
  const _MutasiSection({super.key, required this.api, required this.branchId});
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

  Future<void> _openForm(String kind) async {
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
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              Expanded(
                  child: FilledButton.icon(
                onPressed: () => _openForm('incoming'),
                style: FilledButton.styleFrom(
                    backgroundColor: kTaskTeal,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 64)),
                icon: const Icon(Icons.move_to_inbox_outlined),
                label: const Text('Stok masuk'),
              )),
              const SizedBox(width: 12),
              Expanded(
                  child: FilledButton.icon(
                onPressed: () => _openForm('outgoing'),
                style: FilledButton.styleFrom(
                    backgroundColor: kTaskTerracotta,
                    foregroundColor: Colors.white,
                    minimumSize: const Size(0, 64)),
                icon: const Icon(Icons.outbox_outlined),
                label: const Text('Stok keluar'),
              )),
            ])),
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
  List<Map<String, dynamic>> _catalog = [];
  String _warehouseId = '';
  String _channel = 'toko';
  String _transactionDate = todayWib();
  String _batch = '';
  String _notes = '';
  String _catalogQuery = '';
  final List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  bool _catalogLoading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final warehouses = (await widget.api.warehouses(widget.branchId))
          .cast<Map<String, dynamic>>();
      final warehouseId = warehouses.isEmpty ? '' : '${warehouses.first['id']}';
      final results = await Future.wait([
        widget.api.incomingProducts(
            branchId: widget.branchId, warehouseId: int.tryParse(warehouseId)),
        if (widget.kind == 'outgoing') widget.api.channels(),
      ]);
      if (!mounted) return;
      setState(() {
        _warehouses = warehouses;
        _catalog = results[0].cast<Map<String, dynamic>>();
        if (widget.kind == 'outgoing') {
          _channels = results[1].cast<Map<String, dynamic>>();
          if (!_channels
              .any((channel) => channel['value']?.toString() == _channel)) {
            _channel = _channels.isEmpty
                ? 'toko'
                : (_channels.first['value']?.toString() ?? 'toko');
          }
        }
        _warehouseId = warehouseId;
        _catalogLoading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _error = e.message;
          _catalogLoading = false;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _filteredCatalog {
    final query = _catalogQuery.trim().toLowerCase();
    if (query.isEmpty) return _catalog;
    return _catalog.where((product) {
      return (product['name'] ?? '').toString().toLowerCase().contains(query) ||
          (product['sku'] ?? '').toString().toLowerCase().contains(query);
    }).toList();
  }

  String _mediaUrl(String? path) {
    return stockProductMediaUrl(path, baseUrl: widget.api.baseUrl);
  }

  String _displayDate(String value) {
    final date = DateTime.tryParse(value);
    if (date == null) return value;
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
    return '${date.day.toString().padLeft(2, '0')} ${months[date.month - 1]} ${date.year}';
  }

  Future<void> _reloadCatalog(String warehouseId) async {
    if (warehouseId.isEmpty) return;
    setState(() {
      _catalogLoading = true;
      _catalogQuery = '';
      _items.clear();
    });
    try {
      final products = await widget.api.incomingProducts(
          branchId: widget.branchId, warehouseId: int.tryParse(warehouseId));
      if (!mounted) return;
      setState(() {
        _catalog = products.cast<Map<String, dynamic>>();
        _catalogLoading = false;
      });
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _catalogLoading = false;
          _error = e.message;
        });
      }
    }
  }

  Future<void> _addCatalogProduct(Map<String, dynamic> product) async {
    final variants =
        ((product['variants'] as List?) ?? []).cast<Map<String, dynamic>>();
    var variantId = variants.isEmpty ? null : variants.first['id'] as int?;
    final qty = TextEditingController(text: '1');
    final cost = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(productDisplayName(product)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (variants.isNotEmpty) ...[
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final variant in variants)
                      ChoiceChip(
                        label: Text(variant['color']?.toString() ?? ''),
                        selected: variant['id'] == variantId,
                        onSelected: (_) => setDialogState(
                            () => variantId = variant['id'] as int?),
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
              if (widget.kind == 'incoming') ...[
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
        .where((variant) => variant['id'] == variantId)
        .map((variant) => variant['color']?.toString() ?? '')
        .join(', ');
    setState(() {
      _items.add({
        'product_id': product['id'],
        if (variantId != null) 'variant_id': variantId,
        'name': product['name'],
        'photo_path': stockProductPhotoPath(product),
        'variant_label': variantLabel,
        'quantity': quantity,
        if (widget.kind == 'incoming' && cost.text.trim().isNotEmpty)
          'cost': double.tryParse(cost.text.replaceAll('.', '')) ?? 0,
      });
    });
  }

  int get _totalQuantity =>
      _items.fold<int>(0, (sum, item) => sum + asNum(item['quantity']).round());

  Widget _cartBar(BuildContext context) {
    final accent = _inOutAccent(widget.kind);
    return GlassCard(
      key: const ValueKey('inventory-inout-cart-bar'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      radius: 16,
      onTap: _items.isEmpty ? null : _showCartSheet,
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(10),
            ),
            child:
                Icon(Icons.shopping_basket_outlined, size: 19, color: accent),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Keranjang · ${_items.length} produk',
                    style: TextStyle(
                        color: accent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800)),
                Text(
                    _items.isEmpty
                        ? 'Belum ada produk dipilih'
                        : '$_totalQuantity pcs',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: taskMuted(context))),
              ],
            ),
          ),
          Text('Lihat',
              style: TextStyle(
                  color: accent, fontSize: 11, fontWeight: FontWeight.w800)),
          const SizedBox(width: 3),
          Icon(Icons.chevron_right, color: accent),
        ],
      ),
    );
  }

  Future<void> _showCartSheet() async {
    final accent = _inOutAccent(widget.kind);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: StatefulBuilder(
          builder: (sheetContext, setSheetState) => Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: ConstrainedBox(
              key: const ValueKey('inventory-inout-cart-sheet'),
              constraints: BoxConstraints(
                  maxHeight: MediaQuery.sizeOf(sheetContext).height * .62),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text('Keranjang · ${_items.length} produk',
                            style: TextStyle(
                                color: accent,
                                fontSize: 16,
                                fontWeight: FontWeight.w800)),
                      ),
                      Text('$_totalQuantity pcs',
                          style: TextStyle(
                              color: taskMuted(sheetContext),
                              fontWeight: FontWeight.w700)),
                      IconButton(
                        onPressed: () => Navigator.pop(sheetContext),
                        icon: const Icon(Icons.close),
                        tooltip: 'Tutup keranjang',
                      ),
                    ],
                  ),
                  const Divider(height: 8),
                  Flexible(
                    child: ListView.separated(
                      shrinkWrap: true,
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const Divider(height: 8),
                      itemBuilder: (_, index) {
                        final item = _items[index];
                        final variant =
                            (item['variant_label'] ?? '').toString();
                        return Row(
                          children: [
                            _InventoryThumbnail(
                                path: _mediaUrl(stockProductPhotoPath(item)),
                                size: const Size(38, 46)),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(productDisplayName(item),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700)),
                                  Text(
                                      '${variant.isEmpty ? '' : '$variant · '}${item['quantity']} pcs',
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: taskMuted(sheetContext))),
                                ],
                              ),
                            ),
                            IconButton(
                              onPressed: () async {
                                await _editItem(item,
                                    withCost: widget.kind == 'incoming');
                                if (mounted) setSheetState(() {});
                              },
                              icon: const Icon(Icons.edit_outlined, size: 18),
                              tooltip: 'Ubah jumlah',
                              visualDensity: VisualDensity.compact,
                            ),
                            IconButton(
                              onPressed: () {
                                setState(() => _items.removeAt(index));
                                setSheetState(() {});
                              },
                              icon: const Icon(Icons.delete_outline, size: 18),
                              tooltip: 'Hapus dari keranjang',
                              visualDensity: VisualDensity.compact,
                            ),
                          ],
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _addChannel() async {
    final name = await showDialog<String>(
      context: context,
      builder: (_) => const _AddChannelDialog(),
    );
    if (name == null || name.isEmpty || !mounted) return;
    try {
      final created = await widget.api.createChannel(name);
      if (!mounted) return;
      final createdData = created['data'];
      final createdRow = createdData is Map
          ? Map<String, dynamic>.from(createdData)
          : <String, dynamic>{};
      final createdValue =
          (createdRow['value']?.toString().trim().isNotEmpty ?? false)
              ? createdRow['value'].toString().trim()
              : _channelValue(name);
      createdRow['value'] = createdValue;
      createdRow['name'] =
          createdRow['name']?.toString().trim().isNotEmpty == true
              ? createdRow['name'].toString().trim()
              : name;

      List<Map<String, dynamic>> channels = [];
      try {
        final ch = await widget.api.channels();
        channels = ch
            .whereType<Map>()
            .map((row) => Map<String, dynamic>.from(row))
            .toList();
      } on ApiException {
        // POST sudah berhasil. Pertahankan item dari respons POST ketika
        // refresh GET tertunda atau gagal sesaat.
      }
      if (!mounted) return;
      if (!channels
          .any((row) => row['value']?.toString().trim() == createdValue)) {
        channels.add(createdRow);
      }
      setState(() {
        _channels = channels;
        _channel = createdValue;
      });
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  String _channelValue(String name) {
    final normalized = name
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_+|_+$'), '');
    return normalized.length > 30
        ? normalized.substring(0, 30).replaceFirst(RegExp(r'_+$'), '')
        : normalized;
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
                    style: TextStyle(fontSize: 12, color: taskMuted(context))),
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

  String get _selectedWarehouseName {
    for (final warehouse in _warehouses) {
      if ('${warehouse['id']}' == _warehouseId) {
        return warehouse['name']?.toString() ?? 'Gudang';
      }
    }
    return 'Pilih gudang';
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
        'transaction_date': _transactionDate,
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
        backgroundColor: kTaskDark,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        foregroundColor: Colors.white,
        // Judul dijamin putih (theme global memakai denim).
        titleTextStyle: const TextStyle(
            color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
        flexibleSpace: Container(color: kTaskDark),
        title: Row(
          children: [
            Expanded(
              child: Text(_inOutLabel(widget.kind),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            Text('${_items.length} item',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      ),
      body: _loading
          ? const UiLoadingState(label: 'Memuat formulir…')
          : (_error != null && _warehouses.isEmpty)
              ? UiErrorState(message: _error!, onRetry: () => _load())
              : UiTaskBody(
                  topPadding:
                      MediaQuery.of(context).padding.top + kToolbarHeight + 12,
                  footer: _cartBar(context),
                  action: FilledButton(
                    style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(52),
                        backgroundColor: accent,
                        foregroundColor: Colors.white),
                    onPressed: _saving ? null : _submit,
                    child: _saving
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : Text(widget.kind == 'incoming'
                            ? 'Simpan stok masuk'
                            : 'Simpan stok keluar'),
                  ),
                  children: [
                    GlassCard(
                      padding: EdgeInsets.zero,
                      radius: 16,
                      child: Theme(
                        data: Theme.of(context)
                            .copyWith(dividerColor: Colors.transparent),
                        child: ExpansionTile(
                          key: const ValueKey('inventory-inout-details'),
                          initiallyExpanded: false,
                          tilePadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 2),
                          childrenPadding:
                              const EdgeInsets.fromLTRB(12, 10, 12, 12),
                          leading:
                              Icon(Icons.inventory_2_outlined, color: accent),
                          title: Row(
                            children: [
                              Expanded(
                                child: Text(_selectedWarehouseName,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w800)),
                              ),
                              Text(_displayDate(_transactionDate),
                                  style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                          subtitle: Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                  _batch.trim().isEmpty && _notes.trim().isEmpty
                                      ? 'Batch / catatan'
                                      : '${_batch.trim().isEmpty ? 'Tanpa batch' : _batch.trim()}${_notes.trim().isEmpty ? '' : ' · ${_notes.trim()}'}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis),
                            ],
                          ),
                          iconColor: accent,
                          collapsedIconColor: accent,
                          children: [
                            InkWell(
                              onTap: () async {
                                final picked = await showDatePicker(
                                    context: context,
                                    initialDate:
                                        DateTime.parse(_transactionDate),
                                    firstDate: DateTime(2020),
                                    lastDate: DateTime.now()
                                        .add(const Duration(days: 366)));
                                if (picked == null || !mounted) return;
                                setState(() => _transactionDate =
                                    '${picked.year.toString().padLeft(4, '0')}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}');
                              },
                              child: InputDecorator(
                                  decoration: const InputDecoration(
                                      labelText: 'Tanggal',
                                      suffixIcon:
                                          Icon(Icons.calendar_today_outlined)),
                                  child: Text(_transactionDate)),
                            ),
                            const SizedBox(height: 8),
                            DropdownButtonFormField<String>(
                              initialValue:
                                  _warehouseId.isEmpty ? null : _warehouseId,
                              decoration: const InputDecoration(
                                  labelText: 'Gudang',
                                  border: OutlineInputBorder()),
                              items: [
                                for (final w in _warehouses)
                                  DropdownMenuItem(
                                      value: '${w['id']}',
                                      child: Text(w['name']?.toString() ?? '')),
                              ],
                              onChanged: (v) async {
                                final next = v ?? '';
                                setState(() => _warehouseId = next);
                                await _reloadCatalog(next);
                              },
                            ),
                            if (widget.kind == 'outgoing') ...[
                              const SizedBox(height: 8),
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
                                        value: c['value']?.toString() ?? '',
                                        child:
                                            Text(c['name']?.toString() ?? '')),
                                  if (_channels.isEmpty)
                                    const DropdownMenuItem(
                                        value: 'toko', child: Text('toko')),
                                ],
                                onChanged: (v) =>
                                    setState(() => _channel = v ?? 'toko'),
                              ),
                            ],
                            const SizedBox(height: 8),
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
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      onChanged: (value) =>
                          setState(() => _catalogQuery = value),
                      decoration: const InputDecoration(
                          prefixIcon: Icon(Icons.search),
                          isDense: true,
                          hintText: 'Cari produk',
                          border: OutlineInputBorder()),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 8),
                      Text(_error!,
                          style: TextStyle(
                              color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 10),
                    if (_catalogLoading)
                      const SizedBox(
                          height: 180,
                          child: UiLoadingState(label: 'Memuat produk…'))
                    else if (_filteredCatalog.isEmpty)
                      GlassCard(
                        padding: const EdgeInsets.all(20),
                        child: Text('Produk tidak ditemukan',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: taskMuted(context))),
                      )
                    else
                      GridView.builder(
                        key: const ValueKey('inventory-inout-catalog'),
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        padding: EdgeInsets.zero,
                        itemCount: _filteredCatalog.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: .68,
                        ),
                        itemBuilder: (_, index) {
                          final product = _filteredCatalog[index];
                          return GlassCard(
                            padding: EdgeInsets.zero,
                            radius: 14,
                            onTap: () => _addCatalogProduct(product),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Expanded(
                                  child: ClipRRect(
                                    borderRadius: const BorderRadius.vertical(
                                        top: Radius.circular(14)),
                                    child: UiProductPhoto(
                                      path: _mediaUrl(
                                          stockProductPhotoPath(product)),
                                      baseUrl: '',
                                      fit: BoxFit.cover,
                                      label:
                                          'Foto ${productDisplayName(product)}',
                                    ),
                                  ),
                                ),
                                Padding(
                                  padding:
                                      const EdgeInsets.fromLTRB(7, 6, 6, 6),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(productDisplayName(product),
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              fontSize: 11.5,
                                              fontWeight: FontWeight.w800)),
                                      const SizedBox(height: 3),
                                      Row(
                                        children: [
                                          Expanded(
                                            child: Text(
                                                'Stok ${product['stock'] ?? 0}',
                                                maxLines: 1,
                                                overflow: TextOverflow.ellipsis,
                                                style: TextStyle(
                                                    fontSize: 10.5,
                                                    color: taskMuted(context))),
                                          ),
                                          Container(
                                            width: 24,
                                            height: 24,
                                            decoration: BoxDecoration(
                                                color: accent,
                                                shape: BoxShape.circle),
                                            child: const Icon(Icons.add,
                                                size: 16, color: Colors.white),
                                          ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    const SizedBox(height: 96),
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
  bool _cartExpanded = false;

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
        'photo_path': stockProductPhotoPath(product),
        'variant_label': variantLabel,
        'quantity': quantity,
        if (widget.withCost && cost.text.trim().isNotEmpty)
          'cost': double.tryParse(cost.text.replaceAll('.', '')) ?? 0,
      });
    });
  }

  Future<void> _editAddedItem(int index) async {
    final item = _added[index];
    final qty = TextEditingController(text: '${item['quantity']}');
    final cost = TextEditingController(
        text: widget.withCost ? '${asNum(item['cost'] ?? 0)}' : '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(item['name']?.toString() ?? 'Ubah Produk'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if ((item['variant_label'] ?? '').toString().isNotEmpty)
              Text((item['variant_label'] ?? '').toString(),
                  style: TextStyle(fontSize: 12, color: taskMuted(context))),
            const SizedBox(height: 10),
            TextField(
              controller: qty,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                  labelText: 'Jumlah *', border: OutlineInputBorder()),
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
              child: const Text('Simpan')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final newQty = int.tryParse(qty.text) ?? 0;
    if (newQty <= 0) return;
    setState(() {
      item['quantity'] = newQty;
      if (widget.withCost) {
        item['cost'] = double.tryParse(cost.text.replaceAll('.', '')) ?? 0;
      }
    });
  }

  int get _totalQuantity =>
      _added.fold<int>(0, (sum, item) => sum + asNum(item['quantity']).round());

  Widget _cartBar(BuildContext context) {
    return GlassCard(
      key: const ValueKey('inventory-picker-cart-bar'),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      radius: 18,
      onTap: _added.isEmpty ? null : () => setState(() => _cartExpanded = true),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: widget.accent.withValues(alpha: .12),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(Icons.shopping_basket_outlined,
                size: 19, color: widget.accent),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Keranjang',
                    style: TextStyle(
                        color: widget.accent,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800)),
                Text(
                    _added.isEmpty
                        ? 'Belum ada produk dipilih'
                        : '${_added.length} produk · $_totalQuantity pcs',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: taskMuted(context))),
              ],
            ),
          ),
          Icon(Icons.keyboard_arrow_up,
              color: _added.isEmpty ? taskMuted(context) : widget.accent),
        ],
      ),
    );
  }

  Widget _cartPanel(BuildContext context) {
    final maxHeight = MediaQuery.sizeOf(context).height * .42;
    return GlassCard(
      key: const ValueKey('inventory-picker-cart-panel'),
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
      radius: 18,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight.clamp(220, 340)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.shopping_basket_outlined,
                    size: 19, color: widget.accent),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('Keranjang · ${_added.length} produk',
                      style: TextStyle(
                          color: widget.accent,
                          fontSize: 13,
                          fontWeight: FontWeight.w800)),
                ),
                IconButton(
                  onPressed: () => setState(() => _cartExpanded = false),
                  icon: const Icon(Icons.keyboard_arrow_down),
                  tooltip: 'Tutup keranjang',
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const Divider(height: 8),
            Expanded(
              child: ListView.separated(
                shrinkWrap: true,
                padding: const EdgeInsets.only(top: 2),
                itemCount: _added.length,
                separatorBuilder: (_, __) => const Divider(height: 8),
                itemBuilder: (_, index) {
                  final item = _added[index];
                  final variant = (item['variant_label'] ?? '').toString();
                  return Row(
                    children: [
                      Container(
                        width: 32,
                        height: 38,
                        decoration: BoxDecoration(
                          color: widget.accent.withValues(alpha: .12),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(Icons.inventory_2_outlined,
                            size: 17, color: widget.accent),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item['name']?.toString() ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 12, fontWeight: FontWeight.w700)),
                            Text(
                                '${variant.isEmpty ? '' : '$variant · '}${item['quantity']} pcs',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                    fontSize: 11, color: taskMuted(context))),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: () => _editAddedItem(index),
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        tooltip: 'Ubah jumlah di keranjang',
                        visualDensity: VisualDensity.compact,
                      ),
                      IconButton(
                        onPressed: () => setState(() => _added.removeAt(index)),
                        icon: const Icon(Icons.delete_outline, size: 18),
                        tooltip: 'Hapus dari keranjang',
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: kTaskDark,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        foregroundColor: Colors.white,
        titleTextStyle: const TextStyle(
            color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700),
        flexibleSpace: Container(color: kTaskDark),
        title: Text(widget.title),
        actions: [
          TextButton(
            onPressed:
                _added.isEmpty ? null : () => Navigator.pop(context, _added),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
            child: Text('Selesai (${_added.length})'),
          ),
        ],
      ),
      body: Stack(
        children: [
          Column(
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
                        padding: EdgeInsets.fromLTRB(
                            12, 0, 12, _cartExpanded ? 284 : 96),
                        itemCount: _filtered.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 3,
                          mainAxisSpacing: 10,
                          crossAxisSpacing: 10,
                          childAspectRatio: 0.72,
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
                                    path: widget
                                        .mediaUrl(stockProductPhotoPath(p)),
                                    baseUrl: '',
                                    fit: BoxFit.cover,
                                    label: 'Foto ${productDisplayName(p)}',
                                  ),
                                ),
                                Padding(
                                  padding: const EdgeInsets.all(8),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
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
                                          style: TextStyle(
                                              fontSize: 11,
                                              color: taskMuted(context))),
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
          Positioned(
            left: 12,
            right: 12,
            bottom: 12 + MediaQuery.paddingOf(context).bottom,
            child: _cartExpanded ? _cartPanel(context) : _cartBar(context),
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

  String _targetLabel(Map<String, dynamic> target) {
    final branchName = target['name']?.toString().trim();
    final warehouseName = target['warehouse_name']?.toString().trim();
    final labels = [
      if (branchName != null && branchName.isNotEmpty) branchName,
      if (warehouseName != null && warehouseName.isNotEmpty) warehouseName,
    ];
    return labels.isEmpty ? 'Lokasi tujuan' : labels.join(' · ');
  }

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
                    style: TextStyle(fontSize: 12, color: taskMuted(context))),
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
    return UiTaskBody(
      summary:
          '${_items.length} produk · ${_items.fold<num>(0, (sum, item) => sum + asNum(item['quantity']))} pcs',
      action: FilledButton(
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: _saving ? null : _submit,
        child: _saving
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Text('Buat Transfer'),
      ),
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
                  value: '${t['warehouse_id']}', child: Text(_targetLabel(t))),
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
              leading: _InventoryThumbnail(
                  path: stockProductMediaUrl(stockProductPhotoPath(item),
                      baseUrl: widget.api.baseUrl),
                  size: const Size(42, 56)),
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
    return UiTaskBody(
      summary: '${_items.length} produk dihitung',
      action: FilledButton.icon(
        key: const ValueKey('opname-save-button'),
        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
        onPressed: _saving ? null : _submit,
        icon: _saving
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.save_outlined),
        label: const Text('Simpan Opname'),
      ),
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
                  '${item['variant_label'] ?? ''}\nSistem ${item['expected_stock']} · Fisik ${item['physical_stock']}\nSelisih ${asNum(item['physical_stock']) - asNum(item['expected_stock'])}'),
              trailing: IconButton(
                onPressed: () => setState(() => _items.remove(item)),
                icon: const Icon(Icons.delete_outline),
              ),
            ),
          ),
      ],
    );
  }
}

class _AddChannelDialog extends StatefulWidget {
  const _AddChannelDialog();

  @override
  State<_AddChannelDialog> createState() => _AddChannelDialogState();
}

class _AddChannelDialogState extends State<_AddChannelDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _controller.text.trim();
    if (name.isNotEmpty) Navigator.pop(context, name);
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit = _controller.text.trim().isNotEmpty;
    return AlertDialog(
      title: const Text('Tambah Saluran'),
      content: TextField(
        controller: _controller,
        autofocus: true,
        textInputAction: TextInputAction.done,
        onChanged: (_) => setState(() {}),
        onSubmitted: (_) => _submit(),
        decoration: const InputDecoration(
            hintText: 'Nama saluran', border: OutlineInputBorder()),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal')),
        FilledButton(
            onPressed: canSubmit ? _submit : null, child: const Text('Tambah')),
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
            key: const ValueKey('opname-picker-done-button'),
            style: TextButton.styleFrom(foregroundColor: Colors.white),
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
                        'SKU ${p['sku'] ?? ''} · stok sistem ${p['quantity'] ?? p['stock'] ?? 0}'),
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
            color: active ? fg : (dark ? kTaskDarkBorder : kTaskBorder),
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
            Icon(Icons.expand_more, size: 18, color: taskMuted(context)),
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
                border: Border.all(color: dark ? kTaskDarkBorder : kTaskBorder),
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
        if (warehouses.isNotEmpty)
          const PopupMenuItem<String>(
            value: '',
            child: Row(
              children: [
                Icon(Icons.all_inclusive, size: 18),
                SizedBox(width: 10),
                Text('Semua gudang'),
              ],
            ),
          ),
        for (final warehouse in warehouses)
          PopupMenuItem<String>(
            value: '${warehouse['id']}',
            child: Row(
              children: [
                const Icon(Icons.warehouse_outlined, size: 18),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(_warehouseLabel(warehouse)),
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
    if (selectedId.isEmpty && warehouses.isNotEmpty) return 'Semua gudang';
    for (final warehouse in warehouses) {
      if ('${warehouse['id']}' == selectedId) {
        return _warehouseLabel(warehouse);
      }
    }
    return 'Gudang';
  }

  String _warehouseLabel(Map<String, dynamic> warehouse) {
    final name = warehouse['name']?.toString() ?? 'Gudang';
    final branch = warehouse['branch_name']?.toString();
    return branch == null || branch.isEmpty ? name : '$branch · $name';
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
                  Icon(Icons.check,
                      size: 18, color: Theme.of(context).colorScheme.primary),
              ],
            ),
          ),
      ],
      child: Container(
        width: 48,
        height: 46,
        decoration: BoxDecoration(
          color: dark ? kTaskDarkSurface : kTaskSurface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: dark ? kTaskDarkBorder : kTaskBorder),
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
          color: dark ? kTaskDarkSurface : kTaskSurface,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => onChanged(!grid),
            child: Container(
              width: 48,
              height: 46,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: dark ? kTaskDarkBorder : kTaskBorder),
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
