# 9. Struktur Direktori

## 9.1 Root

```
pos-pakaian/
├── README.md
├── .gitignore
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── 01-fitur-utama.md
│   ├── 02-tech-stack.md
│   ├── 03-database.md
│   ├── 04-api-endpoints.md
│   ├── 05-halaman-ui.md
│   ├── 06-alur-bisnis.md
│   ├── 07-printer-thermal.md
│   ├── 08-contoh-kode.md
│   ├── 09-struktur-direktori.md
│   ├── 10-pengaturan.md
│   ├── 11-catatan-implementasi.md
│   ├── 12-migration.sql
│   ├── 13-mockup-visual.md
│   ├── 14-testing-strategy.md
│   ├── 15-deployment.md
│   ├── 16-security.md
│   ├── 17-error-handling-logging.md
│   ├── 18-supplier-purchase-orders.md
│   ├── 19-cash-reconciliation.md
│   ├── 20-accessibility.md
│   ├── 21-setup-flutter.md
│   └── 22-dark-mode-receipt-scheduling.md
├── backend/
├── frontend/
├── mobile/
├── electron/
└── tests/
```

## 9.2 Backend

```
backend/
├── package.json
├── .env
├── src/
│   ├── index.js                    # Entry point
│   ├── app.js                      # Express app setup
│   ├── db.js                       # Database connection pool
│   ├── config/
│   │   └── index.js                # Environment config
│   ├── middleware/
│   │   ├── auth.js                 # JWT authentication
│   │   ├── authorize.js            # Role-based access
│   │   ├── validate.js             # Input validation
│   │   ├── errorHandler.js         # Centralized error handler
│   │   └── rateLimiter.js          # Rate limiting
│   ├── routes/
│   │   ├── auth.js
│   │   ├── products.js
│   │   ├── productPhotos.js
│   │   ├── categories.js
│   │   ├── transactions.js
│   │   ├── customers.js
│   │   ├── transactionPayments.js
│   │   ├── pendingTransactions.js
│   │   ├── wholesalePrices.js
│   │   ├── stockMutations.js
│   │   ├── stockOpnames.js
│   │   ├── stockTransfers.js
│   │   ├── warehouses.js
│   │   ├── expenses.js
│   │   ├── expenseBudgets.js
│   │   ├── referral.js
│   │   ├── journal.js
│   │   ├── suppliers.js
│   │   ├── supplierProducts.js
│   │   ├── purchaseOrders.js
│   │   ├── cashDrawer.js
│   │   ├── shifts.js
│   │   ├── loyalty.js
│   │   ├── schedules.js
│   │   ├── shiftTemplates.js
│   │   ├── commissionRules.js
│   │   ├── commissions.js
│   │   ├── reports.js
│   │   ├── users.js
│   │   ├── settings.js
│   │   ├── printer.js
│   │   ├── upload.js
│   │   ├── returns.js
│   │   └── activityLogs.js
│   ├── services/
│   │   ├── invoiceService.js
│   │   ├── printerService.js
│   │   ├── journalService.js
│   │   └── loyaltyService.js
│   ├── utils/
│   │   ├── sku-generator.js
│   │   ├── invoice-number.js
│   │   └── helpers.js
│   └── validators/
│       ├── auth.js
│       ├── products.js
│       ├── transactions.js
│       └── expenses.js
├── tests/
│   ├── unit/
│   │   ├── backend/
│   │   └── frontend/
│   ├── integration/
│   │   ├── api/
│   │   └── database/
│   ├── e2e/
│   ├── load/
│   └── fixtures/
└── Dockerfile
```

## 9.3 Frontend

