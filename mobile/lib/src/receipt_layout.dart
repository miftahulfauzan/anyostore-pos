import 'format.dart';

enum ReceiptLineAlignment { left, center }

class ReceiptLine {
  const ReceiptLine(
    this.text, {
    this.alignment = ReceiptLineAlignment.left,
    this.bold = false,
    this.large = false,
  });

  final String text;
  final ReceiptLineAlignment alignment;
  final bool bold;
  final bool large;
}

/// Text layout for ESC/POS receipts. The printer width is measured in the
/// normal font's character columns: 32 for 58 mm and 48 for 80 mm.
class ReceiptLayout {
  ReceiptLayout._(this.width);

  factory ReceiptLayout.fromReceipt(Map<String, dynamic> receipt) {
    final store = (receipt['store'] as Map<String, dynamic>?) ?? {};
    final size = (store['printer_size']?.toString() ?? '80')
        .replaceAll(RegExp(r'\s+'), '')
        .toLowerCase();
    return ReceiptLayout._(size.startsWith('58') ? 32 : 48);
  }

  final int width;

  List<ReceiptLine> build([Map<String, dynamic>? receipt]) {
    final data = receipt ?? <String, dynamic>{};
    final store = (data['store'] as Map<String, dynamic>?) ?? {};
    final result = <ReceiptLine>[];

    void left(String value, {bool bold = false, bool large = false}) {
      for (final part in _wrap(value, large ? width ~/ 2 : width)) {
        result.add(ReceiptLine(part, bold: bold, large: large));
      }
    }

    void centered(String value, {bool bold = false, bool large = false}) {
      for (final part in _wrap(value, large ? width ~/ 2 : width)) {
        result.add(ReceiptLine(part,
            alignment: ReceiptLineAlignment.center, bold: bold, large: large));
      }
    }

    void pair(String label, String value,
        {bool bold = false, bool large = false}) {
      // Leave one column for the label even when the amount is long. The
      // previous width-sized right column could produce width + 1 characters
      // and make thermal printers wrap the row unexpectedly.
      final right = _fit(value, width - 1);
      final maxLabel = width - right.length - 1;
      final safeLabel = _fit(label, maxLabel < 1 ? 1 : maxLabel);
      result.add(ReceiptLine(
          '${safeLabel.padRight(width - right.length)}$right',
          bold: bold,
          large: large));
    }

    centered(_value(store, 'store_name', fallback: 'Anyostore'),
        bold: true, large: true);
    _optionalMultiline(store['receipt_header'], centered);
    _optionalCentered(store['store_address'], centered);
    _optionalCentered(_value(store, 'store_phone', prefix: 'Telp: '), centered);
    _optionalCentered(
        _value(store, 'store_tax_id', prefix: 'NPWP: '), centered);
    left(_separator());

    left('INFORMASI TRANSAKSI', bold: true);
    pair('Invoice', '${data['invoice_no'] ?? ''}');
    final transactionDate = _transactionDateLabel(data);
    if (transactionDate.isNotEmpty) pair('Tanggal', transactionDate);
    _optionalLeft(_value(data, 'cashier', prefix: 'Kasir: '), left);
    _optionalLeft(_value(data, 'customer_name', prefix: 'Pelanggan: '), left);
    left(_separator());

    left('PRODUK', bold: true);
    final rawItems = (data['items'] as List?) ?? [];
    for (final raw in rawItems) {
      final item = (raw as Map).cast<String, dynamic>();
      final name =
          item['product_name']?.toString() ?? item['name']?.toString() ?? '';
      final sku = item['sku']?.toString().trim() ?? '';
      final variant = item['variant_detail']?.toString() ?? '';
      final qty = asNum(item['quantity']).toInt();
      final price = asNum(item['price']);
      final subtotal = asNum(item['subtotal']);
      pair(name, fmtRp(subtotal), bold: true);
      final details =
          [sku, variant.trim()].where((value) => value.isNotEmpty).join(' · ');
      if (details.isNotEmpty) left(details);
      left('$qty x ${fmtRp(price)}');
    }
    left(_separator());
    pair('Subtotal', fmtRp(asNum(data['subtotal'])));
    final discount = asNum(data['discount']);
    if (discount > 0) pair('Diskon', '-${fmtRp(discount)}');
    pair('Total', fmtRp(asNum(data['grand_total'])), bold: true);
    left(_separator());

    var payments = (data['payments'] as List?) ?? [];
    if (payments.isEmpty && data['payment_method'] != null) {
      payments = [
        {
          'payment_method': data['payment_method'],
          'amount': asNum(data['grand_total']),
        }
      ];
    }
    for (final raw in payments) {
      final payment = (raw as Map).cast<String, dynamic>();
      pair(_paymentLabel(payment['payment_method']),
          fmtRp(asNum(payment['amount'])));
    }
    final paymentTotal = payments.fold<num>(
        0, (total, raw) => total + asNum((raw as Map)['amount']));
    final paid = asNum(data['amount_paid']) > 0
        ? asNum(data['amount_paid'])
        : paymentTotal > 0
            ? paymentTotal
            : asNum(data['grand_total']);
    pair('Dibayar', fmtRp(paid));
    final change = asNum(data['change']);
    pair('Kembalian', fmtRp(change));

    left(_separator());
    centered('Terima kasih, sampai jumpa lagi!');
    _optionalMultiline(store['receipt_footer'], centered);
    _optionalMultiline(store['receipt_note'], centered);
    result.add(const ReceiptLine(''));
    return result;
  }

