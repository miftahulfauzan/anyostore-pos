import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Donut komposisi status stok untuk hero Stok Produk (denim).
///
/// Ring CustomPaint ringan (tanpa library chart): tiga segmen
/// Aman/Menipis/Habis berwarna di atas track putih transparan,
/// sama untuk mode terang & gelap karena selalu di atas permukaan
/// denim.
class StockStatusDonut extends StatelessWidget {
  const StockStatusDonut({
    super.key,
    this.good = 0,
    this.low = 0,
    this.empty = 0,
    this.size = 84,
    this.stroke = 9,
  });

  static const Color goodColor = Color(0xff6EE7B7);
  static const Color lowColor = Color(0xffFBBF24);
  static const Color emptyColor = Color(0xffF87171);

  final int good;
  final int low;
  final int empty;
  final double size;
  final double stroke;

  /// Fraksi [good, low, empty]; total 1 saat ada data, semua 0 saat kosong.
  static List<double> fractions({required int good, required int low, required int empty}) {
    final total = good + low + empty;
    if (total <= 0) return const [0, 0, 0];
    return [
      good / total,
      low / total,
      empty / total,
    ];
  }

  @override
  Widget build(BuildContext context) {
    final label =
        'Status stok: $good aman, $low menipis, $empty habis';
    return Semantics(
      label: label,
      child: SizedBox(
        width: size,
        height: size,
        child: CustomPaint(
          painter: _DonutPainter(
            good: good,
            low: low,
            empty: empty,
            stroke: stroke,
          ),
        ),
      ),
    );
  }
}

class _DonutPainter extends CustomPainter {
  const _DonutPainter({
    required this.good,
    required this.low,
    required this.empty,
    required this.stroke,
  });

  final int good;
  final int low;
  final int empty;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final center = rect.center;
    final radius = (math.min(size.width, size.height) - stroke) / 2;
    const startAngle = -math.pi / 2;
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..color = Colors.white.withValues(alpha: .16);
    canvas.drawCircle(center, radius, trackPaint);

    final fractions = StockStatusDonut.fractions(
        good: good, low: low, empty: empty);
    final colors = [
      StockStatusDonut.goodColor,
      StockStatusDonut.lowColor,
      StockStatusDonut.emptyColor,
    ];
    if (fractions.reduce((a, b) => a + b) <= 0) return;

    var sweepStart = startAngle;
    final paint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    for (var i = 0; i < fractions.length; i++) {
      final fraction = fractions[i];
      if (fraction <= 0) continue;
      // Segmen menyisakan celah kecil agar batas warna terbaca.
      final gap = fractions.length > 1 && fraction < 1 ? .04 : 0.0;
      final sweep = fraction * 2 * math.pi - gap;
      paint.color = colors[i];
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        sweepStart,
        math.max(sweep, .02),
        false,
        paint,
      );
      sweepStart += fraction * 2 * math.pi;
    }
  }

  @override
  bool shouldRepaint(covariant _DonutPainter old) =>
      old.good != good ||
      old.low != low ||
      old.empty != empty ||
      old.stroke != stroke;
}
