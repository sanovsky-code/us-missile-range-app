# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

A **local-first, Hebrew-RTL Next.js 16 web app** for managing missile / launch / test-range / radar metadata. Runs on `http://127.0.0.1:3000` against a **SQLite file at `data/app.db`** (better-sqlite3, synchronous). It is shipped to end users as a **self-contained ~50 MB zip** (`npm run build:dist`) — extract, double-click `start.bat`, no Node install needed.

Three distinct **persistence flows** coexist and must not be confused:

1. **Canonical bulk reload** — `npm run db:import` rebuilds `data/app.db` from `data/us_missile_range_data.xlsx`. Used once at install and whenever the upstream Excel is reissued.
2. **Controlled selective import** — operator hands over a partial `.xlsx` of edits, either via the CLI (`npm run import:excel`) or the `/import` wizard. Diffs row-by-row, surfaces source conflicts, runs inside one transaction with a backup taken first.
3. **In-app CRUD** — Salesforce-style timeline (comments / tasks), favorites, user-managed contacts. Operator edits via the UI, audit columns track who-and-when.

All three write through the same data-store layer and never bypass the audit/backup mechanics.

## Common commands

```sh
npm run dev                       # next dev (turbopack) on 127.0.0.1:3000
npm run build                     # production build into .next/
npm start                         # run the production build
npm run lint                      # eslint

npm run db:init                   # create data/app.db with empty schema (runs migrations)
npm run db:import                 # bulk-load data/us_missile_range_data.xlsx into data/app.db

# Controlled selective import (CLI mirror of the /import wizard):
npm run import:excel -- --file ./imports/update.xlsx --mode preview
npm run import:excel -- --file ./imports/update.xlsx --mode apply --by "alice"

# Build the shippable zip (dist/LapamRangesApp.zip, ~50 MB):
npm run build:dist
```

There is **no test runner configured**. Verification in this codebase is "boot the dev server and probe via curl / browser." When changing schema or import logic, run `npm run db:init` to reset, then exercise the affected endpoint.

## Where things live

| Layer | File | Purpose |
|---|---|---|
| Schema + connection | `src/lib/db.ts` | `SCHEMA_SQL` template literal, `getDb()` singleton, idempotent migrations keyed in `app_meta` |
| Read/write queries | `src/lib/data-store.ts` | Every query the app makes (sites, radars, timeline, favorites, etc.) |
| Controlled import | `src/lib/excel-import.ts` | Parse → scan/diff → source-conflict resolve → preview → transactional apply, with `audit_log` + `import_batches` |
| UI primitives | `src/components/ui/` | Just `Badge` and `CitedText` — the codebase uses Tailwind classes directly, not a component library |
| Feature components | `src/components/{import,favorites,management,map,site-profile,layout}/` | Grouped by feature, not by element type |
| App router pages | `src/app/{map,site/[siteId],management,favorites,import,about}/` | Server components by default; client components marked `"use client"` |
| API routes | `src/app/api/**/route.ts` | Next 16 route handlers (params come as `Promise<{...}>`) |

## Architecture: the three concentric persistence layers

This is the conceptual model. Mixing them up has caused real bugs in this repo's history.

### Layer 1 — Static reference data (imported from Excel)

`sites`, `radars`, `site_range_activities` (operational/test/launch activities — formerly `activities`), `sources`, `contacts`. Loaded from `data/us_missile_range_data.xlsx` via `db:import` or the controlled-import flows. **Never `DELETE FROM sites`** — sites are UPSERTed with `INSERT … ON CONFLICT(site_id) DO UPDATE` to avoid cascading deletes through FKs into Layer 3.

### Layer 2 — Operational ingest audit

`audit_log`, `import_batches`, `import_validation_errors`, `import_source_conflicts`. Every controlled-import run records the batch, every changed field, every validation issue, every source-conflict resolution. Read-only metadata, never modified by hand.

### Layer 3 — User-managed records

`site_timeline_activities` (Salesforce-style Comments / Tasks / Task Updates — formerly `site_activities`), `site_contacts`, `site_favorites`. These are operator-created and **must survive any import**. Their FK to `sites.site_id` is the reason Layer 1 has to UPSERT instead of replace.

**Two table renames live in the migration history** and may still confuse new readers:

- `site_activities` → `site_timeline_activities` (Layer 3, user timeline)
- `activities` → `site_range_activities` (Layer 1, operational data from Excel)

If you see the old names in a customer DB, the migration in `db.ts` (`migrateRenameActivityTables`, keyed `tables_rename_v2` in `app_meta`) copies their rows into the new tables on first boot and drops the legacy tables.

## The controlled-import wizard (`/import`) in 60 seconds

Five steps. Each calls one API route under `src/app/api/import/`:

