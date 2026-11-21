// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'auth_store.dart';
import 'branch_scope.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'product_form_page.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

class ProductsPage extends StatefulWidget {
  const ProductsPage({super.key, required this.api, required this.branchId});
  final ApiClient api;
  final int branchId;

  @override
  State<ProductsPage> createState() => _ProductsPageState();
}

class _ProductsPageState extends State<ProductsPage> {
  final _search = TextEditingController();
  List<Map<String, dynamic>> _rows = [];
  bool _loading = true;
  String? _error;
  bool _isOwner = false;
  List<Map<String, dynamic>> _branches = [];
  int? _branchId;

  int get _effectiveBranch => _branchId ?? widget.branchId;

  String _mediaUrl(String? path) => path == null || path.isEmpty
      ? ''
      : (widget.api.baseUrl.split('/api').first + path);

  @override
  void initState() {
    super.initState();
    _isOwner = context.read<AuthStore>().role == 'owner';
    if (_isOwner) _loadBranches();
    _load();
  }

  Future<void> _loadBranches() async {
    try {
      final rows = await widget.api.branches();
      if (mounted) {
        setState(() => _branches = rows.cast<Map<String, dynamic>>());
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final rows = await widget.api
          .products(branchId: _effectiveBranch, search: _search.text.trim());
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openForm([Map<String, dynamic>? existing]) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ProductFormPage(
          api: widget.api, branchId: _effectiveBranch, existing: existing),
    ));
    _load();
  }

  Future<void> _printLabel(Map<String, dynamic> row) async {
    await printNow(
      context,
      (printer, device) => printer.printPriceLabel(
        name: row['name']?.toString() ?? '',
        price: fmtRp(asNum(row['price'])),
        sku: row['sku']?.toString(),
        barcode: row['barcode']?.toString(),
      ),
      title: 'Cetak Label Harga (rak 40x30)',
    );
  }

  Future<void> _copy(Map<String, dynamic> r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Salin produk?'),
        content: Text(
            'Membuat salinan "${r['name']}" (varian, harga grosir, dan foto ikut disalin; stok dimulai 0).'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Batal')),
          FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Salin')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await widget.api
          .copyProduct(int.parse('${r['id']}'), branchId: _effectiveBranch);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Produk disalin. Periksa daftar untuk mengedit SKU/barcode')));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _delete(Map<String, dynamic> row) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus produk?'),
        content: Text('${row['name'] ?? ''} akan dihapus dari katalog.'),
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
      await widget.api
          .deleteProduct(int.parse('${row['id']}'), branchId: _effectiveBranch);
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  int get _lowStockCount => _rows.where((row) {
        final stock = asNum(row['stock']);
        final minStock =
            row['min_stock'] == null ? 5 : asNum(row['min_stock']).toInt();
        return stock <= minStock;
      }).length;

  Widget _productCard(Map<String, dynamic> row) {
    final name = productDisplayName(row);
    final sku = row['sku']?.toString().trim() ?? '';
    final category = row['category_name']?.toString().trim() ?? '';
    final stock = asNum(row['stock']).toInt();
    final minStock =
        row['min_stock'] == null ? 5 : asNum(row['min_stock']).toInt();
    final status = appStockStyle(context, stock, minStock);
    final photo = _mediaUrl(row['photo_path']?.toString());
    final subtitle =
        [sku, category].where((part) => part.isNotEmpty).join(' · ');
    return AppListCard(
      onTap: () => _openForm(row),
      tint: taskSurface(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 52,
              height: 52,
              child: UiProductPhoto(
                path: photo,
                baseUrl: '',
                width: 52,
                height: 52,
                fit: BoxFit.cover,
                label: 'Foto $name',
              ),
            ),
          ),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                    ),
                    const SizedBox(width: 6),
                    Text(fmtRp(asNum(row['price'])),
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ],
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 1),
                  Text(subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          TextStyle(fontSize: 10.5, color: taskMuted(context))),
                ],
                const SizedBox(height: 5),
                AppStatusPill(
                    label: '${status.label} · $stock',
                    fg: status.fg,
                    bg: status.bg),
              ],
            ),
          ),
          AppKebab(
            tooltip: 'Aksi produk',
            onSelected: (value) {
              if (value == 'print') {
                _printLabel(row);
              } else if (value == 'copy') {
                _copy(row);
              } else if (value == 'delete') {
                _delete(row);
              }
            },
            items: const [
              PopupMenuItem(value: 'print', child: Text('Cetak label harga')),
              PopupMenuItem(value: 'copy', child: Text('Salin produk')),
              PopupMenuItem(value: 'delete', child: Text('Hapus produk')),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              if (_isOwner)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                  child: AppSelectField<int?>(
                    value: _effectiveBranch,
                    decoration: appFieldDecoration(context,
                        label: 'Toko/Gudang', icon: Icons.storefront_outlined),
                    items: [
                      for (final b in _branches)
                        DropdownMenuItem<int?>(
                            value: int.tryParse('${b['id']}'),
                            child: Text(b['name']?.toString() ?? '')),
                    ],
                    onChanged: (v) async {
                      setState(() => _branchId = v);
                      if (v != null) await BranchScope.set(v);
                      await _load();
                    },
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: 'Cari nama / SKU / barcode',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    filled: true,
                    fillColor: taskSurface(context),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: taskBorder(context))),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(
                            color: Theme.of(context).colorScheme.primary,
                            width: 2)),
                  ),
                  onSubmitted: (_) => _load(),
                ),
              ),
              if (!_loading && _error == null && _rows.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                  child: Row(
                    children: [
                      Icon(Icons.inventory_2_outlined,
                          size: 14, color: taskMuted(context)),
                      const SizedBox(width: 6),
                      Text('${_rows.length} produk',
                          style: TextStyle(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                      if (_lowStockCount > 0) ...[
                        const SizedBox(width: 6),
                        Text('· $_lowStockCount perlu restock',
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: const Color(0xFFB45309))),
                      ],
                    ],
                  ),
                ),
              Expanded(
                child: _loading
                    ? const UiLoadingState(label: 'Memuat produk…')
                    : _error != null
                        ? UiErrorState(message: _error!, onRetry: _load)
                        : _rows.isEmpty
                            ? AppEmptyState(
                                icon: Icons.inventory_2_outlined,
                                title: 'Belum ada produk',
                                message:
                                    'Tambahkan produk pertama untuk mulai berjualan.',
                                actionLabel: 'Tambah produk',
                                onAction: () => _openForm(),
                              )
                            : ListView(
                                padding:
                                    const EdgeInsets.fromLTRB(12, 10, 12, 12),
                                children: [
                                  for (final row in _rows) _productCard(row),
                                ],
                              ),
              ),
              Padding(
                // Ruang bawah aman iPhone (home indicator).
                padding: EdgeInsets.fromLTRB(
                    12, 4, 12, 12 + MediaQuery.of(context).padding.bottom),
                child: FilledButton.icon(
                  onPressed: () => _openForm(),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  icon: const Icon(Icons.add, size: 20),
                  label: const Text('Tambah Produk'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
