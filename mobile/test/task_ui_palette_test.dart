import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

void main() {
  test('shared light palette uses the approved NexaDash tokens', () {
    expect(kTaskBg, const Color(0xffF7F9FC));
    expect(kTaskSurface, const Color(0xffFFFFFF));
    expect(kTaskSurfaceMuted, const Color(0xffEEF2F6));
    expect(kTaskDark, const Color(0xff1E3A5F));
    expect(kTaskInk, const Color(0xff151821));
    expect(kTaskSecondary, const Color(0xff5D6878));
    expect(kTaskAccent, const Color(0xff2563EB));
    expect(kTaskTeal, const Color(0xff16A34A));
    expect(kTaskTerracotta, const Color(0xffEA580C));
    expect(kTaskPurple, const Color(0xff7C3AED));
    expect(kTaskWarning, const Color(0xffF59E0B));
    expect(kTaskBorder, const Color(0xffD9E0E8));
    expect(kTaskStockGood, const Color(0xff15803D));
    expect(kTaskStockGoodSurface, const Color(0xffDCFCE7));
    expect(kTaskStockLow, const Color(0xff92400E));
    expect(kTaskStockLowSurface, const Color(0xffFEF3C7));
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
