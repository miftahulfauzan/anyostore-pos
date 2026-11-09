import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:pos_pakaian_mobile/main.dart' as app;
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/auth_store.dart';
import 'package:pos_pakaian_mobile/src/font_scale_controller.dart';

MediaQueryData _rootMediaQuery(WidgetTester tester) => tester
    .widget<MediaQuery>(find.byKey(const ValueKey('font-scale-media-query')))
    .data;

void main() {
  setUp(() {
    FontScaleController.scale.value = FontScaleController.defaultScale;
  });

  testWidgets('root text scaling follows the selected font level',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final auth = AuthStore(ApiClient());
    await tester.pumpWidget(ChangeNotifierProvider.value(
      value: auth,
      child: const app.PosMobileApp(),
    ));
    await tester.pump();

    expect(_rootMediaQuery(tester).textScaler.scale(10), 10);
    final material = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(
        material.theme?.textTheme.bodyMedium?.fontFamily, 'Plus Jakarta Sans');

    FontScaleController.scale.value = 1.4;
    await tester.pump();

    expect(_rootMediaQuery(tester).textScaler.scale(10), 14);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
      'root keeps Android text scale and caps large text on narrow screens',
      (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final auth = AuthStore(ApiClient());
    await tester.pumpWidget(MediaQuery(
      data: const MediaQueryData(
        size: Size(390, 844),
        textScaler: TextScaler.linear(1.3),
      ),
      child: ChangeNotifierProvider.value(
        value: auth,
        child: const app.PosMobileApp(),
      ),
    ));
    await tester.pump();

    expect(_rootMediaQuery(tester).textScaler.scale(10), 13);

    FontScaleController.scale.value = 1.4;
    await tester.pumpWidget(MediaQuery(
      data: const MediaQueryData(
        size: Size(320, 844),
        textScaler: TextScaler.linear(1.3),
      ),
      child: ChangeNotifierProvider.value(
        value: auth,
        child: const app.PosMobileApp(),
      ),
    ));
    await tester.pump();
    expect(_rootMediaQuery(tester).textScaler.scale(10), 12);
  });
}
