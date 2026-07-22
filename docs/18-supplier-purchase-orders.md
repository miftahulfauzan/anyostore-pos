# 18. Manajemen Supplier & Purchase Order

## 18.1 Manajemen Supplier

### Data Supplier

| Field | Type | Keterangan |
|-------|------|------------|
| Nama | Text | Nama supplier |
| Kontak Person | Text | Nama PIC |
| Telepon | Text | Nomor telepon |
| Email | Text | Email (opsional) |
| Alamat | Text | Alamat lengkap |
| Syarat Bayar | Select | Tunai / Kredit 7/14/30 hari |
| Catatan | Text | Catatan tambahan |

### Fitur

| Fitur | Detail |
|-------|--------|
| CRUD | Tambah, edit, hapus supplier |
| Search | Cari by nama, kontak, telepon |
| Filter | Filter by status aktif |
| Product Mapping | Produk mana dari supplier mana |
| Import/Export | Import dari Excel, export ke CSV |
| Performance | Tracking waktu pengiriman |

---

## 18.2 Purchase Order (PO)

### Status PO

```
Draft → Pending Approval → Approved → Ordered → Received → Completed
  │                                                      │
  └──────────────────────→ Cancelled ←───────────────────┘
```

| Status | Keterangan |
|--------|------------|
| Draft | PO baru dibuat, belum disimpan |
| Pending Approval | Menunggu approval manager/owner |
| Approved | Sudah disetujui, siap dikirim ke supplier |
| Ordered | PO sudah dikirim ke supplier |
| Received | Barang sudah diterima, menunggu verifikasi |
| Completed | Semua proses selesai |
| Cancelled | PO dibatalkan |

### Form PO

```
┌──────────────────────────────────────────────────────────────┐
│ 📋 Form Purchase Order                                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Supplier: ┌──────────────────────────────────────────┐      │
│            │ PT Textil Jaya                            │      │
│            └──────────────────────────────────────────┘      │
│                                                               │
│  Tanggal Order: ┌──────────────┐  Estimasi: ┌────────────┐  │
│                 │ 08/07/2026   │            │ 15/07/2026  │  │
│                 └──────────────┘            └────────────┘  │
│                                                               │
│  Items:                                                       │
│  ┌────────────┬──────┬──────┬──────────┬────────────┐       │
│  │ Produk     │ Var  │ Qty  │ Harga    │ Subtotal   │       │
│  ├────────────┼──────┼──────┼──────────┼────────────┤       │
│  │ Kaos Polos │ M    │ 50   │ Rp25.000 │ Rp1.250.000│       │
│  │ Kaos Polos │ L    │ 30   │ Rp25.000 │ Rp 750.000 │       │
│  │ Kemeja     │ L    │ 20   │ Rp65.000 │ Rp1.300.000│       │
│  └────────────┴──────┴──────┴──────────┴────────────┘       │
│  [+ Tambah Item]                                              │
│                                                               │
│  Total: Rp 3.300.000                                         │
│                                                               │
│  Catatan: ┌────────────────────────────────────────────┐    │
│           │ Mohon kirim sebelum tanggal 15 Juli         │    │
│           └────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 💾 Simpan    │  │ 📤 Submit    │  │ 🖨️ Print     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### Goods Receiving

```
┌──────────────────────────────────────────────────────────────┐
│ 📦 Goods Receiving - PO-20260708-001                         │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Supplier: PT Textil Jaya                                    │
│  Tanggal PO: 08/07/2026                                      │
│  Status: Ordered                                             │
│                                                               │
│  ┌────────────┬──────┬──────────┬──────────┬────────┐       │
│  │ Produk     │ PO   │ Diterima │ Selisih  │ Status │       │
│  ├────────────┼──────┼──────────┼──────────┼────────┤       │
│  │ Kaos Polos │  50  │   50     │    0     │  ✅    │       │
│  │ Kaos Polos │  30  │   28     │   -2     │  ⚠️    │       │
│  │ Kemeja     │  20  │   20     │    0     │  ✅    │       │
│  └────────────┴──────┴──────────┴──────────┴────────┘       │
│                                                               │
│  Catatan Selisih: Kaos Polos M kurang 2 pcs                  │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ ✅ Terima Barang │  │ ❌ Tolak         │                  │
│  └──────────────────┘  └──────────────────┘                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 18.3 Backend API

```javascript
// backend/src/routes/suppliers.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/suppliers
router.get('/', authenticate, async (req, res) => {
  const { search, page = 1 } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;
  
  let query = 'SELECT * FROM suppliers WHERE branch_id = ?';
  const params = [req.user.branch_id];
  
  if (search) {
    query += ' AND (name LIKE ? OR contact_person LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  query += ' ORDER BY name LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const [rows] = await db.query(query, params);
  res.json({ data: rows });
});

// POST /api/suppliers
router.post('/', authenticate, authorize(['owner', 'manager', 'admin']), async (req, res) => {
  const { name, contact_person, phone, email, address, payment_terms, notes } = req.body;
  
  const [result] = await db.query(
    `INSERT INTO suppliers (branch_id, name, contact_person, phone, email, address, payment_terms, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.branch_id, name, contact_person, phone, email, address, payment_terms, notes]
  );
  
  res.json({ success: true, data: { id: result.insertId } });
});

