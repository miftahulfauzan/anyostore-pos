// ignore_for_file: prefer_const_constructors

import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'format.dart';

/// Satu baris barang pada invoice yang dibagikan.
class InvoiceLine {
  const InvoiceLine({
    required this.name,
    this.variant = '',
    required this.qty,
    required this.price,
    required this.subtotal,
  });

  final String name;
  final String variant;
  final int qty;
  final double price;
  final double subtotal;
}

/// Data invoice gambar. Dipakai untuk dua keadaan: penawaran (belum dibayar,
/// dari keranjang) dan bukti (setelah transaksi tersimpan).
class InvoicePayload {
  const InvoicePayload({
    required this.storeName,
    required this.storeAddress,
    required this.storePhone,
    required this.invoiceNo,
    required this.dateText,
    required this.cashier,
    required this.customerLabel,
    required this.items,
    required this.subtotal,
    required this.discount,
    required this.total,
    this.note,
  });

  final String storeName;
  final String storeAddress;
  final String storePhone;
  final String invoiceNo;
  final String dateText;
  final String cashier;
  final String customerLabel;
  final List<InvoiceLine> items;
  final double subtotal;
  final double discount;
  final double total;
  final String? note;
}

/// Toko "BASIK" tampil tanpa tulisan ANYOSTORE; toko lain tetap memakai
/// ANYOSTORE sebagai nama utama dan nama toko sebagai subjudul.
bool invoiceShowsBrand(String storeName) =>
    !storeName.toUpperCase().contains('BASIK');

/// Rekening transfer yang tampil di bawah total.
const invoiceBankAccounts = <({String bank, String number})>[
  (bank: 'BCA', number: '0042813603'),
  (bank: 'MANDIRI', number: '1640000929465'),
];
const invoiceBankHolder = 'Miftahul Fauzan';
const invoiceBankNote = 'Jika sudah transfer mohon konfirmasinya ya ka';

/// Lebar logis invoice; ditangkap pada pixel ratio 2 sehingga keluar 1080 px.
const double invoiceLogicalWidth = 540;

class InvoiceImage extends StatelessWidget {
  const InvoiceImage({super.key, required this.payload});

  final InvoicePayload payload;

