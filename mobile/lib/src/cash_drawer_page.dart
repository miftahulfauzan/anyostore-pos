import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'task_ui.dart';

class CashDrawerPage extends StatefulWidget {
  const CashDrawerPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<CashDrawerPage> createState() => _CashDrawerPageState();
}

class _CashDrawerPageState extends State<CashDrawerPage> {
  Map<String, dynamic>? _drawer;
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
      final summary = await widget.api.cashDrawerSummary();
      if (!mounted) return;
      setState(() => _drawer = summary);
    } on ApiException catch (e) {
      if (mounted) {
        setState(() => _drawer = null);
        setState(() => _error = e.statusCode == 404 ? null : e.message);
      }
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

  InputDecoration _dec(String label, {String? prefix}) {
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xffE7E0D6)),
    );
    return InputDecoration(
      labelText: label,
      prefixText: prefix,
      filled: true,
      fillColor: const Color(0xfff8fafc),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      enabledBorder: border,
      focusedBorder: border.copyWith(
          borderSide: const BorderSide(color: Color(0xff1E3A5F), width: 1.4)),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final open = _drawer?['status'] == 'open';

    return ColoredBox(
      color: const Color(0xffF5F1EA),
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
        if (open && _drawer != null) ...[
          _Card(
            title: 'Laci Kas Terbuka',
            children: [
              _Row('Modal awal', fmtRp(asNum(_drawer?['opening_amount']))),
              _Row('Kas yang diharapkan',
                  fmtRp(asNum(_drawer?['expected_cash']))),
            ],
          ),
          const SizedBox(height: 10),
          _Card(
            title: 'Kas Masuk / Keluar',
            children: [
              DropdownButtonFormField<String>(
                initialValue: _moveType,
                decoration: _dec('Jenis'),
                items: const [
                  DropdownMenuItem(value: 'cash-in', child: Text('Kas masuk')),
                  DropdownMenuItem(
                      value: 'cash-out', child: Text('Kas keluar')),
                ],
                onChanged: (v) => setState(() => _moveType = v ?? 'cash-in'),
              ),
              const SizedBox(height: 8),
              TextField(
                  controller: _moveAmount,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Nominal', prefix: 'Rp ')),
              const SizedBox(height: 8),
              TextField(
                  controller: _moveReason,
                  decoration: _dec('Alasan')),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _saving ||
                        _moveAmount.text.isEmpty ||
                        _moveReason.text.trim().isEmpty
                    ? null
                    : () => _run(() => widget.api.cashDrawerInOut(
                        _moveType, _num(_moveAmount), _moveReason.text.trim())),
                style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xff1E3A5F),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28))),
                child: const Text('Simpan Kas Masuk'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _Card(
            title: 'Tutup Laci',
            children: [
              TextField(
                  controller: _closeAmount,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Kas aktual', prefix: 'Rp ')),
              const SizedBox(height: 8),
              TextField(
                  controller: _closeNotes,
                  decoration: _dec('Catatan (wajib jika ada selisih)')),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _saving || _closeAmount.text.isEmpty
                    ? null
                    : () => _run(() => widget.api.cashDrawerClose(
                        _num(_closeAmount), _closeNotes.text.trim())),
                style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xff1E3A5F),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28))),
                child: const Text('Tutup Laci Kas'),
              ),
            ],
          ),
        ] else ...[
          _Card(
            title: 'Buka Laci Kas',
            children: [
              const Text('Belum ada laci terbuka untuk akun ini.'),
              const SizedBox(height: 8),
              TextField(
                  controller: _openAmount,
                  keyboardType: TextInputType.number,
                  decoration: _dec('Modal awal', prefix: 'Rp ')),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _saving || _openAmount.text.isEmpty
                    ? null
                    : () => _run(
                        () => widget.api.cashDrawerOpen(_num(_openAmount))),
                style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xff1E3A5F),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(28))),
                child: const Text('Buka Laci'),
              ),
            ],
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error)),
        ],
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => GlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Color(0xff1E3A5F))),
            const SizedBox(height: 12),
            ...children,
          ],
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: const TextStyle(fontSize: 12, color: Color(0xff8A857C))),
            Text(value,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Color(0xff1E3A5F))),
          ],
        ),
      );
}
