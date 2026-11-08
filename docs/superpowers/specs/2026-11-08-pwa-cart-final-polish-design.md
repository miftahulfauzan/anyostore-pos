# PWA Cart Final Polish Design

## Intent

Make the PWA POS cart faster and quieter for daily cashier use: no routine loading/success popup interruption, denser 64px product rows, a four-piece first add for Basik/Metro stores, and a truly viewport-filling cart sheet.

## Goals

- Suppress only routine `loading` and `success` notifications on the compact `/pos` view; errors remain visible.
- Keep each mobile cart product row exactly 64px high and vertically scrollable.
- Start a newly added product at quantity 4 only when the active store name contains Basik or Metro; repeated taps on an existing item still increment by 1, and other stores start at 1.
- Make the open cart occupy the full viewport width and height, including on mobile browser/PWA safe areas.
- Preserve all existing product, price, total, discount, payment, and checkout logic.

## Non-goals

- No backend/API, database, Android UI, or unrelated page changes.
- No suppression of error notifications.

## Approach

Use the existing final mobile CSS override for the 64px/full-screen rules, a tiny pure helper for the store-name quantity default, and a route/viewport guard inside `NotificationCenter` so only routine POS-mobile notices are suppressed. This keeps the cart markup and transaction state unchanged.
