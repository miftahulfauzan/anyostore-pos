// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'format.dart';
import 'printer_setup.dart';
import 'product_form_page.dart';
import 'task_ui.dart';

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
      await widget.api.copyProduct(int.parse('${r['id']}'));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Produk disalin — cek daftar untuk edit SKU/barcode')));
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
      await widget.api.deleteProduct(int.parse('${row['id']}'));
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
                  child: DropdownButtonFormField<int?>(
                    initialValue: _effectiveBranch,
                    isExpanded: true,
                    decoration: const InputDecoration(
                        isDense: true,
                        labelText: 'Toko/Gudang',
                        border: OutlineInputBorder()),
                    items: [
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
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    hintText: 'Cari nama / SKU / barcode',
                    prefixIcon: const Icon(Icons.search, size: 20),
                    filled: true,
                    fillColor: Colors.white,
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: const BorderSide(color: kTaskBorder)),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide:
                            BorderSide(color: ink(context), width: 1.4)),
                  ),
                  onSubmitted: (_) => _load(),
                ),
              ),
              Expanded(
                child: _loading
                    ? const Center(child: CircularProgressIndicator())
                    : _error != null
                        ? Center(child: Text(_error!))
                        : _rows.isEmpty
                            ? const Center(
                                child: Text(
                                    'Belum ada produk. Ketuk Tambah Produk.'))
                            : ListView.separated(
                                padding: const EdgeInsets.all(12),
                                itemCount: _rows.length,
                                separatorBuilder: (_, __) =>
                                    const SizedBox(height: 8),
                                itemBuilder: (_, i) {
                                  final r = _rows[i];
                                  final photo =
                                      _mediaUrl(r['photo_path']?.toString());
                                  return GlassCard(
                                    padding: const EdgeInsets.all(10),
                                    radius: 20,
                                    onTap: () => _openForm(r),
                                    child: Row(
                                      children: [
                                        ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(12),
                                          child: SizedBox(
                                            width: 48,
                                            height: 48,
                                            child: photo.isEmpty
                                                ? ColoredBox(
                                                    color: Color(0xffE6ECF3),
                                                    child: Icon(
                                                        Icons.inventory_2,
                                                        color: ink(context)),
                                                  )
                                                : Image.network(
                                                    photo,
                                                    fit: BoxFit.cover,
                                                    cacheWidth: 160,
                                                    errorBuilder:
                                                        (_, __, ___) =>
                                                            ColoredBox(
                                                      color: Color(0xffE6ECF3),
                                                      child: Icon(
                                                          Icons.inventory_2,
                                                          color: ink(context)),
                                                    ),
                                                  ),
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Text(r['name']?.toString() ?? '',
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: TextStyle(
                                                      fontSize: 13,
                                                      fontWeight:
                                                          FontWeight.w800,
                                                      color: ink(context))),
                                              const SizedBox(height: 2),
                                              Text(
                                                  '${r['sku'] ?? ''} · Stok ${r['stock'] ?? 0}',
                                                  style: const TextStyle(
                                                      fontSize: 10,
                                                      color: kTaskGray)),
                                            ],
                                          ),
                                        ),
                                        Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.end,
                                          children: [
                                            Text(fmtRp(asNum(r['price'])),
                                                style: TextStyle(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.w800,
                                                    color: ink(context))),
                                            Row(
                                              mainAxisSize: MainAxisSize.min,
                                              children: [
                                                IconButton(
                                                  onPressed: () =>
                                                      _printLabel(r),
                                                  visualDensity:
                                                      VisualDensity.compact,
                                                  tooltip: 'Cetak label harga',
                                                  icon: Icon(Icons.print,
                                                      size: 18,
                                                      color: ink(context)),
                                                ),
                                                IconButton(
                                                  onPressed: () => _copy(r),
                                                  visualDensity:
                                                      VisualDensity.compact,
                                                  tooltip: 'Salin produk',
                                                  icon: const Icon(
                                                      Icons.copy_outlined,
                                                      size: 17),
                                                ),
                                                IconButton(
                                                  onPressed: () => _delete(r),
                                                  visualDensity:
                                                      VisualDensity.compact,
                                                  icon: const Icon(
                                                      Icons.delete_outline,
                                                      size: 18,
                                                      color: Color(0xffC2410C)),
                                                ),
                                              ],
                                            ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  );
                                },
                              ),
              ),
              Padding(
                // Ruang bawah aman iPhone (home indicator).
                padding: EdgeInsets.fromLTRB(
                    12, 4, 12, 12 + MediaQuery.of(context).padding.bottom),
                child: FilledButton.icon(
                  onPressed: () => _openForm(),
                  style: FilledButton.styleFrom(
                    backgroundColor: kTaskDark,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28)),
                    minimumSize: const Size.fromHeight(50),
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
