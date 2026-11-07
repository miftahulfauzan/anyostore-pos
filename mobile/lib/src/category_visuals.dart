import 'package:flutter/material.dart';

import 'task_ui.dart';

/// Incremented after category settings are saved so mounted POS tabs can
/// refresh their catalog without losing the current cart.
final ValueNotifier<int> categoryCatalogRevision = ValueNotifier<int>(0);

void notifyCategoryCatalogChanged() {
  categoryCatalogRevision.value++;
}

/// Preset visual kategori yang aman dipakai di chip, kartu, dan mode gelap.
const kCategoryColorPresets = <String>[
  '#2563EB', // denim blue
  '#0F9D9A', // teal
  '#D89B19', // amber
  '#E85D4A', // coral
  '#7C3AED', // purple
  '#DB2777', // pink
  '#16A34A', // green
  '#64748B', // slate
];

Color? parseCategoryColor(String? value) {
  final hex = value?.trim();
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) {
    return null;
  }
  return Color(int.parse(hex.substring(1), radix: 16) | 0xff000000);
}

String categoryFallbackHex(String? name) {
  final normalized = (name ?? '').trim().toLowerCase();
  if (normalized.contains('kemeja') || normalized.contains('denim')) {
    return '#0F9D9A';
  }
  if (normalized.contains('celana') || normalized.contains('bawahan')) {
    return '#D89B19';
  }
  if (normalized.contains('oneset') || normalized.contains('dress')) {
    return '#E85D4A';
  }
  return '#2563EB';
}

Color categoryColorFor({String? name, String? storedHex}) {
  return parseCategoryColor(storedHex) ??
      parseCategoryColor(categoryFallbackHex(name)) ??
      kTaskAccent;
}
