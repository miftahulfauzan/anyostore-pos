# 11. Catatan Implementasi

## 11.1 Barcode Scanner

```javascript
// Handle barcode input
const handleBarcodeScan = async (barcode) => {
  // Prevent duplicate scan
  if (lastScannedBarcode === barcode) return;
  setLastScannedBarcode(barcode);
  
  // Add to cart or increment quantity
  const existingItem = cart.find(i => i.barcode === barcode);
  if (existingItem) {
    updateQuantity(existingItem.id, existingItem.quantity + 1);
  } else {
    const product = await fetchProductByBarcode(barcode);
    if (product) {
      addToCart(product);
    } else {
      showError(`Produk ${barcode} tidak ditemukan`);
    }
  }
  
  // Reset after 500ms
  setTimeout(() => setLastScannedBarcode(null), 500);
};
```

## 11.2 Security

| Layer | Implementation |
|-------|---------------|
| Authentication | JWT (8h expiry) + Refresh Token (7d) |
| Password | bcrypt (12 rounds) |
| PIN | bcrypt hash, lockout 3 attempts (5min) |
| RBAC | Middleware per role per endpoint |
| Validation | express-validator (all inputs) |
| SQL Injection | Parameterized queries only |
| XSS | Helmet headers + input sanitization |
| CORS | Whitelist origins |
| Rate Limiting | 100 req/min per IP |
| File Upload | Validate type + size (5MB max) |

## 11.3 Performance

| Tip | Implementation |
|-----|---------------|
| Pagination | Server-side for all lists |
| Debounce | 300ms for search inputs |
| Lazy Load | React.lazy + Suspense |
| Image | Sharp resize (500x500) |
| Cache | React Query (5min stale) |
| Index | Database indexes on FK + search columns |
| Connection Pool | max: 20, min: 5 |

## 11.4 Offline Mode (Mobile)

```javascript
// Queue transactions when offline
const queueTransaction = async (transaction) => {
  const queue = await AsyncStorage.getItem('transactionQueue');
  const items = queue ? JSON.parse(queue) : [];
  items.push({ ...transaction, timestamp: Date.now() });
  await AsyncStorage.setItem('transactionQueue', JSON.stringify(items));
};

// Sync when online
const syncQueue = async () => {
  const queue = await AsyncStorage.getItem('transactionQueue');
  if (!queue) return;
  
  const items = JSON.parse(queue);
  for (const item of items) {
    try {
      await api.post('/transactions', item);
      items.shift();
      await AsyncStorage.setItem('transactionQueue', JSON.stringify(items));
    } catch (error) {
      break;
    }
  }
};
```

## 11.5 Multi-Branch Scaling

```
Branch A ──┐
           ├──→ API Server ──→ Database (Replication)
Branch B ──┘       │
                   └──→ Redis (Cache + Session)
                   └──→ S3 (File Storage)
```

## 11.6 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Printer tidak menyala | Cek koneksi USB, restart printer, cek driver |
| Stok negatif | Jalankan stok opname, cek log mutasi |
| Transaksi dobel | Cek idempotency key, gunakan optimistic locking |
| Login gagal | Cek JWT expiry, clear cookies |
| Gambar tidak upload | Cek ukuran (max 5MB), cek format (jpg/png) |
| Laporan salah | Cek timezone server, pastikan period lock |
