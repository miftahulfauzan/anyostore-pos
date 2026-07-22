# 8. Contoh Kode

## 8.1 Backend: API Transaksi (Express.js)

```javascript
// backend/src/routes/transactions.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const {
      items,
      payment_method,
      amount_paid,
      discount_type = 'none',
      discount_value = 0,
      customer_id = null,
      notes = ''
    } = req.body;
    
    const user_id = req.user.id;
    const branch_id = req.user.branch_id;
    
    // 1. Hitung subtotal
    let subtotal = 0;
    for (const item of items) {
      const [product] = await conn.query(
        'SELECT price, cost FROM products WHERE id = ? AND is_active = TRUE',
        [item.product_id]
      );
      if (!product) throw new Error(`Produk ID ${item.product_id} tidak ditemukan`);
      
      item.unit_price = product.price;
      item.cost = product.cost;
      subtotal += product.price * item.quantity;
      
      // Validasi stok
      const [stockResult] = await conn.query(
        'SELECT stock, name FROM products WHERE id = ?',
        [item.product_id]
      );
      if (stockResult[0].stock < item.quantity) {
        throw new Error(`Stok ${stockResult[0].name} tidak mencukupi`);
      }
    }
    
    // 2. Hitung diskon
    let discount = 0;
    if (discount_type === 'percentage') {
      discount = subtotal * (discount_value / 100);
    } else if (discount_type === 'nominal') {
      discount = Math.min(discount_value, subtotal);
    }
    discount = Math.round(discount);
    
    // 3. Hitung grand total
    const grand_total = subtotal - discount;
    
    // 4. Hitung kembalian
    const change = Math.max(0, amount_paid - grand_total);
    
    // 5. Generate invoice number
    const today = new Date().toISOString().slice(0, 10);
    const [countResult] = await conn.query(
      'SELECT COUNT(*) as cnt FROM transactions WHERE DATE(created_at) = ?',
      [today]
    );
    const seq = String(countResult.cnt + 1).padStart(4, '0');
    const invoiceNo = `INV-${today.replace(/-/g, '')}-${seq}`;
    
    // 6. Insert transaction
    const [txResult] = await conn.query(
      `INSERT INTO transactions 
       (branch_id, invoice_no, user_id, customer_id, subtotal, 
        discount_type, discount_value, discount, grand_total,
        payment_method, amount_paid, change, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [branch_id, invoiceNo, user_id, customer_id, subtotal,
       discount_type, discount_value, discount, grand_total,
       payment_method, amount_paid, change, notes]
    );
    
    const transactionId = txResult.insertId;
    
    // 7. Insert transaction items + update stock
    for (const item of items) {
      const itemSubtotal = (item.unit_price * item.quantity) - (item.discount || 0);
      
      await conn.query(
        `INSERT INTO transaction_items
         (transaction_id, product_id, product_name, product_sku,
          quantity, price, discount, subtotal, cost)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transactionId, item.product_id, item.product_name, item.product_sku,
         item.quantity, item.unit_price, item.discount || 0, itemSubtotal, item.cost]
      );
      
      // Update stock
      await conn.query(
        'UPDATE products SET stock = stock - ? WHERE id = ?',
        [item.quantity, item.product_id]
      );
      
      // Insert stock mutation
      const [stockBefore] = await conn.query(
        'SELECT stock + ? as before_stock FROM products WHERE id = ?',
        [item.quantity, item.product_id]
      );
      
      await conn.query(
        `INSERT INTO stock_mutations
         (branch_id, product_id, user_id, type, reference_type,
          reference_id, qty, stock_before, stock_after, notes)
         VALUES (?, ?, ?, 'sale', 'transaction', ?, ?, ?, ?, ?)`,
        [branch_id, item.product_id, user_id, transactionId,
         -item.quantity, stockBefore[0].before_stock, stockBefore[0].before_stock - item.quantity,
         `Transaksi ${invoiceNo}`]
      );
    }
    
    // 8. Log activity
    await conn.query(
      'INSERT INTO activity_logs (user_id, action, description) VALUES (?, ?, ?)',
      [user_id, 'create_transaction', `Transaksi ${invoiceNo} - Rp${grand_total}`]
    );
    
    // 9. Update customer
    if (customer_id) {
      await conn.query(
        'UPDATE customers SET total_purchases = total_purchases + 1, total_spent = total_spent + ?, last_purchase = NOW() WHERE id = ?',
        [grand_total, customer_id]
      );
    }
    
    await conn.commit();
    
    res.json({
      success: true,
      data: {
        id: transactionId,
        invoice_no: invoiceNo,
        grand_total,
        amount_paid,
        change,
        payment_method,
        items: items.map(i => ({
          name: i.product_name,
          qty: i.quantity,
          price: i.unit_price,
          total: i.unit_price * i.quantity
        }))
      }
    });
    
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

// PUT /api/transactions/:id/reprint - Increment print_count, set printed=TRUE
router.put('/:id/reprint', authenticate, async (req, res) => {
  await db.query(
    'UPDATE transactions SET print_count = print_count + 1, printed = TRUE WHERE id = ?',
    [req.params.id]
  );
  res.json({ success: true });
});

module.exports = router;
```

---

## 8.2 Backend: Generate Invoice Data untuk Printer

```javascript
// backend/src/routes/printer.js
const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/invoice/:id', async (req, res) => {
  const [tx] = await db.query(
    `SELECT t.*, u.name as cashier_name
     FROM transactions t
     JOIN users u ON t.user_id = u.id
     WHERE t.id = ?`,
    [req.params.id]
  );
  
  if (!tx) return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  
  const [items] = await db.query(
    'SELECT * FROM transaction_items WHERE transaction_id = ?',
    [req.params.id]
  );
  
  const [settings] = await db.query(
    'SELECT `key`, `value` FROM store_settings WHERE branch_id = ?',
    [tx.branch_id]
  );
  const settingsMap = {};
  for (const s of settings) settingsMap[s.key] = s.value;
  
  res.json({
    store_name: settingsMap.store_name || 'Toko Saya',
    address: settingsMap.store_address || '',
    phone: settingsMap.store_phone || '',
    invoice_no: tx.invoice_no,
    cashier: tx.cashier_name,
    datetime: tx.created_at,
    items: items.map(i => ({
      name: i.product_name,
      variant: i.variant_detail || '',
      qty: i.quantity,
      price: i.price,
      total: i.subtotal
    })),
    subtotal: tx.subtotal,
    discount: tx.discount,
    grand_total: tx.grand_total,
    payment_method: tx.payment_method,
    paid: tx.amount_paid,
    change: tx.change
  });
});

module.exports = router;
```

---

## 8.3 Frontend: Komponen POS (React)

```jsx
// frontend/src/components/pos/POSPage.jsx
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/services/api';
import { useCartStore } from '@/stores/cartStore';
import { useToast } from '@/hooks/useToast';

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const [showPayment, setShowPayment] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  
  const barcodeRef = useRef(null);
  const { items, addItem, updateQty, removeItem, clearCart } = useCartStore();
  const toast = useToast();
  
  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);
  
  const { data: products, isLoading } = useQuery({
    queryKey: ['products', search, category, page],
    queryFn: () => api.get('/products', { params: { search, category, page, limit: 20 } })
  });
  
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories')
  });
  
  const handleBarcode = async (barcode) => {
    try {
      const res = await api.get(`/products/barcode/${barcode}`);
      const product = res.data;
      
      addItem({
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        price: product.price,
        quantity: 1
      });
      
      toast.success(`${product.name} ditambahkan`);
      barcodeRef.current?.focus();
    } catch (err) {
      toast.error(`Produk dengan barcode ${barcode} tidak ditemukan`);
    }
  };
  
  const transactionMutation = useMutation({
    mutationFn: (paymentData) => api.post('/transactions', {
      items: items.map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        product_sku: i.product_sku,
        quantity: i.quantity,
        unit_price: i.price,
        discount: i.discount || 0
      })),
      payment_method: paymentData.method,
      amount_paid: paymentData.amount,
      discount_type: paymentData.discountType,
      discount_value: paymentData.discountValue,
      customer_id: paymentData.customerId,
      notes: paymentData.notes
    }),
    onSuccess: (res) => {
      setLastTransaction(res.data.data);
      clearCart();
      setShowPayment(false);
      setShowSuccess(true);
      
      if (settings?.auto_print !== false) {
        printInvoice(res.data.data);
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Transaksi gagal');
    }
  });
  
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const cartDiscount = items.reduce((sum, i) => sum + (i.discount || 0), 0);
  
  return (
    <div className="flex h-screen bg-gray-100">
      <div className="flex-1 flex flex-col">
        <BarcodeInput ref={barcodeRef} onScan={handleBarcode} search={search} setSearch={setSearch} />
        <CategoryFilter categories={categories} selected={category} onChange={setCategory} />
        <ProductGrid 
          products={products?.data || []} 
          loading={isLoading}
          onSelect={(product) => addItem({...product, quantity: 1})}
          page={page} 
          totalPages={products?.totalPages || 1}
          onPageChange={setPage}
        />
      </div>
      
      <CartPanel
        items={items}
        subtotal={subtotal}
        discount={cartDiscount}
        onUpdateQty={updateQty}
        onRemoveItem={removeItem}
        onClearCart={clearCart}
        onCheckout={() => setShowPayment(true)}
      />
      
      {showPayment && (
        <PaymentModal
          total={subtotal - cartDiscount}
          onSubmit={(data) => transactionMutation.mutate(data)}
          onClose={() => setShowPayment(false)}
          loading={transactionMutation.isPending}
        />
      )}
      
      {showSuccess && lastTransaction && (
        <SuccessScreen
          transaction={lastTransaction}
          onNewTransaction={() => setShowSuccess(false)}
          onPrint={() => printInvoice(lastTransaction)}
        />
      )}
    </div>
  );
}
```

---

## 8.4 Frontend: Cetak ke Printer Thermal

```javascript
// frontend/src/services/printService.js
import { api } from './api';

export async function printInvoice(transaction) {
  if (window.qz) {
    await printViaQZTray(transaction);
  } else {
    await printViaBackend(transaction.id);
  }
}

async function printViaQZTray(transaction) {
  try {
    await qz.websocket.connect();
    const config = qz.configs.create('EPSON TM-T20');
    const data = buildESCPOSBuffer(transaction);
    
    await qz.print(config, [{
      type: 'raw',
      format: 'raw',
      data: Array.from(data),
      options: { language: 'escpos' }
    }]);
    
    await qz.websocket.disconnect();
    await api.put(`/transactions/${transaction.id}/reprint`);
    
  } catch (err) {
    console.error('Print error:', err);
    throw new Error('Gagal mencetak. Periksa koneksi printer.');
  }
}

function buildESCPOSBuffer(tx) {
  const buf = [];
  const push = (str) => { for (let i = 0; i < str.length; i++) buf.push(str.charCodeAt(i)); };
  const cmd = (...bytes) => buf.push(...bytes);
  
  cmd(0x1B, 0x40); // Initialize
  cmd(0x1B, 0x61, 0x01); // Center align
  cmd(0x1D, 0x21, 0x11); // Double height
  push(tx.store_name + '\n');
  cmd(0x1D, 0x21, 0x00); // Normal size
  push(tx.address + '\n');
  push('Telp: ' + tx.phone + '\n');
  push('-'.repeat(32) + '\n');
  
  cmd(0x1B, 0x61, 0x00); // Left align
  push('Invoice: ' + tx.invoice_no + '\n');
  push('Kasir: ' + tx.cashier + '\n');
  push('Tgl: ' + new Date(tx.datetime).toLocaleString('id-ID') + '\n');
  push('-'.repeat(32) + '\n');
  
  cmd(0x1B, 0x45, 0x01); // Bold on
  push('Item'.padEnd(20) + 'Qty'.padEnd(5) + 'Total'.padStart(7) + '\n');
  cmd(0x1B, 0x45, 0x00); // Bold off
  push('-'.repeat(32) + '\n');
  
  for (const item of tx.items) {
    const name = (item.name + ' ' + (item.variant || '')).trim().slice(0, 18);
    push(name.padEnd(18) + String(item.qty).padStart(4) + formatRupiah(item.total).padStart(10) + '\n');
  }
  
  push('-'.repeat(32) + '\n');
  cmd(0x1B, 0x45, 0x01); // Bold on
  push('Subtotal:'.padEnd(20) + formatRupiah(tx.subtotal).padStart(12) + '\n');
  if (tx.discount > 0) {
    push('Diskon:'.padEnd(20) + ('-' + formatRupiah(tx.discount)).padStart(12) + '\n');
  }
  push('Total:'.padEnd(20) + formatRupiah(tx.grand_total).padStart(12) + '\n');
  cmd(0x1B, 0x45, 0x00); // Bold off
  push('-'.repeat(32) + '\n');
  push((tx.payment_method).toUpperCase() + ':'.padEnd(19) + formatRupiah(tx.paid).padStart(11) + '\n');
  push('Kembali:'.padEnd(19) + formatRupiah(tx.change).padStart(11) + '\n');
  push('-'.repeat(32) + '\n');
  cmd(0x1B, 0x61, 0x01); // Center
  cmd(0x1B, 0x45, 0x01); // Bold on
  push('TERIMA KASIH\n');
  cmd(0x1B, 0x45, 0x00); // Bold off
  push('Barang yang sudah dibeli\n');
  push('tidak dapat ditukar/dikembalikan\n\n');
  cmd(0x1D, 0x56, 0x00); // Cut
  
  return new Uint8Array(buf);
}

function formatRupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

async function printViaBackend(transactionId) {
  await api.post('/printer/print', { transaction_id: transactionId });
}
```

---

## 8.5 Generate SKU Otomatis

```javascript
// backend/src/utils/sku-generator.js
function generateSKU(categorySlug, productName, index) {
  const categoryMap = {
    'baju-kaos': 'BJK', 'kemeja': 'KMJ', 'batik': 'BTK',
    'jaket-hoodie': 'JKT', 'celana-panjang': 'CLP', 'celana-pendek': 'CLD',
    'gamis-terusan': 'GMS', 'koko-muslim': 'KKO', 'daster': 'DSTR',
    'rok': 'ROK', 'sepatu': 'SPT', 'tas': 'TAS',
    'aksesoris': 'AKS', 'lainnya': 'LLN'
  };
  
  const catCode = categoryMap[categorySlug] || 'LLN';
  const idx = String(index).padStart(3, '0');
  return `${catCode}-${idx}`;
}

module.exports = { generateSKU };
```

---

## 8.6 Zustand Store Keranjang

```javascript
// frontend/src/stores/cartStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      discountType: 'none',
      discountValue: 0,
      notes: '',

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find(
            (i) => i.product_id === item.product_id && i.variant_id === item.variant_id
          );

          if (existing) {
            return {
              items: state.items.map((i) =>
                i.product_id === item.product_id && i.variant_id === item.variant_id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              )
            };
          }

          return { items: [...state.items, { ...item, quantity: 1, discount: 0 }] };
        }),

      updateQty: (id, variantId, qty) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.product_id === id && i.variant_id === variantId
              ? { ...i, quantity: Math.max(1, qty) }
              : i
          )
        })),

      removeItem: (id, variantId) =>
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.product_id === id && i.variant_id === variantId)
          )
        })),

      setDiscount: (type, value) => set({ discountType: type, discountValue: value }),
      setCustomer: (customer) => set({ customer }),
      setNotes: (notes) => set({ notes }),

      clearCart: () =>
        set({
          items: [], customer: null,
          discountType: 'none', discountValue: 0, notes: ''
        })
    }),
    { name: 'pos-cart', partialize: (state) => ({ items: state.items }) }
  )
);
```

---

## 8.7 Backend: API Pencatatan Biaya

```javascript
// backend/src/routes/expenses.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  const { start_date, end_date, category_id, status, page = 1 } = req.query;
  const limit = 20;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT e.*, ec.name as category_name, u.name as created_by_name
    FROM expenses e
    JOIN expense_categories ec ON e.category_id = ec.id
    JOIN users u ON e.user_id = u.id
    WHERE e.branch_id = ?
  `;
  const params = [req.user.branch_id];
  
  if (start_date) { query += ' AND e.expense_date >= ?'; params.push(start_date); }
  if (end_date) { query += ' AND e.expense_date <= ?'; params.push(end_date); }
  if (category_id) { query += ' AND e.category_id = ?'; params.push(category_id); }
  if (status) { query += ' AND e.status = ?'; params.push(status); }
  
  query += ' ORDER BY e.expense_date DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const [rows] = await db.query(query, params);
  res.json({ data: rows });
});

