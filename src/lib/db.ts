/**
 * SQLite database singleton.
 *
 * Manages the connection to data/app.db. On first access:
 *   1. Verifies the data directory exists
 *   2. Opens (or creates) the database file
 *   3. Runs schema_init.sql to create tables and indexes if missing
 *
 * The singleton pattern ensures a single connection per Node process. Next.js
 * dev mode reuses the connection across hot reloads via globalThis.
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "app.db");

// Schema is checked-in source code, not a separate .sql file, so the database
// is self-bootstrapping when the app starts.
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS sites (
  site_id              TEXT PRIMARY KEY,
  site_name            TEXT NOT NULL,
  site_type            TEXT,
  size_category        TEXT,
  size_score           INTEGER,
  country              TEXT,
  state                TEXT,
  latitude             REAL,
  longitude            REAL,
  coordinate_type      TEXT,
  managing_organization TEXT,
  operator             TEXT,
  missile_relevance    TEXT,
  launch_relevance     TEXT,
  radar_relevance      TEXT,
  public_contact_email TEXT,
  public_contact_phone TEXT,
  website              TEXT,
  description          TEXT,
  citations            TEXT,
  confidence_level     TEXT,
  last_verified_date   TEXT,
  record_status        TEXT,
  created_at           TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at           TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sites_country ON sites(country);
CREATE INDEX IF NOT EXISTS idx_sites_size ON sites(size_category);
CREATE INDEX IF NOT EXISTS idx_sites_type ON sites(site_type);
CREATE INDEX IF NOT EXISTS idx_sites_status ON sites(record_status);
CREATE INDEX IF NOT EXISTS idx_sites_state ON sites(state);

CREATE TABLE IF NOT EXISTS radars (
  radar_id             TEXT PRIMARY KEY,
  site_id              TEXT NOT NULL,
  radar_name           TEXT,
  radar_model          TEXT,
  radar_type           TEXT,
  frequency_band       TEXT,
  purpose              TEXT,
  owner                TEXT,
  operator             TEXT,
  manufacturer         TEXT,
  installation_date    TEXT,
  upgrade_date         TEXT,
  fix_date             TEXT,
  operational_status   TEXT,
  public_description   TEXT,
  citations            TEXT,
  confidence_level     TEXT,
  last_verified_date   TEXT,
  source_id            TEXT,
  record_status        TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_radars_site ON radars(site_id);
CREATE INDEX IF NOT EXISTS idx_radars_type ON radars(radar_type);
CREATE INDEX IF NOT EXISTS idx_radars_status ON radars(operational_status);

CREATE TABLE IF NOT EXISTS activities (
  activity_id              TEXT PRIMARY KEY,
  site_id                  TEXT NOT NULL,
  activity_category        TEXT,
  activity_description     TEXT,
  missile_or_system_type   TEXT,
  start_year               INTEGER,
  end_year                 INTEGER,
  status                   TEXT,
  source_id                TEXT,
  confidence_level         TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_activities_site ON activities(site_id);
CREATE INDEX IF NOT EXISTS idx_activities_category ON activities(activity_category);

CREATE TABLE IF NOT EXISTS sources (
  source_id         TEXT PRIMARY KEY,
  source_title      TEXT,
  source_url        TEXT,
  source_type       TEXT,
  publisher         TEXT,
  publication_date  TEXT,
  access_date       TEXT,
  reliability_score INTEGER,
  notes             TEXT,
  notebook_uuid     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(source_type);

CREATE TABLE IF NOT EXISTS contacts (
  contact_id        TEXT PRIMARY KEY,
  site_id           TEXT NOT NULL,
  organization_name TEXT,
  contact_type      TEXT,
  contact_email     TEXT,
  contact_phone     TEXT,
  contact_url       TEXT,
  notes             TEXT,
  source_id         TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contacts_site ON contacts(site_id);

-- Generic table for file attachments. The actual file lives under /files/<type>/<name>;
-- only the relative path is stored here so the project remains portable.
CREATE TABLE IF NOT EXISTS files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT,
  entity_id     TEXT,
  file_name     TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type     TEXT,
  file_size     INTEGER,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_files_entity ON files(entity_type, entity_id);

-- Salesforce-style unified Activity Timeline.
-- A single table stores comments, tasks, task updates, and any future
-- activity types (Call, Email, Meeting, Note). The activity_type field
-- discriminates between them. parent_activity_id links a "Task Update"
-- back to the original "Task" it describes, so status-change history is
-- preserved instead of being silently overwritten.
-- site_id is TEXT to match sites.site_id (e.g. "SITE-0170").
CREATE TABLE IF NOT EXISTS site_activities (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id             TEXT NOT NULL,
  activity_type       TEXT NOT NULL,
  subject             TEXT NOT NULL,
  body                TEXT,
  status              TEXT,
  priority            TEXT,
  due_date            TEXT,
  assigned_to         TEXT,
  created_by          TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT,
  completed_at        TEXT,
  parent_activity_id  INTEGER,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_activity_id) REFERENCES site_activities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_site_activities_site_id ON site_activities(site_id);
CREATE INDEX IF NOT EXISTS idx_site_activities_type ON site_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_site_activities_status ON site_activities(status);
CREATE INDEX IF NOT EXISTS idx_site_activities_due_date ON site_activities(due_date);
CREATE INDEX IF NOT EXISTS idx_site_activities_parent ON site_activities(parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_site_activities_created_at ON site_activities(created_at);

-- The previous, separate site_comments / site_tasks tables remain defined
-- so existing customer databases keep working. They are no longer written
-- to by the application; on first boot a migration copies their rows into
-- site_activities and records a marker in app_meta so it never runs twice.
CREATE TABLE IF NOT EXISTS site_comments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL,
  comment_text  TEXT NOT NULL,
  created_by    TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS site_tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'Open',
  priority      TEXT NOT NULL DEFAULT 'Medium',
  due_date      TEXT,
  created_by    TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);

-- Tiny key/value table for migrations / app metadata
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;


type DbHolder = { db: Database.Database | null };

const globalForDb = globalThis as unknown as { __appDb?: DbHolder };
const holder: DbHolder = globalForDb.__appDb ?? { db: null };
if (process.env.NODE_ENV !== "production") {
  globalForDb.__appDb = holder;
}


export function getDb(): Database.Database {
  if (holder.db) return holder.db;

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let db: Database.Database;
  try {
    db = new Database(DB_PATH);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to open SQLite database at ${DB_PATH}. ` +
      `The file may be locked by another process, corrupted, or unreadable. ` +
      `Original error: ${message}`
    );
  }

  try {
    db.exec(SCHEMA_SQL);
  } catch (err) {
    db.close();
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to initialize SQLite schema. The database file may be corrupted. ` +
      `Delete data/app.db and re-run the import to recreate it. ` +
      `Original error: ${message}`
    );
  }

  // Run one-shot migrations. Each migration is keyed by name in app_meta;
  // running twice is a no-op.
  try {
    migrateCommentsAndTasksToActivities(db);
  } catch (err) {
    console.warn("Activity migration failed:", err);
    // Non-fatal: the app still works with an empty site_activities table.
  }

  holder.db = db;
  return db;
}


/**
 * One-shot migration: copy any rows from the old site_comments / site_tasks
 * tables into the unified site_activities table. Marks itself done in app_meta
 * so it never runs twice. Empty source tables are a no-op.
 */
