# Vabani Bricks — Business Management System

Production, stock, billing, customer credit, payments and staff control for a brick
manufacturing and supply business. Next.js (App Router) + Supabase (Postgres, Auth, RLS).

> **Design rule:** the browser never decides anything that matters. Prices, totals, tax,
> stock, credit limits, invoice numbers and balances are computed inside PostgreSQL
> functions that lock the rows they touch. Staff cannot write to any table directly;
> every write goes through a vetted function that checks their role and logs an audit row.

---

## 1. What's included

| Area | Where |
|---|---|
| Database schema, constraints, indexes | `supabase/migrations/…01_schema.sql` |
| Atomic business functions + integrity triggers | `supabase/migrations/…02_functions.sql` |
| Dashboard & report functions | `supabase/migrations/…03_reports.sql` |
| RLS policies, grants, storage bucket | `supabase/migrations/…04_security.sql` |
| IST business timezone | `supabase/migrations/…05_timezone.sql` |
| Starter brick categories (zero stock) | `supabase/seed.sql` |
| Server actions (all mutations) | `src/actions/*` |
| Admin pages | `src/app/admin/*` |
| Staff pages | `src/app/staff/*` |
| PDFs (A4 invoice, thermal receipt, payment receipt, statement, reports) | `src/lib/pdf/documents.tsx`, `src/app/api/pdf/*` |
| Report definitions (screen = CSV = PDF) | `src/lib/reports.ts`, `src/app/api/reports/export` |
| PWA (manifest, service worker, offline page, icons) | `public/*`, `src/app/pwa-icon` |
| Database acceptance tests | `tests/db.acceptance.test.mjs` |
| PDF rendering tests | `tests/pdf/pdf.smoke.test.tsx` |

### Pages
- **Auth:** `/login`, `/forgot-password`, `/reset-password`
- **Admin:** `/admin/dashboard`, `/admin/inventory`, `/admin/inventory/production`,
  `/admin/inventory/stock-history` (ledger + approvals), `/admin/invoices` (+ `/new`, `/[id]`),
  `/admin/customers` (+ `/[id]`), `/admin/accounts`, `/admin/payments`, `/admin/reports`,
  `/admin/staff`, `/admin/audit-logs`, `/admin/notifications`, `/admin/settings`
- **Staff:** `/staff/dashboard`, `/staff/new-invoice`, `/staff/customers` (+ `/[id]`),
  `/staff/invoices` (+ `/[id]`), `/staff/payments`, `/staff/profile`

---

## 2. Setup (about 15 minutes)

**Requirements:** Node.js 20.19+ (22 recommended), a Supabase project, a Vercel account.

### 2.1 Create the Supabase project
1. Create a project at supabase.com (region: Mumbai `ap-south-1` for lowest latency in India).
2. **Authentication → Providers → Email:** keep Email enabled, **turn OFF "Allow new users to sign up"**.
   Staff logins are created by the owner inside the app.
3. **Authentication → URL Configuration:** set Site URL to your app URL and add
   `https://YOUR-APP/auth/callback` to Redirect URLs (needed for password reset).

### 2.2 Apply the database
Using the Supabase CLI (recommended):
```bash
npm install
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```
Then run `supabase/seed.sql` once in **SQL Editor** if you want the three starter brick categories.

Without the CLI: open **SQL Editor** and run the five files in `supabase/migrations/` **in filename order**, then `seed.sql`.

### 2.3 Create the owner (admin) login
1. **Authentication → Users → Add user** → enter the owner's email + a strong password, tick "Auto confirm".
2. In **SQL Editor** run:
   ```sql
   select public.bootstrap_admin('owner@yourbusiness.com');
   ```
   This function can only be run from the SQL editor (it is not exposed to the API).

### 2.4 Environment variables
Copy `.env.example` to `.env.local` and fill in (Supabase → Project Settings → API):

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** — used solely to create/disable staff logins. Never prefix with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SITE_URL` | e.g. `https://vabani-bricks.vercel.app` |

### 2.5 Run locally
```bash
npm run dev
```
Open http://localhost:3000, sign in as the owner, then:
1. **Settings** → business address, phone, (optional) GSTIN, logo, UPI ID.
2. **Inventory** → review brick categories and prices; record opening stock / production.
3. **Staff** → *Add staff* to create a login for each employee.
4. **Customers** → set credit limits and opening balances for regular credit customers.

---

## 3. Deploy to Vercel
1. Push this folder to a GitHub repository.
2. In Vercel: **New Project → Import** the repo (framework auto-detected as Next.js).
3. Add the four environment variables from 2.4 (Production + Preview). Mark `SUPABASE_SERVICE_ROLE_KEY` as *Sensitive*.
4. Deploy. Then update Supabase Auth Site URL / Redirect URLs to the Vercel domain.
5. On phones: open the site in Chrome → menu → **Install app** (Android) or Safari → Share → **Add to Home Screen** (iPhone).

---

## 4. How the controls work

