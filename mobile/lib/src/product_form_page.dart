import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'api_client.dart';
import 'task_ui.dart';

class _VariantRow {
  _VariantRow()
      : size = TextEditingController(),
        color = TextEditingController(),
        sku = TextEditingController(),
        barcode = TextEditingController(),
        price = TextEditingController();
  int? id;
  final TextEditingController size;
  final TextEditingController color;
  final TextEditingController sku;
  final TextEditingController barcode;
  final TextEditingController price;
}

class _TierRow {
  _TierRow()
      : minQty = TextEditingController(),
        maxQty = TextEditingController(),
        price = TextEditingController();
  final TextEditingController minQty;
  final TextEditingController maxQty;
  final TextEditingController price;
}

class _PhotoItem {
  _PhotoItem.picked(this.bytes, this.mime, this.base64)
      : mediaId = null,
        url = null;
  _PhotoItem.existing(this.mediaId, this.url)
      : bytes = null,
        mime = null,
        base64 = null;
  final Uint8List? bytes;
  final String? mime;
  final String? base64;
  final int? mediaId;
  final String? url;
  bool removed = false;
}

class ProductFormPage extends StatefulWidget {
  const ProductFormPage(
      {super.key, required this.api, required this.branchId, this.existing});
  final ApiClient api;
  final int branchId;
  final Map<String, dynamic>? existing;

  @override
  State<ProductFormPage> createState() => _ProductFormPageState();
}

class _ProductFormPageState extends State<ProductFormPage> {
  final _name = TextEditingController();
  final _sku = TextEditingController();
  final _barcode = TextEditingController();
  final _price = TextEditingController();
  final _cost = TextEditingController();
  final _minStock = TextEditingController(text: '5');
  final _description = TextEditingController();
  final List<_VariantRow> _variants = [];
  final List<_TierRow> _tiers = [];
  final List<_PhotoItem> _photos = [];
  List<Map<String, dynamic>> _categories = [];
  String _categoryId = '';
  String _gender = 'unisex';
  bool _loading = true;
  bool _saving = false;

