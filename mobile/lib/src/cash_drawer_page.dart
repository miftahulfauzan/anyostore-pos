// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'format.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

class CashDrawerPage extends StatefulWidget {
  const CashDrawerPage({
    super.key,
    required this.api,
    this.isOwner = false,
  });

  final ApiClient api;
  final bool isOwner;

  @override
  State<CashDrawerPage> createState() => _CashDrawerPageState();
}

class _CashDrawerPageState extends State<CashDrawerPage> {
  Map<String, dynamic>? _drawer;
  double _expected = 0;
  List<Map<String, dynamic>> _movements = [];
  bool _loading = true;
  String? _error;

  final _openAmount = TextEditingController();
  String _moveType = 'cash-in';
  final _moveAmount = TextEditingController();
  final _moveReason = TextEditingController();
  final _closeAmount = TextEditingController();
  final _closeNotes = TextEditingController();
  bool _saving = false;

  bool get _needsBranchSelection =>
      widget.isOwner && widget.api.activeBranchId == null;

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _openAmount.dispose();
    _moveAmount.dispose();
    _moveReason.dispose();
    _closeAmount.dispose();
    _closeNotes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (_needsBranchSelection) {
      setState(() {
        _loading = false;
        _error = null;
        _drawer = null;
        _expected = 0;
        _movements = [];
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.api.cashDrawerCurrent();
      if (!mounted) return;
      final drawer = data['drawer'];
      setState(() {
        _drawer = drawer is Map<String, dynamic> ? drawer : null;
        _expected = asNum(data['expected_cash']);
        _movements = ((data['movements'] as List?) ?? [])
            .whereType<Map<String, dynamic>>()
            .toList();
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _run(
    Future<Map<String, dynamic>> Function() action, {
    required String successMessage,
    required VoidCallback onSaved,
  }) async {
    setState(() => _saving = true);
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(successMessage)));
      onSaved();
      await _load();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  double _num(TextEditingController controller) =>
      double.tryParse(controller.text.replaceAll('.', '')) ?? 0;

  String _timeLabel(Object? raw) {
    final date = DateTime.tryParse((raw ?? '').toString());
    if (date == null) return '';
    final wib = date.toUtc().add(const Duration(hours: 7));
    return '${wib.hour.toString().padLeft(2, '0')}:${wib.minute.toString().padLeft(2, '0')}';
  }

  Widget _cashFigure(String label, String value) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
        decoration: BoxDecoration(
          color: _isDark ? const Color(0xFF182135) : const Color(0xFFF8FAFC),
          border: Border.all(color: taskBorder(context)),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w700,
                    color: taskMuted(context))),
            const SizedBox(height: 2),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(value,
                  maxLines: 1,
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()],
                      color: ink(context))),
            ),
          ],
        ),
      );

  Widget _openCard() => AppSectionCard(
        icon: Icons.point_of_sale_outlined,
        color: const Color(0xFF1E3A5F),
        title: 'Buka kas',
        children: [
          Text(
            'Belum ada laci kas terbuka untuk akun/toko ini. Masukkan modal awal untuk mulai mencatat penjualan tunai.',
            style: TextStyle(
                fontSize: TaskTypography.micro,
                height: 1.45,
                color: taskMuted(context)),
          ),
          const SizedBox(height: 10),
          AppField(
            controller: _openAmount,
            label: 'Modal awal',
            hint: '0',
            icon: Icons.payments_outlined,
            keyboard: TextInputType.number,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: _saving || _openAmount.text.isEmpty
                  ? null
                  : () => _run(
                        () => widget.api.cashDrawerOpen(_num(_openAmount)),
                        successMessage: 'Kas berhasil dibuka.',
                        onSaved: _openAmount.clear,
                      ),
              icon: const Icon(Icons.lock_open_outlined, size: 18),
              label: const Text('Buka kas'),
              style: FilledButton.styleFrom(
                minimumSize: const Size(0, 44),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(11)),
              ),
            ),
          ),
        ],
      );

  Widget _moveTypeButton({required String type, required String label}) {
    final selected = _moveType == type;
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => setState(() => _moveType = type),
          borderRadius: BorderRadius.circular(9),
          child: Container(
            constraints: const BoxConstraints(minHeight: 38),
            padding: const EdgeInsets.symmetric(horizontal: 11),
            decoration: BoxDecoration(
              color: selected
                  ? Theme.of(context).colorScheme.primary
                  : taskSurface(context),
              border: Border.all(
                  color: selected
                      ? Theme.of(context).colorScheme.primary
                      : taskBorder(context)),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  type == 'cash-in'
                      ? Icons.arrow_downward_rounded
                      : Icons.arrow_upward_rounded,
                  size: 16,
                  color: selected
                      ? Theme.of(context).colorScheme.onPrimary
                      : taskMuted(context),
                ),
                const SizedBox(width: 5),
                Flexible(
                  child: Text(label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: TaskTypography.micro,
                          fontWeight: FontWeight.w800,
                          color: selected
                              ? Theme.of(context).colorScheme.onPrimary
                              : taskMuted(context))),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _movementRow(Map<String, dynamic> row) {
    final isIn = row['type'] == 'cash_in';
    final color = isIn
        ? (_isDark ? const Color(0xFF86EFAC) : const Color(0xFF137A43))
        : (_isDark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C));
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          SizedBox(
            width: 42,
            child: Text(_timeLabel(row['created_at']),
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: taskMuted(context))),
          ),
          Expanded(
            child: Text(row['reason']?.toString() ?? '-',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: TaskTypography.micro,
                    fontWeight: FontWeight.w700,
                    color: ink(context))),
          ),
          const SizedBox(width: 8),
          Text('${isIn ? '+' : '-'}${fmtRp(asNum(row['amount']))}',
              style: TextStyle(
                  fontSize: TaskTypography.micro,
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                  color: color)),
        ],
      ),
    );
  }

  Widget _openDrawerCard() {
    final openedAt = _timeLabel(_drawer?['opened_at']);
    return AppSectionCard(
      icon: Icons.point_of_sale_outlined,
      color: const Color(0xFF1E3A5F),
      title: 'Kas terbuka',
      hint: openedAt.isEmpty ? null : 'sejak $openedAt',
      children: [
        Row(
          children: [
            Expanded(
                child: _cashFigure(
                    'Modal awal', fmtRp(asNum(_drawer?['opening_amount'])))),
            const SizedBox(width: 8),
            Expanded(child: _cashFigure('Kas seharusnya', fmtRp(_expected))),
          ],
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            _moveTypeButton(type: 'cash-in', label: 'Kas masuk'),
            const SizedBox(width: 6),
            _moveTypeButton(type: 'cash-out', label: 'Kas keluar'),
          ],
        ),
        const SizedBox(height: 8),
        AppField(
          controller: _moveAmount,
          label: 'Nominal',
          hint: '0',
          icon: Icons.payments_outlined,
          keyboard: TextInputType.number,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        AppField(
          controller: _moveReason,
          label: 'Alasan',
          hint: _moveType == 'cash-in'
              ? 'Setoran / tambah modal'
              : 'Ambil untuk belanja',
          icon: Icons.edit_note_outlined,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _saving
                ? null
                : () {
                    if (_num(_moveAmount) <= 0 ||
                        _moveReason.text.trim().isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Nominal dan alasan wajib diisi.')),
                      );
                      return;
                    }
                    _run(
                      () => widget.api.cashDrawerInOut(_moveType,
                          _num(_moveAmount), _moveReason.text.trim()),
                      successMessage: _moveType == 'cash-in'
                          ? 'Kas masuk dicatat.'
                          : 'Kas keluar dicatat.',
                      onSaved: () {
                        _moveAmount.clear();
                        _moveReason.clear();
                      },
                    );
                  },
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11)),
            ),
            child: const Text('Catat'),
          ),
        ),
        if (_movements.isNotEmpty) ...[
          const SizedBox(height: 10),
          Divider(height: 1, color: taskBorder(context)),
          const SizedBox(height: 8),
          Text('RIWAYAT KAS',
              style: TextStyle(
                  fontSize: TaskTypography.micro,
                  fontWeight: FontWeight.w800,
                  letterSpacing: .5,
                  color: taskMuted(context))),
          const SizedBox(height: 4),
          for (var i = 0; i < _movements.length; i++) ...[
            if (i > 0) Divider(height: 1, color: taskBorder(context)),
            _movementRow(_movements[i]),
          ],
        ],
      ],
    );
  }

  Widget _closeCard() {
    final actual = _num(_closeAmount);
    final difference = _closeAmount.text.isEmpty ? 0.0 : actual - _expected;
    final hasDifference = _closeAmount.text.isNotEmpty && difference != 0;
    final differenceColor = difference == 0
        ? (_isDark ? const Color(0xFFE7ECF4) : const Color(0xFF0F172A))
        : (_isDark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C));

    return AppSectionCard(
      icon: Icons.lock_outline_rounded,
      color: const Color(0xFFBE123C),
      title: 'Tutup kas',
      children: [
        AppField(
          controller: _closeAmount,
          label: 'Kas aktual (dihitung)',
          hint: '0',
          icon: Icons.payments_outlined,
          keyboard: TextInputType.number,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
          decoration: BoxDecoration(
            color: _isDark ? const Color(0xFF182135) : const Color(0xFFF8FAFC),
            border: Border.all(color: taskBorder(context)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              Text('Selisih',
                  style: TextStyle(
                      fontSize: TaskTypography.micro,
                      fontWeight: FontWeight.w700,
                      color: taskMuted(context))),
              const Spacer(),
              Text(fmtRp(difference),
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      fontFeatures: const [FontFeature.tabularFigures()],
                      color: differenceColor)),
            ],
          ),
        ),
        const SizedBox(height: 8),
        AppField(
          controller: _closeNotes,
          label: 'Catatan${hasDifference ? ' (wajib)' : ''}',
          hint: hasDifference ? 'Alasan selisih kas' : 'Opsional',
          icon: Icons.edit_note_outlined,
          maxLines: 2,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _saving || _closeAmount.text.isEmpty
                ? null
                : () {
                    if (difference != 0 && _closeNotes.text.trim().isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                            content: Text('Selisih kas wajib diberi alasan.')),
                      );
                      return;
                    }
                    _run(
                      () => widget.api
                          .cashDrawerClose(actual, _closeNotes.text.trim()),
                      successMessage: 'Kas ditutup.',
                      onSaved: () {
                        _closeAmount.clear();
                        _closeNotes.clear();
                      },
                    );
                  },
            icon: const Icon(Icons.lock_outline_rounded, size: 18),
            label: const Text('Tutup kas'),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44),
              backgroundColor: kTaskTerracotta,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _branchPrompt() => AppSectionCard(
        icon: Icons.storefront_outlined,
        color: const Color(0xFF1E3A5F),
        title: 'Pilih toko/gudang',
        children: [
          Text(
            'Pilih satu toko/gudang di menu Lainnya untuk membuka laci kas. Mode “Semua” tidak memiliki laci kas.',
            style: TextStyle(
                fontSize: TaskTypography.micro,
                height: 1.45,
                color: taskMuted(context)),
          ),
        ],
      );

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return ColoredBox(
        color: pageBg(context),
        child: const UiLoadingState(label: 'Memuat laci kas…'),
      );
    }
    if (_error != null) {
      return ColoredBox(
        color: pageBg(context),
        child: UiErrorState(message: _error!, onRetry: _load),
      );
    }

    final open = _drawer?['status'] == 'open';
    return ColoredBox(
      color: pageBg(context),
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          if (_needsBranchSelection)
            _branchPrompt()
          else if (!open)
            _openCard()
          else ...[
            _openDrawerCard(),
            const SizedBox(height: 10),
            _closeCard(),
          ],
        ],
      ),
    );
  }
}