```
frontend/
├── package.json
├── next.config.js
├── tailwind.config.js
├── public/
│   ├── favicon.ico
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js
│   │   ├── (auth)/
│   │   │   ├── login/page.js
│   │   │   └── pin/page.js
│   │   ├── (dashboard)/
│   │   │   ├── layout.js
│   │   │   ├── page.js                # Dashboard
│   │   │   ├── pos/page.js            # POS
│   │   │   ├── products/
│   │   │   │   ├── page.js            # List
│   │   │   │   └── [id]/page.js       # Form
│   │   │   ├── transactions/
│   │   │   │   ├── page.js
│   │   │   │   └── [id]/page.js
│   │   │   ├── customers/page.js
│   │   │   ├── warehouse/page.js
│   │   │   ├── expenses/page.js
│   │   │   ├── suppliers/page.js
│   │   │   ├── purchase-orders/page.js
│   │   │   ├── accounting/page.js
│   │   │   ├── reports/
│   │   │   │   ├── sales/page.js
│   │   │   │   ├── profit-loss/page.js
│   │   │   │   └── expenses/page.js
│   │   │   ├── settings/page.js
│   │   │   └── users/page.js
│   │   └── api/                       # Next.js API routes
│   ├── components/
│   │   ├── ui/                        # Reusable UI components
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Table.jsx
│   │   │   ├── Card.jsx
│   │   │   └── Badge.jsx
│   │   ├── pos/
│   │   │   ├── BarcodeInput.jsx
│   │   │   ├── ProductGrid.jsx
│   │   │   ├── CartPanel.jsx
│   │   │   ├── PaymentModal.jsx
│   │   │   └── SuccessScreen.jsx
│   │   ├── products/
│   │   │   ├── ProductList.jsx
│   │   │   └── ProductForm.jsx
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Header.jsx
│   │   │   └── Layout.jsx
│   │   └── reports/
│   │       ├── SalesChart.jsx
│   │       └── ProfitLossReport.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCart.js
│   │   └── useToast.js
│   ├── stores/
│   │   ├── authStore.js
│   │   └── cartStore.js
│   ├── services/
│   │   ├── api.js
│   │   └── printService.js
│   ├── lib/
│   │   ├── utils.js
│   │   └── constants.js
│   └── styles/
│       └── globals.css
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── Dockerfile
```

## 9.4 Mobile (Flutter)

```
mobile/
├── pubspec.yaml
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── routes/
│   │   └── app_routes.dart
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── login_screen.dart
│   │   │   └── pin_screen.dart
│   │   ├── pos/
│   │   │   ├── pos_screen.dart
│   │   │   ├── cart_screen.dart
│   │   │   └── payment_screen.dart
│   │   ├── warehouse/
│   │   │   ├── stock_opname_screen.dart
│   │   │   └── transfer_screen.dart
│   │   ├── expenses/
│   │   │   ├── expense_list_screen.dart
│   │   │   └── expense_form_screen.dart
│   │   └── profile/
│   │       └── profile_screen.dart
│   ├── components/
│   │   ├── product_card.dart
│   │   ├── cart_item.dart
│   │   └── barcode_scanner.dart
│   ├── services/
│   │   ├── api_service.dart
│   │   ├── bluetooth_printer.dart
│   │   ├── sync_service.dart
│   │   └── storage_service.dart
│   ├── providers/
│   │   ├── auth_provider.dart
│   │   └── cart_provider.dart
│   └── utils/
│       └── formatters.dart
├── android/
├── ios/
└── __tests__/
```

## 9.5 Docker

```
docker/
├── Dockerfile.frontend
├── Dockerfile.backend
├── docker-compose.yml
├── docker-compose.prod.yml
└── nginx/
    └── nginx.conf
```

## 9.6 Tests

```
tests/
├── unit/
│   ├── backend/
│   │   ├── transactions.test.js
│   │   ├── products.test.js
│   │   ├── expenses.test.js
│   │   └── journal.test.js
│   └── frontend/
│       ├── CartPanel.test.jsx
│       └── ProductGrid.test.jsx
├── integration/
│   ├── api/
│   │   ├── auth.test.js
│   │   ├── products.test.js
│   │   └── transactions.test.js
│   └── database/
│       └── seed.test.js
├── e2e/
│   ├── pos-flow.spec.js
│   ├── product-management.spec.js
│   └── login.spec.js
└── fixtures/
    ├── products.json
    ├── users.json
    └── transactions.json
```

## 9.7 CI/CD

```
.github/
├── workflows/
│   ├── ci.yml
│   └── deploy.yml
├── dependabot.yml
└── CODEOWNERS
```
