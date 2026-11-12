import 'dart:convert';

import 'package:bluetooth_print_plus/bluetooth_print_plus.dart';
import 'package:flutter/material.dart';

import 'api_client.dart';
import 'offline_store.dart';
import 'printer_service.dart';
import 'task_ui.dart';

/// Bottom sheet untuk scan, pilih, dan cetak ke printer Bluetooth (GPrinter).
class PrinterSetupSheet extends StatefulWidget {
  const PrinterSetupSheet({
    super.key,
    required this.title,
    required this.job,
    this.autoScan = false,
    this.autoPrintOnDetect = false,
  });
  final String title;
  final Future<void> Function(PrinterService printer, BluetoothDevice device)
      job;
  final bool autoScan;
  final bool autoPrintOnDetect;

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

  @override
  void initState() {
    super.initState();
    if (widget.autoScan) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scan());
    }
  }

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
        setState(() {
          _error =
              'Tidak ada printer ditemukan. Pastikan GPrinter menyala dan sudah dipasangkan di Settings Bluetooth Android.';
        });
      } else if (widget.autoPrintOnDetect) {
        final saved = await _printer.savedPrinter();
        final savedIndex = saved == null
            ? -1
            : devices.indexWhere((device) => device.address == saved.address);
        final autoIndex = savedIndex >= 0
            ? savedIndex
            : devices.length == 1
                ? 0
                : -1;
        if (autoIndex >= 0 && mounted) {
          await _print(devices[autoIndex], autoIndex);
        }
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
  bool autoScan = false,
  bool autoPrintOnDetect = false,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (_) => PrinterSetupSheet(
      title: title,
      job: job,
      autoScan: autoScan,
      autoPrintOnDetect: autoPrintOnDetect,
    ),
  );
}

Future<void> showPrinterSheet(
  BuildContext context,
  Future<Map<String, dynamic>> Function() receiptLoader,
) {
  return showPrinterJobSheet(context, (printer, device) async {
    final receipt = await receiptLoader();
    await printer.printReceipt(receipt);
  }, autoScan: true, autoPrintOnDetect: true);
}

Future<void>? _printNowInFlight;

/// Cetak ke printer tersimpan. Jika koneksi lama sudah tidak tersedia, scan
/// otomatis dan langsung mencetak bila satu printer terdeteksi.
Future<void> printNow(
  BuildContext context,
  Future<void> Function(PrinterService printer, BluetoothDevice device) job, {
  String title = 'Cetak ke Printer Bluetooth',
}) async {
  if (_printNowInFlight != null) return _printNowInFlight!;
  final operation = _printNowInternal(context, job, title: title);
  _printNowInFlight = operation;
  try {
    await operation;
  } finally {
    if (identical(_printNowInFlight, operation)) _printNowInFlight = null;
  }
}

Future<void> _printNowInternal(
  BuildContext context,
  Future<void> Function(PrinterService printer, BluetoothDevice device) job, {
  required String title,
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
  await showPrinterJobSheet(
    context,
    job,
    title: title,
    autoScan: true,
    autoPrintOnDetect: true,
  );
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

/// Payload struk dengan cache offline: hasil sukses disimpan per transaksi,
/// dan saat jaringan putus dipakai salinan terakhir supaya cetak ulang tetap
/// bisa dilakukan tanpa internet.
Future<Map<String, dynamic>> loadReceiptForPrint(ApiClient api, int id) async {
  try {
    final data = await api.receipt(id);
    if (data.isNotEmpty) {
      await OfflineStore.cacheSet('receipt-$id', jsonEncode(data));
    }
    return data;
  } on ApiException catch (error) {
    if (!error.isNetwork) rethrow;
    final cached = await OfflineStore.cacheGet('receipt-$id');
    if (cached != null) return cached;
    rethrow;
  }
}
