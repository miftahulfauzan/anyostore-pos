# Web Account Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect an existing web session on `/login` and provide an opt-in, secure account switcher like the APK.

**Architecture:** Extend Express auth endpoints to keep one refresh session cookie per remembered account, using the existing `refresh_tokens` table and `rotateRefresh()`. Next.js reads only safe account metadata; active/saved tokens remain in `HttpOnly` cookies.

**Tech Stack:** Express, MySQL, JWT cookies, Next.js 16 App Router, React 18.

**Spec:** `docs/superpowers/specs/2026-11-24-web-account-switcher-design.md`

## Global Constraints

- Saved accounts are opt-in; the login checkbox defaults to unchecked.
- Maximum 8 saved accounts per browser.
- Saved refresh cookies use `HttpOnly`, `Secure` in production, `SameSite=Strict`, and `Path=/api/auth`.
- Never put passwords or JWTs in `localStorage`, `sessionStorage`, or browser-readable API data.
- Reuse refresh-token validation/rotation; do not add a migration unless existing session rows prove insufficient.
- Mobile and reseller authentication remain unchanged.
- Automated tests are not added or run under the current session instruction; verify syntax, lint, and production build.

## Review Focus

These are manual code-review checkpoints; automated tests are omitted under the current session instruction.

- A stale, revoked, expired, or disabled saved account must not switch successfully; `GET /api/auth/accounts` must reject and clear it. The switcher must reload that list after a failed switch so a delayed error response cannot erase a cookie rotated by a concurrent successful switch.
- Refresh rotation must update the matching saved refresh cookie; Task 1 must keep the active and saved session usable.
- Switching away from an unremembered account must revoke its old session; Task 1 must revoke the source before replacing its active cookies.
- Removing the active account must clear its active cookies and return the browser to `/login`; Task 3 must handle the response and navigation.
- The ninth account must still be able to log in, but not be saved; Task 1 returns `account_saved: false` and Task 3 explains the 8-account limit.

---

### Task 1: Backend saved-session lifecycle

**Files:**
- Modify: `backend/src/auth.js`
- Modify: `backend/src/app.js`
- Modify: `backend/test/auth-sessions.test.js` (update existing web-response assertions to read the cookie contract; add no tests)
- Modify: `backend/test/login-pin.test.js` (update the existing web-response assertion; add no tests)

**Interfaces:**
- Login accepts optional `remember_account: boolean`; successful web responses preserve existing non-token fields and add `data.account_saved: boolean`. Ordinary web login and refresh responses omit `accessToken`; the `?mobile=1` login response remains unchanged for mobile.
- `GET /api/auth/accounts` returns `{ active, active_saved, accounts }`, where each account is `{ id, name, username, email, role, branch_id }` and contains no token.
- `active_saved` means the active user's ID has a valid saved session. A first remembered login or `remember` action creates an additional refresh token in the authenticated active session family and writes only the `pos_saved_<userId>` cookie; it never replaces active web cookies. A valid existing saved cookie for the same user is reused.
- `POST /api/auth/accounts/remember` saves the current account session.
- `POST /api/auth/accounts/switch` accepts `{ user_id }` and returns the selected safe user object after server validation and refresh rotation.
- `DELETE /api/auth/accounts/:userId` removes only the matching `pos_saved_<userId>` cookie/session after confirming the token's user ID; removing the active account also clears active cookies.
- `POST /api/auth/logout` retains current default revocation behavior; `preserve_saved: true` clears active cookies while retaining a valid saved session, and `remove_saved: true` revokes and removes it.

- [ ] **Step 1: Add saved-cookie helpers** in `backend/src/auth.js`. Name cookies `pos_saved_<userId>`; scope them to `/api/auth` and match the current refresh-cookie security flags and lifetime.
- [ ] **Step 2: Add the authenticated account handlers** with the interfaces above. Validate that each saved refresh token belongs to its cookie user ID and to a live `refresh_tokens` row; cap saves at 8. A full list must not fail login.
- [ ] **Step 3: Wire lifecycle behavior** into both login methods, `refresh`, `logout`, and the new routes in `backend/src/app.js`. Keep a saved cookie in sync after `rotateRefresh()` when it shares the active session family; create or reuse the saved refresh token within that family on opt-in without replacing active cookies; preserve a remembered source session during switch and revoke an unremembered source session.
- [ ] **Step 4: Check backend syntax and lint.**

Run from `backend/`:

```bash
node --check src/auth.js
node --check src/app.js
npm run lint
```

Expected: all commands exit 0.

### Task 2: Login session detection and opt-in

**Files:**
- Modify: `frontend/app/login/page.js`
- Modify: `frontend/app/components/AppStateProvider.js`

**Interfaces:**
- A valid `/api/auth/me` response routes owner/gudang to `/dashboard` and other roles to `/pos`.
- The login form sends `remember_account` for password and PIN login; the checkbox defaults to `false`.
- Login/session and account API fetches use `credentials: 'include'` so browser cookies reach the API in same-origin production and cross-origin local development.

- [ ] **Step 1: Check the current session before showing the login form.** Keep the form available after a 401 or network failure; redirect only when `/auth/me` confirms a user.
- [ ] **Step 2: Add the opt-in checkbox and submit its value** to both login modes. If the server reports `account_saved: false` because the account limit is reached, show a clear message without blocking login.
- [ ] **Step 3: Stop clearing the provider session on `/login`** while preserving its existing public-root behavior.
- [ ] **Step 4: Run frontend lint.**

Run from `frontend/`:

```bash
npm run lint
```

Expected: exit 0.

### Task 3: Account switcher UI and logout choices

**Files:**
- Create: `frontend/app/account-switcher/page.js`
- Modify: `frontend/app/components/AppShell.js`
- Modify: `frontend/middleware.js`

**Interfaces:**
- Page uses `GET /api/auth/accounts`, `POST /api/auth/accounts/switch`, `POST /api/auth/accounts/remember`, and `DELETE /api/auth/accounts/:userId`.
- Successful switch reloads to the selected role's home (`/dashboard` for owner/gudang; `/pos` otherwise).
- Adding an account offers **Simpan & lanjut**, **Lanjut tanpa menyimpan**, and **Batal** when the active account is not saved.

- [ ] **Step 1: Add the `/account-switcher` staff route** to `middleware.js` and add **Ganti Akun** to standard and warehouse navigation in `AppShell.js`.
- [ ] **Step 2: Build the switcher page** to show the active account and up to 8 saved accounts, switch accounts, remove saved accounts with confirmation, and add another account through the approved three-choice flow. Removing the active account routes to `/login` after the backend clears its active cookies.
- [ ] **Step 3: Replace immediate sidebar logout with the approved two-choice dialog.** Map **Keluar saja** to preserve a remembered session and **Keluar & hapus akun ini** to remove it; keep the unsaved-work warning before either action.
- [ ] **Step 4: Run frontend lint and production build.**

Run from `frontend/`:

```bash
npm run lint
npm run build
```

Expected: both commands exit 0.

### Task 4: Document the web auth contract

**Files:**
- Modify: `docs/agents/backend.md`
- Modify: `docs/agents/web-deploy.md`

- [ ] **Step 1: Document saved-account cookies and auth endpoints** in `docs/agents/backend.md`, including the 8-account cap and revoke/preserve logout behavior.
- [ ] **Step 2: Document the login redirect and Ganti Akun page** in `docs/agents/web-deploy.md`.
- [ ] **Step 3: Run `git diff --check`** and confirm no token storage in browser-readable storage.

Expected: `git diff --check` exits 0; source review finds no password/JWT writes to `localStorage` or `sessionStorage`.
