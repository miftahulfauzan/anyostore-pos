# Deploy POS Pakaian to Netlify

The production testing stack uses:

- Netlify for the Next.js frontend and Express API function.
- TiDB Cloud Starter for a MySQL-compatible database.
- TiDB for persistent product media and store logos.

Set `MEDIA_STORAGE=database` in production so uploads never fall back to the
read-only function filesystem.

## Required Netlify environment variables

Copy the names from `.env.netlify.example` into Netlify project environment variables. Never commit real passwords or JWT secrets.

## Build settings

`netlify.toml` contains the build configuration. The frontend calls `/api`, which Netlify rewrites to the Express function.

For a manual CLI release, deploy the output produced by the Next.js Runtime,
not the raw `.next` directory:

```sh
npx netlify build
npx netlify deploy --prod --no-build \
  --dir frontend/.netlify/static \
  --functions frontend/.netlify/functions
```

Deploying `frontend/.next` directly omits the public `/_next/static` layout and
causes the production page to render without its stylesheet.

## Data migration

Import `backups/pre-oracle/20260722-120345/database.sql` into the TiDB Cloud Starter database before public acceptance testing. Run `backend/migrations/20260722_media_files.sql`, then migrate existing files under `uploads/` into `media_files` using keys relative to `uploads/` (for example `products/file.jpg`).

## Validation

After deployment, verify `/api/health`, owner and branch-admin login, product/variant stock, checkout for each store, receipt identity, reports, and image/logo upload before treating the deployment as ready.