router.post('/', authenticate, authorize(['owner', 'manager']), async (req, res) => {
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const {
      category_id, name, amount, payment_method = 'cash',
      expense_date, notes = '', receipt_file = null,
      is_recurring = false, recurring_frequency = null, next_due_date = null
    } = req.body;
    
    const needsApproval = amount > 1000000;
    const status = needsApproval ? 'pending' : 'approved';
    
    const [result] = await conn.query(
      `INSERT INTO expenses 
       (branch_id, category_id, name, amount, payment_method, 
        expense_date, notes, receipt_file, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.branch_id, category_id, name, amount, payment_method,
       expense_date, notes, receipt_file, status, req.user.id]
    );
    
    const expenseId = result.insertId;
    
    if (status === 'approved') {
      await createExpenseJournal(conn, expenseId, category_id, amount, req.user.branch_id);
    }
    
    if (is_recurring && next_due_date) {
      await conn.query(
        `INSERT INTO expense_schedules
         (expense_id, frequency, next_due_date, is_active)
         VALUES (?, ?, ?, TRUE)`,
        [expenseId, recurring_frequency, next_due_date]
      );
    }
    
    await conn.commit();
    res.json({ success: true, data: { id: expenseId, status } });
    
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

async function createExpenseJournal(conn, expenseId, categoryId, amount, branchId) {
  const [category] = await conn.query(
    'SELECT id, account_code FROM expense_categories WHERE id = ?',
    [categoryId]
  );
  
  const [journalResult] = await conn.query(
    `INSERT INTO journal_entries
     (branch_id, journal_date, reference_type, reference_id, description, created_by)
     VALUES (?, CURDATE(), 'expense', ?, ?, ?)`,
    [branchId, expenseId, `Biaya expense #${expenseId}`, 1]
  );
  
  const journalId = journalResult.insertId;
  
  // Find COA accounts - use category's account_code instead of hardcoded
  const [expenseAccount] = await conn.query(
    "SELECT id FROM chart_of_accounts WHERE code = ?",
    [category[0].account_code]
  );
  const [cashAccount] = await conn.query("SELECT id FROM chart_of_accounts WHERE code = '1-1000'");
  
  await conn.query(
    `INSERT INTO journal_entry_items (journal_id, account_id, debit, credit) VALUES (?, ?, ?, 0)`,
    [journalId, expenseAccount[0].id, amount]
  );
  
  await conn.query(
    `INSERT INTO journal_entry_items (journal_id, account_id, debit, credit) VALUES (?, ?, 0, ?)`,
    [journalId, cashAccount[0].id, amount]
  );
}

module.exports = router;
```

---

## 8.8 Backend: API Pembukuan

```javascript
// backend/src/routes/journal.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/entries', authenticate, authorize(['owner']), async (req, res) => {
  const { start_date, end_date, page = 1 } = req.query;
  
  const [rows] = await db.query(`
    SELECT je.*, u.name as created_by_name
    FROM journal_entries je
    JOIN users u ON je.created_by = u.id
    WHERE je.branch_id = ?
    ${start_date ? 'AND je.journal_date >= ?' : ''}
    ${end_date ? 'AND je.journal_date <= ?' : ''}
    ORDER BY je.journal_date DESC, je.id DESC
  `, [req.user.branch_id, start_date, end_date].filter(Boolean));
  
  for (const entry of rows) {
    const [items] = await db.query(
      `SELECT ji.*, coa.code as account_code, coa.name as account_name
       FROM journal_entry_items ji
       JOIN chart_of_accounts coa ON ji.account_id = coa.id
       WHERE ji.journal_id = ?`,
      [entry.id]
    );
    entry.items = items;
  }
  
  res.json({ data: rows });
});

