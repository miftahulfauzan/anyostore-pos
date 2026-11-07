import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/category_visuals.dart';

void main() {
  test('uses the stored hex color when it is valid', () {
    expect(
      categoryColorFor(name: 'Kemeja', storedHex: '#7c3aed'),
      const Color(0xff7c3aed),
    );
  });

  test('falls back to the existing name accent for missing or invalid colors', () {
    expect(
      categoryColorFor(name: 'Kemeja'),
      const Color(0xff0f9d9a),
    );
    expect(
      categoryColorFor(name: 'Kemeja', storedHex: 'not-a-color'),
      const Color(0xff0f9d9a),
    );
    expect(categoryColorFor(name: 'Aksesoris'), const Color(0xff2563eb));
  });

  test('exposes a compact preset palette for Settings', () {
    expect(kCategoryColorPresets, contains('#7C3AED'));
    expect(kCategoryColorPresets.length, 8);
  });
}
