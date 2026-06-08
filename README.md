# U.S. Defense Range Map (Local App)

A local web application that displays U.S. and global missile, launch, test range, radar, and aerospace defense sites on an interactive map.

The app runs **locally on your computer** at `http://127.0.0.1:3000`. All data lives inside this folder — there is no server you need to access, no internet account, and nothing to install on a database server.

## Quick start (Windows)

1. Make sure **Node.js 20 or newer** is installed (https://nodejs.org).
2. Double-click `start.bat`.
3. The first run installs dependencies, builds the database from the bundled Excel file, and opens your browser at `http://127.0.0.1:3000`. Subsequent runs are faster.

If your browser does not open automatically, navigate to `http://127.0.0.1:3000` manually.

To stop the app, close the terminal window.

## How the app stores data

```
data/
  app.db                          ← SQLite database (the live data)
  us_missile_range_data.xlsx      ← Original Excel source (kept as an archive / import file)

files/
  documents/                      ← Uploaded PDFs / documents
  images/                         ← Site photos
  exports/                        ← Generated reports

backups/
  app.db.<timestamp>              ← Automatic snapshots before each Excel re-import
```

- **SQLite** (`data/app.db`) is the only thing the running app reads from and writes to.
- The original **Excel file** is preserved untouched.
- **Files you upload** (e.g. document attachments) live under `/files/<type>/...`. Only their metadata + a relative path is stored in SQLite — so the project folder remains portable.
- **Backups** are written automatically before any destructive operation (like re-importing the Excel file).

You do **not** need to open `app.db` directly. It is read by the application behind the scenes.

## מועדפים — Favorites

Mark a Site as a favorite to access it from the dedicated **"מועדפים"** tab in the navbar.

### Marking / unmarking

- **From the site detail page** — click the star button to the right of the title. The label toggles between **"הוסף למועדפים"** and **"הסר ממועדפים"**.
- **From the map popup** — click the small ★ next to the site name in any marker popup.
- The star is filled (yellow) when the site is a favorite and an outline otherwise. The UI updates immediately (optimistic) and is rolled back if the API call fails.

### The Favorites tab

The **"מועדפים"** tab shows every favorited Site in a card layout. Each card displays the site name, Site ID, country/state, short description, managing organization, radar count, open task count, last verified date, and two quick actions: **"פתח אתר"** opens the full Site profile and **"הסר ממועדפים"** removes the favorite in place. A free-text search and dropdown filters for country and state are at the top.

When the list is empty the page shows: *"אין אתרים מועדפים עדיין."* with a hint pointing at the star buttons.

### How favorites are stored

Favorites live in their own SQLite table — `site_favorites` — and reference `sites.site_id` via a foreign key. **No Site data is duplicated.** The schema is:

```
site_favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id TEXT NOT NULL UNIQUE,
  created_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  sort_order INTEGER,
  notes TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
)
```

`UNIQUE(site_id)` is what makes "add favorite" idempotent — calling it twice on the same site does nothing. Favorites persist across page refresh, browser restart, and full application restart (they are real SQLite rows).

### Why Excel import does not touch favorites

The bulk `db:import` flow and the controlled `import:excel` / wizard flow both use **`INSERT … ON CONFLICT(site_id) DO UPDATE …`** on the `sites` table. They never `DELETE FROM sites`, so the FK from `site_favorites` is never cascade-triggered and `site_favorites` rows survive every import unchanged. The favorite is user-level metadata, not data from the Excel source, and is intentionally orthogonal to the import pipeline.

The only way to lose a favorite is to explicitly click **"הסר ממועדפים"** in the UI (or `DELETE /api/favorites/<site_id>` from the API).

### API surface

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/favorites` | Joined list of every favorited Site (with radar_count, open_task_count, etc.) for the Favorites tab |
| `GET` | `/api/favorites/:siteId` | `{ is_favorite: boolean }` for a single site |
| `POST` | `/api/favorites/:siteId` | Add to favorites (idempotent). Body: `{ created_by?, notes? }` |
| `DELETE` | `/api/favorites/:siteId` | Remove from favorites (idempotent) |

`GET /api/sites` and `GET /api/sites/:siteId` also return `is_favorite` on each row, so list and map views render the filled star without an extra round-trip.

## Working with sites — Salesforce-style record page

Open the **Map** tab, click any marker, then "View Full Profile" (or use the search box in the filter sidebar). Every site page is laid out like a Salesforce record:

- **Right column** (sticky on desktop): the **ציר זמן פעילויות / Activity Timeline** — comments, tasks, and task-update history for this site, newest first.
- **Main column** (left): site metadata, map, overview, **אנשי קשר / Contacts**, operational activities, radars, sources, data-quality footer.

On narrow screens the layout collapses to a single column and the timeline stacks above the rest of the page.

## Activity Timeline (right column)

The timeline supports three activity types today:

- **Comment** — Free-text note ("Comment added"). Click "הערה חדשה" / "Comment" to add one. Comments are append-only: editing or deleting an old comment is not part of the UI flow.
- **Task** — Click "משימה חדשה" / "Task" to create one. A task has a subject, description, priority (Low / Medium / High), due date, and assignee. Default status is "Open".
- **Task Update** — Generated automatically whenever a task status changes. The original task is updated AND a new "Task Update" row is written that points back at the original task via `parent_activity_id`, so the timeline preserves the full status history (e.g. "Status changed from Open to In Progress").

When a task moves to status "Done", the application also stamps `completed_at` on the row. Re-opening a closed task clears `completed_at` and writes another Task Update row.

Use the filter chips above the timeline (`הכל / הערות / משימות / היסטוריה`) to focus on one activity type. Each task card has an inline status dropdown so you can move it through its lifecycle without leaving the timeline.

The **Management** tab in the top navigation is a cross-site work queue. By default it shows only **active tasks** (Open or In Progress) across every site, with filters for status, priority, and site. Closed tasks remain visible inside their site's timeline; they simply drop off the Management default view. Toggle "הצג גם משימות סגורות" to include them.

## Site contacts (main column)

The **אנשי קשר** card on the main column is a full CRUD view of contacts attached to the site.

- Click **הוסף איש קשר** to add a contact. Required: full name. Optional: role / organization / phone / email / notes.
- Hover any contact and click the pencil icon to **edit**, or the trash icon to **delete** (with confirmation).
- If the site has no user-added contacts and no imported public-affairs entries, the empty state reads **"אין מידע ציבורי ליצירת קשר."**
- The card also displays the read-only **"אנשי קשר ציבוריים מהמקורות"** sub-list — the Public Affairs offices imported from the Excel sources. Those entries can't be edited from the UI because they belong to the source data.

Contacts you add through the UI live in the new `site_contacts` SQLite table:

```
site_contacts (id, site_id TEXT FK, full_name, role_title, organization,
               phone, email, notes, created_at, updated_at)
```

Indexes: `site_id`, `email`. FK is `ON DELETE CASCADE`.

API endpoints:

- `GET /api/sites/:siteId/contacts` — list
- `POST /api/sites/:siteId/contacts` — create (body: `{full_name, role_title?, organization?, phone?, email?, notes?}`)
- `PATCH /api/contacts/:id` — partial update
- `DELETE /api/contacts/:id` — delete

### How to test contacts

1. Open a site profile.
2. Click **הוסף איש קשר**, fill the form, click **שמירה**. The new card appears in the list.
3. Refresh the browser — the contact is still there (it's in `site_contacts`).
4. Click the pencil icon on the card, change a field, click **שמירה**. The card updates and `updated_at` is stamped.
5. Click the trash icon → confirm. The card is removed.
6. If a site has imported public contacts (e.g. White Sands Missile Range), they appear under the **"אנשי קשר ציבוריים מהמקורות"** subheading below your editable contacts. Try adding a custom contact and verify both lists are visible.

### SQLite tables that back the timeline

- `site_timeline_activities` — Unified table for every Salesforce-style timeline activity. Columns: `id`, `site_id` (TEXT FK to `sites.site_id`), `activity_type`, `subject`, `body`, `status`, `priority`, `due_date`, `assigned_to`, `created_by`, `created_at`, `updated_at`, `completed_at`, `parent_activity_id` (self-FK to the parent Task for Task Update history rows). Indexed on `site_id`, `activity_type`, `status`, `due_date`, `parent_activity_id`, and `created_at`.
- The older `site_comments`, `site_tasks`, and `site_activities` tables remain in the schema for backwards compatibility. They are no longer written to. On first boot of an old customer database, one-shot migrations copy the rows into `site_timeline_activities` (and drop the legacy tables) and record `activities_migration_v1` and `tables_rename_v2` in `app_meta` so they do not run twice.

> **Do not confuse `site_timeline_activities` with `site_range_activities`.**
> `site_timeline_activities` holds the *user-facing* Salesforce timeline (Comment / Task / Task Update). `site_range_activities` holds the *operational/domain* activities imported from the Excel `Site_Activities` sheet — missile tests, space launches, historical activity windows, etc. They are intentionally separate tables.

## Re-importing the Excel file

If you receive an updated `us_missile_range_data.xlsx`:

1. Stop the app (close the terminal window).
2. Replace `data/us_missile_range_data.xlsx` with the new version.
3. Run:
   ```
   npm run db:import
   ```
4. Start the app again with `start.bat`.

The import script automatically backs up the current `data/app.db` into `/backups/` before any writes.

**Re-imports never erase your comments, tasks, or contacts.** The script upserts the imported reference data (sites, radars, operational activities, sources, imported public contacts) without ever issuing a `DELETE FROM sites`, so the user-data tables (`site_timeline_activities`, `site_contacts`, etc.) that reference `sites.site_id` are not cascade-deleted. If you really want a clean reload, stop the app, delete `data/app.db`, and run `npm run db:import` again — the fresh database is rebuilt from scratch.

## ייבוא נתונים — The Import wizard (UI)

For day-to-day updates the easiest way to push a partial spreadsheet into SQLite is the **"ייבוא נתונים"** tab in the navbar. It is a six-step wizard that lets the operator tick the exact records to import and inspect every change before any database write happens. Internally it talks to the same engine as the `import:excel` CLI documented below.

### Flow

The wizard scans the workbook against SQLite and shows **only the actual changes**, grouped by Site. Unchanged rows are filtered out — the operator never has to scroll past 180 untouched rows looking for the 5 real edits.

| # | Hebrew label | What happens |
|---|---|---|
| 1 | בחירת קובץ אקסל | Upload an `.xlsx`. `POST /api/import/parse` validates required sheets / columns, then `POST /api/import/scan` walks all four sheets and returns the per-site change tree. No DB write. |
| 2 | בחירת רשומות לעדכון | The site-tree view. Each Site is a card; expanding it shows nested sub-sections for its modified Radars, Site Range Activities, and Contacts. Filter chips at the top hide whole entity types; free-text search matches site_name/site_id/entity id. Parent checkbox is a tri-state that toggles the whole site; children have their own checkboxes for surgical control. **New sites in the Excel that don't exist in the DB** appear at the top in yellow with an "אתר חדש — ייווצר" badge — tick to create. |
| 3 | מקורות מידע | `POST /api/import/multi-source-conflicts` finds every `source_id` referenced by the selected entity rows (and by `SRC-…` ids inside `citations`). Each one is auto-classified into **create**, **reuse**, or **conflict**. Conflicts are listed with both the SQLite values and the Excel values side by side; the operator picks a resolution per row (default = create new). |
| 4 | תצוגה מקדימה | `POST /api/import/multi-preview` returns the full diff — per-type Create/Update/Skip totals, every field change, the source-action plan. No DB writes. |
| 5 | סיכום ייבוא | `POST /api/import/multi-apply` performs the actual write inside one transaction, with a `data/app.db` backup taken **before** the transaction opens. New sites are inserted first so radars/activities/contacts under them satisfy the FK. Returns the final summary with the backup path. |

### Which fields the wizard imports

Same rules as the CLI flow below: empty cells preserve the existing SQLite value, `__CLEAR__` clears a field, and the protected Site identity fields (`site_name`, `latitude`, `longitude`, `country`, `state`) require the operator to explicitly opt in. The wizard only shows safe Site fields by default.

### How Sources are handled

The wizard never imports the whole `Sources` sheet. It only looks at the `source_id` values referenced by the selected entity rows (and, for Sites/Radars, any `SRC-…` ids inside `citations`). For each referenced source_id:

| Case | Existing SQLite row | Excel `source_title` / `source_url` | Result |
|---|---|---|---|
| A | does **not** exist | (any) | **CREATE_NEW** — insert under the original id |
| B | exists | both match (trimmed) | **REUSE_EXISTING** — no DB change |
| C | exists | title or url differs | **CONFLICT** — the wizard surfaces it for resolution |

**Default conflict resolution: "צור מקור חדש"** — the Excel row is inserted under a freshly generated SRC-XXXX, and every selected entity row that referenced the original id is rewritten to point at the new one. The pre-existing SQLite source stays untouched. This is intentional — silent overwrites of Sources are never allowed.

The operator may instead pick **"השתמש במקור הקיים"** to keep the SQLite row exactly as-is (the entity rows keep referencing the original id, no Source write happens). An advanced toggle exposes **"עדכן מקור קיים"**, which requires a second confirmation; this is the only path that writes new title/url values onto an existing source_id.

Every conflict — and its resolution — is recorded in `import_source_conflicts` for the batch.

### Backup, transaction, and audit

When "הפעל ייבוא" is clicked:

1. `data/app.db` is copied to `backups/app_<YYYYMMDDHHMMSS>.db`. The path is stamped into `import_batches.backup_path` (preserved even on failure).
2. A single SQLite transaction wraps:
   - Source actions (`CREATE_NEW` and any explicit `UPDATE_EXISTING`),
   - Persisting `import_source_conflicts` rows,
   - Applying the entity-row diffs (sites / radars / site_range_activities / contacts).
3. If anything throws, the transaction rolls back. The backup is **not** deleted. The import batch is marked `status='Failed'` and a message is shown.
4. One `audit_log` row is written per changed field (`Create`, `Update`, `Clear`), all tagged with the same `import_batch_id`.

### Reviewing import history

```
sqlite3 data/app.db "SELECT id, import_type, status, selected_records_count,
                            created_count, updated_count, skipped_count,
                            source_created_count, source_reused_count,
                            source_conflict_count, backup_path
                     FROM import_batches ORDER BY started_at DESC LIMIT 10;"

sqlite3 data/app.db "SELECT * FROM import_source_conflicts
                     WHERE import_batch_id = '<batch_id>' ORDER BY id;"
```

For per-field history of a record:

```
sqlite3 data/app.db "SELECT action, field_name, old_value, new_value, changed_by, changed_at
                     FROM audit_log
                     WHERE entity_type = 'Site' AND entity_id = 'SITE-0043'
                     ORDER BY id DESC LIMIT 50;"
```

### Reverting a bad apply

Stop the app, then copy the recorded backup back into place:

```
copy backups\app_<YYYYMMDDHHMMSS>.db data\app.db
```

The backup path for any batch is in `import_batches.backup_path`.

## Controlled Excel update / import (`import:excel`)

The `db:import` flow above replaces the **entire** reference dataset from one canonical Excel. For incremental, audited updates — a stakeholder hands you a small spreadsheet that touches a few sites, a few radars, a couple of new operational activities — use the controlled-import pipeline instead. Most operators prefer the **"ייבוא נתונים"** wizard described above; the CLI exists for scripted/automated workflows.

### Why two flows?

| Use case | Use |
|---|---|
| First-time bulk load, or full replacement of reference data | `npm run db:import` |
| Partial update of a few rows, with preview + audit trail + per-field diff | `npm run import:excel` |

### Preparing the Excel file

The file should follow the same sheet layout as `us_missile_range_data.xlsx`. Three sheets are **required**, the rest are optional:

| Sheet | Required | Stable key | Purpose |
|---|---|---|---|
| `Sites` | yes | `site_id` | Update existing Site fields (no new Sites here) |
| `Radars` | yes | `radar_id` (auto-generated when blank) | Update or insert radars |
| `Site_Activities` | yes | `activity_id` (auto-generated when blank) | Update or insert operational activities into `site_range_activities` |
| `Sources` | no | `source_id` | Update or insert sources |
| `Contacts` | no | `contact_id` (auto-generated when blank) | Update or insert public Contacts (read-only contacts from the legacy `contacts` table — not site_contacts, which is UI-only) |
| `Change_Log`, `Validation_Errors` | no | — | Ignored by the pipeline; they are produced as outputs in the workbook itself for hand-off |

#### Sites — which fields the import will change

Safe (always written when present):

```
description
managing_organization
operator
missile_relevance
launch_relevance
radar_relevance
confidence_level
last_verified_date
record_status
citations
```

Identity / location fields are **protected** — the diff shows them in preview but they are NOT written unless you pass `--allow-identity-fields`:

```
site_name
latitude
longitude
country
state
```

#### Blanks vs. clearing

- A **blank cell** on an existing row → the existing SQLite value is preserved (no overwrite).
- The literal string `__CLEAR__` → the field is set to `NULL` in SQLite (and an audit row with `action='Clear'` is written).

#### Required columns per sheet

| Sheet | Required headers |
|---|---|
| `Sites` | `site_id`, `description` |
| `Radars` | `radar_id`, `site_id`, `radar_name`, `radar_type` |
| `Site_Activities` | `activity_id`, `site_id`, `activity_category`, `activity_description` |

(The `*_id` columns may be left blank in rows that should be inserted with a generated ID; the column itself must exist.)

### Running it

Drop your update file under `imports/` (any name will do) and start in **preview** mode. Preview never writes business data:

```
npm run import:excel -- --file ./imports/update.xlsx --mode preview
```

The console prints:

- a per-sheet summary (`Create / Update / Skip / NoChange / Errors`),
- the field-level diff for every modified record (existing value → new value),
- every validation error and warning.

A copy of the report is written to `imports/previews/preview_<batch_id>.json`. The run is recorded in `import_batches` with `mode='preview'`, and per-row validation errors land in `import_validation_errors` for later review — but `audit_log` is **not** touched and SQLite business data is unchanged.

When the preview looks right, apply it:

```
npm run import:excel -- --file ./imports/update.xlsx --mode apply --by "alice"
```

Apply mode:

1. Backs up `data/app.db` to `backups/app_<YYYYMMDDHHMMSS>.db` **before** opening the write transaction. The backup is preserved even if the import succeeds.
2. Writes every change inside one SQLite transaction. If anything throws, the transaction rolls back and `import_batches.status` is `Failed`. The backup remains for manual recovery.
3. Writes one `audit_log` row per changed field with `entity_type`, `entity_id`, `action ∈ {Create, Update, Clear}`, `field_name`, `old_value`, `new_value`, `changed_by` (the `--by` value), and `import_batch_id`.
4. Writes one `import_batches` row with the final counters (`created_count`, `updated_count`, `skipped_count`, `error_count`) and the backup path.

Optional flags:

- `--by "<name>"` — stamped into `audit_log.changed_by`.
- `--allow-identity-fields` — also writes the five protected Site fields above.

### Reviewing validation errors

```
sqlite3 data/app.db "SELECT batch.id, batch.mode, batch.status, batch.error_count, batch.skipped_count
                      FROM import_batches batch
                      ORDER BY batch.started_at DESC LIMIT 10;"

sqlite3 data/app.db "SELECT sheet_name, row_number, field_name, rule, message, severity
                      FROM import_validation_errors
                      WHERE import_batch_id = '<batch_id>'
                      ORDER BY id;"
```

The most recent preview / apply also writes a full JSON report to `imports/previews/preview_<batch_id>.json` — that file contains every row decision (Create / Update / Skip / NoChange), each field-level diff, and every error and warning.

### Reverting a bad apply

Stop the app, then:

```
copy backups\app_<YYYYMMDDHHMMSS>.db data\app.db
```

(use the backup path recorded in `import_batches.backup_path` for the failed batch). Restart the app.

### Imported operational activities ≠ user Activity Timeline

The `Site_Activities` Excel sheet imports into `site_range_activities` — operational/domain activities such as missile tests, space launches, historical activity windows, telemetry windows. They are read-only in the UI and are exposed under the existing "פעילויות" section on the site profile.

The Salesforce-style Activity Timeline on the right side of the site page (comments, tasks, task updates) lives in `site_timeline_activities` and is **never** touched by the Excel import. Adding a Task in the timeline is independent of any operational activity in the Excel file, and vice versa.

## SQLite tables

The database contains:

| Table | Purpose |
|---|---|
| `sites`, `radars`, `sources`, `contacts` | Static reference data imported from Excel |
| `site_range_activities` | Operational/domain activities (missile tests, space launches, …) imported from the Excel `Site_Activities` sheet |
| `site_timeline_activities` | Salesforce-style user Activity Timeline (Comments, Tasks, Task Updates, …) |
| `site_contacts` | User-managed contacts attached to a site (full CRUD) |
| `site_favorites` | Per-user favorite Sites — pointer table, no Site data duplicated |
| `site_comments`, `site_tasks` | Legacy tables, retained for migration only — no longer written to |
| `files` | Metadata for file attachments (actual files live under `/files/`) |
| `audit_log` | Field-level audit trail written by the controlled Excel import pipeline |
| `import_batches` | One row per controlled import run (preview or apply). Carries `import_type` for the wizard flow and source-action counters. |
| `import_validation_errors` | Per-row validation errors collected during a controlled import |
| `import_source_conflicts` | One row per conflicting Source surfaced by the wizard, with the chosen resolution and the new SRC-XXXX id if one was generated |
| `app_meta` | Migration markers (last import time, etc.) |

## Useful npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development mode |
| `npm run build` | Compile a production build |
| `npm start` | Run the production build (used by `start.bat`) |
| `npm run db:init` | Create `data/app.db` with the empty schema (runs migrations) |
| `npm run db:import` | Bulk-load `data/us_missile_range_data.xlsx` into `data/app.db` (initial dataset; creates a backup first) |
| `npm run import:excel -- --file <xlsx> --mode preview\|apply` | Controlled, audited update of SQLite from a partial Excel file (see below) |

## Project layout

```
us-missile-range-app/
├── data/                        Database + import source
├── files/                       File attachments (project-root-relative)
├── backups/                     Automatic .db snapshots
├── scripts/                     Maintenance scripts (Excel import, etc.)
├── src/
│   ├── app/                     Next.js pages + API routes
│   ├── components/              React components
│   └── lib/
│       ├── db.ts                SQLite connection + schema
│       ├── data-store.ts        Read/write API used by the app
│       ├── file-store.ts        Helper for file attachments
│       ├── excel-parser.ts      Reads .xlsx uploads
│       └── excel-writer.ts      Builds .xlsx exports on demand
├── start.bat                    Windows launcher
└── README.md
```

## Troubleshooting

**The app says "SQLite database not found".**
Run `npm run db:import` to build `data/app.db` from the Excel file.

**A backup operation failed / the database is locked.**
Make sure the app is fully stopped (no Node.js process running). On Windows the easiest way is to close all terminal windows that were running the app, then try again.

**I want a clean start.**
Delete `data/app.db` (the running app must be stopped first) and re-run `npm run db:import`.

**My Excel file has errors on upload.**
Open the upload page (`/upload`) and read the validation report. Common issues: missing `site_id`, invalid coordinates, picklist values outside the allowed set. Fix the Excel and re-upload.

## Sending the project to someone else

The whole folder is self-contained. To package it:

1. **Stop the app** if it is running.
2. **Delete `node_modules/`** before zipping (it will be recreated on first run on the target machine; the SQLite native module needs to be built locally).
3. **Zip** the entire `us-missile-range-app/` directory.

On the target machine the recipient needs Node.js 20 or newer. They unzip the folder and double-click `start.bat`. The launcher reinstalls dependencies, runs the Excel-to-SQLite import if the database isn't present, builds the app once, and opens the browser.

All paths the application stores are project-root-relative (using forward slashes), so the project keeps working no matter which drive letter or folder it lives in.

If you forget step 2 and ship `node_modules/`, `start.bat` detects the mismatch on first run and rebuilds the native SQLite module automatically — but the zip will be much larger than it needs to be.
