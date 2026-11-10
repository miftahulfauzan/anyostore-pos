// ignore_for_file: prefer_const_constructors

import 'dart:io';
import 'dart:math' as math;
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

/// Data invoice gambar (tagihan). Nomor invoice berasal dari reservasi server
/// supaya nomor pada gambar sama dengan nomor transaksi sebenarnya.
class InvoicePayload {
  const InvoicePayload({
    required this.storeName,
    required this.storeAddress,
    required this.storePhones,
    required this.invoiceNo,
    required this.dateText,
    required this.cashier,
    required this.customerLabel,
    required this.items,
    required this.subtotal,
    required this.discount,
    required this.total,
    this.instagram,
    this.note,
  });

  final String storeName;
  final String storeAddress;
  final List<String> storePhones;
  final String invoiceNo;
  final String dateText;
  final String cashier;
  final String customerLabel;
  final List<InvoiceLine> items;
  final double subtotal;
  final double discount;
  final double total;
  final String? instagram;
  final String? note;
}

/// Toko "BASIK" tampil tanpa tulisan ANYOSTORE; toko lain tetap memakai
/// ANYOSTORE sebagai nama utama dan nama toko sebagai subjudul.
bool invoiceShowsBrand(String storeName) =>
    !storeName.toUpperCase().contains('BASIK');

/// Instagram hanya untuk toko BASIK.
String? invoiceInstagram(String storeName, [String storeAddress = '']) {
  final name = storeName.toUpperCase();
  final address = storeAddress.toUpperCase();
  if (name.contains('BASIK')) return '@basik.pgmta';
  if (name.contains('BLOK B') || name.contains('TOKO B') || address.contains('BLOK B')) {
    return '@anyostore';
  }
  return null;
}

/// Rekening transfer yang tampil di bawah total.
const invoiceBankAccounts = <({String bank, String number})>[
  (bank: 'BCA', number: '0042813603'),
  (bank: 'MANDIRI', number: '1640000929465'),
];
const invoiceBankHolder = 'Miftahul Fauzan';
const invoiceBankNote = 'Jika sudah transfer mohon konfirmasinya ya ka';

/// Lebar logis invoice; ditangkap pada pixel ratio 2 sehingga keluar 1080 px.
const double invoiceLogicalWidth = 540;

/// Hasil gambar selalu 3:4 (lebar 3, tinggi 4). Bila isi invoice lebih pendek,
/// sisa bawah diisi putih; bila lebih panjang, tinggi mengikuti isi.
const double invoiceOutputWidth = 1080;
const double invoiceOutputHeight = 1440;

/// Bagian invoice yang dirender. Dipisah supaya blok rekening + kaki bisa
/// diletakkan di tengah sisa ruang kanvas 3:4.
enum InvoicePart { all, body, footer }

class InvoiceImage extends StatelessWidget {
  const InvoiceImage({super.key, required this.payload, this.part = InvoicePart.all});

