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
    final price =
        sel != null ? asNum(sel['price']) : asNum(widget.product['price']);
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
                    ChoiceChip(
                      label: Text([
                        v['color']?.toString(),
                        v['size']?.toString(),
                      ].where((e) => e != null && e.isNotEmpty).join(' / ')),
                      selected: v['id'] == _variantId,
                      onSelected: (_) =>
                          setState(() => _variantId = v['id'] as int?),
                    ),
                ],
              ),
              const SizedBox(height: 10),
              // Foto varian terpilih (fallback foto produk).
              Builder(
                builder: (context) {
                  final photoPath = (sel?['photo_path']?.toString() ??
                          widget.product['photo_path']?.toString()) ??
                      '';
                  final url = widget.mediaUrl(photoPath);
                  if (url.isEmpty) return const SizedBox.shrink();
                  return ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: CachedNetworkImage(
                      imageUrl: url,
                      height: 110,
                      width: double.maxFinite,
                      fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  );
                },
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

  @override
  void initState() {
    super.initState();
    _c = TextEditingController(text: '${widget.value}');
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
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 48,
      child: TextField(
        controller: _c,
        keyboardType: TextInputType.number,
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