  String _separator() => '-' * width;

  static String _value(dynamic source, String key,
      {String fallback = '', String prefix = ''}) {
    final value = source is Map ? source[key]?.toString() ?? '' : '';
    return value.isEmpty ? fallback : '$prefix$value';
  }

  static String _transactionDateLabel(Map<String, dynamic> data) {
    final rawBusinessDate = data['transaction_date']?.toString() ?? '';
    var date = _slashDate(rawBusinessDate);
    final parsed = DateTime.tryParse(data['created_at']?.toString() ?? '');
    if (parsed != null) {
      final wib = parsed.toUtc().add(const Duration(hours: 7));
      date = date.isEmpty
          ? '${_twoDigit(wib.day)}/${_twoDigit(wib.month)}/${wib.year}'
          : date;
      return '$date · ${_twoDigit(wib.hour)}:${_twoDigit(wib.minute)}';
    }
    return date;
  }

  static String _slashDate(String value) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(value);
    if (match == null) return '';
    return '${match.group(3)}/${match.group(2)}/${match.group(1)}';
  }

  static String _twoDigit(int value) => value.toString().padLeft(2, '0');

  static String _paymentLabel(dynamic value) {
    switch (value?.toString().trim().toLowerCase()) {
      case 'cash':
        return 'Tunai';
      case 'qris':
        return 'QRIS';
      case 'transfer':
        return 'Transfer';
      case 'debit':
        return 'Debit';
      case 'credit':
        return 'Kredit';
      case 'split':
        return 'Pembayaran terpisah';
      default:
        return value?.toString().trim().isNotEmpty == true
            ? value.toString()
            : 'Pembayaran';
    }
  }

  static void _optionalCentered(
      dynamic value, void Function(String, {bool bold, bool large}) add) {
    final text = value?.toString().trim() ?? '';
    if (text.isNotEmpty) add(text, bold: false, large: false);
  }

  static void _optionalMultiline(
      dynamic value, void Function(String, {bool bold, bool large}) add) {
    final text = value?.toString().trim() ?? '';
    if (text.isNotEmpty) add(text, bold: false, large: false);
  }

  static void _optionalLeft(
      String value, void Function(String, {bool bold, bool large}) add) {
    if (value.isNotEmpty) add(value, bold: false, large: false);
  }

  static String _fit(String value, int max) {
    final normalized = value.trim();
    if (max <= 0) return '';
    if (normalized.length <= max) return normalized;
    if (max == 1) return normalized.substring(0, 1);
    return '${normalized.substring(0, max - 1).trimRight()}…';
  }

  static List<String> _wrap(String value, int max) {
    if (max <= 0) return const [''];
    final result = <String>[];
    for (final paragraph in value.replaceAll('\r\n', '\n').split('\n')) {
      final words = paragraph.trim().split(RegExp(r'\s+'));
      if (paragraph.trim().isEmpty) {
        result.add('');
        continue;
      }
      var line = '';
      for (final word in words) {
        if (word.isEmpty) continue;
        if (word.length > max) {
          if (line.isNotEmpty) {
            result.add(line);
            line = '';
          }
          var remaining = word;
          while (remaining.length > max) {
            result.add(remaining.substring(0, max));
            remaining = remaining.substring(max);
          }
          line = remaining;
        } else if (line.isEmpty) {
          line = word;
        } else if (line.length + word.length + 1 <= max) {
          line = '$line $word';
        } else {
          result.add(line);
          line = word;
        }
      }
      if (line.isNotEmpty) result.add(line);
    }
    return result.isEmpty ? const [''] : result;
  }
}
