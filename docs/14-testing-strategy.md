# 14. Testing Strategy

## 14.1 Testing Pyramid

```
        ╱╲
       ╱ E2E ╲
      ╱──────╲
     ╱Integration╲
    ╱──────────╲
   ╱    Unit    ╲
  ╱──────────────╲
```

| Level | Coverage | Tools |
|-------|----------|-------|
| Unit | 80%+ | Jest, React Testing Library |
| Integration | 60%+ | Jest, Supertest |
| E2E | Critical paths | Playwright |

## 14.2 Unit Testing

### Backend (Jest + Supertest)

```javascript
// tests/unit/backend/transactions.test.js
const { calculateDiscount } = require('../../src/utils/helpers');
const { generateInvoiceNo } = require('../../src/utils/invoice-number');

describe('Helper Functions', () => {
  describe('calculateDiscount', () => {
    test('should calculate percentage discount', () => {
      const result = calculateDiscount(100000, 'percentage', 10);
      expect(result).toBe(10000);
    });

    test('should calculate nominal discount', () => {
      const result = calculateDiscount(100000, 'nominal', 15000);
      expect(result).toBe(15000);
    });

    test('should not exceed subtotal', () => {
      const result = calculateDiscount(100000, 'nominal', 150000);
      expect(result).toBe(100000);
    });
  });
});
```

### Frontend (React Testing Library)

```javascript
// tests/unit/CartPanel.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import CartPanel from '../../src/components/pos/CartPanel';

const mockItems = [
  { product_id: 1, product_name: 'Kaos Polos', price: 55000, quantity: 2 }
];

test('renders cart items correctly', () => {
  render(<CartPanel items={mockItems} subtotal={110000} discount={0} />);
  expect(screen.getByText('Kaos Polos')).toBeInTheDocument();
  expect(screen.getByText('Rp110.000')).toBeInTheDocument();
});

test('calls onCheckout when checkout button clicked', () => {
  const onCheckout = jest.fn();
  render(<CartPanel items={mockItems} subtotal={110000} discount={0} onCheckout={onCheckout} />);
  fireEvent.click(screen.getByText('BAYAR'));
  expect(onCheckout).toHaveBeenCalled();
});
```

## 14.3 Integration Testing

```javascript
// tests/integration/api/transactions.test.js
const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('POST /api/transactions', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'kasir@tok.com', password: 'admin123' });
    authToken = res.body.token;
  });

  afterAll(async () => {
    await db.end();
  });

  test('should create transaction successfully', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [{ product_id: 1, quantity: 2 }],
        payment_method: 'cash',
        amount_paid: 110000
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.invoice_no).toMatch(/^INV-/);
  });

  test('should fail with insufficient stock', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        items: [{ product_id: 1, quantity: 9999 }],
        payment_method: 'cash',
        amount_paid: 1000000
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('tidak mencukupi');
  });
});
```

## 14.4 E2E Testing (Playwright)

```javascript
// tests/e2e/pos-flow.spec.js
const { test, expect } = require('@playwright/test');

test('complete POS transaction flow', async ({ page }) => {
  // Login
  await page.goto('/login');
  await page.fill('input[type="email"]', 'kasir@tok.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("LOGIN")');

  // Navigate to POS
  await page.click('text=POS');
  await expect(page).toHaveURL('/pos');

  // Scan barcode
  await page.fill('input[placeholder*="barcode"]', '8991234567890');
  await page.press('input[placeholder*="barcode"]', 'Enter');

  // Verify item added
  await expect(page.locator('.cart-item')).toHaveCount(1);

  // Click bayar (tombol di layar POS)
  await page.click('button:has-text("BAYAR")');

  // Modal pembayaran muncul
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  // Select payment method
  await page.click('text=Tunai');
  await page.fill('input[type="number"]', '60000');

  // Confirm payment (tombol di modal)
  await page.click('button:has-text("Bayar & Cetak")');

  // Verify success
  await expect(page.locator('text=TRANSAKSI BERHASIL')).toBeVisible();
});
```

## 14.5 Database Testing

```javascript
// tests/integration/database/seed.test.js
const db = require('../../../src/db');

describe('Database Seed', () => {
  test('should have branches', async () => {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM branches');
    expect(rows[0].count).toBeGreaterThan(0);
  });

  test('should have categories', async () => {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM categories');
    expect(rows[0].count).toBe(14);
  });

  test('should have chart of accounts', async () => {
    const [rows] = await db.query('SELECT COUNT(*) as count FROM chart_of_accounts');
    expect(rows[0].count).toBeGreaterThan(0);
  });
});
```

## 14.6 Load Testing (k6)

```javascript
// tests/load/pos-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10,
  duration: '30s',
};

export default function () {
  const res = http.get('http://localhost:3001/api/products');
  check(res, { 'status was 200': (r) => r.status == 200 });
  sleep(1);
}
```

## 14.7 Test Configuration

```json
// package.json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:e2e": "playwright test",
    "test:load": "k6 run tests/load/pos-load.js"
  },
  "jest": {
    "testEnvironment": "node",
    "coverageThreshold": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80
      }
    }
  }
}
```