  @override
  Widget build(BuildContext context) {
    const denim = Color(0xFF1E3A5F);
    const inkColor = Color(0xFF0F172A);
    const muted = Color(0xFF64748B);
    const line = Color(0xFFE2E8F0);
    const paper = Color(0xFFFFFFFF);

    final showBrand = invoiceShowsBrand(payload.storeName);
    final initial = payload.storeName.trim().isEmpty
        ? 'A'
        : payload.storeName.trim().characters.first.toUpperCase();

    Widget meta(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 8.5,
                      letterSpacing: .8,
                      fontWeight: FontWeight.w800,
                      color: muted)),
              const SizedBox(height: 1),
              Text(value,
                  style: const TextStyle(
                      fontSize: 11.5, fontWeight: FontWeight.w700, color: inkColor)),
            ],
          ),
        );

    Widget summaryRow(String label, String value, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Text(label,
                  style: TextStyle(
                      fontSize: 11,
                      color: bold ? denim : const Color(0xFF475569),
                      fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
              const Spacer(),
              Text(value,
                  style: TextStyle(
                      fontSize: bold ? 13 : 11,
                      color: bold ? denim : inkColor,
                      fontWeight: bold ? FontWeight.w800 : FontWeight.w600)),
            ],
          ),
        );

    return Container(
      width: invoiceLogicalWidth,
      color: paper,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ===== Kepala =====
          Container(
            color: denim,
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(9)),
                      child: Text(initial,
                          style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              color: denim)),
                    ),
                    const SizedBox(width: 9),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (showBrand)
                            const Text('ANYOSTORE',
                                style: TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: .3,
                                    color: Colors.white)),
                          Text(showBrand ? payload.storeName.toUpperCase() : payload.storeName,
                              style: TextStyle(
                                  fontSize: showBrand ? 9 : 16,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: showBrand ? 1.6 : .2,
                                  color: showBrand
                                      ? const Color(0xCCFFFFFF)
                                      : Colors.white)),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                const Text('INVOICE',
                    style: TextStyle(
                        fontSize: 12.5,
                        letterSpacing: 3,
                        fontWeight: FontWeight.w800,
                        color: Colors.white)),
                if (payload.storeAddress.trim().isNotEmpty || payload.storePhone.trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (payload.storeAddress.trim().isNotEmpty) payload.storeAddress.trim(),
                      if (payload.storePhone.trim().isNotEmpty) payload.storePhone.trim(),
                    ].join('\n'),
                    style: const TextStyle(
                        fontSize: 10, height: 1.5, color: Color(0xD9FFFFFF)),
                  ),
                ],
              ],
            ),
          ),

          // ===== Meta =====
          Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 6),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: line)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: meta('No. Invoice', payload.invoiceNo)),
                Expanded(child: meta('Tanggal', payload.dateText)),
                Expanded(child: meta('Kasir', payload.cashier)),
                Expanded(child: meta('Pelanggan', payload.customerLabel)),
              ],
            ),
          ),

          // ===== Item =====
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            child: Row(
              children: const [
                Expanded(
                    flex: 5,
                    child: Text('BARANG',
                        style: TextStyle(
                            fontSize: 8.5,
                            letterSpacing: .8,
                            fontWeight: FontWeight.w800,
                            color: muted))),
                SizedBox(
                    width: 34,
                    child: Text('QTY',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 8.5,
                            letterSpacing: .8,
                            fontWeight: FontWeight.w800,
                            color: muted))),
                SizedBox(
                    width: 86,
                    child: Text('JUMLAH',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontSize: 8.5,
                            letterSpacing: .8,
                            fontWeight: FontWeight.w800,
                            color: muted))),
              ],
            ),
          ),
          Container(margin: const EdgeInsets.symmetric(horizontal: 20), height: 1, color: line),
          ...payload.items.map((item) => Padding(
                padding: const EdgeInsets.fromLTRB(20, 7, 20, 7),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 5,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.name,
                              style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: inkColor)),
                          if (item.variant.trim().isNotEmpty)
                            Text(item.variant,
                                style: const TextStyle(
                                    fontSize: 9.5, color: muted, height: 1.35)),
                        ],
                      ),
                    ),
                    SizedBox(
                        width: 34,
                        child: Text('${item.qty}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 11.5, color: Color(0xFF475569)))),
                    SizedBox(
                        width: 86,
                        child: Text(fmtRp(item.subtotal),
                            textAlign: TextAlign.right,
                            style: const TextStyle(
                                fontSize: 11.5, fontWeight: FontWeight.w700, color: inkColor))),
                  ],
                ),
              )),

          // ===== Ringkasan =====
          Container(
            margin: const EdgeInsets.fromLTRB(20, 8, 20, 0),
            padding: const EdgeInsets.only(top: 8),
            decoration: const BoxDecoration(border: Border(top: BorderSide(color: line))),
            child: Column(
              children: [
                summaryRow('Subtotal', fmtRp(payload.subtotal)),
                if (payload.discount > 0)
                  summaryRow('Diskon', '-${fmtRp(payload.discount)}'),
                Container(
                  margin: const EdgeInsets.symmetric(vertical: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                      color: const Color(0xFFEEF3FB),
                      borderRadius: BorderRadius.circular(9)),
                  child: Row(
                    children: [
                      const Text('Total',
                          style: TextStyle(
                              fontSize: 13.5, fontWeight: FontWeight.w800, color: denim)),
                      const Spacer(),
                      Text(fmtRp(payload.total),
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.w900, color: denim)),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // ===== Rekening =====
          Container(
            margin: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 11),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              border: Border.all(color: line),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('REKENING',
                    style: TextStyle(
                        fontSize: 9.5,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w800,
                        color: denim)),
                const SizedBox(height: 5),
                for (final account in invoiceBankAccounts)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 1.5),
                    child: Row(
                      children: [
                        Container(
                          width: 11,
                          height: 11,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border.all(color: muted, width: 1.4),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        const SizedBox(width: 7),
                        SizedBox(
                          width: 68,
                          child: Text(account.bank,
                              style: const TextStyle(
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF334155))),
                        ),
                        Text(account.number,
                            style: const TextStyle(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: .2,
                                color: inkColor)),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
                const Text('a.n $invoiceBankHolder',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: inkColor)),
                const SizedBox(height: 3),
                const Text(invoiceBankNote,
                    style: TextStyle(fontSize: 9.5, height: 1.4, color: Color(0xFF475569))),
              ],
            ),
          ),

          // ===== Kaki =====
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            child: Column(
              children: [
                const Text('Terima kasih sudah berbelanja',
                    style: TextStyle(
                        fontSize: 10.5, fontWeight: FontWeight.w800, color: denim)),
                const SizedBox(height: 3),
                Text(
                  payload.note ?? 'Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 8.5, height: 1.5, color: muted),
                ),
                const SizedBox(height: 7),
                const Text('cek produk kami lainnya anyostore.my.id',
                    style: TextStyle(
                        fontSize: 9,
                        letterSpacing: .3,
                        fontWeight: FontWeight.w800,
                        color: denim)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Render invoice menjadi PNG lalu bagikan lewat share sheet sistem.
Future<void> shareInvoiceImage(BuildContext context, InvoicePayload payload) async {
  final boundaryKey = GlobalKey();
  final overlay = Overlay.of(context, rootOverlay: true);
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => Positioned(
      left: -1400,
      top: 0,
      child: RepaintBoundary(
        key: boundaryKey,
        child: Material(
          color: Colors.white,
          child: InvoiceImage(payload: payload),
        ),
      ),
    ),
  );

  overlay.insert(entry);
  try {
    await WidgetsBinding.instance.endOfFrame;
    await Future<void>.delayed(const Duration(milliseconds: 30));
    final boundary = boundaryKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return;
    final image = await boundary.toImage(pixelRatio: 2);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    if (data == null) return;
    final directory = await getTemporaryDirectory();
    final safeNumber = payload.invoiceNo.replaceAll(RegExp(r'[^A-Za-z0-9-]'), '');
    final file = File('${directory.path}/invoice-$safeNumber.png');
    await file.writeAsBytes(data.buffer.asUint8List(), flush: true);
    await Share.shareXFiles([XFile(file.path)], subject: 'Invoice ${payload.invoiceNo}');
  } finally {
    entry.remove();
  }
}

/// Label tipe harga pelanggan.
String invoiceCustomerTierLabel(Object? tier) {
  switch ('$tier') {
    case 'semi_grosir':
      return 'Semi Grosir';
    case 'grosir_seri':
      return 'Grosir Seri';
    default:
      return 'Reguler';
  }
}

/// Tanggal invoice: 10 Nov 2026 · 14.25
String invoiceDateText(Object? raw) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  final parsed = DateTime.tryParse('${raw ?? ''}');
  if (parsed == null) return '-';
  final local = parsed.toLocal();
  final hh = local.hour.toString().padLeft(2, '0');
  final mm = local.minute.toString().padLeft(2, '0');
  return '${local.day} ${months[local.month - 1]} ${local.year} · $hh.$mm';
}
