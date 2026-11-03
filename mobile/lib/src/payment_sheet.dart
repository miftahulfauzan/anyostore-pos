import 'package:flutter/material.dart';

import 'format.dart';
import 'task_ui.dart';
import 'ui_kit.dart';

class PaymentSheet extends StatefulWidget {
  const PaymentSheet({super.key, required this.grandTotal});
  final double grandTotal;

  @override
  State<PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<PaymentSheet> {
  static const methods = ['cash', 'qris', 'transfer', 'debit'];
  static const labels = {
    'cash': 'Tunai',
    'qris': 'QRIS',
    'transfer': 'Transfer',
    'debit': 'Debit',
  };
  static const icons = {
    'cash': Icons.payments_outlined,
    'qris': Icons.qr_code_2,
    'transfer': Icons.account_balance_outlined,
    'debit': Icons.credit_card,
  };

  final List<String> _selectedMethods = ['cash'];
  final _amountCtrl = TextEditingController();
  final _referenceCtrl = TextEditingController();
  final Map<String, TextEditingController> _splitAmounts = {};
  final Map<String, TextEditingController> _splitReferences = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    _amountCtrl.text = widget.grandTotal.ceil().toString();
  }

  @override
  void dispose() {
    _amountCtrl.dispose();
    _referenceCtrl.dispose();
    for (final controller in _splitAmounts.values) {
      controller.dispose();
    }
    for (final controller in _splitReferences.values) {
      controller.dispose();
    }
    super.dispose();
  }

  double _parse(String raw) {
    final digits = raw.replaceAll(RegExp(r'[^0-9]'), '');
    return double.tryParse(digits) ?? 0;
  }

  double get _paid => _parse(_amountCtrl.text);

  double get _splitTotal => _selectedMethods.fold<double>(
        0,
        (total, method) => total + _parse(_splitAmounts[method]?.text ?? ''),
      );

  bool get _splitAmountsValid => _selectedMethods
      .every((method) => _parse(_splitAmounts[method]?.text ?? '') > 0);

  void _toggleMethod(String method) {
    setState(() {
      if (_selectedMethods.contains(method)) {
        _selectedMethods.remove(method);
        _splitAmounts.remove(method)?.dispose();
        _splitReferences.remove(method)?.dispose();
      } else {
        _selectedMethods.add(method);
        _splitAmounts[method] = TextEditingController();
        _splitReferences[method] = TextEditingController();
      }
      _error = null;
    });
  }

