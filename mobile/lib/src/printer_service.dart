import 'package:bluetooth_print_plus/bluetooth_print_plus.dart';

import 'format.dart';

/// Cetak struk thermal ke printer Bluetooth ESC/POS (GPrinter, 80mm).
class PrinterService {
  Future<List<BluetoothDevice>> scan() async {
    final collected = <BluetoothDevice>[];
    final sub = BluetoothPrintPlus.scanResults.listen((list) {
      collected
        ..clear()
        ..addAll(list);
    });
    try {
      await BluetoothPrintPlus.startScan(timeout: const Duration(seconds: 6));
      await Future<void>.delayed(const Duration(milliseconds: 6500));
    } finally {
      await sub.cancel();
    }
    return collected;
  }

  Future<void> connect(BluetoothDevice device) =>
      BluetoothPrintPlus.connect(device);

  Future<void> disconnect() => BluetoothPrintPlus.disconnect();

  Future<void> printBarcode({required String code, String? label}) async {
    final esc = EscCommand();
    await esc.cleanCommand();
    if (label != null && label.trim().isNotEmpty) {
      await esc.text(
          content: label.trim(),
          alignment: Alignment.center,
          style: EscTextStyle.bold);
    }
    await esc.code128(
        content: code,
        height: 60,
        alignment: Alignment.center,
        hriPosition: HriPosition.below);
    await esc.newline();
    await esc.cutPaper();
    final bytes = await esc.getCommand();
    if (bytes != null) await BluetoothPrintPlus.write(bytes);
  }

  Future<void> printReceipt(Map<String, dynamic> receipt) async {
    final esc = EscCommand();
    await esc.cleanCommand();

    Future<void> line(String text,
            {Alignment alignment = Alignment.left,
            EscTextStyle style = EscTextStyle.default_,
            EscFontSize fontSize = EscFontSize.default_}) =>
        esc.text(
            content: text,
            alignment: alignment,
            style: style,
            fontSize: fontSize);

    Future<void> blank() => esc.newline();

    final store = (receipt['store'] as Map<String, dynamic>?) ?? {};
    final storeName = store['store_name']?.toString() ?? 'Anyostore';

    // Header toko
    await line(storeName,
        alignment: Alignment.center,
        style: EscTextStyle.bold,
        fontSize: EscFontSize.size2);
    if (store['store_address']?.toString().isNotEmpty == true) {
      await line(store['store_address'].toString(),
          alignment: Alignment.center);
    }
    if (store['store_phone']?.toString().isNotEmpty == true) {
      await line('Telp: ${store['store_phone']}', alignment: Alignment.center);
    }
    if (store['store_tax_id']?.toString().isNotEmpty == true) {
      await line('NPWP: ${store['store_tax_id']}', alignment: Alignment.center);
    }
    if (store['receipt_header']?.toString().isNotEmpty == true) {
      await line(store['receipt_header'].toString(),
          alignment: Alignment.center);
    }
    await line('--------------------------------');

    // Info transaksi
    await line('${receipt['invoice_no'] ?? ''}',
        alignment: Alignment.center, style: EscTextStyle.bold);
    await line('${receipt['created_at'] ?? ''}', alignment: Alignment.center);
    if (receipt['cashier']?.toString().isNotEmpty == true) {
      await line('Kasir: ${receipt['cashier']}');
    }
    if (receipt['customer_name']?.toString().isNotEmpty == true) {
      await line('Pelanggan: ${receipt['customer_name']}');
    }
    await line('--------------------------------');

    // Item
    final rawItems = (receipt['items'] as List?) ?? [];
    for (final raw in rawItems) {
      final item = raw as Map<String, dynamic>;
      final name = item['product_name']?.toString() ?? '';
      final variant = item['variant_detail']?.toString() ?? '';
      final qty = asNum(item['quantity']).toInt();
      final price = asNum(item['price']);
      final subtotal = asNum(item['subtotal']);
      await line(name, style: EscTextStyle.bold);
      if (variant.isNotEmpty) await line('  $variant');
      await line('  $qty x ${fmtRp(price)}'.padRight(24) +
          fmtRp(subtotal).padLeft(24));
    }
    await line('--------------------------------');

    // Total
    await line('Subtotal'.padRight(24) +
        fmtRp(asNum(receipt['subtotal'])).padLeft(24));
    final discount = asNum(receipt['discount']);
    if (discount > 0) {
      await line('Diskon'.padRight(24) + fmtRp(discount).padLeft(24));
    }
    await line('TOTAL'.padRight(24) +
        fmtRp(asNum(receipt['grand_total'])).padLeft(24));
    await line('--------------------------------');

    // Pembayaran
    final payments = (receipt['payments'] as List?) ?? [];
    if (payments.isNotEmpty) {
      for (final raw in payments) {
        final p = raw as Map<String, dynamic>;
        final method = p['payment_method']?.toString() ?? '';
        final amount = asNum(p['amount']);
        await line(
            method.toUpperCase().padRight(24) + fmtRp(amount).padLeft(24));
      }
    }
    final change = asNum(receipt['change']);
    if (change > 0) {
      await line('Kembalian'.padRight(24) + fmtRp(change).padLeft(24));
    }

    // Footer
    await blank();
    if (store['receipt_note']?.toString().isNotEmpty == true) {
      await line(store['receipt_note'].toString(), alignment: Alignment.center);
    }
    if (store['receipt_footer']?.toString().isNotEmpty == true) {
      await line(store['receipt_footer'].toString(),
          alignment: Alignment.center);
    }
    await line('Terima kasih, sampai jumpa lagi!', alignment: Alignment.center);
    await blank();
    await blank();
    await esc.cutPaper();

    final bytes = await esc.getCommand();
    if (bytes != null) await BluetoothPrintPlus.write(bytes);
  }
}