  final InvoicePayload payload;
  final InvoicePart part;

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
          padding: const EdgeInsets.only(bottom: 7),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label.toUpperCase(),
                  style: const TextStyle(
                      fontSize: 9,
                      letterSpacing: .8,
                      fontWeight: FontWeight.w800,
                      color: muted)),
              const SizedBox(height: 1),
              Text(value,
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w700, color: inkColor)),
            ],
          ),
        );

    Widget summaryRow(String label, String value, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(
            children: [
              Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      color: bold ? denim : const Color(0xFF475569),
                      fontWeight: bold ? FontWeight.w800 : FontWeight.w500)),
              const Spacer(),
              Text(value,
                  style: TextStyle(
                      fontSize: bold ? 14 : 12,
                      color: bold ? denim : inkColor,
                      fontWeight: bold ? FontWeight.w800 : FontWeight.w600)),
            ],
          ),
        );

    Widget contactLine(InvoiceBrandIcon brand, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: 16,
                height: 16,
                child: Center(
                  child: InvoiceBrandIconWidget(
                      brand: brand, size: 14, color: const Color(0xF2FFFFFF)),
                ),
              ),
              const SizedBox(width: 7),
              Text(text,
                  style: const TextStyle(
                      fontSize: 10.5,
                      height: 1.2,
                      fontWeight: FontWeight.w700,
                      color: Color(0xF2FFFFFF))),
            ],
          ),
        );

    final bodyChildren = <Widget>[
          // ===== Kepala: kiri logo + nama toko + alamat, kanan kontak =====
          Container(
            color: denim,
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(12)),
                        child: Text(initial,
                            style: const TextStyle(
                                fontSize: 23,
                                fontWeight: FontWeight.w900,
                                color: denim)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (showBrand)
                              const Text('ANYOSTORE',
                                  style: TextStyle(
                                      fontSize: 16,
                                      height: 1.15,
                                      fontWeight: FontWeight.w900,
                                      letterSpacing: .3,
                                      color: Colors.white)),
                            Text(
                                showBrand
                                    ? payload.storeName.toUpperCase()
                                    : payload.storeName,
                                style: TextStyle(
                                    fontSize: showBrand ? 9 : 18,
                                    height: 1.2,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: showBrand ? 1.6 : .1,
                                    color: showBrand
                                        ? const Color(0xCCFFFFFF)
                                        : Colors.white)),
                            if (payload.storeAddress.trim().isNotEmpty) ...[
                              const SizedBox(height: 3),
                              Text(payload.storeAddress.trim(),
                                  style: const TextStyle(
                                      fontSize: 10.5,
                                      height: 1.35,
                                      fontWeight: FontWeight.w600,
                                      color: Color(0xE0FFFFFF))),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final phone in payload.storePhones)
                      contactLine(InvoiceBrandIcon.whatsapp, phone),
                    if (payload.instagram != null)
                      contactLine(InvoiceBrandIcon.instagram, payload.instagram!),
                  ],
                ),
              ],
            ),
          ),

          // ===== Baris dokumen =====
          Container(
            padding: const EdgeInsets.fromLTRB(20, 11, 20, 11),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: line))),
            child: Row(
              children: [
                const Text('INVOICE',
                    style: TextStyle(
                        fontSize: 12,
                        letterSpacing: 2.4,
                        fontWeight: FontWeight.w800,
                        color: denim)),
                const Spacer(),
                Text(payload.invoiceNo,
                    style: const TextStyle(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: inkColor)),
              ],
            ),
          ),

          // ===== Meta =====
          Container(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 5),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: line))),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: meta('Tanggal', payload.dateText)),
                Expanded(child: meta('Kasir', payload.cashier)),
                Expanded(child: meta('Pelanggan', payload.customerLabel)),
                Expanded(child: meta('Status', 'Tagihan')),
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
                            fontSize: 9,
                            letterSpacing: .8,
                            fontWeight: FontWeight.w800,
                            color: muted))),
                SizedBox(
                    width: 40,
                    child: Text('QTY',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 9,
                            letterSpacing: .8,
                            fontWeight: FontWeight.w800,
                            color: muted))),
                SizedBox(
                    width: 96,
                    child: Text('JUMLAH',
                        textAlign: TextAlign.right,
                        style: TextStyle(
                            fontSize: 9,
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
                                  fontSize: 12.5,
                                  fontWeight: FontWeight.w700,
                                  color: inkColor)),
                          if (item.variant.trim().isNotEmpty || item.price > 0)
                            Text(
                                [
                                  item.variant.trim(),
                                  if (item.price > 0) '${fmtRp(item.price)}/pcs',
                                ].where((part) => part.isNotEmpty).join(' · '),
                                style: const TextStyle(
                                    fontSize: 10, color: muted, height: 1.35)),
                        ],
                      ),
                    ),
                    SizedBox(
                        width: 40,
                        child: Text('${item.qty}',
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                fontSize: 12.5, color: Color(0xFF475569)))),
                    SizedBox(
                        width: 96,
                        child: Text(fmtRp(item.subtotal),
                            textAlign: TextAlign.right,
                            style: const TextStyle(
                                fontSize: 12.5, fontWeight: FontWeight.w700, color: inkColor))),
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
                  padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
                  decoration: BoxDecoration(
                      color: const Color(0xFFEEF3FB),
                      borderRadius: BorderRadius.circular(9)),
                  child: Row(
                    children: [
                      const Text('Total',
                          style: TextStyle(
                              fontSize: 14.5, fontWeight: FontWeight.w800, color: denim)),
                      const Spacer(),
                      Text(fmtRp(payload.total),
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w900, color: denim)),
                    ],
                  ),
                ),
              ],
            ),
          ),

        ];

    final footerChildren = <Widget>[
          // ===== Rekening =====
          Container(
            margin: const EdgeInsets.fromLTRB(20, 10, 20, 0),
            padding: const EdgeInsets.fromLTRB(13, 11, 13, 12),
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
                        fontSize: 10,
                        letterSpacing: 1,
                        fontWeight: FontWeight.w800,
                        color: denim)),
                const SizedBox(height: 5),
                for (final account in invoiceBankAccounts)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 2),
                    child: Row(
                      children: [
                        Container(
                          width: 12,
                          height: 12,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            border: Border.all(color: muted, width: 1.4),
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 72,
                          child: Text(account.bank,
                              style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF334155))),
                        ),
                        Text(account.number,
                            style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w700,
                                letterSpacing: .2,
                                color: inkColor)),
                      ],
                    ),
                  ),
                const SizedBox(height: 4),
                const Text('a.n $invoiceBankHolder',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: inkColor)),
                const SizedBox(height: 3),
                const Text(invoiceBankNote,
                    style: TextStyle(fontSize: 10.5, height: 1.4, color: Color(0xFF475569))),
              ],
            ),
          ),

          // ===== Kaki =====
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            child: const Column(
              children: [
                Text('Terima kasih sudah berbelanja',
                    style: TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w800, color: denim)),
                SizedBox(height: 6),
                Text('cek produk kami lainnya anyostore.my.id',
                    style: TextStyle(
                        fontSize: 10,
                        letterSpacing: .3,
                        fontWeight: FontWeight.w800,
                        color: denim)),
              ],
            ),
          ),
    ];

    final children = switch (part) {
      InvoicePart.body => bodyChildren,
      InvoicePart.footer => footerChildren,
      InvoicePart.all => [...bodyChildren, ...footerChildren],
    };
    return Container(
      width: invoiceLogicalWidth,
      color: paper,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: children,
      ),
    );
  }
}