  Map<String, dynamic>? _buildPayload() {
    if (_selectedMethods.length > 1) {
      if (!_splitAmountsValid) {
        setState(() => _error = 'Isi nominal untuk setiap metode pembayaran.');
        return null;
      }
      if ((_splitTotal - widget.grandTotal).abs() > 0.005) {
        setState(() => _error =
            'Jumlah pembayaran harus sama dengan total ${fmtRp(widget.grandTotal)}.');
        return null;
      }
      return {
        'payment_method': 'split',
        'amount_paid': _splitTotal,
        'payments': [
          for (final method in _selectedMethods)
            {
              'payment_method': method,
              'amount': _parse(_splitAmounts[method]!.text),
              if (_splitReferences[method]!.text.trim().isNotEmpty)
                'reference': _splitReferences[method]!.text.trim(),
            },
        ],
      };
    }

    if (_selectedMethods.isEmpty) {
      setState(() => _error = 'Pilih minimal satu metode pembayaran.');
      return null;
    }

    final method = _selectedMethods.first;
    if (method == 'cash' && _paid < widget.grandTotal - 0.005) {
      setState(() => _error = 'Nominal tunai kurang dari total transaksi.');
      return null;
    }
    return {
      'payment_method': method,
      'amount_paid': method == 'cash' ? _paid : widget.grandTotal,
      if (_referenceCtrl.text.trim().isNotEmpty)
        'payment_reference': _referenceCtrl.text.trim(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final isSplit = _selectedMethods.length > 1;
    final selectedMethod =
        _selectedMethods.isEmpty ? null : _selectedMethods.first;
    final change =
        !isSplit && selectedMethod == 'cash' && _paid >= widget.grandTotal
            ? _paid - widget.grandTotal
            : 0.0;

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * .92,
      child: SafeArea(
        child: Padding(
          padding:
              EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
          child: UiTaskBody(
            action: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_error != null) ...[
                  Semantics(
                    liveRegion: true,
                    child: Text(_error!,
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error)),
                  ),
                  const SizedBox(height: 8),
                ],
                FilledButton(
                  style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(52)),
                  onPressed: () {
                    final payload = _buildPayload();
                    if (payload != null) Navigator.pop(context, payload);
                  },
                  child: const Text('Selesaikan pembayaran'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Kembali ke keranjang'),
                ),
              ],
            ),
            children: [
              Row(children: [
                IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.arrow_back),
                    tooltip: 'Kembali ke keranjang'),
                Expanded(child: Text('Pembayaran',
                    style: Theme.of(context).textTheme.titleMedium)),
              ]),
              const SizedBox(height: 12),
              GlassCard(
                radius: 20,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Total pembayaran', style: TextStyle(color: taskMuted(context))),
                    const SizedBox(height: 4),
                    Text(fmtRp(widget.grandTotal), style: TextStyle(
                        color: ink(context), fontSize: 30, fontWeight: FontWeight.w800)),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text('Pilih satu atau beberapa metode',
                  style: TextStyle(color: taskMuted(context))),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (final method in methods)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: Semantics(
                          selected: _selectedMethods.contains(method),
                          button: true,
                          child: InkWell(
                            onTap: () => _toggleMethod(method),
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  vertical: 12, horizontal: 2),
                              decoration: BoxDecoration(
                                color: _selectedMethods.contains(method)
                                    ? (Theme.of(context).brightness ==
                                            Brightness.dark
                                        ? kTaskDarkSurface
                                        : kTaskSurfaceMuted)
                                    : taskSurface(context),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: _selectedMethods.contains(method)
                                      ? Theme.of(context).colorScheme.primary
                                      : taskBorder(context),
                                ),
                              ),
                              child: Column(children: [
                                Icon(icons[method], color: _selectedMethods.contains(method)
                                    ? Theme.of(context).colorScheme.primary : taskMuted(context)),
                                const SizedBox(height: 6),
                                FittedBox(
                                  fit: BoxFit.scaleDown,
                                  child: Text(labels[method]!,
                                      style: TextStyle(
                                          fontSize: 12, fontWeight: FontWeight.w600,
                                          color: _selectedMethods.contains(method)
                                              ? Theme.of(context).colorScheme.primary : ink(context))),
                                ),
                              ]),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              if (isSplit) ...[
                for (final method in _selectedMethods) ...[
                  TextField(
                    controller: _splitAmounts[method],
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(
                      labelText: '${labels[method]} (Rp)',
                      prefixText: 'Rp ',
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  if (method != 'cash') ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: _splitReferences[method],
                      decoration: InputDecoration(
                        labelText: 'Referensi ${labels[method]} (opsional)',
                        ),
                    ),
                  ],
                  const SizedBox(height: 10),
                ],
                Text(
                  !_splitAmountsValid
                      ? 'Isi nominal setiap metode.'
                      : _splitTotal == widget.grandTotal
                          ? 'Total pas: ${fmtRp(_splitTotal)}'
                          : _splitTotal < widget.grandTotal
                              ? 'Kurang ${fmtRp(widget.grandTotal - _splitTotal)}'
                              : 'Lebih ${fmtRp(_splitTotal - widget.grandTotal)}',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color:
                        _splitAmountsValid && _splitTotal == widget.grandTotal
                            ? (Theme.of(context).brightness == Brightness.dark
                                ? kTaskDarkInk : kTaskStockGood)
                            : taskMuted(context),
                  ),
                ),
              ] else if (selectedMethod == 'cash') ...[
                TextField(
                  controller: _amountCtrl,
                  onChanged: (_) => setState(() {}),
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Tunai diterima',
                    prefixText: 'Rp ',
                  ),
                ),
                const SizedBox(height: 8),
                Text('Kembalian: ${fmtRp(change)}',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ] else ...[
                if (selectedMethod == null)
                  const Text('Pilih minimal satu metode pembayaran.')
                else ...[
                  Text(
                      'Pembayaran ${labels[selectedMethod]}: ${fmtRp(widget.grandTotal)}'),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _referenceCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Referensi (opsional)',
                      ),
                  ),
                ],
              ],
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