function migrateCommentsAndTasksToActivities(db: Database.Database): void {
  const KEY = "activities_migration_v1";
  const done = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(KEY);
  if (done) return;

  const txn = db.transaction(() => {
    const commentsExist = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='site_comments'"
    ).get();
    const tasksExist = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='site_tasks'"
    ).get();

    let migratedComments = 0;
    let migratedTasks = 0;

    if (commentsExist) {
      const insComment = db.prepare(`
        INSERT INTO site_activities
          (site_id, activity_type, subject, body, created_by, created_at, updated_at)
        VALUES (?, 'Comment', 'Comment added', ?, ?, ?, ?)
      `);
      const comments = db.prepare("SELECT * FROM site_comments ORDER BY id").all() as Array<{
        site_id: string; comment_text: string; created_by: string | null;
        created_at: string; updated_at: string | null;
      }>;
      for (const c of comments) {
        insComment.run(c.site_id, c.comment_text, c.created_by, c.created_at, c.updated_at);
        migratedComments++;
      }
    }

    if (tasksExist) {
      const insTask = db.prepare(`
        INSERT INTO site_activities
          (site_id, activity_type, subject, body, status, priority, due_date,
           created_by, created_at, updated_at, completed_at)
        VALUES (?, 'Task', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tasks = db.prepare("SELECT * FROM site_tasks ORDER BY id").all() as Array<{
        site_id: string; title: string; description: string | null;
        status: string; priority: string; due_date: string | null;
        created_by: string | null; created_at: string; updated_at: string | null;
      }>;
      for (const t of tasks) {
        const completedAt = t.status === "Done" ? (t.updated_at ?? t.created_at) : null;
        insTask.run(
          t.site_id, t.title, t.description, t.status, t.priority, t.due_date,
          t.created_by, t.created_at, t.updated_at, completedAt,
        );
        migratedTasks++;
      }
    }

    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
      KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        migrated_comments: migratedComments,
        migrated_tasks: migratedTasks,
      }),
    );

    if (migratedComments > 0 || migratedTasks > 0) {
      console.log(
        `Migrated ${migratedComments} comments and ${migratedTasks} tasks into site_activities.`
      );
    }
  });

  txn();
}


export function getDbPath(): string {
  return DB_PATH;
}


export function closeDb(): void {
  if (holder.db) {
    holder.db.close();
    holder.db = null;
  }
}


/**
 * Run a callback inside an immediate transaction. better-sqlite3's `transaction`
 * helper wraps any thrown error to roll back automatically.
 */
export function transaction<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  return db.transaction(() => fn(db))();
}
