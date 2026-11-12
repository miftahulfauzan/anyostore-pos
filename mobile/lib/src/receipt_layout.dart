import 'format.dart';

enum ReceiptLineAlignment { left, center }

class ReceiptLine {
  const ReceiptLine(
    this.text, {
    this.alignment = ReceiptLineAlignment.left,
    this.bold = false,
  });

  final String text;
  final ReceiptLineAlignment alignment;
  final bool bold;
}

/// Tata letak struk thermal ESC/POS.
///
/// Badan struk dicetak memakai **Font B** printer (9×17 dot, satu ukuran lebih
/// kecil dari Font A 12×24) sehingga satu baris muat 42 karakter pada kertas
/// 58 mm dan 64 karakter pada 80 mm. Karena itu lebar kolom di sini dihitung
/// dari grid Font B, bukan lagi 32/48 kolom Font A.
///
/// Setiap baris dipaksa selebar kertas: margin kiri = margin kanan sehingga
/// teks tidak menempel tepi kertas dan angka kanan tetap rata.
class ReceiptLayout {
  ReceiptLayout._(this.width, this.margin, {required this.fontB});

  factory ReceiptLayout.fromReceipt(Map<String, dynamic> receipt) {
    final store = (receipt['store'] as Map<String, dynamic>?) ?? {};
    final size = (store['printer_size']?.toString() ?? '80')
        .replaceAll(RegExp(r'\s+'), '')
        .toLowerCase();
    final narrow = size.startsWith('58');
    // Template dari web: ukuran font & margin bisa diubah per cabang.
    final fontB =
        (store['receipt_font']?.toString() ?? 'b').toLowerCase() != 'a';
    final width = narrow ? (fontB ? 42 : 32) : (fontB ? 64 : 48);
    final fallbackMargin = narrow ? 3 : 4;
    final custom = int.tryParse(store['receipt_margin']?.toString() ?? '') ?? 0;
    final margin =
        custom >= 0 && custom <= 6 && custom != 0 ? custom : fallbackMargin;
    return ReceiptLayout._(width, margin, fontB: fontB);
  }

  /// Jumlah kolom dalam satu baris (termasuk margin kiri kanan).
  final int width;

  /// Jumlah kolom kosong di kiri dan di kanan setiap baris.
  final int margin;

  /// true = Font B (kecil), false = Font A (normal).
  final bool fontB;

  int get _inner => width - margin * 2;

  /// Label kolom kiri pada bagian informasi transaksi.
  static const _metaLabel = 12;

  static bool _on(Map<String, dynamic> store, String key) {
    final raw = store[key]?.toString().trim().toLowerCase() ?? '';
    if (raw.isEmpty) return true;
    return raw == 'true' || raw == '1';
  }

  static String _text(Map<String, dynamic> store, String key, String fallback) {
    final raw = _ascii(store[key]?.toString().trim() ?? '');
    return raw.isEmpty ? fallback : raw;
  }

  /// Baris siap cetak: pakai kiriman server (`lines`) supaya aturan struk hanya
  /// ada satu; bila tidak ada (mis. cetak offline), susun lokal dengan aturan
  /// yang sama (dijaga fixture golden bersama backend).
  List<ReceiptLine> resolve([Map<String, dynamic>? receipt]) {
    final data = receipt ?? <String, dynamic>{};
    final raw = data['lines'];
    if (raw is List && raw.isNotEmpty) {
      final parsed = <ReceiptLine>[];
      for (final entry in raw) {
        final row = entry is Map ? entry.cast<String, dynamic>() : null;
        if (row == null) continue;
        parsed.add(ReceiptLine(
          row['text']?.toString() ?? '',
          bold: row['bold'] == true,
          alignment: row['alignment'] == 'center'
              ? ReceiptLineAlignment.center
              : ReceiptLineAlignment.left,
        ));
      }
      if (parsed.isNotEmpty) return parsed;
    }
    return build(data);
  }