router.post('/entries', authenticate, authorize(['owner']), async (req, res) => {
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const { journal_date, description, items } = req.body;
    
    const totalDebit = items.reduce((sum, i) => sum + (i.debit || 0), 0);
    const totalCredit = items.reduce((sum, i) => sum + (i.credit || 0), 0);
    
    if (totalDebit !== totalCredit) {
      throw new Error(`Debit tidak seimbang dengan Kredit`);
    }
    
    const [result] = await conn.query(
      `INSERT INTO journal_entries
       (branch_id, journal_date, reference_type, description, total_debit, total_credit, created_by)
       VALUES (?, ?, 'manual', ?, ?, ?, ?)`,
      [req.user.branch_id, journal_date, description, totalDebit, totalCredit, req.user.id]
    );
    
    const journalId = result.insertId;
    
    for (const item of items) {
      await conn.query(
        `INSERT INTO journal_entry_items (journal_id, account_id, debit, credit) VALUES (?, ?, ?, ?)`,
        [journalId, item.account_id, item.debit || 0, item.credit || 0]
      );
    }
    
    await conn.commit();
    res.json({ success: true, data: { id: journalId } });
    
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

router.get('/trial-balance', authenticate, authorize(['owner']), async (req, res) => {
  const [rows] = await db.query(`
    SELECT 
      coa.code,
      coa.name,
      coa.type,
      SUM(ji.debit) as total_debit,
      SUM(ji.credit) as total_credit,
      SUM(ji.debit) - SUM(ji.credit) as balance
    FROM journal_entry_items ji
    JOIN journal_entries je ON ji.journal_id = je.id
    JOIN chart_of_accounts coa ON ji.account_id = coa.id
    WHERE je.branch_id = ?
    GROUP BY coa.code, coa.name, coa.type
    ORDER BY coa.code
  `, [req.user.branch_id]);
  
  res.json({ data: rows });
});

module.exports = router;
```

---

## 8.9 Backend: API Gudang & Stok Opname

```javascript
// backend/src/routes/warehouse.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/stock-opname', authenticate, authorize(['owner', 'manager', 'gudang']), async (req, res) => {
  const conn = await db.getConnection();
  
  try {
    await conn.beginTransaction();
    
    const { warehouse_id, category_id, items } = req.body;
    
    let totalSelisih = 0;
    for (const item of items) {
      const selisih = item.physical_stock - item.system_stock;
      totalSelisih += Math.abs(selisih);
    }
    
    const [result] = await conn.query(
      `INSERT INTO stock_opnames
       (warehouse_id, branch_id, opname_date, category_id, 
        total_items, total_selisih, notes, created_by)
       VALUES (?, ?, CURDATE(), ?, ?, ?, ?, ?)`,
      [warehouse_id, req.user.branch_id, category_id || null,
       items.length, totalSelisih, req.body.notes || '', req.user.id]
    );
    
    const opnameId = result.insertId;
    
    for (const item of items) {
      const selisih = item.physical_stock - item.system_stock;
      
      if (selisih !== 0) {
        await conn.query(
          `INSERT INTO stock_opname_items
           (opname_id, product_id, variant_id, system_stock, 
            physical_stock, selisih, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [opnameId, item.product_id, item.variant_id || null,
           item.system_stock, item.physical_stock, selisih, item.notes || '']
        );
        
        await conn.query(
          'UPDATE products SET stock = ? WHERE id = ?',
          [item.physical_stock, item.product_id]
        );
        
        await conn.query(
          `INSERT INTO stock_mutations
           (branch_id, warehouse_id, product_id, user_id,
            type, reference_type, reference_id, qty, 
            stock_before, stock_after, notes)
           VALUES (?, ?, ?, ?, 'adjustment', 'stock_opname', ?, ?, ?, ?, ?)`,
          [req.user.branch_id, warehouse_id, item.product_id,
           req.user.id, opnameId, selisih, item.system_stock,
           item.physical_stock, `Stok opname #${opnameId}`]
        );
      }
    }
    
    await conn.commit();
    res.json({ success: true, data: { id: opnameId, total_selisih: totalSelisih } });
    
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ success: false, message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
```

---

## 8.10 Frontend: Mobile Offline Sync Service (Flutter)

```dart
// lib/services/sync_service.dart
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:http/http.dart' as http;
import 'api_service.dart';

class SyncService {
  static const String _txKey = 'pos_queue_transactions';
  static const String _stockKey = 'pos_queue_stock_mutations';
  static const String _expenseKey = 'pos_queue_expenses';

  bool _isSyncing = false;

  SyncService() {
    Connectivity().onConnectivityChanged.listen((result) {
      if (result != ConnectivityResult.none && !_isSyncing) {
        syncAll();
      }
    });
  }

  Future<void> queueTransaction(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await _getQueue(_txKey);
    queue.add({
      'id': DateTime.now().millisecondsSinceEpoch.toString(),
      'data': data,
      'timestamp': DateTime.now().toIso8601String(),
      'retries': 0,
    });
    await prefs.setString(_txKey, jsonEncode(queue));
  }

  Future<List<dynamic>> _getQueue(String key) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(key);
    return raw != null ? jsonDecode(raw) : [];
  }

  Future<void> syncAll() async {
    if (_isSyncing) return;
    _isSyncing = true;
    try {
      await _syncQueue(_txKey, '/transactions');
      await _syncQueue(_stockKey, '/stock-mutations');
      await _syncQueue(_expenseKey, '/expenses');
      await _fetchLatestData();
    } catch (e) {
      print('Sync error: $e');
    } finally {
      _isSyncing = false;
    }
  }

  Future<void> _syncQueue(String key, String endpoint) async {
    final queue = await _getQueue(key);
    final failed = <dynamic>[];
    for (final item in queue) {
      try {
        await ApiService.post(endpoint, item['data']);
      } catch (e) {
        item['retries'] = (item['retries'] ?? 0) + 1;
        if (item['retries'] < 3) failed.add(item);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(key, jsonEncode(failed));
  }

  Future<void> _fetchLatestData() async {
    final products = await ApiService.get('/products?limit=1000');
    final categories = await ApiService.get('/categories');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pos_products', jsonEncode(products));
    await prefs.setString('pos_categories', jsonEncode(categories));
  }
}

final syncService = SyncService();
```

---

## 8.11 Frontend: Mobile Bluetooth Printer Service (Flutter)

```dart
// lib/services/bluetooth_printer.dart
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:esc_pos_bluetooth/esc_pos_bluetooth.dart';
import 'package:flutter_bluetooth_printer/flutter_bluetooth_printer.dart';

class BluetoothPrinterService {
  BluetoothPrinter? _printer;
  BluetoothDevice? _connectedDevice;

  Future<List<BluetoothDevice>> scanPrinters() async {
    _printer = BluetoothPrinter();
    return await _printer!.scan();
  }

  Future<void> connect(BluetoothDevice device) async {
    await _printer!.connect(device);
    _connectedDevice = device;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('pos_printer', jsonEncode(device.toJson()));
  }

  Future<List<int>> buildReceipt(Map<String, dynamic> tx) async {
    final profile = await CapabilityProfile.load();
    final generator = Generator(PaperSize.mm80, profile);
    final bytes = <int>[];
    bytes.addAll(generator.text(tx['store_name'],
        styles: const PosStyles(align: PosAlign.center, bold: true)));
    bytes.addAll(generator.text('--------------------------------'));
    bytes.addAll(generator.text('Invoice: ${tx['invoice_no']}'));
    bytes.addAll(generator.text(
        'Total: Rp${tx['grand_total'].toString().replaceAllMapped(
            RegExp(r'(\d{1,3})(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.')}'));
    bytes.addAll(generator.text('--------------------------------'));
    bytes.addAll(generator.text('TERIMA KASIH',
        styles: const PosStyles(align: PosAlign.center, bold: true)));
    bytes.addAll(generator.feed(2));
    bytes.addAll(generator.cut());
    return bytes;
  }

  Future<void> printReceipt(Map<String, dynamic> tx) async {
    if (_connectedDevice == null) throw Exception('Printer tidak terhubung');
    final bytes = await buildReceipt(tx);
    await _printer!.write(bytes);
  }
}

final bluetoothPrinter = BluetoothPrinterService();
```