  String _mediaUrl(String? path) => path == null || path.isEmpty
      ? ''
      : (widget.api.baseUrl.split('/api').first + path);

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    _sku.dispose();
    _barcode.dispose();
    _price.dispose();
    _cost.dispose();
    _minStock.dispose();
    _description.dispose();
    for (final v in _variants) {
      v.size.dispose();
      v.color.dispose();
      v.sku.dispose();
      v.barcode.dispose();
      v.price.dispose();
    }
    for (final t in _tiers) {
      t.minQty.dispose();
      t.maxQty.dispose();
      t.price.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final categories = await widget.api.productCategories();
      final existing = widget.existing;
      if (existing != null) {
        final detail = await widget.api
            .product(int.parse('${existing['id']}'), branchId: widget.branchId);
        _fill(detail);
      }
      if (!mounted) return;
      setState(() {
        _categories = categories.cast<Map<String, dynamic>>();
        if (_categoryId.isEmpty && _categories.isNotEmpty) {
          _categoryId = '${_categories.first['id']}';
        }
        _loading = false;
      });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _fill(Map<String, dynamic> d) {
    _name.text = d['name']?.toString() ?? '';
    _sku.text = d['sku']?.toString() ?? '';
    _barcode.text = d['barcode']?.toString() ?? '';
    _price.text = (asNumSafe(d['price'])).toStringAsFixed(0);
    _cost.text = (asNumSafe(d['cost'])).toStringAsFixed(0);
    _minStock.text = (asNumSafe(d['min_stock'])).toStringAsFixed(0);
    _description.text = d['description']?.toString() ?? '';
    _categoryId = '${d['category_id']}';
    _gender = d['gender']?.toString() ?? 'unisex';
    for (final v in (d['variants'] as List?) ?? []) {
      final m = v as Map<String, dynamic>;
      final row = _VariantRow();
      row.id = int.tryParse('${m['id']}');
      row.size.text = m['size']?.toString() ?? '';
      row.color.text = m['color']?.toString() ?? '';
      row.sku.text = m['sku']?.toString() ?? '';
      row.barcode.text = m['barcode']?.toString() ?? '';
      row.price.text = (asNumSafe(m['price'])).toStringAsFixed(0);
      _variants.add(row);
    }
    for (final w in (d['wholesale_prices'] as List?) ?? []) {
      final m = w as Map<String, dynamic>;
      final row = _TierRow();
      row.minQty.text = (asNumSafe(m['min_qty'])).toStringAsFixed(0);
      row.maxQty.text = (asNumSafe(m['max_qty'])).toStringAsFixed(0);
      row.price.text = (asNumSafe(m['price'])).toStringAsFixed(0);
      _tiers.add(row);
    }
    for (final m in (d['media'] as List?) ?? []) {
      final media = m as Map<String, dynamic>;
      if (media['media_type']?.toString() == 'image') {
        _photos.add(_PhotoItem.existing(
            int.tryParse('${media['id']}'), _mediaUrl(media['path']?.toString())));
      }
    }
  }

  double asNumSafe(dynamic v) {
    final n = double.tryParse('$v') ?? 0;
    return n;
  }

  InputDecoration _dec(String label,
      {String? prefix, Widget? suffix, bool multi = false}) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(16),
      borderSide: const BorderSide(color: kTaskBorder),
    );
    return InputDecoration(
      labelText: label,
      prefixText: prefix,
      suffixIcon: suffix,
      filled: true,
      fillColor: Colors.white,
      contentPadding: EdgeInsets.symmetric(
          horizontal: 14,
          vertical: multi ? 18 : 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: const BorderSide(color: kTaskDark, width: 1.4)),
    );
  }

  Future<void> _pickPhotos() async {
    final picked = await ImagePicker().pickMultiImage(
        maxWidth: 1200, maxHeight: 1200, imageQuality: 85);
    if (picked.isEmpty || !mounted) return;
    for (final p in picked) {
      if (_photos.where((x) => !x.removed).length >= 10) break;
      final bytes = await p.readAsBytes();
      _photos.add(_PhotoItem.picked(
          bytes, p.mimeType ?? 'image/jpeg', base64Encode(bytes)));
    }
    setState(() {});
  }

  void _removePhoto(_PhotoItem item) {
    setState(() {
      if (item.mediaId != null) {
        item.removed = true;
      } else {
        _photos.remove(item);
      }
    });
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty ||
        _categoryId.isEmpty ||
        _price.text.trim().isEmpty) {
      _snack('Nama, kategori, dan harga jual wajib diisi');
      return;
    }
    setState(() {
      _saving = true;
    });
    final body = <String, dynamic>{
      'name': _name.text.trim(),
      'category_id': int.tryParse(_categoryId),
      'sku': _sku.text.trim().isEmpty ? null : _sku.text.trim(),
      'barcode': _barcode.text.trim().isEmpty ? null : _barcode.text.trim(),
      'price': double.tryParse(_price.text.replaceAll('.', '')) ?? 0,
      'cost': double.tryParse(_cost.text.replaceAll('.', '')) ?? 0,
      'min_stock': double.tryParse(_minStock.text.replaceAll('.', '')) ?? 5,
      'gender': _gender,
      'description': _description.text.trim().isEmpty
          ? null
          : _description.text.trim(),
      'wholesale_prices': [
        for (final t in _tiers)
          if (t.minQty.text.trim().isNotEmpty && t.price.text.trim().isNotEmpty)
            {
              'min_qty': int.tryParse(t.minQty.text.trim()) ?? 1,
              'max_qty': int.tryParse(t.maxQty.text.trim()),
              'price':
                  double.tryParse(t.price.text.replaceAll('.', '')) ?? 0,
            },
      ],
      'variants': [
        for (final v in _variants)
          if (v.color.text.trim().isNotEmpty || v.size.text.trim().isNotEmpty)
            {
              if (v.id != null) 'id': v.id,
              'size': v.size.text.trim().isEmpty ? null : v.size.text.trim(),
              'color':
                  v.color.text.trim().isEmpty ? null : v.color.text.trim(),
              'sku': v.sku.text.trim().isEmpty ? null : v.sku.text.trim(),
              'barcode':
                  v.barcode.text.trim().isEmpty ? null : v.barcode.text.trim(),
              'price': double.tryParse(v.price.text.replaceAll('.', '')) ?? 0,
            },
      ],
    };
    try {
      final int productId;
      if (widget.existing == null) {
        final res = await widget.api.createProduct(body);
        productId = int.parse('${res['id']}');
      } else {
        productId = int.parse('${widget.existing!['id']}');
        await widget.api.updateProduct(productId, body);
      }
      for (final p in _photos) {
        if (p.bytes != null) {
          await widget.api
              .uploadProductMedia(productId, p.mime ?? 'image/jpeg', p.base64!);
        } else if (p.removed && p.mediaId != null) {
          await widget.api.deleteProductMedia(productId, p.mediaId!);
        }
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        _snack(e.message);
      }
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return ColoredBox(
      color: kTaskBg,
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          ListView(
            padding: const EdgeInsets.all(12),
            children: [
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                        widget.existing == null
                            ? 'Tambah Produk'
                            : 'Edit Produk',
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: kTaskDark)),
                    const SizedBox(height: 14),
                    TextField(controller: _name, decoration: _dec('Nama *')),
                    const SizedBox(height: 10),
                    DropdownButtonFormField<String>(
                      initialValue: _categoryId,
                      decoration: _dec('Kategori *'),
                      items: [
                        for (final c in _categories)
                          DropdownMenuItem(
                              value: '${c['id']}',
                              child: Text(c['name']?.toString() ?? '')),
                      ],
                      onChanged: (v) =>
                          setState(() => _categoryId = v ?? ''),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                            child: TextField(
                                controller: _sku,
                                decoration: _dec('SKU'))),
                        const SizedBox(width: 10),
                        Expanded(
                            child: TextField(
                                controller: _barcode,
                                decoration: _dec('Barcode'))),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                            child: TextField(
                                controller: _price,
                                keyboardType: TextInputType.number,
                                decoration: _dec('Harga jual *',
                                    prefix: 'Rp '))),
                        const SizedBox(width: 10),
                        Expanded(
                            child: TextField(
                                controller: _cost,
                                keyboardType: TextInputType.number,
                                decoration:
                                    _dec('Harga modal', prefix: 'Rp '))),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                            child: TextField(
                                controller: _minStock,
                                keyboardType: TextInputType.number,
                                decoration: _dec('Stok min'))),
                        const SizedBox(width: 10),
                        Expanded(
                            child: DropdownButtonFormField<String>(
                          initialValue: _gender,
                          decoration: _dec('Gender'),
                          items: const [
                            DropdownMenuItem(
                                value: 'unisex', child: Text('Unisex')),
                            DropdownMenuItem(
                                value: 'male', child: Text('Pria')),
                            DropdownMenuItem(
                                value: 'female', child: Text('Wanita')),
                            DropdownMenuItem(
                                value: 'kids', child: Text('Anak-anak')),
                          ],
                          onChanged: (v) =>
                              setState(() => _gender = v ?? 'unisex'),
                        )),
                      ],
                    ),
                    const SizedBox(height: 10),
                    TextField(
                        controller: _description,
                        maxLines: 3,
                        decoration: _dec('Deskripsi', multi: true)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                            child: Text('Varian (warna/ukuran)',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: kTaskDark))),
                        TextButton.icon(
                          onPressed: () => setState(() => _variants.add(_VariantRow())),
                          icon: const Icon(Icons.add, size: 16),
                          label: const Text('Tambah'),
                        ),
                      ],
                    ),
                    for (var i = 0; i < _variants.length; i++)
                      _variantCard(_variants[i], i),
                    if (_variants.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('Belum ada varian. Produk dijual polos.',
                            style:
                                TextStyle(fontSize: 11, color: kTaskGray)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                            child: Text('Harga Grosir',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: kTaskDark))),
                        TextButton.icon(
                          onPressed: () => setState(() => _tiers.add(_TierRow())),
                          icon: const Icon(Icons.add, size: 16),
                          label: const Text('Tambah'),
                        ),
                      ],
                    ),
                    for (var i = 0; i < _tiers.length; i++)
                      _tierCard(_tiers[i], i),
                    if (_tiers.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('Belum ada harga grosir.',
                            style:
                                TextStyle(fontSize: 11, color: kTaskGray)),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              GlassCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        const Expanded(
                            child: Text('Foto Produk',
                                style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: kTaskDark))),
                        TextButton.icon(
                          onPressed: _pickPhotos,
                          icon: const Icon(Icons.add_photo_alternate,
                              size: 16),
                          label: const Text('Tambah Foto'),
                        ),
                      ],
                    ),
                    if (_photos.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 8),
                        child: Text('Belum ada foto (maks 10).',
                            style:
                                TextStyle(fontSize: 11, color: kTaskGray)),
                      )
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final p in _photos)
                            if (!p.removed)
                              Stack(
                                clipBehavior: Clip.none,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(12),
                                    child: SizedBox(
                                      width: 72,
                                      height: 72,
                                      child: p.bytes != null
                                          ? Image.memory(p.bytes!,
                                              fit: BoxFit.cover)
                                          : Image.network(p.url!,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, __, ___) =>
                                                  const ColoredBox(
                                                      color:
                                                          Color(0xffE6ECF3))),
                                    ),
                                  ),
                                  Positioned(
                                    top: -6,
                                    right: -6,
                                    child: GestureDetector(
                                      onTap: () => _removePhoto(p),
                                      child: Container(
                                        width: 20,
                                        height: 20,
                                        decoration: const BoxDecoration(
                                          color: Color(0xffC2410C),
                                          shape: BoxShape.circle,
                                        ),
                                        child: const Icon(Icons.close,
                                            size: 13, color: Colors.white),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                        ],
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(
                  backgroundColor: kTaskDark,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(28)),
                  minimumSize: const Size.fromHeight(50),
                ),
                child: Text(_saving ? 'Menyimpan...' : 'Simpan Produk'),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ],
      ),
    );
  }

  Widget _variantCard(_VariantRow v, int i) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0x0F1E3A5F),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                  child: TextField(
                      controller: v.color,
                      decoration: _dec('Warna'))),
              const SizedBox(width: 8),
              Expanded(
                  child: TextField(
                      controller: v.size, decoration: _dec('Ukuran'))),
              IconButton(
                onPressed: () =>
                    setState(() => _variants.removeAt(i)),
                icon: const Icon(Icons.delete_outline,
                    size: 18, color: Color(0xffC2410C)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: TextField(
                      controller: v.sku, decoration: _dec('SKU varian'))),
              const SizedBox(width: 8),
              Expanded(
                  child: TextField(
                      controller: v.barcode,
                      decoration: _dec('Barcode'))),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
              controller: v.price,
              keyboardType: TextInputType.number,
              decoration: _dec('Harga varian', prefix: 'Rp ')),
        ],
      ),
    );
  }

  Widget _tierCard(_TierRow t, int i) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0x0F1E3A5F),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
              child: TextField(
                  controller: t.minQty,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Min qty'))),
          const SizedBox(width: 8),
          Expanded(
              child: TextField(
                  controller: t.maxQty,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Max qty'))),
          const SizedBox(width: 8),
          Expanded(
              child: TextField(
                  controller: t.price,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Harga', prefix: 'Rp '))),
          IconButton(
            onPressed: () => setState(() => _tiers.removeAt(i)),
            icon: const Icon(Icons.delete_outline,
                size: 18, color: Color(0xffC2410C)),
          ),
        ],
      ),
    );
  }
}
