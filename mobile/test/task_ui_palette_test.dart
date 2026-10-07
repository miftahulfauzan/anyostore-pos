import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

void main() {
  test('Anyostore palette uses the approved cream and denim tokens', () {
    expect(kTaskBg, const Color(0xffF5F1EA));
    expect(kTaskDark, const Color(0xff1E3A5F));
    expect(kTaskInk, const Color(0xff1E3A5F));
    expect(kTaskSecondary, const Color(0xff2E5D8F));
    expect(kTaskBlueLight, const Color(0xff5A8BBF));
    expect(kTaskTeal, const Color(0xff246B45));
    expect(kTaskTerracotta, const Color(0xff9A3412));
    expect(kTaskSand, const Color(0xffE7E0D6));
    expect(kTaskBorder, const Color(0xffE7E0D6));
    expect(kTaskStockGood, const Color(0xff246B45));
    expect(kTaskStockLow, const Color(0xff9A3412));
    expect(kTaskStockEmpty, const Color(0xffB42318));
  });

  test('stock status text and surfaces meet WCAG AA normal-text contrast', () {
    double contrast(Color foreground, Color background) {
      final a = foreground.computeLuminance();
      final b = background.computeLuminance();
      final lighter = a > b ? a : b;
      final darker = a > b ? b : a;
      return (lighter + 0.05) / (darker + 0.05);
    }

    expect(contrast(kTaskStockGood, kTaskStockGoodSurface),
        greaterThanOrEqualTo(4.5));
    expect(contrast(kTaskStockLow, kTaskStockLowSurface),
        greaterThanOrEqualTo(4.5));
    expect(contrast(kTaskStockEmpty, kTaskStockEmptySurface),
        greaterThanOrEqualTo(4.5));
  });

  testWidgets('GlassCard is solid by default for reliable mobile rendering',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: GlassCard(child: Text('Isi kartu')),
      ),
    ));

    expect(find.text('Isi kartu'), findsOneWidget);
    expect(find.byType(BackdropFilter), findsNothing);
    expect(find.byType(ShaderMask), findsNothing);
    final card =
        tester.widgetList<DecoratedBox>(find.byType(DecoratedBox)).first;
    expect((card.decoration as BoxDecoration).boxShadow, isNull);
  });
}
