# POS Pakaian

Implementation workspace for the POS Pakaian platform.

## Start development

1. Copy `.env.example` to `.env` and replace every secret.
2. Start MySQL and the applications with `docker compose up --build`.
3. Create the first owner using the bcrypt-hash instructions in [docs/10-pengaturan.md](docs/10-pengaturan.md).
4. Open `http://localhost:3000`; API health is available at `http://localhost:3001/api/health`.

The database schema is initialized only for a fresh Docker volume. Use versioned migrations for future production schema changes.

## Quality gates

Run `npm test` in `backend/` and `npm run build` in `frontend/` before every merge. CI repeats these checks, runs dependency audits, and validates the Flutter source when changes are pushed or opened as a pull request.
