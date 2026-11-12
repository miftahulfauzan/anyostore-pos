import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/task_ui.dart';

void main() {
  test('mobile typography tokens keep normal text readable', () {
    expect(TaskTypography.pageTitle, 22);
    expect(TaskTypography.largeBody, 16);
    expect(TaskTypography.sectionTitle, 18);
    expect(TaskTypography.body, 14);
    expect(TaskTypography.secondary, 12);
    expect(TaskTypography.micro, greaterThanOrEqualTo(11));
    expect(TaskTypography.chartAxis, greaterThanOrEqualTo(11));
    expect(TaskTypography.badge, greaterThanOrEqualTo(11));
    expect(TaskTypography.displayCompact, 28);
    expect(TaskTypography.display, 32);
  });
}
