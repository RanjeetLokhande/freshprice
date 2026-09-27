# Fresh Price

Daily fruit & vegetable prices, quantities and cost calculation. A mobile-first, installable web app (PWA) built with Next.js 15 and Supabase.

Two rules drive the design:

- **Prices are dated.** A price is never overwritten across days, and every edit to a day's price is kept as a revision.
- **Saved calculations snapshot the price they used.** A later price change never alters history.

## Setup

1. Create a Supabase project. In **SQL Editor**, run [`supabase/setup-all.sql`](supabase/setup-all.sql) once. It contains all migrations in one transaction.
2. Configure and start the app:
   ```bash
   npm install
   cp .env.example .env.local   # Supabase URL + publishable key (Project Settings → API Keys)
   npm run dev
   ```
3. Open http://localhost:3000 and create an account. **The first account becomes Admin**, and later sign-ups get the `user` role (change it under More → Users & roles).

To upgrade an existing project, run only the migration files you haven't run yet, in order, from `supabase/migrations/`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (type-checks too). Run it with `NEXT_DIST_DIR=.next-build` to avoid disturbing a running dev server |
| `npm test` | Unit tests, plus database tests that run **every migration on a real Postgres engine (PGlite)** |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |

## Architecture

```
supabase/migrations/   schema, RLS, triggers, SQL functions (batch price save, calculation save/finalize/cancel, reports)
supabase/tests/        database tests (PGlite + stubs for Supabase auth)
src/domain/            pure calculation engine: units & conversions, money/rounding, business date — shared by browser and server
src/shared/            types + Zod schemas shared by client and server (API envelope, master registry, prices, calculations)
src/server/            withApi() (auth → rate limit → permission → validation → envelope), services per area, CSV/XLSX export
src/client/            fetch wrapper (envelope, abort, idempotency keys, downloads) + TanStack Query hooks
src/components/        mobile-first UI: app shell, bottom sheets, generic master screens, calculation editor
```

- **Master-driven.** Categories, units, conversions, items, custom fields, settings and roles/permissions are all data. One registry ([`src/shared/masters.ts`](src/shared/masters.ts)) drives the API, validation and admin screens.
- **API responses.** Every endpoint returns `{ success, data | code+message+errors, meta?, requestId }`. Batch endpoints return a result for each row.
- **Enforced by the database, not just the UI:**
  - One price per item, date and unit, with revisions.
  - Finalized calculations are frozen; they can only be cancelled (with permission and a reason).
  - Prices are re-verified when a calculation is saved and when it is finalized.
  - Save is idempotent.
  - There is always at least one active admin.
  - Row-level security on every table.
- **Security:**
  - Content security policy, HSTS, frame blocking, no server fingerprint header.
  - Per-user rate limits (writes 120/min, exports 20/min; in-memory, so use a shared store if you run several instances).
  - Spreadsheet-formula neutralisation in exports.
  - No secrets in code.
- **PWA.** Installable, with generated icons. The service worker caches static assets only and **never** API data, and shows an offline page when there is no connection.