  List<ReceiptLine> build([Map<String, dynamic>? receipt]) {
    final data = receipt ?? <String, dynamic>{};
    final store = (data['store'] as Map<String, dynamic>?) ?? {};
    final result = <ReceiptLine>[];

    void emit(String content, {bool bold = false, bool center = false}) {
      final body = center
          ? _center(content, _inner)
          : _fit(content.replaceAll(RegExp(r'\s+$'), ''), _inner)
              .padRight(_inner);
      final text = ' ' * margin + body + ' ' * margin;
      result.add(ReceiptLine(text,
          bold: bold,
          alignment: center
              ? ReceiptLineAlignment.center
              : ReceiptLineAlignment.left));
    }

    void centered(String value, {bool bold = false}) {
      for (final part in _wrap(value, _inner)) {
        emit(part, bold: bold, center: true);
      }
    }

    void meta(String label, String value) {
      final room = _inner - _metaLabel;
      final safe =
          value.length > room ? '${value.substring(0, room - 3)}...' : value;
      emit('${label.padRight(_metaLabel)}$safe');
    }

    void pair(String label, String value) {
      final right = _fit(value, _inner);
      final left = _fit(label, _inner - right.length - 1);
      emit('${left.padRight(_inner - right.length)}$right');
    }

    void item(String name, int qty, String price, String amount) {
      var mid = '$qty x $price';
      var nameWidth = _inner - mid.length - amount.length - 3;
      if (nameWidth < 6) {
        mid = '${qty}x$price';
        nameWidth = _inner - mid.length - amount.length - 3;
      }
      final nameCol = nameWidth.clamp(4, 16);
      final safeName =
          name.length <= nameCol ? name : '${name.substring(0, nameCol - 1)}.';
      final gap = _inner - nameCol - 1 - mid.length - amount.length - 1;
      emit('${safeName.padRight(nameCol)} $mid'
          '${' ' * (gap < 1 ? 1 : gap)}$amount');
    }

    void rule() {
      final style = (store['receipt_separator']?.toString().trim() ?? 'dash')
          .toLowerCase();
      if (style == 'none') return;
      if (style == 'blank') {
        emit('');
        return;
      }
      emit('-' * _inner);
    }

    // ===== Kepala: nama toko, sapaan, alamat, nomor WhatsApp =====
    centered(_ascii(_value(store, 'store_name', fallback: 'Anyostore')),
        bold: true);
    _optional(store['receipt_header'], centered);
    emit('');
    if (_on(store, 'receipt_show_address')) {
      _optional(store['store_address'], centered, maxLines: 3);
    }
    emit('');
    if (_on(store, 'receipt_show_wa')) {
      for (final contact in _contactLines(store)) {
        centered(contact);
      }
    }
    if (_on(store, 'receipt_show_npwp')) {
      final tax = _value(store, 'store_tax_id', prefix: 'NPWP: ');
      if (tax.isNotEmpty) centered(tax);
    }
    rule();

    // ===== Informasi transaksi (judul polos, bukan kotak) =====
    emit(_text(store, 'receipt_title_info', 'INFORMASI TRANSAKSI'), bold: true);
    meta(_text(store, 'receipt_label_invoice', 'Invoice'),
        _ascii('${data['invoice_no'] ?? ''}'));
    final date = _transactionDateLabel(data);
    if (date.isNotEmpty) {
      meta(_text(store, 'receipt_label_date', 'Tanggal'), date);
    }
    final cashier = _value(data, 'cashier');
    if (cashier.isNotEmpty && _on(store, 'receipt_show_cashier')) {
      meta(_text(store, 'receipt_label_cashier', 'Kasir'), _ascii(cashier));
    }
    final customer = _value(data, 'customer_name');
    if (customer.isNotEmpty && _on(store, 'receipt_show_customer')) {
      meta(_text(store, 'receipt_label_customer', 'Pelanggan'),
          _ascii(customer));
    }
    rule();

    // ===== Produk: nama, qty x harga, jumlah dalam satu baris =====
    emit(_text(store, 'receipt_title_products', 'PRODUK'), bold: true);
    emit('');
    final rawItems = (data['items'] as List?) ?? [];
    for (final raw in rawItems) {
      final itemRow = (raw as Map).cast<String, dynamic>();
      final name = itemRow['product_name']?.toString() ??
          itemRow['name']?.toString() ??
          '';
      item(
        _ascii(name),
        asNum(itemRow['quantity']).toInt(),
        _moneyNumber(asNum(itemRow['price'])),
        fmtRp(asNum(itemRow['subtotal'])),
      );
    }
    emit('');
    rule();

    pair(_text(store, 'receipt_label_subtotal', 'Subtotal'),
        fmtRp(asNum(data['subtotal'])));
    final discount = asNum(data['discount']);
    if (discount > 0) {
      pair(_text(store, 'receipt_label_discount', 'Diskon'),
          '-${fmtRp(discount)}');
    }
    pair(_text(store, 'receipt_label_total', 'Total'),
        fmtRp(asNum(data['grand_total'])));
    rule();

    var payments = (data['payments'] as List?) ?? [];
    if (payments.isEmpty && data['payment_method'] != null) {
      payments = [
        {
          'payment_method': data['payment_method'],
          'amount': asNum(data['grand_total']),
        }
      ];
    }
    if (_on(store, 'receipt_show_payment')) {
      for (final raw in payments) {
        final payment = (raw as Map).cast<String, dynamic>();
        pair(_paymentLabel(payment['payment_method']),
            fmtRp(asNum(payment['amount'])));
      }
    }
    final paymentTotal = payments.fold<num>(
        0, (total, raw) => total + asNum((raw as Map)['amount']));
    final paid = asNum(data['amount_paid']) > 0
        ? asNum(data['amount_paid'])
        : paymentTotal > 0
            ? paymentTotal
            : asNum(data['grand_total']);
    if (_on(store, 'receipt_show_paid')) {
      pair(_text(store, 'receipt_label_paid', 'Dibayar'), fmtRp(paid));
    }
    if (_on(store, 'receipt_show_change')) {
      pair(_text(store, 'receipt_label_change', 'Kembalian'),
          fmtRp(asNum(data['change'])));
    }

    rule();
    centered(
        _text(store, 'receipt_closing', 'Terima kasih, sampai jumpa lagi!'));
    _optional(store['receipt_footer'], centered);
    _optional(store['receipt_note'], centered);
    emit('');
    return result;
  }

