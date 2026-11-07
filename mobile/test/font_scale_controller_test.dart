import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/src/font_scale_controller.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FontScaleController.scale.value = FontScaleController.defaultScale;
  });

  test('exposes the six requested scales in order', () {
    expect(FontScaleController.options, <double>[.4, .6, .8, 1.0, 1.2, 1.4]);
    expect(FontScaleController.defaultScale, 1.0);
    expect(FontScaleController.label(.4), '40%');
    expect(FontScaleController.label(1.4), '140%');
  });

  test('falls back to normal when the stored scale is invalid', () async {
    SharedPreferences.setMockInitialValues({'pos_font_scale': .7});

    await FontScaleController.load();

    expect(FontScaleController.scale.value, 1.0);
  });

  test('reads a legacy string preference safely',
      () async {
    SharedPreferences.setMockInitialValues({'pos_font_scale': '1.2'});

    await FontScaleController.load();

    expect(FontScaleController.scale.value, 1.2);
  });

  test('loads and persists a valid scale', () async {
    SharedPreferences.setMockInitialValues({'pos_font_scale': 1.2});
    await FontScaleController.load();
    expect(FontScaleController.scale.value, 1.2);

    await FontScaleController.set(.6);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getDouble('pos_font_scale'), .6);
    expect(FontScaleController.scale.value, .6);
  });

  test('caps only oversized text on a narrow phone', () {
    expect(FontScaleController.effectiveScale(1.4, 320), 1.2);
    expect(FontScaleController.effectiveScale(1.2, 320), 1.2);
    expect(FontScaleController.effectiveScale(1.4, 390), 1.4);
    expect(FontScaleController.effectiveScale(.4, 320), .4);
    expect(FontScaleController.effectiveScale(1.8, 390), 1.4);
  });
}
