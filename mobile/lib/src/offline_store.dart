import 'dart:convert';

import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';

import 'api_client.dart';

/// Penyimpanan lokal transaksi offline + sinkronisasi otomatis.
class OfflineStore {
  static Database? _db;

  static Future<Database> _open() async {
    if (_db != null) return _db!;
    final path = join(await getDatabasesPath(), 'anyostore_offline.db');
    _db = await openDatabase(path, version: 2, onCreate: (db, version) async {
      await db.execute('''
        CREATE TABLE IF NOT EXISTS offline_transactions (
          client_transaction_id TEXT PRIMARY KEY,
          temp_invoice_no TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          grand_total REAL NOT NULL DEFAULT 0
        )
      ''');
      await db.execute('''
        CREATE TABLE IF NOT EXISTS products_cache (
          branch_id INTEGER PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          sync_date TEXT NOT NULL
        )
      ''');
    }, onUpgrade: (db, oldVersion, newVersion) async {
      if (oldVersion < 2) {
        await db.execute('''
          CREATE TABLE IF NOT EXISTS products_cache (
            branch_id INTEGER PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            sync_date TEXT NOT NULL
          )
        ''');
      }
    });
    return _db!;
  }

  static Future<void> insert(
      Map<String, dynamic> payload, String tempInvoiceNo,
      {String? clientTransactionId, double grandTotal = 0}) async {
    final db = await _open();
    final id = clientTransactionId ??
        payload['client_transaction_id']?.toString() ??
        uuidV4Local();
    await db.insert('offline_transactions', {
      'client_transaction_id': id,
      'temp_invoice_no': tempInvoiceNo,
      'payload': jsonEncode({...payload, 'client_transaction_id': id}),
      'created_at': DateTime.now().toIso8601String(),
      'grand_total': grandTotal,
    });
  }

  static Future<List<Map<String, dynamic>>> pending() async {
    final db = await _open();
    final rows = await db.query('offline_transactions',
        orderBy: 'created_at ASC');
    return rows;
  }

  static Future<int> count() async {
    final db = await _open();
    final rows = await db.rawQuery(
        'SELECT COUNT(*) AS c FROM offline_transactions');
    return (rows.first['c'] as int?) ?? 0;
  }

  static Future<void> remove(String clientTransactionId) async {
    final db = await _open();
    await db.delete('offline_transactions',
        where: 'client_transaction_id = ?', whereArgs: [clientTransactionId]);
  }

  /// Simpan cache produk/gudang/pelanggan/pengaturan untuk buka cepat tanpa server.
  static Future<void> saveProductsCache(
      int branchId, String payload, String updatedAt, String syncDate) async {
    final db = await _open();
    await db.insert('products_cache', {
      'branch_id': branchId,
      'payload': payload,
      'updated_at': updatedAt,
      'sync_date': syncDate,
    }, conflictAlgorithm: ConflictAlgorithm.replace);
  }

  /// Baca cache produk untuk cabang; null kalau belum pernah disimpan.
  static Future<Map<String, dynamic>?> loadProductsCache(int branchId) async {
    final db = await _open();
    final rows = await db.query('products_cache',
        where: 'branch_id = ?', whereArgs: [branchId], limit: 1);
    if (rows.isEmpty) return null;
    final r = rows.first;
    return {
      'payload': jsonDecode(r['payload'] as String? ?? '{}')
          as Map<String, dynamic>,
      'updated_at': r['updated_at']?.toString() ?? '',
      'sync_date': r['sync_date']?.toString() ?? '',
    };
  }
}

String uuidV4Local() {
  final now = DateTime.now().millisecondsSinceEpoch;
  return 'offline-$now-${now % 1000}';
}

/// Kirim semua transaksi antrean ke server (idempotent via client_transaction_id).
/// Mengembalikan jumlah yang berhasil sync.
Future<int> syncOfflineTransactions(ApiClient api) async {
  final rows = await OfflineStore.pending();
  var synced = 0;
  for (final row in rows) {
    final id = row['client_transaction_id']?.toString() ?? '';
    if (id.isEmpty) continue;
    try {
      final payload =
          jsonDecode(row['payload'] as String? ?? '{}') as Map<String, dynamic>;
      await api.createTransaction(payload);
      await OfflineStore.remove(id);
      synced++;
    } on ApiException catch (e) {
      // 4xx = data ditolak server, biarkan di antrean agar terlihat.
      if (e.statusCode != null && e.statusCode! < 500) break;
    } catch (_) {
      break; // masih offline / jaringan bermasalah
    }
  }
  return synced;
}