1. **Upload** → `POST /api/import/parse` returns parsed sheet contents (no DB write).
2. **Scan + select** → `POST /api/import/scan` walks all four entity sheets, drops `NoChange` rows, groups changes by site, and returns a tree. The UI shows a Salesforce-style per-site card with tristate parent checkboxes; **only ticked rows are imported.**
3. **Source conflicts** → `POST /api/import/multi-source-conflicts` collects every `source_id` referenced by the selected rows. Each is auto-classified into `REUSE_EXISTING` / `CREATE_NEW` / `CONFLICT_REQUIRES_USER_DECISION`. The operator picks a resolution for the last group; default is **`CREATE_NEW`** (silent overwrites of an existing source are never allowed).
4. **Preview** → `POST /api/import/multi-preview` returns the field-level diff. No DB write.
5. **Apply** → `POST /api/import/multi-apply` takes a backup of `data/app.db` to `backups/`, then runs the import inside one SQLite transaction, with new sites inserted **before** their children so FK constraints hold. Writes `audit_log` rows tagged with the batch id.

The single-type endpoints (`/api/import/preview`, `/api/import/apply`, `/api/import/source-conflicts`) still exist for the CLI flow but the wizard uses the `multi-*` variants.

## Conventions

- **Hebrew RTL** is the default. UI containers use `dir="rtl"`. English content (site IDs, URLs, English-language site names) gets `dir="ltr"` inline. Date inputs use `<input type="date">` + a `normalizeDateForInput()` helper.
- **better-sqlite3 is synchronous.** Methods on `DataStore` are not `async`. The `ensureLoaded()` shim is the only exception, kept for API compatibility with the old in-memory store.
- **Audit columns** (`created_by`, `updated_by`, `changed_by`) are populated from `changedBy` parameters that propagate from CLI flags or future API session. They are nullable but should always be filled by import flows.
- **Schema is inline in `src/lib/db.ts`** as a JS template literal. **Do not put backticks inside SQL comments** — they break the template literal. Every existing comment in `SCHEMA_SQL` avoids backticks for this reason.
- **`serverExternalPackages`**: `better-sqlite3` is on Next.js's default list, so no manual entry is needed. But its native `.node` binary must be pinned into the standalone trace via `outputFileTracingIncludes` in `next.config.ts` — `@vercel/nft` won't catch it otherwise.

## Distribution build (`build:dist`) — what to know before touching it

`scripts/build-distribution.ps1` produces `dist/LapamRangesApp.zip` containing a Next.js standalone server, a pre-loaded `data/app.db`, and a bundled portable Node.js.

**The hard constraint**: `better-sqlite3`'s native binary is compiled against the developer's `npm install` Node ABI (`NODE_MODULE_VERSION`). The bundled portable Node **must** be the same major version, or the dist crashes on launch with a `NODE_MODULE_VERSION` mismatch. The script has an early-fail guard (`devMajor` vs `bundleMajor`). If you bump Node on the dev machine, update `$NodeVersion` at the top of the script.

The dist's `start.bat` does no `npm install` and no rebuild — it sets `PATH` to the bundled `node-portable\` and runs `server.js` directly. Operators see only a terminal window and the auto-opened browser.

## Gotchas a future reader will hit

- **Renaming a table in `SCHEMA_SQL` alone won't migrate existing customer DBs.** Pair the schema edit with an idempotent migration in `db.ts` keyed via `app_meta`.
- **Don't `DELETE FROM sites`** anywhere — write tests run, then a real DB loses user comments and tasks. Always UPSERT.
- **The `/import` wizard's "new site" path** requires `ctx.existingSiteIds` to be augmented with sites the Sites sheet will create, before running the radar/activity/contact handlers. Otherwise their FK check rejects the brand-new site. See `scanForChanges()` in `excel-import.ts`.
- **Next 16 route handlers**: `params` is a `Promise<{...}>` — always `await` it. Existing routes already follow this pattern; copy from a recent one.
- **TypeScript `??` and `||` cannot be mixed without parens** under the project's strict config. Use `((a ?? b) || c)` not `a ?? b || c`.
- **AGENTS.md applies**: Next.js 16 has breaking changes from earlier versions. When uncertain about a Next.js config option, read the relevant file under `node_modules/next/dist/docs/` before guessing.
- **Windows + OneDrive + Turbopack = unrecoverable jest-worker crashes**: dev shows `Jest worker encountered 2 child process exceptions, exceeding retry limit` on routes that worked moments earlier. Root cause: Turbopack uses jest-worker subprocess pools for parallel compilation; on Windows those subprocesses fail to spawn with `0xc0000142` (DLL initialization failed) when OneDrive holds transient sync locks on files in `.next/` OR `node_modules/`. After two failures Turbopack wedges the dev cache. **Fix: `dev` script uses `next dev --webpack` instead of Turbopack** (`--webpack` is a supported Next.js 16 flag — see `next dev --help`). Webpack doesn't use jest-worker the same way and tolerates OneDrive's file locks. Cost: ~5-10s initial compile per route vs ~1s for Turbopack; HMR is still snappy. Production builds (`next build`) still use the default toolchain and are unaffected. `scripts/setup-dev-cache.ps1` exists as a partial mitigation (junctions `.next` to `%LOCALAPPDATA%`) but isn't sufficient on its own because `node_modules` stays inside OneDrive — the webpack flag is the real fix.
