import 'package:bluetooth_print_plus/bluetooth_print_plus.dart';
import 'package:flutter/material.dart';

import 'printer_service.dart';
import 'task_ui.dart';

/// Bottom sheet untuk scan, pilih, dan cetak ke printer Bluetooth (GPrinter).
class PrinterSetupSheet extends StatefulWidget {
  const PrinterSetupSheet({super.key, required this.title, required this.job});
  final String title;
  final Future<void> Function(PrinterService printer, BluetoothDevice device)
      job;

  @override
  State<PrinterSetupSheet> createState() => _PrinterSetupSheetState();
}

class _PrinterSetupSheetState extends State<PrinterSetupSheet> {
  final _printer = PrinterService();
  List<BluetoothDevice> _devices = [];
  bool _scanning = false;
  String? _error;
  int? _printingIndex;
  String? _status;

  Future<void> _scan() async {
    setState(() {
      _scanning = true;
      _error = null;
      _devices = [];
    });
    try {
      final devices = await _printer.scan();
      if (!mounted) return;
      setState(() => _devices = devices);
      if (devices.isEmpty) {
        _error =
            'Tidak ada printer ditemukan. Pastikan GPrinter menyala dan sudah dipasangkan di Settings Bluetooth Android.';
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'Gagal scan: $e');
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _print(BluetoothDevice printer, int index) async {
    setState(() {
      _printingIndex = index;
      _status = 'Menghubungkan ke ${printer.name}...';
      _error = null;
    });
    try {
      await _printer.connect(printer);
      setState(() => _status = 'Mencetak...');
      await widget.job(_printer, printer);
      await _printer.savePrinter(printer);
      await _printer.disconnect();
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Struk terkirim ke ${printer.name}')));
    } catch (e) {
      await _printer.disconnect();
      if (!mounted) return;
      setState(() {
        _printingIndex = null;
        _status = null;
        _error = 'Cetak gagal: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Text(widget.title,
                    style: Theme.of(context)
                        .textTheme
                        .titleMedium
                        ?.copyWith(fontWeight: FontWeight.w800)),
                const Spacer(),
                IconButton(
                    onPressed: _scan,
                    icon: const Icon(Icons.refresh),
                    tooltip: 'Scan ulang'),
              ],
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: _scanning ? null : _scan,
              icon: _scanning
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.bluetooth_searching),
              label: Text(_scanning ? 'Mencari printer...' : 'Scan Printer'),
            ),
            if (_status != null) ...[
              const SizedBox(height: 8),
              Text(_status!,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ],
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 12),
            if (_devices.isEmpty && !_scanning)
              const Text(
                  'Tips: pasangkan GPrinter dulu di Pengaturan > Bluetooth, lalu tekan Scan Printer. Printer yang dipilih akan disimpan dan dipakai otomatis.')
            else
              Flexible(
                child: ListView(
                  shrinkWrap: true,
                  children: [
                    for (var i = 0; i < _devices.length; i++)
                      GlassCard(
                        padding: EdgeInsets.zero,
                        child: ListTile(
                          leading: const Icon(Icons.print),
                          title: Text(_devices[i].name.isEmpty
                              ? 'Printer ${_devices[i].address}'
                              : _devices[i].name),
                          subtitle: Text(_devices[i].address),
                          trailing: _printingIndex == i
                              ? const SizedBox(
                                  width: 20,
                                  height: 20,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.print_outlined),
                          onTap: _printingIndex == null
                              ? () => _print(_devices[i], i)
                              : null,
                        ),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

Future<void> showPrinterJobSheet(
  BuildContext context,
  Future<void> Function(PrinterService printer, BluetoothDevice device) job, {
  String title = 'Cetak ke Printer Bluetooth',
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => PrinterSetupSheet(title: title, job: job),
  );
}

Future<void> showPrinterSheet(
  BuildContext context,
  Future<Map<String, dynamic>> Function() receiptLoader,
) {
  return showPrinterJobSheet(context, (printer, device) async {
    final receipt = await receiptLoader();
    await printer.printReceipt(receipt);
  });
}

/// Cetak pakai printer tersimpan tanpa scan ulang; kalau belum ada,
/// fallback ke bottom sheet pilih printer.
Future<void> printNow(
  BuildContext context,
  Future<void> Function(PrinterService printer, BluetoothDevice device) job, {
  String title = 'Cetak ke Printer Bluetooth',
}) async {
  final printer = PrinterService();
  final saved = await printer.savedPrinter();
  if (saved != null) {
    try {
      await printer.connect(saved);
      await job(printer, saved);
      await printer.disconnect();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Struk terkirim ke ${saved.name}')));
      }
      return;
    } catch (_) {
      await printer.disconnect();
    }
  }
  if (!context.mounted) return;
  await showPrinterJobSheet(context, job, title: title);
}

Future<void> printReceiptNow(
  BuildContext context,
  Future<Map<String, dynamic>> Function() receiptLoader,
) {
  return printNow(context, (printer, device) async {
    final receipt = await receiptLoader();
    await printer.printReceipt(receipt);
  });
}
