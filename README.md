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

- `site_activities` — Unified table for every activity type. Columns: `id`, `site_id` (TEXT FK to `sites.site_id`), `activity_type`, `subject`, `body`, `status`, `priority`, `due_date`, `assigned_to`, `created_by`, `created_at`, `updated_at`, `completed_at`, `parent_activity_id` (self-FK to the parent Task for Task Update history rows). Indexed on `site_id`, `activity_type`, `status`, `due_date`, `parent_activity_id`, and `created_at`.
- The older `site_comments` and `site_tasks` tables remain in the schema for backwards compatibility. They are no longer written to. The first time the app boots against a database that has data in those tables, a one-shot migration copies their rows into `site_activities` and records `activities_migration_v1` in `app_meta` so it does not run twice.

## Re-importing the Excel file

If you receive an updated `us_missile_range_data.xlsx`:

1. Stop the app (close the terminal window).
2. Replace `data/us_missile_range_data.xlsx` with the new version.
3. Run:
   ```
   npm run db:import
   ```
4. Start the app again with `start.bat`.

The import script automatically backs up the current `data/app.db` into `/backups/` before replacing its contents.

## SQLite tables

The database contains:

| Table | Purpose |
|---|---|
| `sites`, `radars`, `activities`, `sources`, `contacts` | Static reference data imported from Excel |
| `site_activities` | Unified Activity Timeline (Comments, Tasks, Task Updates, …) |
| `site_contacts` | User-managed contacts attached to a site (full CRUD) |
| `site_comments`, `site_tasks` | Legacy tables, retained for migration only — no longer written to |
| `files` | Metadata for file attachments (actual files live under `/files/`) |
| `app_meta` | Migration markers (last import time, etc.) |

## Useful npm scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app in development mode |
| `npm run build` | Compile a production build |
| `npm start` | Run the production build (used by `start.bat`) |
| `npm run db:import` | Re-import `data/us_missile_range_data.xlsx` into `data/app.db` (creates a backup first) |

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
