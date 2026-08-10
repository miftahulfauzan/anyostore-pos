import 'package:flutter/material.dart';

import 'format.dart';

class PaymentSheet extends StatefulWidget {
  const PaymentSheet({super.key, required this.grandTotal});
  final double grandTotal;

  @override
  State<PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<PaymentSheet> {
  static const methods = ['cash', 'qris', 'transfer', 'debit'];
  bool _split = false;
  String _method = 'cash';
  String _amount = '';
  String _reference = '';
  final List<Map<String, dynamic>> _rows = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _amount = widget.grandTotal.toStringAsFixed(0);
  }

  double get _paid => double.tryParse(_amount.replaceAll('.', '')) ?? 0;

  void _addRow() {
    setState(() {
      _rows.add({'method': 'cash', 'amount': '', 'reference': ''});
      _error = null;
    });
  }

  void _removeRow(int i) => setState(() => _rows.removeAt(i));

  Map<String, dynamic>? _buildPayload() {
    if (_split) {
      final payments = <Map<String, dynamic>>[];
      var sum = 0.0;
      for (final row in _rows) {
        final amount =
            double.tryParse((row['amount'] as String).replaceAll('.', '')) ?? 0;
        if (amount <= 0) {
          setState(() => _error = 'Nominal pembayaran tidak valid');
          return null;
        }
        sum += amount;
        payments.add({
          'payment_method': row['method'],
          'amount': amount,
          if ((row['reference'] as String).trim().isNotEmpty)
            'reference': (row['reference'] as String).trim(),
        });
      }
      if (payments.isEmpty) {
        setState(() => _error = 'Tambahkan minimal satu pembayaran');
        return null;
      }
      if ((sum - widget.grandTotal).abs() > 0.005) {
        setState(() =>
            _error = 'Total pembayaran harus sama dengan total transaksi');
        return null;
      }
      return {'payments': payments};
    }
    if (_paid < widget.grandTotal) {
      setState(() => _error = 'Nominal pembayaran kurang dari total');
      return null;
    }
    if (_method != 'cash' && (_paid - widget.grandTotal).abs() > 0.005) {
      setState(() => _error = 'Pembayaran non-tunai harus sesuai total');
      return null;
    }
    return {
      'payment_method': _method,
      'amount_paid': _paid,
      if (_reference.trim().isNotEmpty) 'payment_reference': _reference.trim(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final change = _method == 'cash' && _paid >= widget.grandTotal
        ? _paid - widget.grandTotal
        : 0.0;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text('Pembayaran',
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const Spacer(),
                Text('Total ${fmtRp(widget.grandTotal)}',
                    style: const TextStyle(fontWeight: FontWeight.w800)),
              ],
            ),
            const SizedBox(height: 12),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Tunai / 1 metode')),
                ButtonSegment(value: true, label: Text('Split')),
              ],
              selected: {_split},
              onSelectionChanged: (s) => setState(() => _split = s.first),
            ),
            const SizedBox(height: 12),
            if (!_split) ...[
              DropdownButtonFormField<String>(
                initialValue: _method,
                decoration: const InputDecoration(
                    labelText: 'Metode', border: OutlineInputBorder()),
                items: [
                  for (final m in methods)
                    DropdownMenuItem(value: m, child: Text(m.toUpperCase())),
                ],
                onChanged: (v) => setState(() => _method = v ?? 'cash'),
              ),
              const SizedBox(height: 10),
              TextField(
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: 'Nominal dibayar',
                    border: OutlineInputBorder(),
                    prefixText: 'Rp '),
                controller: TextEditingController(text: _amount),
                onChanged: (v) => setState(() => _amount = v),
              ),
              if (_method != 'cash') ...[
                const SizedBox(height: 10),
                TextField(
                  decoration: const InputDecoration(
                      labelText: 'Referensi (opsional)',
                      border: OutlineInputBorder()),
                  onChanged: (v) => setState(() => _reference = v),
                ),
              ],
              if (_method == 'cash') ...[
                const SizedBox(height: 8),
                Text('Kembalian: ${fmtRp(change)}',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ],
            ] else ...[
              for (var i = 0; i < _rows.length; i++)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<String>(
                                initialValue: _rows[i]['method'] as String,
                                decoration: const InputDecoration(
                                    isDense: true,
                                    border: OutlineInputBorder()),
                                items: [
                                  for (final m in methods)
                                    DropdownMenuItem(
                                        value: m, child: Text(m.toUpperCase())),
                                ],
                                onChanged: (v) => setState(
                                    () => _rows[i]['method'] = v ?? 'cash'),
                              ),
                            ),
                            const SizedBox(width: 8),
                            IconButton(
                                onPressed: () => _removeRow(i),
                                icon: const Icon(Icons.delete_outline)),
                          ],
                        ),
                        const SizedBox(height: 8),
                        TextField(
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(
                              labelText: 'Nominal',
                              isDense: true,
                              border: OutlineInputBorder(),
                              prefixText: 'Rp '),
                          onChanged: (v) =>
                              setState(() => _rows[i]['amount'] = v),
                        ),
                      ],
                    ),
                  ),
                ),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                    onPressed: _addRow,
                    icon: const Icon(Icons.add),
                    label: const Text('Tambah metode')),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 12),
            FilledButton(
              style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(50)),
              onPressed: () {
                final payload = _buildPayload();
                if (payload != null) Navigator.pop(context, payload);
              },
              child: const Text('Proses Pembayaran'),
            ),
          ],
        ),
      ),
    );
  }
}
