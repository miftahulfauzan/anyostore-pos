import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'format.dart';

class VariantPicker extends StatefulWidget {
  const VariantPicker(
      {super.key,
      required this.product,
      required this.variants,
      required this.mediaUrl});
  final Map<String, dynamic> product;
  final List<Map<String, dynamic>> variants;

  /// Mengubah path foto relatif -> URL penuh.
  final String Function(String?) mediaUrl;

  @override
  State<VariantPicker> createState() => _VariantPickerState();
}

class _VariantPickerState extends State<VariantPicker> {
  int? _variantId;
  int _qty = 1;

  @override
  void initState() {
    super.initState();
    if (widget.variants.isNotEmpty) {
      _variantId = widget.variants.first['id'] as int?;
    }
  }

  Map<String, dynamic>? get _selected {
    for (final v in widget.variants) {
      if (v['id'] == _variantId) return v;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final sel = _selected;
    final selPrice = sel != null ? asNum(sel['price']) : 0;
    final price = selPrice > 0 ? selPrice : asNum(widget.product['price']);
    return AlertDialog(
      title: Text(widget.product['name']?.toString() ?? 'Produk',
          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.variants.isEmpty)
              Text('Tidak ada varian aktif',
                  style: TextStyle(color: Theme.of(context).colorScheme.error))
            else ...[
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final v in widget.variants)
                    _VariantBox(
                      variant: v,
                      selected: v['id'] == _variantId,
                      mediaUrl: widget.mediaUrl,
                      onTap: () => setState(() => _variantId = v['id'] as int?),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              if (sel != null)
                Text('Stok: ${sel['stock'] ?? 0}',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.outline)),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                Text('Harga: ${fmtRp(price)}',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                const Spacer(),
                IconButton(
                    onPressed: () =>
                        setState(() => _qty = _qty > 1 ? _qty - 1 : 1),
                    icon: const Icon(Icons.remove_circle_outline)),
                _QtyField(
                  value: _qty,
                  onChanged: (v) => setState(() => _qty = v),
                ),
                IconButton(
                    onPressed: () => setState(() => _qty++),
                    icon: const Icon(Icons.add_circle_outline)),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Batal')),
        FilledButton(
          onPressed: () =>
              Navigator.pop(context, {'variant_id': _variantId, 'qty': _qty}),
          child: const Text('Tambah'),
        ),
      ],
    );
  }
}

class _QtyField extends StatefulWidget {
  const _QtyField({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  State<_QtyField> createState() => _QtyFieldState();
}

class _QtyFieldState extends State<_QtyField> {
  late final TextEditingController _c;
  late final FocusNode _fn;

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: '${widget.value}');
    _fn = FocusNode()..addListener(_selectAll);
  }

  void _selectAll() {
    if (_fn.hasFocus) {
      _c.selection = TextSelection(baseOffset: 0, extentOffset: _c.text.length);
    }
  }

  @override
  void didUpdateWidget(_QtyField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value && _c.text != '${widget.value}') {
      _c.text = '${widget.value}';
    }
  }

  @override
  void dispose() {
    _fn.dispose();
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      child: TextField(
        controller: _c,
        focusNode: _fn,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _fn.unfocus(),
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
        decoration: InputDecoration(
          isDense: true,
          filled: true,
          fillColor: const Color(0xFFF0F4F9),
          border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: Color(0xffB9C9DC))),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide:
                  const BorderSide(color: Color(0xff1E3A5F), width: 1.4)),
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        ),
        onChanged: (t) {
          final v = int.tryParse(t);
          if (v != null && v >= 1) widget.onChanged(v);
        },
      ),
    );
  }
}

/// Kotak varian seragam: foto kecil di kiri + nama warna/ukuran di kanan.
class _VariantBox extends StatelessWidget {
  const _VariantBox(
      {required this.variant,
      required this.selected,
      required this.mediaUrl,
      required this.onTap});
  final Map<String, dynamic> variant;
  final bool selected;
  final String Function(String?) mediaUrl;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = [
      variant['color']?.toString(),
      variant['size']?.toString(),
    ].where((e) => e != null && e.isNotEmpty).join(' / ');
    final url = mediaUrl(variant['photo_path']?.toString());
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 134,
        height: 42,
        padding: const EdgeInsets.symmetric(horizontal: 5),
        decoration: BoxDecoration(
          color: selected
              ? scheme.primary.withValues(alpha: .14)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? scheme.primary : scheme.outlineVariant,
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 28,
                height: 28,
                child: url.isEmpty
                    ? ColoredBox(
                        color: scheme.surfaceContainerHighest,
                        child: const Icon(Icons.inventory_2,
                            size: 14, color: Colors.grey),
                      )
                    : CachedNetworkImage(
                        imageUrl: url,
                        fit: BoxFit.cover,
                        memCacheWidth: 120,
                        errorWidget: (_, __, ___) => ColoredBox(
                          color: scheme.surfaceContainerHighest,
                          child: const Icon(Icons.inventory_2,
                              size: 14, color: Colors.grey),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 6),
            Expanded(
              child: Text(label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                      color: scheme.onSurface)),
            ),
          ],
        ),
      ),
    );
  }
}
