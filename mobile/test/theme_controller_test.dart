import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/theme_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    ThemeController.mode.value = ThemeMode.light;
  });

  test('persists the explicit light theme across a reload', () async {
    await ThemeController.set(ThemeMode.dark);
    await ThemeController.set(ThemeMode.light);

    ThemeController.mode.value = ThemeMode.dark;
    await ThemeController.load();

    expect(ThemeController.mode.value, ThemeMode.light);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('pos_theme_mode'), 'light');
  });

  test('missing or invalid theme preference defaults to light', () async {
    SharedPreferences.setMockInitialValues({'pos_theme_mode': 'invalid'});

    ThemeController.mode.value = ThemeMode.dark;
    await ThemeController.load();

    expect(ThemeController.mode.value, ThemeMode.light);
  });
}
