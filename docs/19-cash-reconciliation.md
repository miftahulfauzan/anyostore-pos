# 19. Cash Reconciliation & End-of-Day

## 19.1 Cash Drawer Management

### Opening Cash

```
┌────────────────────────────────────────────────┐
│ 💵 Buka Kasir                                  │
├────────────────────────────────────────────────┤
│                                                 │
│  Kasir: Ahmad                                   │
│  Shift: Pagi (08:00 - 14:00)                   │
│                                                 │
│  Modal Awal:                                    │
│  ┌────────────────────────────────────────┐    │
│  │ Rp [500.000                          ] │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  ┌────────────────────────────────────────┐    │
│  │         💵 Buka Kasir                   │    │
│  └────────────────────────────────────────┘    │
│                                                 │
└────────────────────────────────────────────────┘
```

### Cash In/Out

```
┌────────────────────────────────────────────────┐
│ 💰 Cash In/Out                                 │
├────────────────────────────────────────────────┤
│                                                 │
│  Tipe: [Cash In ▼]                             │
│                                                 │
│  Nominal:                                      │
│  ┌────────────────────────────────────────┐    │
│  │ Rp [100.000                          ] │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  Keterangan:                                   │
│  ┌────────────────────────────────────────┐    │
│  │ Setoran dari penjualan                  │    │
│  └────────────────────────────────────────┘    │
│                                                 │
│  ┌────────────────────────────────────────┐    │
│  │           💾 Simpan                     │    │
│  └────────────────────────────────────────┘    │
│                                                 │
└────────────────────────────────────────────────┘
```

---

## 19.2 End-of-Day (Z-Report)

Cash in/out harus dicatat sebagai `cash_drawer_movements`, bukan hanya
mengubah total drawer. Expected cash dihitung dari modal awal + penjualan tunai
+ cash-in − cash-out − pengeluaran tunai. Setiap selisih saat penutupan wajib
memiliki alasan dan tercatat di activity log.

```
┌──────────────────────────────────────────────────────────────────┐
│ 📊 Z-Report - 8 Juli 2026                                        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ╔════════════════════════════════════════════════════════════╗  │
│  ║                    RINGKASAN HARI INI                       ║  │
│  ╠════════════════════════════════════════════════════════════╣  │
│  ║                                                              ║  │
│  ║  Total Penjualan:        Rp 2.500.000                       ║  │
│  ║  Total Transaksi:        45 transaksi                        ║  │
│  ║  Rata-rata/Transaksi:    Rp 55.556                          ║  │
│  ║                                                              ║  │
│  ╠════════════════════════════════════════════════════════════╣  │
│  ║  METODE PEMBAYARAN                                           ║  │
│  ║  ────────────────────────────────────────────────────────── ║  │
│  ║  💵 Tunai:              Rp 1.125.000  (45%)                ║  │
│  ║  📱 QRIS:               Rp  875.000  (35%)                 ║  │
│  ║  💳 Debit:              Rp  375.000  (15%)                 ║  │
│  ║  🏦 Transfer:           Rp  125.000   (5%)                 ║  │
│  ║                                                              ║  │
│  ╠════════════════════════════════════════════════════════════╣  │
│  ║  PENGELUARAN                                                ║  │
│  ║  ────────────────────────────────────────────────────────── ║  │
│  ║  Total Pengeluaran:     Rp  350.000                        ║  │
│  ║                                                              ║  │
│  ╠════════════════════════════════════════════════════════════╣  │
│  ║  LABA BERSIH                                                   ║  │
│  ║  ────────────────────────────────────────────────────────── ║  │
│  ║  Pendapatan:            Rp 2.500.000                       ║  │
│  ║  HPP:                  -Rp  875.000                        ║  │
│  ║  Pengeluaran:          -Rp  350.000                        ║  │
│  ║  ═══════════════════════════════════════════════════════════║  │
│  ║  Laba Bersih:           Rp 1.275.000                       ║  │
│  ╚════════════════════════════════════════════════════════════╝  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  RECONCILIATION                                             │  │
│  │  ════════════════════════════════════════════════════════  │  │
│  │  Modal Awal:              Rp   500.000                     │  │
│  │  + Penjualan Tunai:       Rp 1.125.000                     │  │
│  │  - Pengeluaran:          -Rp   350.000                     │  │
│  │  ══════════════════════════════════════════════════════    │  │
│  │  Expected Cash:           Rp 1.275.000                     │  │
│  │  Actual Cash:            [ Rp 1.275.000 ]                  │  │
│  │  Selisih:                 Rp 0                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ 🖨️ Print    │  │ ✅ Tutup Kas │  │ ❌ Batal     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 19.3 Shift Management

```
┌──────────────────────────────────────────────────────────────────┐
│ 👥 Shift Hari Ini                                                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Kasir    │ Shift     │ Mulai    │ Selesai  │ Status         ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ Ahmad    │ Pagi      │ 08:00    │ 14:00    │ ✅ Selesai     ││
│  │ Budi     │ Sore      │ 14:00    │ 20:00    │ 🟢 Aktif       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 19.4 Backend API

