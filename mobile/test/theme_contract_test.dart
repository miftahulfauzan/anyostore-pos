import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/main.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

double contrast(Color a, Color b) {
  final first = a.computeLuminance();
  final second = b.computeLuminance();
  final lighter = first > second ? first : second;
  final darker = first > second ? second : first;
  return (lighter + .05) / (darker + .05);
}

void main() {
  test('light theme derives surfaces, text, controls, and focus from tokens', () {
    final theme = buildAnyostoreTheme();
    expect(theme.scaffoldBackgroundColor, kTaskBg);
    expect(theme.colorScheme.surface, kTaskSurface);
    expect(theme.colorScheme.primary, kTaskDark);
    expect(theme.colorScheme.secondary, kTaskAccent);
    expect(theme.textTheme.bodyMedium?.color, kTaskInk);
    expect(theme.appBarTheme.backgroundColor, kTaskBg);
    expect(theme.dialogTheme.backgroundColor, kTaskSurface);
    expect(theme.inputDecorationTheme.fillColor, kTaskSurfaceMuted);
    expect(theme.inputDecorationTheme.focusedBorder?.borderSide.color,
        kTaskAccent);
    final button = theme.filledButtonTheme.style!;
    final foreground = button.foregroundColor!.resolve({})!;
    final background = button.backgroundColor!.resolve({})!;
    expect(background, kTaskDark);
    expect(contrast(foreground, background), greaterThanOrEqualTo(4.5));
  });

  test('dark theme uses distinct background and surface', () {
    final theme = buildAnyostoreTheme(brightness: Brightness.dark);
    expect(theme.scaffoldBackgroundColor, kTaskDarkBg);
    expect(theme.colorScheme.surface, kTaskDarkSurface);
    expect(kTaskDarkBg, isNot(kTaskDarkSurface));
  });
}