  /// Nomor WhatsApp admin dari pengaturan toko. Sebelumnya struk hanya memakai
  /// `store_phone` sehingga nomor admin lain tidak pernah tercetak.
  static List<String> _contactLines(Map<String, dynamic> store) {
    final numbers = <String>[];
    void add(dynamic value) {
      final text = _ascii(value?.toString().trim() ?? '');
      if (text.isEmpty) return;
      if (!numbers.contains(text)) numbers.add(text);
    }

    final raw = store['whatsapp_numbers'];
    if (raw is String && raw.trim().startsWith('[')) {
      try {
        final decoded = raw.trim();
        for (final part
            in decoded.substring(1, decoded.length - 1).split(',')) {
          add(part.replaceAll('"', '').replaceAll(RegExp(r'[\[\]]'), ''));
        }
      } catch (_) {}
    } else if (raw is List) {
      for (final value in raw) {
        add(value);
      }
    }
    add(store['whatsapp_number']);
    add(store['whatsapp_number_2']);
    add(store['whatsapp_number_3']);
    if (numbers.isEmpty) add(store['store_phone']);

    if (numbers.isEmpty) return const [];
    // Label sekali di atas, nomor di baris-baris berikutnya.
    return ['WhatsApp', ...numbers];
  }

  static String _moneyNumber(num value) {
    final rounded = value.round();
    final digits = rounded.toString();
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
      buffer.write(digits[i]);
    }
    return buffer.toString();
  }

  static String _center(String value, int width) {
    final text = _fit(value, width);
    final gap = width - text.length;
    if (gap <= 0) return text;
    final left = gap ~/ 2;
    return '${' ' * left}$text${' ' * (gap - left)}';
  }

  static String _value(dynamic source, String key,
      {String fallback = '', String prefix = ''}) {
    final value = source is Map ? source[key]?.toString() ?? '' : '';
    return value.isEmpty ? fallback : '$prefix$value';
  }

  /// Printer thermal memakai codepage lama: ganti karakter non-ASCII supaya
  /// tidak tercetak sebagai simbol acak.
  static String _ascii(String value) => value
      .replaceAll('\u00b7', '-')
      .replaceAll('\u2026', '...')
      .replaceAll('\u2013', '-')
      .replaceAll('\u2014', '-')
      .replaceAll('\u2019', "'")
      .replaceAll('\u2018', "'")
      .replaceAll('\u201c', '"')
      .replaceAll('\u201d', '"')
      .replaceAll('\u00d7', 'x');

  static String _transactionDateLabel(Map<String, dynamic> data) {
    final rawBusinessDate = data['transaction_date']?.toString() ?? '';
    var date = _slashDate(rawBusinessDate);
    final parsed = DateTime.tryParse(data['created_at']?.toString() ?? '');
    if (parsed != null) {
      final wib = parsed.toUtc().add(const Duration(hours: 7));
      date = date.isEmpty
          ? '${_twoDigit(wib.day)}/${_twoDigit(wib.month)}/${wib.year}'
          : date;
      return '$date ${_twoDigit(wib.hour)}:${_twoDigit(wib.minute)}';
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

  static void _optional(dynamic value, void Function(String) add,
      {int? maxLines}) {
    final text = _ascii(value?.toString().trim() ?? '');
    if (text.isEmpty) return;
    if (maxLines == null) {
      add(text);
      return;
    }
    final rows = text
        .replaceAll('\r\n', '\n')
        .split('\n')
        .map((row) => row.trim())
        .where((row) => row.isNotEmpty)
        .take(maxLines)
        .join('\n');
    add(rows);
  }

  static String _fit(String value, int max) {
    final normalized = value.trim();
    if (max <= 0) return '';
    if (normalized.length <= max) return normalized;
    if (max <= 3) return normalized.substring(0, max);
    return '${normalized.substring(0, max - 3)}...';
  }

  static List<String> _wrap(String value, int max) {
    if (max <= 0) return const [''];
    final result = <String>[];
    for (final paragraph in value.replaceAll('\r\n', '\n').split('\n')) {
      final words = paragraph.trim().split(RegExp(r'\s+'));
      if (paragraph.trim().isEmpty) continue;
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
