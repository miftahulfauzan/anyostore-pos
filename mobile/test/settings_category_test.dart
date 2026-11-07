import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:pos_pakaian_mobile/src/api_client.dart';
import 'package:pos_pakaian_mobile/src/settings_page.dart';

class _CategorySettingsApi extends ApiClient {
  final categories = <Map<String, dynamic>>[
    {'id': 1, 'name': 'Kemeja', 'color': '#0F9D9A'},
    {'id': 2, 'name': 'Celana', 'color': '#D89B19'},
  ];
  final reorderCalls = <List<int>>[];
  final updateCalls = <Map<String, dynamic>>[];
  bool failReorder = false;
  bool failColor = false;
  bool ignoreColor = false;

  @override
  Future<Map<String, dynamic>> storeSettings() async => {
        'store_name': 'Anyostore',
        'branch_id': 4,
      };

  @override
  Future<List<dynamic>> productCategories() async => categories;

  @override
  Future<Map<String, dynamic>> createCategory(String name,
      {String? color}) async {
    categories.add({'id': 3, 'name': name, 'color': color});
    return {'success': true};
  }

  @override
  Future<Map<String, dynamic>> updateCategory(int id, String name,
      {String? color}) async {
    updateCalls.add({'id': id, 'name': name, 'color': color});
    if (failColor) throw ApiException('Warna kategori gagal disimpan');
    final category = categories.firstWhere((item) => item['id'] == id);
    category['name'] = name;
    if (!ignoreColor) category['color'] = color;
    return {'success': true};
  }

  @override
  Future<Map<String, dynamic>> reorderCategories(List<int> order) async {
    reorderCalls.add(List<int>.from(order));
    if (failReorder) throw ApiException('Urutan kategori gagal disimpan');
    categories.sort((a, b) =>
        order.indexOf(a['id'] as int).compareTo(order.indexOf(b['id'] as int)));
    return {'success': true};
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('settings exposes product category management', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
          body: SettingsPage(api: _CategorySettingsApi(), role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Kategori Produk'),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    expect(find.text('Kategori Produk'), findsOneWidget);
    expect(find.text('Kemeja'), findsOneWidget);
    expect(find.text('Celana'), findsOneWidget);
    expect(find.byKey(const ValueKey('settings-add-category')), findsOneWidget);
    expect(
        find.byKey(const ValueKey('settings-save-categories')), findsOneWidget);
  });

  testWidgets('settings can add a product category', (tester) async {
    final api = _CategorySettingsApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsPage(api: api, role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('settings-add-category')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('settings-add-category')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).last, 'Topi');
    await tester
        .tap(find.byKey(const ValueKey('settings-category-dialog-save')));
    await tester.pumpAndSettle();

    expect(api.categories.last['name'], 'Topi');
    expect(find.text('Topi'), findsOneWidget);
  });

  testWidgets('settings can drag categories and persist the new order',
      (tester) async {
    final api = _CategorySettingsApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsPage(api: api, role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('settings-category-reorder')),
      500,
      scrollable: find.byType(Scrollable).first,
    );

    final drag = await tester.startGesture(
      tester.getCenter(find.byIcon(Icons.drag_indicator).first),
    );
    await tester.pump(const Duration(milliseconds: 250));
    await drag.moveBy(const Offset(0, 160));
    await drag.up();
    await tester.pumpAndSettle();

    expect(api.reorderCalls, isEmpty);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-save-categories')));
    await tester.pumpAndSettle();
    expect(api.reorderCalls, hasLength(1));
    expect(api.reorderCalls.single, <int>[2, 1]);
    expect(
      tester.getTopLeft(find.text('Celana')).dy,
      lessThan(tester.getTopLeft(find.text('Kemeja')).dy),
    );
  });

  testWidgets('settings can choose a category color from the preset palette',
      (tester) async {
    final api = _CategorySettingsApi();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsPage(api: api, role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('settings-category-color-1')),
      500,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.byKey(const ValueKey('settings-category-color-1')));
    await tester.pumpAndSettle();
    await tester
        .tap(find.byKey(const ValueKey('settings-category-swatch-#7C3AED')));
    await tester.pumpAndSettle();

    expect(api.updateCalls, isEmpty);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-save-categories')));
    await tester.pumpAndSettle();
    expect(api.updateCalls.last['id'], 1);
    expect(api.updateCalls.last['color'], '#7C3AED');
    expect(find.byKey(const ValueKey('settings-category-color-1')),
        findsOneWidget);
  });

  testWidgets('failed category reorder restores the previous order',
      (tester) async {
    final api = _CategorySettingsApi()..failReorder = true;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsPage(api: api, role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('settings-category-reorder')),
      500,
      scrollable: find.byType(Scrollable).first,
    );

    final drag = await tester.startGesture(
      tester.getCenter(find.byIcon(Icons.drag_indicator).first),
    );
    await tester.pump(const Duration(milliseconds: 250));
    await drag.moveBy(const Offset(0, 160));
    await drag.up();
    await tester.pumpAndSettle();

    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-save-categories')));
    await tester.pumpAndSettle();

    expect(find.text('Urutan kategori gagal disimpan'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Kemeja')).dy,
      lessThan(tester.getTopLeft(find.text('Celana')).dy),
    );
  });

  testWidgets('failed category color update restores the previous color',
      (tester) async {
    final api = _CategorySettingsApi()..failColor = true;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsPage(api: api, role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('settings-category-color-1')),
      500,
      scrollable: find.byType(Scrollable).first,
    );

    await tester.tap(find.byKey(const ValueKey('settings-category-color-1')));
    await tester.pumpAndSettle();
    await tester
        .tap(find.byKey(const ValueKey('settings-category-swatch-#7C3AED')));
    await tester.pumpAndSettle();

    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-save-categories')));
    await tester.pumpAndSettle();

    expect(find.text('Warna kategori gagal disimpan'), findsOneWidget);
    final dot = tester.widget<Container>(
        find.byKey(const ValueKey('settings-category-color-dot-1')));
    final decoration = dot.decoration! as BoxDecoration;
    expect(decoration.color, const Color(0xff0f9d9a));
  });

  testWidgets('settings rejects a server response that ignores the color',
      (tester) async {
    final api = _CategorySettingsApi()..ignoreColor = true;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: SettingsPage(api: api, role: 'manager')),
    ));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('settings-category-color-1')),
      500,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('settings-category-color-1')));
    await tester.pumpAndSettle();
    await tester
        .tap(find.byKey(const ValueKey('settings-category-swatch-#DB2777')));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(Scrollable).first, const Offset(0, 500));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-save-categories')));
    await tester.pumpAndSettle();

    expect(find.textContaining('Server belum menerapkan'), findsOneWidget);
    expect(find.text('Pengaturan kategori disimpan'), findsNothing);
  });
}
