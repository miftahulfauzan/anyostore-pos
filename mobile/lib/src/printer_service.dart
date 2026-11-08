import 'dart:async';
import 'dart:typed_data';

import 'package:bluetooth_print_plus/bluetooth_print_plus.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'format.dart';
import 'receipt_layout.dart';

/// Cetak struk thermal ke printer Bluetooth ESC/POS (GPrinter, 80mm).
class PrinterService {
  // Small packets are more reliable with the low-cost Bluetooth serial
  // adapters used by thermal printers. A single large write can be accepted
  // by the Android plugin but only the beginning reaches the printer.
  static const _bluetoothChunkSize = 128;
  static const _betweenChunks = Duration(milliseconds: 45);
  static const _afterWrite = Duration(milliseconds: 450);

  static const _prefName = 'pos_saved_printer_name';
  static const _prefAddr = 'pos_saved_printer_addr';
  static const _activeBranch = 'pos_active_branch';

  PrinterService({
    http.Client? httpClient,
    String? baseUrl,
    Future<Uint8List?> Function(String url)? logoLoader,
  })  : _httpClient = httpClient ?? http.Client(),
        _baseUrl = baseUrl ??
            const String.fromEnvironment('API_URL',
                defaultValue: 'https://anyostore.my.id/api'),
        _logoLoader = logoLoader;

  final http.Client _httpClient;
  final String _baseUrl;
  final Future<Uint8List?> Function(String url)? _logoLoader;

  /// Printer disimpan per toko/gudang (multi-printer per cabang).
  static Future<void> setActiveBranch(int branchId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(_activeBranch, branchId);
  }