```javascript
// backend/src/routes/cashDrawer.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

// POST /api/cash-drawer/open
router.post('/open', authenticate, async (req, res) => {
  const { opening_amount } = req.body;
  
  // Check if there's already an open drawer
  const [existing] = await db.query(
    "SELECT * FROM cash_drawers WHERE user_id = ? AND status = 'open'",
    [req.user.id]
  );
  
  if (existing.length > 0) {
    return res.status(400).json({ message: 'Masih ada kasir yang terbuka' });
  }
  
  const [result] = await db.query(
    `INSERT INTO cash_drawers (branch_id, user_id, opening_amount, status)
     VALUES (?, ?, ?, 'open')`,
    [req.user.branch_id, req.user.id, opening_amount]
  );
  
  res.json({ success: true, data: { id: result.insertId } });
});

// PUT /api/cash-drawer/close
router.put('/close', authenticate, async (req, res) => {
  const { actual_cash, notes } = req.body;
  
  const [drawer] = await db.query(
    "SELECT * FROM cash_drawers WHERE user_id = ? AND status = 'open'",
    [req.user.id]
  );
  
  if (drawer.length === 0) {
    return res.status(400).json({ message: 'Tidak ada kasir yang terbuka' });
  }
  
  const d = drawer[0];
  
  // Calculate expected cash
  const [salesResult] = await db.query(
    `SELECT SUM(amount_paid - \`change\`) as cash_sales
     FROM transactions 
     WHERE user_id = ? AND payment_method = 'cash' 
     AND created_at >= ? AND status = 'completed'`,
    [req.user.id, d.opened_at]
  );
  
  const [expensesResult] = await db.query(
    `SELECT SUM(amount) as cash_out
     FROM expenses 
     WHERE user_id = ? AND payment_method = 'cash'
     AND created_at >= ?`,
    [req.user.id, d.opened_at]
  );
  
  const cashSales = salesResult[0].cash_sales || 0;
  const cashOut = expensesResult[0].cash_out || 0;
  // expected = modal awal + penjualan tunai - pengeluaran tunai
  const expectedCash = d.opening_amount + cashSales - cashOut;
  const difference = actual_cash - expectedCash;
  
  // Update drawer (closing_amount = total uang terhitung / actual_cash)
  await db.query(
    `UPDATE cash_drawers SET 
     closing_amount = ?, expected_cash = ?, actual_cash = ?, 
     difference = ?, notes = ?, status = 'closed', closed_at = NOW()
     WHERE id = ?`,
    [actual_cash, expectedCash, actual_cash, difference, notes, d.id]
  );
  
  // Create Z-Report data
  res.json({
    success: true,
    data: {
      opening_amount: d.opening_amount,
      cash_sales: cashSales,
      cash_out: cashOut,
      expected_cash: expectedCash,
      actual_cash: actual_cash,
      difference: difference
    }
  });
});

// GET /api/cash-drawer/z-report?scope=branch (owner/manager: seluruh cabang)
router.get('/z-report', authenticate, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const scope = req.query.scope === 'branch' &&
    ['owner', 'manager'].includes(req.user.role)
    ? 'branch' : 'user';
  
  const userFilter = scope === 'branch'
    ? 't.branch_id = ?'
    : 't.user_id = ?';
  
  const [drawer] = await db.query(
    `SELECT * FROM cash_drawers WHERE ${scope === 'branch' ? 'branch_id' : 'user_id'} = ? AND DATE(opened_at) = ?`,
    [req.user[scope === 'branch' ? 'branch_id' : 'id'], today]
  );
  
  if (drawer.length === 0) {
    return res.status(404).json({ message: 'Belum ada kasir hari ini' });
  }
  
  const d = drawer[0];
  
  // Get sales summary
  const [sales] = await db.query(
    `SELECT 
      COUNT(*) as total_transactions,
      SUM(grand_total) as total_sales,
      SUM(CASE WHEN payment_method = 'cash' THEN amount_paid - \`change\` ELSE 0 END) as cash_sales,
      SUM(CASE WHEN payment_method = 'qris' THEN grand_total ELSE 0 END) as qris_sales,
      SUM(CASE WHEN payment_method = 'debit' THEN grand_total ELSE 0 END) as debit_sales,
      SUM(CASE WHEN payment_method = 'transfer' THEN grand_total ELSE 0 END) as transfer_sales
     FROM transactions t
     WHERE ${userFilter} AND DATE(t.created_at) = ? AND t.status = 'completed'`,
    [req.user[scope === 'branch' ? 'branch_id' : 'id'], today]
  );
  
  // Get expenses
  const [expenses] = await db.query(
    `SELECT SUM(amount) as total_expenses
     FROM expenses e
     WHERE ${scope === 'branch' ? 'e.branch_id' : 'e.user_id'} = ? AND DATE(e.created_at) = ?`,
    [req.user[scope === 'branch' ? 'branch_id' : 'id'], today]
  );
  
  res.json({
    scope,
    drawer: d,
    sales: sales[0],
    expenses: expenses[0].total_expenses || 0
  });
});

module.exports = router;
```
