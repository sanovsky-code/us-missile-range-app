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

You can also re-import from the **/upload** page inside the running app: select an `.xlsx` file, click "העלה ואמת" (Upload & Validate), and the database is updated on the fly. A backup is still taken.

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

The whole folder is self-contained. You can zip the entire `us-missile-range-app/` directory and send it to a customer. They only need Node.js installed; everything else lives inside the folder. Paths in the database are all relative, so the project works as soon as it is unzipped.