module.exports = router;
```

```javascript
// backend/src/routes/purchaseOrders.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/purchase-orders
router.post('/', authenticate, authorize(['owner', 'manager', 'admin']), async (req, res) => {
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const { supplier_id, expected_date, items, notes } = req.body;
    
    // Generate PO number
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [count] = await conn.query(
      "SELECT COUNT(*) as cnt FROM purchase_orders WHERE DATE(created_at) = CURDATE()"
    );
    const poNumber = `PO-${today}-${String(count[0].cnt + 1).padStart(4, '0')}`;
    
    // Calculate total
    const totalAmount = items.reduce((sum, item) => sum + (item.unit_cost * item.quantity), 0);
    
    // Insert header
    const [result] = await conn.query(
      `INSERT INTO purchase_orders
       (branch_id, supplier_id, po_number, order_date, expected_date, 
        status, total_amount, notes, created_by)
       VALUES (?, ?, ?, CURDATE(), ?, 'draft', ?, ?, ?)`,
      [req.user.branch_id, supplier_id, poNumber, expected_date, totalAmount, notes, req.user.id]
    );
    
    const poId = result.insertId;
    
    // Insert items
    for (const item of items) {
      await conn.query(
        `INSERT INTO purchase_order_items
         (po_id, product_id, variant_id, quantity, unit_cost, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [poId, item.product_id, item.variant_id || null, item.quantity, item.unit_cost, item.unit_cost * item.quantity]
      );
    }
    
    await conn.commit();
    res.json({ success: true, data: { id: poId, po_number: poNumber } });
    
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/purchase-orders/:id/submit - Draft → Pending Approval
router.put('/:id/submit', authenticate, authorize(['owner', 'manager', 'admin']), async (req, res) => {
  const [result] = await db.query(
    "UPDATE purchase_orders SET status = 'pending_approval' WHERE id = ? AND status = 'draft'",
    [req.params.id]
  );
  if (result.affectedRows === 0) return res.status(400).json({ message: 'PO harus berstatus draft' });
  res.json({ success: true });
});

// PUT /api/purchase-orders/:id/approve - Pending Approval → Approved
router.put('/:id/approve', authenticate, authorize(['owner', 'manager']), async (req, res) => {
  const [result] = await db.query(
    "UPDATE purchase_orders SET status = 'approved', approved_by = ? WHERE id = ? AND status = 'pending_approval'",
    [req.user.id, req.params.id]
  );
  if (result.affectedRows === 0) return res.status(400).json({ message: 'PO harus berstatus pending_approval' });
  res.json({ success: true });
});

// PUT /api/purchase-orders/:id/order - Approved → Ordered
router.put('/:id/order', authenticate, authorize(['owner', 'manager', 'admin']), async (req, res) => {
  const [result] = await db.query(
    "UPDATE purchase_orders SET status = 'ordered' WHERE id = ? AND status = 'approved'",
    [req.params.id]
  );
  if (result.affectedRows === 0) return res.status(400).json({ message: 'PO harus berstatus approved' });
  res.json({ success: true });
});

// PUT /api/purchase-orders/:id/receive
router.put('/:id/receive', authenticate, authorize(['owner', 'manager', 'gudang']), async (req, res) => {
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const { items } = req.body; // [{ product_id, received_qty }]
    
    const [po] = await conn.query(
      'SELECT * FROM purchase_orders WHERE id = ? AND status = ?',
      [req.params.id, 'ordered']
    );
    
    if (!po) throw new Error('PO tidak ditemukan atau status tidak sesuai');
    
    for (const item of items) {
      // Update received_qty
      await conn.query(
        'UPDATE purchase_order_items SET received_qty = ? WHERE po_id = ? AND product_id = ?',
        [item.received_qty, req.params.id, item.product_id]
      );
      
      // Update stock
      await conn.query(
        'UPDATE products SET stock = stock + ? WHERE id = ?',
        [item.received_qty, item.product_id]
      );
      
      // Insert stock mutation
      await conn.query(
        `INSERT INTO stock_mutations
         (branch_id, product_id, user_id, type, reference_type, reference_id, qty, notes)
         VALUES (?, ?, ?, 'purchase', 'purchase_order', ?, ?, ?)`,
        [req.user.branch_id, item.product_id, req.user.id, req.params.id,
         item.received_qty, `PO #${po.po_number}`]
      );
    }
    
    // Update PO status
    await conn.query(
      "UPDATE purchase_orders SET status = 'received' WHERE id = ?",
      [req.params.id]
    );
    
    await conn.commit();
    res.json({ success: true });
    
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
```
