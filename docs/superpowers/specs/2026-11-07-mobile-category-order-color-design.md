# Mobile Category Order and Color

## Intent

Make category management useful from the Android app: an owner or authorized
staff member can arrange categories in the order they want and assign a visual
color that is reused by the POS category filter and product cards.

## Goals

- Reorder active categories in Settings with a drag-and-drop list.
- Choose a category color from a small, accessible preset palette.
- Persist both values through the existing authenticated category API.
- Make POS category chips and product-card accents follow the persisted values.
- Preserve existing behavior for old categories whose color is still empty.

## Non-goals

- No arbitrary color-picker or user-entered hex values in the mobile UI.
- No redesign of the cart, checkout, product-card layout, or category CRUD flow
  beyond the controls needed for order and color.
- No separate color configuration per branch; categories remain global as they
  are today.

## UX decisions

- The Settings category list stays compact and uses a visible drag handle. A
  row keeps its existing edit and delete actions, with a palette action beside
  them.
- Reordering is optimistic for immediate feedback and rolls back with an error
  message if the server rejects the request.
- Color selection uses eight fixed colors: denim blue, teal, amber, coral,
  purple, pink, green, and slate. The selected swatch has a clear check mark,
  and each swatch has a semantic label for accessibility.
- Existing categories with no stored color use the current name-based fallback
  in POS. New categories default to denim blue until changed.

## Data and API

- Add nullable `categories.color VARCHAR(7)` through a new migration.
- Category GET/POST/PUT responses and requests include `color`.
- Reuse `PATCH /api/products/categories/reorder` with the complete ordered
  category ID list; the route validates that IDs are active categories.
- Product list/detail responses include `category_color` and
  `category_sort_order`, allowing POS to render without an extra request.
- Only existing category-management roles may reorder or change colors.
- Server accepts only `#RRGGBB` values or null and normalizes valid values to
  uppercase before writing.

## Failure and compatibility behavior

- Failed reorder/color requests restore the last confirmed local state and show
  a recoverable message.
- A missing/invalid server color never breaks POS; it falls back to the current
  category accent mapping.
- The migration is additive and must not edit an already-run migration.

## Approaches considered

1. Store order and color only in mobile preferences. This is fast but makes
   settings device-specific and would not affect other devices, so it was
   rejected.
2. Store order and an arbitrary hex color in the API. This is flexible, but
   makes contrast and brand consistency harder for a POS used on small screens.
3. Store server-side order plus a validated preset color value. This is the
   selected approach because it works across devices while keeping the UI
   consistent and safe.