### Stock
- `inventory.quantity_available` changes **only** inside `_apply_stock()` / `_dispatch()`, always together with an immutable `stock_movements` row (source, reason, who, when).
- **Finalizing** an invoice *reserves* stock under a row lock (`quantity_reserved`); **dispatching** deducts it. Check constraints make `available ≥ reserved ≥ 0`, so overselling and negative stock are impossible even with simultaneous sales.
- A unique index on `(source_type, source_id, product, movement_type)` makes double deduction impossible: an invoice can be dispatched once, a cancellation can return stock once.
- Damage and physical-count adjustments are two-step (request → approve), both audit-logged.
- **Reports → Stock Availability** recomputes stock from the full movement ledger and flags any mismatch.

### Invoices
- Numbers are gapless and sequential per financial year (`VB/2026-27/000123`), assigned only at finalization inside the same transaction.
- A trigger blocks any change to a finalized invoice's commercial fields or items, and blocks deleting it — for everyone, including direct SQL.
- Corrections: **request cancellation (reason required) → owner approves → original stays in history marked CANCELLED**, its amount is credited back on the ledger, dispatched bricks are returned to stock, and a prefilled **replacement invoice** can be issued.
- Staff cannot change prices (catalogue price is always used), cannot exceed their discount limit, cannot backdate more than one day, and cannot bill beyond a customer's credit limit (configurable).

### Money
- `customer_ledger` is an immutable debit/credit journal; every balance in the app is computed from it.
- Payments get unique receipt numbers, are never edited or deleted, and record who received them. Mistakes are fixed with an owner-only **reversal** that keeps the original.
- Payments auto-allocate to the oldest unpaid invoices, or can be allocated manually; any extra is held as customer advance.
- Statements are generated by a read-only function, so printing a statement never creates transactions.

### Idempotency & offline
- Every invoice and payment submission carries an idempotency key (unique column). A double tap, retry or flaky network returns the same record instead of a duplicate.
- Offline, the billing screen saves drafts on the device (per user). They sync to the server **as drafts only**; finalizing always requires a live server confirmation.

### Audit & alerts
- `audit_logs` is append-only (update/delete/truncate blocked by triggers) and records user, role, action, entity, old/new values, reason, IP and device.
- Actions the database refuses (price override, excess discount, credit limit breach, deleting an invoice, etc.) are logged as security events and notify the owner.
- Notifications: new invoices (with pending dispatch), payments, low stock, stock adjustments, cancellation requests, cancelled invoices, large credit sales, credit limit exceeded, unusual staff activity (e.g. 3+ cancellation requests in a day).

### Access control (three layers)
1. **Route guards** in the admin/staff layouts (UX only).
2. **Server actions** validate input with Zod and run with the user's session, never the service role.
3. **Database**: RLS on every table (SELECT only, filtered by role/ownership), all INSERT/UPDATE/DELETE privileges revoked from API roles, and role checks inside every SECURITY DEFINER function. Calling the Supabase REST API directly with a staff token cannot write anything.

---

## 5. Tests
```bash
npm test          # both suites
npm run test:db   # runs the real migrations in an in-process Postgres (PGlite) + acceptance scenarios
npm run test:pdf  # renders every PDF template
npm run typecheck
```

| Spec acceptance test | Covered by |
|---|---|
| 1 Admin adds 10,000 bricks → dashboard shows 10,000 | `test:db` #1 |
| 2 Finalize + dispatch 2,000 → stock 8,000 | `test:db` "2/4/5" (no double deduction on re-dispatch) |
| 3 Staff modifies stock → rejected | `test:db` #3 (RPC, table write and internal function all refused) |
| 4 ₹20,000 credit sale → outstanding ₹20,000 | `test:db` "2/4/5" |
| 5 Pays ₹8,000 → outstanding ₹12,000 | `test:db` "2/4/5" |
| 6 Staff deletes invoice → fails | `test:db` #6 (also blocked for the DB owner) |
| 7 Cancel with reason; history kept; stock reversed | `test:db` "7/13" |
| 8 Weekly statement closing balance | `test:db` #8 (and statement is read-only) |
| 9 Last stock sold twice → prevented | `test:db` #9 (sequential). The concurrent case relies on `SELECT … FOR UPDATE` row locks + check constraints; PGlite is single-connection so true parallelism is best verified on a staging Supabase project. |
| 10 Employee behind each transaction | `test:db` "10/12" |
| 11 Duplicate submissions | `test:db` #11 |
| 12 RLS blocks unauthorized access | `test:db` "10/12" + "inactive users" |
| 13 Balances after partial payments and reversals | `test:db` "7/13" |
| 14 Monthly report = underlying data | `test:db` #14 (+ ledger vs inventory check) |

---

## 6. Operational notes
- **Timezone:** business dates are IST (`Asia/Kolkata`) in both the database and the app.
- **Tax:** off by default. Enable in Settings only if registered; GSTIN is required before enabling GST.
- **Profit:** Reports › Profit & Loss shows *estimated gross profit* = net sales − (quantity sold × product cost price). Set cost prices in Inventory for accuracy. Overheads are not included. Revenue is never shown as profit.
- **Backups:** enable Supabase Point-in-Time Recovery (Pro plan) or schedule `pg_dump`.
- **Deactivating staff** immediately blocks database access (profile inactive) and bans the Auth user (no new sessions).
- **Regenerating DB types** (optional): `npm run db:types`.
