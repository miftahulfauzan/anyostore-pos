import 'package:flutter_test/flutter_test.dart';
import 'package:pos_pakaian_mobile/src/inventory_page.dart';

void main() {
  test('status stok membedakan tersedia, menipis, dan habis', () {
    expect(inventoryStockLevel(12, 5), InventoryStockLevel.good);
    expect(inventoryStockLevel(5, 5), InventoryStockLevel.low);
    expect(inventoryStockLevel(1, 5), InventoryStockLevel.low);
    expect(inventoryStockLevel(0, 5), InventoryStockLevel.empty);
    expect(inventoryStockLevel(-2, 5), InventoryStockLevel.empty);
  });

  test('foto stok menerima photo_path dari endpoint dan fallback umum', () {
    expect(stockProductPhotoPath({'photo_path': '/uploads/a.jpg'}),
        '/uploads/a.jpg');
    expect(stockProductPhotoPath({'photo_url': '/uploads/b.jpg'}),
        '/uploads/b.jpg');
    expect(
        stockProductPhotoPath({'photo': '/uploads/c.jpg'}), '/uploads/c.jpg');
    expect(
        stockProductPhotoPath({
          'photos': [
            {'path': '/uploads/d.jpg'}
          ]
        }),
        '/uploads/d.jpg');
    expect(
        stockProductPhotoPath({
          'media': [
            {'path': '/uploads/e.jpg'}
          ]
        }),
        '/uploads/e.jpg');
    expect(stockProductPhotoPath({'name': 'Tanpa Foto'}), isEmpty);
  });

  test('url foto stok menormalisasi path relatif dan mempertahankan url penuh',
      () {
    expect(
      stockProductMediaUrl('/uploads/a.jpg',
          baseUrl: 'https://example.com/api'),
      'https://example.com/uploads/a.jpg',
    );
    expect(
      stockProductMediaUrl('uploads/b.jpg', baseUrl: 'https://example.com/api'),
      'https://example.com/uploads/b.jpg',
    );
    expect(
      stockProductMediaUrl('https://cdn.example.com/c.jpg',
          baseUrl: 'https://example.com/api'),
      'https://cdn.example.com/c.jpg',
    );
    expect(
      stockProductMediaUrl('/api/uploads/d.jpg',
          baseUrl: 'https://example.com/api'),
      'https://example.com/uploads/d.jpg',
    );
    expect(
      stockProductMediaUrl('products/e.jpg',
          baseUrl: 'https://example.com/api'),
      'https://example.com/uploads/products/e.jpg',
    );
  });
}
