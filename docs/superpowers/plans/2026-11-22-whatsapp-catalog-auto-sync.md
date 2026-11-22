# WhatsApp Catalog Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync the active products from grosir.anyostore.id into the existing WhatsApp catalog automatically every hour, using plain web product names and the brand Basik.

**Architecture:** Add a public CSV feed endpoint in the existing Express public router. Meta's existing primary feed will pull that URL hourly; the same stable item IDs keep the current WhatsApp catalog entries. Set the feed as the preferred source for web-managed attributes, then trigger and verify an initial pull.

**Tech Stack:** Node.js 20, Express, MySQL 8.4, Node `node:test`, Meta Commerce Manager, Meta Ads MCP.

**Spec:** `docs/superpowers/specs/2026-11-22-whatsapp-catalog-auto-sync-design.md`

## Global Constraints

- Source products from the active `Gudang Utama` branch, matching the grosir site.
- Keep stable item IDs as `ANYO-<product.id>`.
- Set product `origin_country` to `ID`.
- Use product names from the website without an `Anyostore` prefix and set brand to `Basik`.
- Products without a photo or a positive price remain `staging`/hidden.
- Reuse the existing catalog and primary feed; do not create another catalog or expose Meta credentials in the public route.
- Meta pulls the complete feed hourly; products removed from the active web catalog are removed by the full replacement.
- Keep WhatsApp catalog connection and cart settings unchanged.

## Review Focus

1. A DB or branch-resolution failure must return a non-success response, never a valid empty full-replacement feed; verify against the live endpoint before configuring Meta.
2. Product names/descriptions with commas, quotes, line breaks, or Unicode must remain valid CSV cells; pin with a serializer test.
3. Missing photos or non-positive prices must not publish an item; pin staging behavior with serializer tests and verify AG01, AG02, CELANA KATUN remain hidden.
4. Image paths must become absolute HTTPS URLs on `grosir.anyostore.id`; pin with a serializer test and inspect a live sample.
5. Availability must use the same available-stock calculation as the public grosir listing; compare the feed with the public product API for representative in-stock and out-of-stock items.

---

### Task 1: Generate the live WhatsApp CSV feed

**Files:**
- Create: `backend/src/whatsapp-catalog-feed.js`
- Modify: `backend/src/routes/public.js`
- Test: `backend/test/whatsapp-catalog-feed.test.js`

**Interfaces:**
- `serializeWhatsAppCatalogCsv(rows: FeedRow[]): string` serializes normalized rows with fields `id`, `name`, `description`, `category_name`, `price`, `available_stock`, and `photo_paths`.
- `GET /api/public/whatsapp-catalog.csv` queries active products from the same default branch as `/api/public/products` and returns UTF-8 CSV with `Content-Type: text/csv; charset=utf-8`.

- [ ] **Step 1: Write failing serializer tests** for stable `ANYO-<id>` IDs, plain titles, brand `Basik`, IDR price, `origin_country=ID`, published vs staging visibility, absolute image URLs, and CSV escaping for commas/quotes/line breaks.
- [ ] **Step 2: Run the focused test** with `cd backend && node --test test/whatsapp-catalog-feed.test.js`; confirm it fails because the serializer is not implemented.
- [ ] **Step 3: Implement the pure serializer** in `backend/src/whatsapp-catalog-feed.js`. Use stable product IDs, strip a leading `Anyostore` from titles if present, format prices as `<amount>.00 IDR`, make product/image links absolute HTTPS URLs, and set visibility to `staging` when the image is missing or price is not positive.
- [ ] **Step 4: Add the CSV route** in `backend/src/routes/public.js`. Query the active `Gudang Utama` product rows, `available_stock`, and product-level images only. Return `503` if the default branch cannot be resolved or the full product query unexpectedly returns zero rows; pass database failures to the existing error handler.
- [ ] **Step 5: Run the focused test** again and confirm it passes.
- [ ] **Step 6: Commit the backend implementation** with the test.

### Task 2: Deploy the endpoint and activate hourly Meta sync

**Files:**
- No source files; deploy through the repository's existing CI/deploy workflow and configure the current feed in Commerce Manager.

**Interfaces:**
- Public feed URL: `https://anyostore.id/api/public/whatsapp-catalog.csv`.
- Existing catalog: `1474892634605940`.
- Existing primary feed: `1618820876213480`.
- Meta schedule: `HOURLY`, `interval_count: 1`, timezone `Asia/Jakarta`, using `replace_schedule` with the public feed URL.

- [ ] **Step 1: Deploy the endpoint** through the repository's established release workflow; wait for the production health/version check to confirm the deployed revision.
- [ ] **Step 2: Inspect the live feed URL** and confirm it returns CSV for the expected grosir branch, includes the 83 current rows, and exposes no private data.
- [ ] **Step 3: Configure Commerce Manager source priority** so the existing feed takes precedence for web-managed attributes, including title, description, brand, price, availability, image, additional images, product link, country of origin, and visibility; preserve the WhatsApp connection and cart settings.
- [ ] **Step 4: Set the existing primary feed's hourly `replace_schedule`** to the public feed URL. Do not add another feed or catalog.
- [ ] **Step 5: Trigger one immediate feed upload** from the configured URL, then poll the upload session until it completes.
- [ ] **Step 6: Verify the catalog result:** all current products persist without invalid rows; ROK-04 and AT36 prices match the live grosir site; titles omit `Anyostore`; brand is `Basik`; AG01, AG02, and CELANA KATUN stay hidden; diagnostic errors are empty.
- [ ] **Step 7: Commit the approved design and plan with the implementation record.**

## Self-Review

- **Spec coverage:** the endpoint, hourly Meta schedule, plain titles, Basik brand, source priority, hidden no-photo products, and live result checks are all covered.
- **Step scan:** serializer tests, endpoint, production availability, Meta configuration, immediate pull, and catalog verification are distinct checkable steps.
- **Type consistency:** the route passes normalized DB rows to the serializer; the serialized CSV URL and Meta feed IDs are fixed above.
- **Review focus:** all five risky input classes above are covered by focused tests or live endpoint/catalog checks.
- **Proportion:** two tasks cover one backend endpoint and its required Meta configuration; no frontend, POS, migration, or credential changes are planned.
