import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local font-size preference shared by every mobile page.
class FontScaleController {
  static const _preferenceKey = 'pos_font_scale';
  static const double defaultScale = .85;
  static const List<double> options = [.85, 1.0, 1.15, 1.3];
  static final ValueNotifier<double> scale = ValueNotifier(defaultScale);

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.get(_preferenceKey);
    final stored = raw is num ? raw.toDouble() : double.tryParse('$raw');
    scale.value = _normalize(stored);
  }

  static Future<void> set(double value) async {
    final next = _normalize(value);
    scale.value = next;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_preferenceKey, next);
  }

  static String label(double value) => '${(value * 100).round()}%';

  /// Caps the combined app/system text scale so compact layouts remain usable.
  /// Only oversized modes are capped, with a stricter limit on very narrow
  /// phones; nilai di bawah opsi minimum dinaikkan ke 85%.
  static double effectiveScale(double value, double width) {
    final maxScale = width > 0 && width <= 340 ? 1.15 : 1.3;
    return value.clamp(options.first, maxScale).toDouble();
  }

  static double _normalize(double? value) {
    if (value == null || !value.isFinite) return defaultScale;
    // Snap ke opsi terdekat (slider bisa menghasilkan 0.999999... untuk 100%;
    // nilai lama seperti .8/.6/1.4 dari versi sebelumnya ikut terangkat ke
    // opsi terdekat, bukan dilempar ke default).
    var best = options.first;
    var bestDistance = double.infinity;
    for (final option in options) {
      final distance = (option - value).abs();
      if (distance < bestDistance) {
        bestDistance = distance;
        best = option;
      }
    }
    return best;
  }
}
