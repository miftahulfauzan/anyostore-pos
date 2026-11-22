// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'format.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

class PromotionsPage extends StatefulWidget {
  const PromotionsPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<PromotionsPage> createState() => _PromotionsPageState();
}

class _PromotionsPageState extends State<PromotionsPage> {
  List<Map<String, dynamic>> _rows = [];
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
      final rows = await widget.api.promotions();
      if (!mounted) return;
      setState(() => _rows = rows.cast<Map<String, dynamic>>());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _form() async {
    final code = TextEditingController();
    final name = TextEditingController();
    final value = TextEditingController();
    final minPurchase = TextEditingController();
    final maxDiscount = TextEditingController();
    final usageLimit = TextEditingController();
    var type = 'percentage';
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: taskSurface(context),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheet) => Padding(
          padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(ctx).bottom),
          child: SafeArea(
            top: false,
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: const Color(0xFFB45309).withValues(alpha: .12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(Icons.local_offer_outlined,
                            size: 18, color: Color(0xFFB45309)),
                      ),
                      const SizedBox(width: 9),
                      Text('Tambah Promo',
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                              color: ink(ctx))),
                    ],
                  ),
                  const SizedBox(height: 12),
                  AppField(
                      controller: code,
                      label: 'Kode promo',
                      hint: 'GAJIAN25',
                      icon: Icons.tag_rounded,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 8),
                  AppField(
                      controller: name,
                      label: 'Nama promo',
                      icon: Icons.local_offer_outlined,
                      textInputAction: TextInputAction.next),
                  const SizedBox(height: 12),
                  Text('Jenis diskon',
                      style: TextStyle(
                          fontSize: TaskTypography.micro,
                          fontWeight: FontWeight.w800,
                          letterSpacing: .5,
                          color: taskMuted(ctx))),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    children: [
                      ChoiceChip(
                        label: const Text('Persen (%)'),
                        selected: type == 'percentage',
                        showCheckmark: false,
                        onSelected: (_) => setSheet(() => type = 'percentage'),
                      ),
                      ChoiceChip(
                        label: const Text('Nominal (Rp)'),
                        selected: type == 'nominal',
                        showCheckmark: false,
                        onSelected: (_) => setSheet(() => type = 'nominal'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  AppField(
                      controller: value,
                      label: 'Nilai diskon',
                      icon: Icons.percent_rounded,
                      keyboard: TextInputType.number),
                  const SizedBox(height: 8),
                  AppField(
                      controller: minPurchase,
                      label: 'Min. pembelian (opsional)',
                      icon: Icons.shopping_bag_outlined,
                      keyboard: TextInputType.number),
                  const SizedBox(height: 8),
                  AppField(
                      controller: maxDiscount,
                      label: 'Maks diskon (opsional)',
                      icon: Icons.speed_outlined,
                      keyboard: TextInputType.number),
                  const SizedBox(height: 8),
                  AppField(
                      controller: usageLimit,
                      label: 'Batas pemakaian (opsional)',
                      icon: Icons.repeat_rounded,
                      keyboard: TextInputType.number),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            foregroundColor: taskMuted(ctx),
                            side: BorderSide(color: taskBorder(ctx)),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(11)),
                          ),
                          child: const Text('Batal'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 46),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(11)),
                          ),
                          child: const Text('Simpan'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (saved != true || !mounted) return;
    if (code.text.trim().isEmpty ||
        name.text.trim().isEmpty ||
        value.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Kode, nama, dan nilai wajib diisi')));
      return;
    }
    try {
      await widget.api.createPromotion({
        'code': code.text.trim(),
        'name': name.text.trim(),
        'discount_type': type,
        'discount_value': double.tryParse(value.text.replaceAll('.', '')) ?? 0,
        if (minPurchase.text.trim().isNotEmpty)
          'min_purchase':
              double.tryParse(minPurchase.text.replaceAll('.', '')) ?? 0,
        if (maxDiscount.text.trim().isNotEmpty)
          'max_discount':
              double.tryParse(maxDiscount.text.replaceAll('.', '')) ?? 0,
        if (usageLimit.text.trim().isNotEmpty)
          'usage_limit': int.tryParse(usageLimit.text) ?? 0,
      });
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Future<void> _toggle(Map<String, dynamic> row) async {
    try {
      await widget.api.togglePromotion(int.parse('${row['id']}'));
      _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  Widget _promoCard(Map<String, dynamic> row) {
    final active = row['is_active'] != false;
    final type = row['discount_type']?.toString() ?? 'percentage';
    final value = row['discount_value'];
    final discountLabel =
        type == 'percentage' ? '$value%' : fmtRp(asNum(value));
    final code = row['code']?.toString() ?? '';
    final used = int.tryParse('${row['usage_count'] ?? 0}') ?? 0;
    final limit = int.tryParse('${row['usage_limit'] ?? 0}') ?? 0;
    final status = appActiveStyle(context, active);
    final accent = _isDark ? const Color(0xFFFCD34D) : const Color(0xFFB45309);
    return AppListCard(
      tint: taskSurface(context),
      child: Row(
        children: [
          AppAvatar(
              text: code.isEmpty ? '%' : code.substring(0, 1),
              fg: accent,
              bg: _isDark ? const Color(0x2EFCD34D) : const Color(0xFFFEF3C7)),
          const SizedBox(width: 9),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(row['name']?.toString() ?? '-',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: ink(context))),
                    ),
                    Text(discountLabel,
                        style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: ink(context))),
                  ],
                ),
                const SizedBox(height: 1),
                Text('${code.isEmpty ? '-' : code} · $discountLabel',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:
                        TextStyle(fontSize: TaskTypography.micro, color: taskMuted(context))),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            AppStatusPill(
                                label: status.label.toUpperCase(),
                                fg: status.fg,
                                bg: status.bg),
                            const SizedBox(width: 4),
                            AppStatusPill(
                              label:
                                  limit > 0 ? '$used / $limit' : '$used dipakai',
                              fg: _isDark
                                  ? const Color(0xFFCBD5E1)
                                  : const Color(0xFF334155),
                              bg: _isDark
                                  ? const Color(0x2ECBD5E1)
                                  : const Color(0xFFE2E8F0),
                            ),
                          ],
                        ),
                      ),
                    ),
                    Switch.adaptive(
                      value: active,
                      onChanged: (_) => _toggle(row),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: Row(
            children: [
              Flexible(
                child: Text('Promo',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
              ),
              const SizedBox(width: 7),
              AppStatusPill(
                label: '${_rows.length}',
                fg: _isDark ? const Color(0xFFCBD5E1) : const Color(0xFF334155),
                bg: _isDark ? const Color(0x2ECBD5E1) : const Color(0xFFE2E8F0),
              ),
              const Spacer(),
              Flexible(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: FilledButton.icon(
                    onPressed: _form,
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Tambah'),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 38),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Expanded(
          child: _loading
              ? const UiLoadingState(label: 'Memuat promo…')
              : _error != null
                  ? UiErrorState(message: _error!, onRetry: _load)
                  : _rows.isEmpty
                      ? AppEmptyState(
                          icon: Icons.local_offer_outlined,
                          title: 'Belum ada promo',
                          message:
                              'Buat kode diskon untuk pelanggan grosir maupun retail.',
                          actionLabel: 'Buat promo pertama',
                          onAction: _form,
                        )
                      : ListView(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 16),
                          children: [
                            for (final row in _rows) _promoCard(row),
                          ],
                        ),
        ),
      ],
    );
  }
}
