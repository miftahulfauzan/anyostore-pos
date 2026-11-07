import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local font-size preference shared by every mobile page.
class FontScaleController {
  static const _preferenceKey = 'pos_font_scale';
  static const double defaultScale = 1.0;
  static const List<double> options = [.4, .6, .8, 1.0, 1.2, 1.4];
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

  /// Large text is capped only on very narrow phones to prevent the fixed
  /// two-column and compact toolbar layouts from becoming unusable.
  static double effectiveScale(double value, double width) {
    final clamped = value.clamp(options.first, options.last).toDouble();
    if (width > 0 && width <= 340 && clamped > 1.2) return 1.2;
    return clamped;
  }

  static double _normalize(double? value) {
    if (value != null && options.contains(value)) return value;
    return defaultScale;
  }
}
