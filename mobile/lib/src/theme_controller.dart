import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pengatur tema aplikasi (Terang/Gelap/Sistem) yang disimpan lokal.
class ThemeController {
  static const _key = 'pos_theme_mode';
  static final ValueNotifier<ThemeMode> mode = ValueNotifier(ThemeMode.light);

  static Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    final v = prefs.getString(_key);
    mode.value = switch (v) {
      'dark' => ThemeMode.dark,
      'system' => ThemeMode.system,
      _ => ThemeMode.light,
    };
  }

  static Future<void> set(ThemeMode m) async {
    mode.value = m;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, switch (m) {
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
      _ => 'light',
    });
  }
}