  Future<int?> activeBranchId() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(_activeBranch);
  }

  Future<String> _suffix(int? branchId) async {
    final b = branchId ?? await activeBranchId() ?? 0;
    return b == 0 ? 'default' : '$b';
  }

  Future<void> savePrinter(BluetoothDevice device, {int? branchId}) async {
    final prefs = await SharedPreferences.getInstance();
    final suffix = await _suffix(branchId);
    await prefs.setString('$_prefName-$suffix', device.name);
    await prefs.setString('$_prefAddr-$suffix', device.address);
  }

  Future<BluetoothDevice?> savedPrinter({int? branchId}) async {
    final prefs = await SharedPreferences.getInstance();
    final suffix = await _suffix(branchId);
    final name = prefs.getString('$_prefName-$suffix') ?? '';
    final address = prefs.getString('$_prefAddr-$suffix') ?? '';
    if (address.isEmpty) return null;
    return BluetoothDevice(name, address);
  }

  Future<void> clearPrinter({int? branchId}) async {
    final prefs = await SharedPreferences.getInstance();
    final suffix = await _suffix(branchId);
    await prefs.remove('$_prefName-$suffix');
    await prefs.remove('$_prefAddr-$suffix');
  }

  Future<List<BluetoothDevice>> scan() async {
    final collected = <BluetoothDevice>[];
    final sub = BluetoothPrintPlus.scanResults.listen((list) {
      collected
        ..clear()
        ..addAll(list);
    });
    try {
      await BluetoothPrintPlus.startScan(timeout: const Duration(seconds: 6));
    } finally {
      await sub.cancel();
    }
    return collected;
  }

  Future<void> connect(BluetoothDevice device) async {
    if (BluetoothPrintPlus.isConnected) {
      await disconnect();
    }
    final connected = Completer<void>();
    late final StreamSubscription<ConnectState> subscription;
    subscription = BluetoothPrintPlus.connectState.listen((state) {
      if (state == ConnectState.connected && !connected.isCompleted) {
        connected.complete();
      }
    });
    try {
      await BluetoothPrintPlus.connect(device);
      if (BluetoothPrintPlus.isConnected) {
        return;
      }
      await connected.future.timeout(const Duration(seconds: 8));
    } finally {
      await subscription.cancel();
    }
  }

  Future<void> disconnect() => BluetoothPrintPlus.disconnect();

  Future<void> _writeBytes(Uint8List bytes) async {
    if (bytes.isEmpty) return;

    for (var start = 0; start < bytes.length; start += _bluetoothChunkSize) {
      final end = (start + _bluetoothChunkSize).clamp(0, bytes.length);
      final chunk = Uint8List.fromList(bytes.sublist(start, end));
      final result = await BluetoothPrintPlus.write(chunk);
      if (result == false) {
        throw StateError('Printer menolak data pada paket ${start + 1}.');
      }
      if (end < bytes.length) await Future<void>.delayed(_betweenChunks);
    }

    // Keep the connection alive while the last packet leaves the phone. This
    // is important because printNow disconnects immediately after this call.
    await Future<void>.delayed(_afterWrite);
  }

  String _mediaUrl(String path) {
    if (Uri.tryParse(path)?.hasScheme == true) return path;
    final root = _baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    return path.startsWith('/') ? '$root$path' : '$root/$path';
  }

  Future<Uint8List?> _loadReceiptLogo(Map<String, dynamic> receipt) async {
    try {
      final store = (receipt['store'] as Map<String, dynamic>?) ?? {};
      if (store['show_logo']?.toString().toLowerCase() == 'false') return null;
      final invoiceLogo = store['invoice_logo']?.toString().trim() ?? '';
      final storeLogo = store['store_logo']?.toString().trim() ?? '';
      final path = invoiceLogo.isNotEmpty ? invoiceLogo : storeLogo;
      if (path.isEmpty) return null;
      final url = _mediaUrl(path);
      final logoLoader = _logoLoader;
      if (logoLoader != null) return await logoLoader(url);
      final response = await _httpClient
          .get(Uri.parse(url))
          .timeout(const Duration(seconds: 3));
      if (response.statusCode != 200 || response.bodyBytes.isEmpty) return null;
      return Uint8List.fromList(response.bodyBytes);
    } catch (_) {
      // A broken logo must not prevent the receipt text from printing.
      return null;
    }
  }

  int _receiptLogoMaxWidth(Map<String, dynamic> receipt) =>
      ReceiptLayout.fromReceipt(receipt).width <= 32 ? 144 : 208;

  Future<void> printBarcode({required String code, String? label}) async {
    final esc = EscCommand();
    await esc.cleanCommand();
    if (label != null && label.trim().isNotEmpty) {
      await esc.text(
          content: label.trim(),
          alignment: Alignment.center,
          style: EscTextStyle.bold);
      await esc.newline();
    }
    await esc.code128(
        content: code,
        height: 60,
        alignment: Alignment.center,
        hriPosition: HriPosition.below);
    await esc.newline();
    await esc.print(feedLines: 4);
    await esc.cutPaper();
    final bytes = await esc.getCommand();
    if (bytes != null) await _writeBytes(bytes);
  }

  /// Label harga 40x30 mm untuk rak: nama, varian, harga besar, sku/barcode.
  Future<void> printPriceLabel({
    required String name,
    required String price,
    String? variant,
    String? sku,
    String? barcode,
  }) async {
    final esc = EscCommand();
    await esc.cleanCommand();
    await esc.text(content: name.trim(), style: EscTextStyle.bold);
    await esc.newline();
    if (variant != null && variant.trim().isNotEmpty) {
      await esc.text(content: variant.trim());
      await esc.newline();
    }
    await esc.text(
        content: price.trim(),
        alignment: Alignment.center,
        style: EscTextStyle.bold,
        fontSize: EscFontSize.size2);
    await esc.newline();
    if (sku != null && sku.trim().isNotEmpty) {
      await esc.text(content: sku.trim(), alignment: Alignment.center);
      await esc.newline();
    }
    if (barcode != null && barcode.trim().isNotEmpty) {
      await esc.code128(
          content: barcode.trim(),
          height: 46,
          alignment: Alignment.center,
          hriPosition: HriPosition.below);
    }
    await esc.newline();
    await esc.print(feedLines: 4);
    await esc.cutPaper();
    final bytes = await esc.getCommand();
    if (bytes != null) await _writeBytes(bytes);
  }

  Future<void> printReceipt(Map<String, dynamic> receipt) async {
    final esc = EscCommand();
    await esc.cleanCommand();
    final layout = ReceiptLayout.fromReceipt(receipt);

    final logo = await _loadReceiptLogo(receipt);
    if (logo != null && logo.isNotEmpty) {
      await esc.image(
        image: logo,
        alignment: Alignment.center,
        maxWidth: _receiptLogoMaxWidth(receipt),
      );
      await esc.newline();
    }

    for (final row in layout.build(receipt)) {
      await esc.text(
        content: row.text,
        alignment: row.alignment == ReceiptLineAlignment.center
            ? Alignment.center
            : Alignment.left,
        style: row.bold ? EscTextStyle.bold : EscTextStyle.default_,
        fontSize: row.large ? EscFontSize.size2 : EscFontSize.default_,
      );
      await esc.newline();
    }
    await esc.print(feedLines: 4);
    await esc.cutPaper();

    final bytes = await esc.getCommand();
    if (bytes != null) await _writeBytes(bytes);
  }

  /// Cetak laporan penutupan harian.
  Future<void> printClosing(Map<String, dynamic> closing) async {
    final esc = EscCommand();
    await esc.cleanCommand();
    Future<void> line(String text,
        {Alignment alignment = Alignment.left,
        EscTextStyle style = EscTextStyle.default_,
        EscFontSize fontSize = EscFontSize.default_}) async {
      await esc.text(
          content: text,
          alignment: alignment,
          style: style,
          fontSize: fontSize);
      await esc.newline();
    }

    final store = (closing['store'] as Map<String, dynamic>?) ?? {};
    final storeName = store['store_name']?.toString() ?? 'Anyostore';
    final methods = (closing['methods'] as Map<String, dynamic>?) ?? {};

    await line(storeName,
        alignment: Alignment.center,
        style: EscTextStyle.bold,
        fontSize: EscFontSize.size2);
    await line('--------------------------------');
    await line('LAPORAN PENUTUPAN',
        alignment: Alignment.center, style: EscTextStyle.bold);
    await line(closing['date']?.toString() ?? '', alignment: Alignment.center);
    await line('--------------------------------');
    await line('Total struk'.padRight(20) +
        '${closing['receipt_count'] ?? 0}'.padLeft(28));
    await line('Total penjualan'.padRight(20) +
        fmtRp(asNum(closing['total_sales'])).padLeft(28));
    await line(
        'Retur'.padRight(20) + '${closing['return_count'] ?? 0}'.padLeft(28));
    await line('Pengeluaran'.padRight(20) +
        fmtRp(asNum(closing['expenses'])).padLeft(28));
    await line(
        'Pemasukan'.padRight(20) + fmtRp(asNum(closing['income'])).padLeft(28));
    await line('TOTAL KASIR'.padRight(20) +
        fmtRp(asNum(closing['expected_total'])).padLeft(28));
    await line('--------------------------------');
    for (final entry in methods.entries) {
      final m = entry.value as Map<String, dynamic>;
      await line((entry.key).toString().toUpperCase(),
          style: EscTextStyle.bold);
      await line(
          '  Penjualan'.padRight(20) + fmtRp(asNum(m['sales'])).padLeft(28));
      await line(
          '  Retur'.padRight(20) + fmtRp(asNum(m['returns'])).padLeft(28));
      await line('  Pembatalan'.padRight(20) +
          fmtRp(asNum(m['cancellations'])).padLeft(28));
      await line('  Kas masuk/keluar'.padRight(20) +
          fmtRp(asNum(m['cash_in_out'])).padLeft(28));
      await line('  Total'.padRight(20) + fmtRp(asNum(m['total'])).padLeft(28));
    }
    await line('--------------------------------');
    await line('Terima kasih, sampai jumpa lagi!', alignment: Alignment.center);
    await esc.print(feedLines: 4);
    await esc.cutPaper();
    final bytes = await esc.getCommand();
    if (bytes != null) await _writeBytes(bytes);
  }

  /// Uji cetak sederhana untuk memastikan printer siap dipakai.
  Future<void> printTest() async {
    final esc = EscCommand();
    await esc.cleanCommand();
    await esc.text(
        content: 'Anyostore App',
        alignment: Alignment.center,
        style: EscTextStyle.bold,
        fontSize: EscFontSize.size2);
    await esc.newline();
    await esc.text(content: '--------------------------------');
    await esc.newline();
    await esc.text(
        content: 'UJI CETAK PRINTER',
        alignment: Alignment.center,
        style: EscTextStyle.bold);
    await esc.newline();
    await esc.text(content: 'Printer siap dipakai otomatis');
    await esc.newline();
    await esc.print(feedLines: 4);
    await esc.cutPaper();
    final bytes = await esc.getCommand();
    if (bytes != null) await _writeBytes(bytes);
  }
}
