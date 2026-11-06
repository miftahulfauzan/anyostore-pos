# Anyostore mobile: approved redesign

The owner approved the mobile blueprint and both concept boards on 25 October 2026. Scope is the existing Flutter Android/iOS app. Business features, API contracts, secure accounts, the local SQLite database, offline queues and branch-specific printers must survive the update.

## Visual reference

Cream/denim, solid lightweight cards, readable product photographs, quiet static navigation, light/dark/system themes. The warehouse account has Dashboard, Stok, Mutasi, Lainnya. Other accounts retain POS, Riwayat, Stok, Laporan, Lainnya. Menu actions follow existing API permissions; personal commission and permitted product operations remain accessible.

## Implemented

- Replaced the fixed 390 px transform canvas and reduced text scale with responsive layouts and system text sizing.
- Reworked the POS catalogue into a photo-led two-column phone grid with category filters, product search, warehouse selection, and a cart sheet with product photos and clear quantity controls.
- Kept all four payment types, split payments, reference entry, cash change, validation, and receipt actions. The primary action stays visible while forms scroll.
- Added direct stock-in, stock-out, transfer, opname, and barcode shortcuts. The full date-filtered movement report remains in More > Mutasi. Stock-in/out retain their semantic colors and existing date, channel, cost, snapshot, and revision behavior.
- Applied the cream/denim theme and readable dark surfaces across existing pages. Business/API payloads and the offline database schema remain intact. The in-progress POS cart is cached per user and branch.
- Filtered menu actions by existing server permissions. Warehouse users keep their dashboard, stock operations, movement history, personal commission, printer, and theme controls.

## Feature parity checklist

- Authentication: username/email, password/PIN, remembered accounts, switch account, profile, secure token refresh.
- POS: catalogue/category/search/scanner, warehouse/branch, variants/photos, editable quantity, customer tiers, wholesale/server preview, promo, price override, hold/resume.
- Payments: cash/QRIS/transfer/debit/split, reference, change, receipt/reprint.
- History: period/status/search, cashier, offline invoice, cancellation, partial/full return, refund method.
- Inventory: total/variant/warehouse scope, sort/list/grid, incoming/outgoing with date/channel/cost, transfer retry identity, opname snapshot/revision, barcode labels.
- Products: create/edit/copy/delete, category/SKU/barcode/cost/minimum/gender/description, variants, wholesale prices, product and variant photos.
- Reports: movement/category/top-product charts, stock status, summary/closing/PPN, branch/date filters, export and closing print.
- Finance: income/expenses/approval where allowed, profit/loss, cash drawer, personal and managed commission.
- Management: customers/tiers, users, promotions, branches/catalogue cloning, activity log.
- Settings/device: theme, logos, receipt fields, branch printer, test/clear printer, backup/share, notification preferences.
- Offline: existing transaction/expense queues, cached catalogue/detail/history/report/finance, manual/foreground sync, local totals.

## Verification

Exercise critical workflows with Flutter widget/integration tests in both themes, narrow and tablet layouts, keyboard and large text. Generate actual UI previews using test data, visibly identified as examples. Build APK outside OneDrive and an iOS archive/development IPA. Real printer, camera and connected-device installation results must be reported separately from automated checks.

Do not uninstall an existing installation or clear its application data to test the redesign. Do not alter backend business rules or production data as part of visual verification.

## Build and test result — 25 October 2026

- `flutter analyze --no-pub lib test`: passed with no issues.
- `flutter test --no-pub --reporter expanded`: all 67 tests passed. Added checks cover role menus, 320 px layouts with normal and enlarged text, warehouse settings access, light/dark stock screens, and cash, non-cash, and split-payment flows.
- Android release-mode APK: built from a clean temporary checkout, package `com.anyostore.pos_pakaian_mobile`, version `0.2.0+2`; archive and signature verified. The project currently signs release mode with the Android debug key, so this artifact is for internal installation, not Play Store publishing or updating an app signed by a different key. Saved to `mobile/build/app/outputs/flutter-apk/app-release.apk`.
- iOS device build: `Runner.app` compiled in release mode with code signing disabled; saved as `mobile/build/ios/anyostore-ios-unsigned.zip` for later signing.
- Development IPA export: blocked by Apple provisioning. Xcode reports no registered team device and no matching development profile for `com.anyostore.posPakaianMobile`. Register the test iPhone with the configured Apple Developer team and create a development profile, then rebuild to produce an installable IPA.
- No physical Android/iOS device was available for installation. No printer/camera hardware test was run. Widget tests and previews use test-only sample data.
