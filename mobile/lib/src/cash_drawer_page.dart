// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'app_ui.dart';
import 'format.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

class CashDrawerPage extends StatefulWidget {
  const CashDrawerPage({super.key, required this.api});
  final ApiClient api;

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

  Future<void> _run(Future<Map<String, dynamic>> Function() action) async {
    setState(() => _saving = true);
    try {
      await action();
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Berhasil disimpan')));
      _moveAmount.clear();
      _moveReason.clear();
      _closeAmount.clear();
      _closeNotes.clear();
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

  double _num(TextEditingController c) =>
      double.tryParse(c.text.replaceAll('.', '')) ?? 0;

  bool get _isDark => Theme.of(context).brightness == Brightness.dark;

  String _timeLabel(Object? raw) {
    final date = DateTime.tryParse((raw ?? '').toString());
    if (date == null) return '';
    final wib = date.toUtc().add(const Duration(hours: 7));
    return '${wib.hour.toString().padLeft(2, '0')}:'
        '${wib.minute.toString().padLeft(2, '0')}';
  }

  double get _cashIn => _movements
      .where((row) => row['type'] == 'cash_in')
      .fold(0, (sum, row) => sum + asNum(row['amount']));

  double get _cashOut => _movements
      .where((row) => row['type'] == 'cash_out')
      .fold(0, (sum, row) => sum + asNum(row['amount']));

  Widget _hero({required bool open}) {
    return Container(
      padding: const EdgeInsets.fromLTRB(15, 14, 15, 15),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1E3A5F), Color(0xFF2B5688)],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(
              color: Color(0x261E3A5F), blurRadius: 16, offset: Offset(0, 6)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: const Color(0x24FFFFFF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.point_of_sale_outlined,
                    size: 18, color: Colors.white),
              ),
              const SizedBox(width: 9),
              const Expanded(
                child: Text('LACI KAS',
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w800,
                        color: Color(0xB8FFFFFF))),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color:
                      open ? const Color(0x3316A34A) : const Color(0x24FFFFFF),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(open ? 'TERBUKA' : 'BELUM DIBUKA',
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        fontWeight: FontWeight.w800,
                        color: open
                            ? const Color(0xFF86EFAC)
                            : const Color(0xE6FFFFFF))),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(open ? fmtRp(_expected) : 'Belum dibuka',
              style: TextStyle(
                  fontSize: open ? 25 : 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -.3,
                  color: Colors.white)),
          const SizedBox(height: 3),
          Text(
              open
                  ? 'Kas yang diharapkan · modal ${fmtRp(asNum(_drawer?['opening_amount']))}'
                  : 'Buka laci untuk mulai mencatat kas masuk/keluar.',
              style: const TextStyle(
                  fontSize: TaskTypography.micro,
                  height: 1.4,
                  color: Color(0xC7FFFFFF))),
        ],
      ),
    );
  }

  Widget _statTile(String label, String value, Color color) => Container(
        padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
        decoration: BoxDecoration(
          color: taskSurface(context),
          border: Border.all(color: taskBorder(context)),
          borderRadius: BorderRadius.circular(11),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                      color: color, borderRadius: BorderRadius.circular(3)),
                ),
                const SizedBox(width: 5),
                Text(label.toUpperCase(),
                    style: TextStyle(
                        fontSize: TaskTypography.micro,
                        fontWeight: FontWeight.w800,
                        letterSpacing: .5,
                        color: taskMuted(context))),
              ],
            ),
            const SizedBox(height: 3),
            Text(value,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ],
        ),
      );

  Widget _openCard() {
    return AppSectionCard(
      icon: Icons.lock_open_outlined,
      color: const Color(0xFF0F766E),
      title: 'Buka Laci Kas',
      hint: 'Modal awal',
      children: [
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
                : () =>
                    _run(() => widget.api.cashDrawerOpen(_num(_openAmount))),
            icon: const Icon(Icons.lock_open_outlined, size: 18),
            label: const Text('Buka Laci'),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11)),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text('Kas awal dihitung sebagai saldo pembuka laci.',
            style: TextStyle(
                fontSize: TaskTypography.micro, color: taskMuted(context))),
      ],
    );
  }

  Widget _movementCard() {
    return AppSectionCard(
      icon: Icons.swap_vert_rounded,
      color: const Color(0xFF1D4ED8),
      title: 'Kas Masuk / Keluar',
      hint: 'Catatan manual',
      children: [
        Row(
          children: [
            for (final option in const [
              ('cash-in', 'Kas masuk'),
              ('cash-out', 'Kas keluar'),
            ]) ...[
              Expanded(
                child: InkWell(
                  onTap: () => setState(() => _moveType = option.$1),
                  borderRadius: BorderRadius.circular(9),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: _moveType == option.$1
                          ? Theme.of(context).colorScheme.primary
                          : taskSurface(context),
                      border: Border.all(
                          color: _moveType == option.$1
                              ? Theme.of(context).colorScheme.primary
                              : taskBorder(context)),
                      borderRadius: BorderRadius.circular(9),
                    ),
                    child: Text(option.$2,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: TaskTypography.micro,
                            fontWeight: FontWeight.w800,
                            color: _moveType == option.$1
                                ? Theme.of(context).colorScheme.onPrimary
                                : taskMuted(context))),
                  ),
                ),
              ),
              if (option.$1 == 'cash-in') const SizedBox(width: 6),
            ],
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
          icon: Icons.edit_note_outlined,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: _saving ||
                    _moveAmount.text.isEmpty ||
                    _moveReason.text.trim().isEmpty
                ? null
                : () => _run(() => widget.api.cashDrawerInOut(
                    _moveType, _num(_moveAmount), _moveReason.text.trim())),
            style: FilledButton.styleFrom(
              minimumSize: const Size(0, 44),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(11)),
            ),
            child: Text(_moveType == 'cash-in'
                ? 'Simpan Kas Masuk'
                : 'Simpan Kas Keluar'),
          ),
        ),
      ],
    );
  }

  Widget _historyCard() {
    return AppSectionCard(
      icon: Icons.history_rounded,
      color: const Color(0xFF6D28D9),
      title: 'Riwayat Mutasi',
      hint: '${_movements.length} catatan',
      children: [
        if (_movements.isEmpty)
          Text('Belum ada kas masuk/keluar.',
              style: TextStyle(fontSize: 11, color: taskMuted(context)))
        else
          for (var i = 0; i < _movements.length; i++) ...[
            if (i > 0) Divider(height: 12, color: taskBorder(context)),
            _movementRow(_movements[i]),
          ],
      ],
    );
  }

  Widget _movementRow(Map<String, dynamic> row) {
    final isIn = row['type'] == 'cash_in';
    final color = isIn
        ? (_isDark ? const Color(0xFF86EFAC) : const Color(0xFF137A43))
        : (_isDark ? const Color(0xFFFDA4AF) : const Color(0xFFBE123C));
    return Row(
      children: [
        Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            color: color.withValues(alpha: _isDark ? .2 : .1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
              isIn ? Icons.south_west_rounded : Icons.north_east_rounded,
              size: 14,
              color: color),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(row['reason']?.toString() ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: ink(context))),
              Text(_timeLabel(row['created_at']),
                  style: TextStyle(
                      fontSize: TaskTypography.micro,
                      color: taskMuted(context))),
            ],
          ),
        ),
        Text('${isIn ? '+' : '-'}${fmtRp(asNum(row['amount']))}',
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w800, color: color)),
      ],
    );
  }

  Widget _closeCard() {
    final actual = _num(_closeAmount);
    final difference = _closeAmount.text.isEmpty ? 0.0 : actual - _expected;
    return AppSectionCard(
      icon: Icons.lock_outline_rounded,
      color: const Color(0xFFBE123C),
      title: 'Tutup Laci',
      hint: 'Hitung kas aktual',
      children: [
        AppField(
          controller: _closeAmount,
          label: 'Kas aktual',
          hint: '0',
          icon: Icons.payments_outlined,
          keyboard: TextInputType.number,
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 8),
        AppField(
          controller: _closeNotes,
          label: 'Catatan (wajib jika ada selisih)',
          icon: Icons.edit_note_outlined,
          onChanged: (_) => setState(() {}),
        ),
        if (_closeAmount.text.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            children: [
              Text('Selisih',
                  style: TextStyle(
                      fontSize: TaskTypography.micro,
                      color: taskMuted(context))),
              const Spacer(),
              Text(
                  difference == 0
                      ? 'Pas'
                      : '${difference > 0 ? '+' : '-'}${fmtRp(difference.abs())}',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: difference == 0
                          ? (_isDark
                              ? const Color(0xFF86EFAC)
                              : const Color(0xFF137A43))
                          : (_isDark
                              ? const Color(0xFFFDA4AF)
                              : const Color(0xFFBE123C)))),
            ],
          ),
        ],
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: _saving || _closeAmount.text.isEmpty
                ? null
                : () => _run(() => widget.api
                    .cashDrawerClose(actual, _closeNotes.text.trim())),
            icon: const Icon(Icons.lock_outline_rounded, size: 18),
            label: const Text('Tutup Laci Kas'),
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

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const ColoredBox(
        color: Color(0xFFF5F7FA),
        child: UiLoadingState(label: 'Memuat laci kas…'),
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
          _hero(open: open),
          const SizedBox(height: 10),
          if (!open)
            _openCard()
          else ...[
            Row(
              children: [
                Expanded(
                    child: _statTile(
                        'Kas masuk', fmtRp(_cashIn), const Color(0xFF137A43))),
                const SizedBox(width: 7),
                Expanded(
                    child: _statTile('Kas keluar', fmtRp(_cashOut),
                        const Color(0xFFBE123C))),
              ],
            ),
            const SizedBox(height: 10),
            _movementCard(),
            const SizedBox(height: 10),
            _historyCard(),
            const SizedBox(height: 10),
            _closeCard(),
          ],
        ],
      ),
    );
  }
}
