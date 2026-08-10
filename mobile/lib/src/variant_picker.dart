import 'package:flutter/material.dart';

import 'format.dart';

class VariantPicker extends StatefulWidget {
  const VariantPicker(
      {super.key, required this.product, required this.variants});
  final Map<String, dynamic> product;
  final List<Map<String, dynamic>> variants;

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
                Text('$_qty',
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
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
