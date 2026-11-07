import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/media_mime.dart';

void main() {
  test('detects the real image type from picker bytes', () {
    expect(detectImageMime([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg');
    expect(
      detectImageMime([
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ]),
      'image/png',
    );
    expect(
        detectImageMime([
          0x52,
          0x49,
          0x46,
          0x46,
          0x00,
          0x00,
          0x00,
          0x00,
          0x57,
          0x45,
          0x42,
          0x50,
        ]),
        'image/webp');
  });

  test('rejects unsupported or incomplete image bytes', () {
    expect(detectImageMime(const []), isNull);
    expect(detectImageMime([0x00, 0x01, 0x02]), isNull);
  });
}