/// Render invoice menjadi PNG (3:4) lalu bagikan lewat share sheet sistem.
/// Isi (header sampai total) dicetak di atas; blok rekening + kaki diletakkan
/// di tengah sisa ruang kosong supaya hasilnya tidak menggantung di atas.
Future<void> shareInvoiceImage(BuildContext context, InvoicePayload payload) async {
  final bodyKey = GlobalKey();
  final footerKey = GlobalKey();
  final overlay = Overlay.of(context, rootOverlay: true);
  late OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => Positioned(
      left: -1400,
      top: 0,
      child: Material(
        color: Colors.white,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            RepaintBoundary(key: bodyKey, child: InvoiceImage(payload: payload, part: InvoicePart.body)),
            RepaintBoundary(key: footerKey, child: InvoiceImage(payload: payload, part: InvoicePart.footer)),
          ],
        ),
      ),
    ),
  );

  overlay.insert(entry);
  try {
    await WidgetsBinding.instance.endOfFrame;
    await Future<void>.delayed(const Duration(milliseconds: 30));
    final bodyBoundary = bodyKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    final footerBoundary = footerKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (bodyBoundary == null || footerBoundary == null) return;
    final body = await bodyBoundary.toImage(pixelRatio: 2);
    final footer = await footerBoundary.toImage(pixelRatio: 2);

    final height = math.max<double>(invoiceOutputHeight, (body.height + footer.height + 96).toDouble());
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(
      Rect.fromLTWH(0, 0, invoiceOutputWidth, height),
      Paint()..color = Colors.white,
    );
    canvas.drawImage(body, Offset.zero, Paint());
    final free = height - body.height - footer.height;
    final footerTop = body.height + math.max<double>(48, free / 2);
    canvas.drawImage(footer, Offset(0, footerTop), Paint());

    final composed = await recorder.endRecording().toImage(invoiceOutputWidth.toInt(), height.toInt());
    final data = await composed.toByteData(format: ui.ImageByteFormat.png);
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


/// Ikon merek pada header invoice (digambar sendiri agar bentuknya mirip logo
/// asli, bukan ikon generik).
enum InvoiceBrandIcon { whatsapp, instagram }

class InvoiceBrandIconWidget extends StatelessWidget {
  const InvoiceBrandIconWidget({
    super.key,
    required this.brand,
    this.size = 12,
    this.color = Colors.white,
  });

  final InvoiceBrandIcon brand;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _BrandIconPainter(brand: brand, color: color)),
    );
  }
}

class _BrandIconPainter extends CustomPainter {
  _BrandIconPainter({required this.brand, required this.color});

  final InvoiceBrandIcon brand;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.width * 0.1
      ..strokeJoin = StrokeJoin.round
      ..strokeCap = StrokeCap.round;
    final fill = Paint()..color = color;

    if (brand == InvoiceBrandIcon.whatsapp) {
      final bubble = Paint()..color = color;
      canvas.drawCircle(Offset(size.width * 0.5, size.height * 0.47), size.width * 0.42, bubble);
      final tail = Path()
        ..moveTo(size.width * 0.12, size.height * 0.84)
        ..lineTo(size.width * 0.03, size.height * 0.99)
        ..lineTo(size.width * 0.36, size.height * 0.9)
        ..close();
      canvas.drawPath(tail, bubble);
      // gagang telepon: warna latar header (denim) menyerupai logo WhatsApp
      final handset = Paint()
        ..color = const Color(0xFF1E3A5F)
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.width * 0.15
        ..strokeCap = StrokeCap.round;
      final path = Path()
        ..moveTo(size.width * 0.34, size.height * 0.34)
        ..quadraticBezierTo(size.width * 0.36, size.height * 0.52, size.width * 0.62, size.height * 0.64);
      canvas.drawPath(path, handset);
      canvas.drawLine(Offset(size.width * 0.3, size.height * 0.3), Offset(size.width * 0.4, size.height * 0.4), handset);
      canvas.drawLine(Offset(size.width * 0.66, size.height * 0.68), Offset(size.width * 0.58, size.height * 0.58), handset);
      return;
    }

    // instagram: kotak membulat + lensa + titik
    final rect = Rect.fromLTWH(size.width * 0.06, size.height * 0.06, size.width * 0.88, size.height * 0.88);
    canvas.drawRRect(RRect.fromRectAndRadius(rect, Radius.circular(size.width * 0.28)), paint);
    canvas.drawCircle(Offset(size.width / 2, size.height / 2), size.width * 0.22, paint);
    canvas.drawCircle(Offset(size.width * 0.74, size.height * 0.26), size.width * 0.05, fill);
  }

  @override
  bool shouldRepaint(_BrandIconPainter oldDelegate) =>
      oldDelegate.brand != brand || oldDelegate.color != color;
}
