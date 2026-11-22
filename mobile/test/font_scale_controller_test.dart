import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/src/font_scale_controller.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    FontScaleController.scale.value = FontScaleController.defaultScale;
  });

  test('exposes the four readable scales in order', () {
    expect(FontScaleController.options, <double>[.85, 1.0, 1.15, 1.3]);
    expect(FontScaleController.defaultScale, .85);
    expect(FontScaleController.label(.85), '85%');
    expect(FontScaleController.label(1.3), '130%');
  });

  test('mengangkat skala lama yang terlalu kecil ke opsi terdekat', () async {
    SharedPreferences.setMockInitialValues({'pos_font_scale': .7});

    await FontScaleController.load();

    expect(FontScaleController.scale.value, .85);
  });

  test('reads a legacy string preference safely', () async {
    SharedPreferences.setMockInitialValues({'pos_font_scale': '1.2'});

    await FontScaleController.load();

    expect(FontScaleController.scale.value, 1.15);
  });

  test('loads and persists a valid scale', () async {
    SharedPreferences.setMockInitialValues({'pos_font_scale': 1.15});
    await FontScaleController.load();
    expect(FontScaleController.scale.value, 1.15);

    await FontScaleController.set(1.0);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getDouble('pos_font_scale'), 1.0);
    expect(FontScaleController.scale.value, 1.0);
  });

  test('caps only oversized text on a narrow phone', () {
    expect(FontScaleController.effectiveScale(1.3, 320), 1.15);
    expect(FontScaleController.effectiveScale(1.15, 320), 1.15);
    expect(FontScaleController.effectiveScale(1.3, 390), 1.3);
    expect(FontScaleController.effectiveScale(.85, 320), .85);
    expect(FontScaleController.effectiveScale(1.8, 390), 1.3);
  });

  test('nilai slider yang meleset sedikit tetap tersimpan', () async {
    await FontScaleController.set(0.9999999999999999);
    expect(FontScaleController.scale.value, 1.0);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getDouble('pos_font_scale'), 1.0);
  });
}
