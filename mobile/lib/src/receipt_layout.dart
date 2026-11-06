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
    final size = store['printer_size']?.toString() ?? '80';
    return ReceiptLayout._(size == '58' ? 32 : 48);
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

    void pair(String label, String value) {
      final right = _fit(value, width);
      final maxLabel = width - right.length - 1;
      final safeLabel = _fit(label, maxLabel < 1 ? 1 : maxLabel);
      result.add(
          ReceiptLine('${safeLabel.padRight(width - right.length)}$right'));
    }

    centered(_value(store, 'store_name', fallback: 'Anyostore'),
        bold: true, large: true);
    _optionalCentered(store['store_address'], centered);
    _optionalCentered(_value(store, 'store_phone', prefix: 'Telp: '), centered);
    _optionalCentered(
        _value(store, 'store_tax_id', prefix: 'NPWP: '), centered);
    _optionalMultiline(store['receipt_header'], centered);
    left(_separator());

    centered('${data['invoice_no'] ?? ''}', bold: true);
    centered('${data['created_at'] ?? ''}');
    _optionalLeft(_value(data, 'cashier', prefix: 'Kasir: '), left);
    _optionalLeft(_value(data, 'customer_name', prefix: 'Pelanggan: '), left);
    left(_separator());

    final rawItems = (data['items'] as List?) ?? [];
    for (final raw in rawItems) {
      final item = (raw as Map).cast<String, dynamic>();
      final name =
          item['product_name']?.toString() ?? item['name']?.toString() ?? '';
      final variant = item['variant_detail']?.toString() ?? '';
      final qty = asNum(item['quantity']).toInt();
      final price = asNum(item['price']);
      final subtotal = asNum(item['subtotal']);
      left(name, bold: true);
      if (variant.trim().isNotEmpty) left('  ${variant.trim()}');
      pair('$qty x ${fmtRp(price)}', fmtRp(subtotal));
    }
    left(_separator());
    pair('Subtotal', fmtRp(asNum(data['subtotal'])));
    final discount = asNum(data['discount']);
    if (discount > 0) pair('Diskon', fmtRp(discount));
    pair('TOTAL', fmtRp(asNum(data['grand_total'])));
    left(_separator());

    final payments = (data['payments'] as List?) ?? [];
    for (final raw in payments) {
      final payment = (raw as Map).cast<String, dynamic>();
      pair((payment['payment_method']?.toString() ?? '').toUpperCase(),
          fmtRp(asNum(payment['amount'])));
    }
    final change = asNum(data['change']);
    if (change > 0) pair('Kembalian', fmtRp(change));

    result.add(const ReceiptLine(''));
    _optionalMultiline(store['receipt_note'], centered);
    _optionalMultiline(store['receipt_footer'], centered);
    centered('Terima kasih, sampai jumpa lagi!');
    result.add(const ReceiptLine(''));
    result.add(const ReceiptLine(''));
    return result;
  }

  String _separator() => '-' * width;

  static String _value(dynamic source, String key,
      {String fallback = '', String prefix = ''}) {
    final value = source is Map ? source[key]?.toString() ?? '' : '';
    return value.isEmpty ? fallback : '$prefix$value';
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
