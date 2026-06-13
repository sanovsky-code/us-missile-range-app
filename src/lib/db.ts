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

-- Site systems / capabilities. Mirrors the radars schema (one Site → many
-- systems, joined by site_id) but covers non-radar instrumentation: optical
-- tracking, telemetry, electronic warfare, command-and-control, etc.
-- system_category is a fixed picklist driven by SYSTEM_CATEGORIES in types.ts.
CREATE TABLE IF NOT EXISTS systems (
  system_id            TEXT PRIMARY KEY,
  site_id              TEXT NOT NULL,
  system_name          TEXT,
  system_category      TEXT,
  purpose              TEXT,
  owner                TEXT,
  operator             TEXT,
  manufacturer         TEXT,
  operational_status   TEXT,
  public_description   TEXT,
  citations            TEXT,
  confidence_level     TEXT,
  last_verified_date   TEXT,
  source_id            TEXT,
  record_status        TEXT,
  created_by           TEXT,
  created_at           TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by           TEXT,
  updated_at           TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_systems_site ON systems(site_id);
CREATE INDEX IF NOT EXISTS idx_systems_category ON systems(system_category);
CREATE INDEX IF NOT EXISTS idx_systems_status ON systems(operational_status);

-- Per-radar lifecycle log: procurement / award / delivery / acceptance /
-- commissioning / modernization / decommissioning events. One Radar has
-- many events (FK on radar_id; ON DELETE CASCADE so wiping a radar also
-- wipes its history). site_id is denormalized for cheap site-level
-- queries — kept in sync via the createLifecycleEvent helper.
--
-- disclosed_value is TEXT (not REAL) so it can preserve operator prefixes
-- the way the analyst log them in Excel ("195583823", ">100000000",
-- "undisclosed"). currency is a separate column for ISO codes.
-- source_ids is a comma-separated list of SRC-* ids, matching the
-- existing radars.citations / systems.citations convention.
CREATE TABLE IF NOT EXISTS radar_lifecycle_events (
  event_id              TEXT PRIMARY KEY,
  radar_id              TEXT NOT NULL,
  site_id               TEXT NOT NULL,
  event_type            TEXT NOT NULL,
  event_date            TEXT,
  event_year            INTEGER,
  event_title           TEXT,
  event_description     TEXT,
  authority_or_owner    TEXT,
  supplier_or_contractor TEXT,
  disclosed_value       TEXT,
  currency              TEXT,
  value_scope           TEXT,
  evidence_status       TEXT,
  source_ids            TEXT,
  analyst_note          TEXT,
  created_by            TEXT,
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by            TEXT,
  updated_at            TEXT,
  FOREIGN KEY (radar_id) REFERENCES radars(radar_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_radar_lifecycle_radar ON radar_lifecycle_events(radar_id);
CREATE INDEX IF NOT EXISTS idx_radar_lifecycle_site ON radar_lifecycle_events(site_id);
CREATE INDEX IF NOT EXISTS idx_radar_lifecycle_year ON radar_lifecycle_events(event_year);
CREATE INDEX IF NOT EXISTS idx_radar_lifecycle_type ON radar_lifecycle_events(event_type);

-- Per-user radar favorites. Mirrors site_favorites: pointer-only, UNIQUE
-- on radar_id keeps "add favorite" idempotent. ON DELETE CASCADE removes
-- the favorite if the underlying radar disappears.
CREATE TABLE IF NOT EXISTS radar_favorites (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  radar_id     TEXT NOT NULL UNIQUE,
  created_by   TEXT,
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  sort_order   INTEGER,
  notes        TEXT,
  FOREIGN KEY (radar_id) REFERENCES radars(radar_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_radar_favorites_radar ON radar_favorites(radar_id);

-- Operational / domain activities imported from the Excel "Site_Activities"
-- sheet: missile tests, space launches, historical activity windows, etc.
-- Distinct from site_timeline_activities below (which is the Salesforce-style
-- user-facing Comment / Task / Task Update timeline).
CREATE TABLE IF NOT EXISTS site_range_activities (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id              TEXT UNIQUE,
  site_id                  TEXT NOT NULL,
  activity_category        TEXT,
  activity_description     TEXT,
  missile_or_system_type   TEXT,
  start_year               INTEGER,
  end_year                 INTEGER,
  status                   TEXT,
  source_id                TEXT,
  confidence_level         TEXT,
  created_at               TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at               TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_site_range_activities_site_id ON site_range_activities(site_id);
CREATE INDEX IF NOT EXISTS idx_site_range_activities_activity_id ON site_range_activities(activity_id);
CREATE INDEX IF NOT EXISTS idx_site_range_activities_category ON site_range_activities(activity_category);

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
-- Renamed from the original site_activities to site_timeline_activities
-- so it is not confused with operational range activities imported from
-- Excel (which live in site_range_activities).
-- site_id is TEXT to match sites.site_id (e.g. "SITE-0170").
CREATE TABLE IF NOT EXISTS site_timeline_activities (
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
  FOREIGN KEY (parent_activity_id) REFERENCES site_timeline_activities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_site_timeline_activities_site_id ON site_timeline_activities(site_id);
CREATE INDEX IF NOT EXISTS idx_site_timeline_activities_type ON site_timeline_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_site_timeline_activities_status ON site_timeline_activities(status);
CREATE INDEX IF NOT EXISTS idx_site_timeline_activities_due_date ON site_timeline_activities(due_date);
CREATE INDEX IF NOT EXISTS idx_site_timeline_activities_parent ON site_timeline_activities(parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_site_timeline_activities_created_at ON site_timeline_activities(created_at);

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

-- User-managed contacts attached to a site (full CRUD from the UI).
-- Separate from the imported contacts table above, which holds the
-- read-only Public Affairs / source contacts pulled from the Excel data.
-- site_id is TEXT to match sites.site_id (e.g. "SITE-0170").
CREATE TABLE IF NOT EXISTS site_contacts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role_title    TEXT,
  organization  TEXT,
  phone         TEXT,
  email         TEXT,
  notes         TEXT,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_site_contacts_site_id ON site_contacts(site_id);
CREATE INDEX IF NOT EXISTS idx_site_contacts_email ON site_contacts(email);

-- Salesforce-style standalone Contacts module. Distinct from:
--   * contacts          (Layer 1 Excel-imported public-affairs offices)
--   * site_contacts     (Layer 3 per-site user-managed)
-- This table holds organization-level contacts the operator manages from
-- the /contacts tab. site_id is optional — a contact may be linked to one
-- of the existing sites (Salesforce "Account") or stand alone.
CREATE TABLE IF NOT EXISTS crm_contacts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  salutation        TEXT,
  first_name        TEXT,
  last_name         TEXT,
  full_name         TEXT NOT NULL,
  title             TEXT,
  organization_name TEXT,
  contact_type      TEXT,
  email             TEXT,
  phone             TEXT,
  mobile            TEXT,
  contact_url       TEXT,
  department        TEXT,
  reports_to        TEXT,
  owner             TEXT,
  site_id           TEXT,
  mailing_address   TEXT,
  notes             TEXT,
  source_id         TEXT,
  created_by        TEXT,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by        TEXT,
  updated_at        TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_organization_name ON crm_contacts(organization_name);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_site_id ON crm_contacts(site_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_full_name ON crm_contacts(full_name);

-- Per-contact Salesforce-style timeline (Comments, Tasks, Task Updates,
-- Call logs). Mirrors the structure of site_timeline_activities; the two
-- live in separate tables because a row never belongs to both a site and
-- a contact. parent_activity_id chains Task Update rows back to their
-- original Task so status-change history is preserved.
CREATE TABLE IF NOT EXISTS contact_timeline_activities (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id          INTEGER NOT NULL,
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
  FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_activity_id) REFERENCES contact_timeline_activities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contact_timeline_activities_contact_id ON contact_timeline_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_timeline_activities_type ON contact_timeline_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_contact_timeline_activities_parent ON contact_timeline_activities(parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_contact_timeline_activities_created_at ON contact_timeline_activities(created_at);

-- Salesforce-style sales Opportunity. One opportunity is always linked
-- to exactly one Site (the customer is picked via Country → Site flow in
-- the UI). Stage drives Probability via a defaults map in TypeScript,
-- but Probability is overridable per opportunity.
CREATE TABLE IF NOT EXISTS opportunities (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  name                     TEXT NOT NULL,
  site_id                  TEXT NOT NULL,
  stage                    TEXT NOT NULL,
  probability              INTEGER,
  amount                   REAL,
  close_date               TEXT,
  owner                    TEXT,
  next_step                TEXT,
  description              TEXT,
  budget_confirmed         INTEGER NOT NULL DEFAULT 0,
  discovery_completed      INTEGER NOT NULL DEFAULT 0,
  roi_analysis_completed   INTEGER NOT NULL DEFAULT 0,
  loss_reason              TEXT,
  created_by               TEXT,
  created_at               TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_by               TEXT,
  updated_at               TEXT,
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_opportunities_site_id ON opportunities(site_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_stage ON opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_opportunities_owner ON opportunities(owner);
CREATE INDEX IF NOT EXISTS idx_opportunities_close_date ON opportunities(close_date);

-- Per-opportunity Salesforce-style activity timeline. Mirrors the contact
-- timeline but adds Event-specific columns (start_at/end_at/location/
-- attendees) for the New Event activity type. These columns stay NULL
-- for non-Event rows.
CREATE TABLE IF NOT EXISTS opportunity_timeline_activities (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id      INTEGER NOT NULL,
  activity_type       TEXT NOT NULL,
  subject             TEXT NOT NULL,
  body                TEXT,
  status              TEXT,
  priority            TEXT,
  due_date            TEXT,
  assigned_to         TEXT,
  start_at            TEXT,
  end_at              TEXT,
  location            TEXT,
  attendees           TEXT,
  created_by          TEXT,
  created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT,
  completed_at        TEXT,
  parent_activity_id  INTEGER,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_activity_id) REFERENCES opportunity_timeline_activities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_opp_timeline_opp_id ON opportunity_timeline_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_timeline_type ON opportunity_timeline_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_opp_timeline_parent ON opportunity_timeline_activities(parent_activity_id);
CREATE INDEX IF NOT EXISTS idx_opp_timeline_created_at ON opportunity_timeline_activities(created_at);

-- External documents attached to an opportunity. The operator pastes a
-- URL (OneDrive / SharePoint / network drive); we do NOT host the file.
-- doc_type is a small picklist: Proposal / RFI / Contract / Presentation /
-- Spec / Other.
CREATE TABLE IF NOT EXISTS opportunity_documents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id  INTEGER NOT NULL,
  title           TEXT NOT NULL,
  url             TEXT NOT NULL,
  doc_type        TEXT,
  notes           TEXT,
  created_by      TEXT,
  created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_opp_documents_opp_id ON opportunity_documents(opportunity_id);

-- Salesforce-style Field History Tracking. Every UPDATE on opportunities
-- diffs the changed columns and writes one row per modified field, in the
-- same transaction as the UPDATE itself. Append-only — never PATCH or
-- DELETE existing rows from app code; ON DELETE CASCADE only fires when
-- the parent opportunity is removed.
--
-- The sentinel field_name "__created__" marks the lifecycle anchor written
-- by createOpportunity(); the UI renders it as "ההזדמנות נוצרה" instead of
-- the Field/Old/New triple.
CREATE TABLE IF NOT EXISTS opportunity_field_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  opportunity_id  INTEGER NOT NULL,
  field_name      TEXT NOT NULL,
  old_value       TEXT,
  new_value       TEXT,
  changed_by      TEXT,
  changed_at      TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_opp_field_history_opp_id ON opportunity_field_history(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_opp_field_history_field ON opportunity_field_history(field_name);
CREATE INDEX IF NOT EXISTS idx_opp_field_history_changed_at ON opportunity_field_history(changed_at);

-- Per-country hide list. Sites whose country appears here vanish from
-- the map, the search autocomplete, the favorites list, and the
-- Management task feed — but their data and audit history are preserved.
-- A direct URL to /site/:id still works (so bookmarks don't break) and
-- the operator can un-hide via the /admin/countries page.
CREATE TABLE IF NOT EXISTS hidden_countries (
  country     TEXT PRIMARY KEY,
  hidden_by   TEXT,
  hidden_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Per-user favorite Sites. Lightweight pointer table; no Site data is
-- duplicated. The UNIQUE(site_id) constraint keeps "add favorite" idempotent
-- and is what makes a single site_id appear at most once in the list. The
-- Excel import paths intentionally do NOT delete from sites (they UPSERT),
-- so this table survives a re-import without losing rows.
-- site_id is TEXT to match sites.site_id (e.g. "SITE-0170").
CREATE TABLE IF NOT EXISTS site_favorites (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id      TEXT NOT NULL,
  created_by   TEXT,
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  sort_order   INTEGER,
  notes        TEXT,
  UNIQUE(site_id),
  FOREIGN KEY (site_id) REFERENCES sites(site_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_site_favorites_site_id ON site_favorites(site_id);

-- Tiny key/value table for migrations / app metadata
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Field-level audit trail for the controlled Excel import pipeline.
-- entity_type ∈ {Site, Radar, SiteRangeActivity, Source, Contact}
-- action      ∈ {Create, Update, Clear, Skip}
CREATE TABLE IF NOT EXISTS audit_log (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  action            TEXT NOT NULL,
  field_name        TEXT,
  old_value         TEXT,
  new_value         TEXT,
  changed_by        TEXT,
  changed_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  import_batch_id   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_import_batch ON audit_log(import_batch_id);

-- One row per controlled-import run (preview or apply). Records the
-- backup path so the operator can roll back manually if needed.
CREATE TABLE IF NOT EXISTS import_batches (
  id                TEXT PRIMARY KEY,
  file_name         TEXT,
  mode              TEXT,
  status            TEXT,
  started_at        TEXT DEFAULT CURRENT_TIMESTAMP,
  completed_at      TEXT,
  total_rows        INTEGER,
  created_count     INTEGER,
  updated_count     INTEGER,
  skipped_count     INTEGER,
  error_count       INTEGER,
  backup_path       TEXT,
  summary           TEXT
);

-- Validation errors collected per row during a controlled-import run.
CREATE TABLE IF NOT EXISTS import_validation_errors (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id   TEXT NOT NULL,
  sheet_name        TEXT NOT NULL,
  row_number        INTEGER,
  field_name        TEXT,
  value             TEXT,
  rule              TEXT,
  message           TEXT,
  severity          TEXT,
  created_at        TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_import_validation_errors_batch ON import_validation_errors(import_batch_id);

-- Per-batch source-conflict log. One row per Excel source_id where the
-- existing SQLite source has a different title or url. resolution ∈
-- {REUSE_EXISTING, CREATE_NEW, UPDATE_EXISTING}. When the resolution is
-- CREATE_NEW, new_source_id holds the freshly generated SRC-XXXX id.
CREATE TABLE IF NOT EXISTS import_source_conflicts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  import_batch_id       TEXT NOT NULL,
  original_source_id    TEXT NOT NULL,
  existing_source_title TEXT,
  existing_source_url   TEXT,
  excel_source_title    TEXT,
  excel_source_url      TEXT,
  resolution            TEXT,
  new_source_id         TEXT,
  created_at            TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_import_source_conflicts_batch ON import_source_conflicts(import_batch_id);
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
  // running twice is a no-op. Order matters: the rename runs first so any
  // legacy rows are copied into the new tables before downstream migrations
  // try to read from them.
  try {
    migrateRenameActivityTables(db);
  } catch (err) {
    console.warn("Activity-table rename migration failed:", err);
  }
  try {
    migrateCommentsAndTasksToActivities(db);
  } catch (err) {
    console.warn("Activity migration failed:", err);
  }
  try {
    migrateImportBatchesAddSelectiveColumns(db);
  } catch (err) {
    console.warn("import_batches column migration failed:", err);
  }
  try {
    migrateCrmContactsAddSplitNameColumns(db);
  } catch (err) {
    console.warn("crm_contacts split-name migration failed:", err);
  }
  try {
    migrateSitesAddIsHidden(db);
  } catch (err) {
    console.warn("sites.is_hidden migration failed:", err);
  }

  holder.db = db;
  return db;
}


/**
 * One-shot rename migration.
 *
 * Older customer databases have two tables that have since been renamed for
 * clarity:
 *   - `site_activities` (Salesforce-style timeline) → site_timeline_activities
 *   - `activities`      (operational/Excel imports) → site_range_activities
 *
 * If those legacy tables still exist, we copy their rows into the new tables
 * (the new tables are created by SCHEMA_SQL above), then drop the legacy
 * tables. The new site_range_activities has an extra INTEGER PRIMARY KEY
 * `id`, so the original `activity_id` becomes a UNIQUE TEXT column.
 *
 * Marks itself done in app_meta under `tables_rename_v2`.
 */
/**
 * Idempotent: add `import_type` and the four source counters to
 * `import_batches` if they aren't there yet. Older customer databases
 * have the older `mode`-only column set; we keep `mode` for backwards
 * compatibility with the existing CLI script and add `import_type` for
 * the selective-wizard flow ("sites" / "radars" / "site_range_activities" /
 * "contacts").
 */
/**
 * Idempotent: add first_name and last_name columns to crm_contacts and
 * backfill them from full_name on existing rows by splitting on the first
 * whitespace. full_name stays NOT NULL — first/last are inputs, full_name
 * is the derived display value.
 */
/**
 * Idempotent: add the is_hidden visibility flag to sites. Distinct from
 * record_status (workflow state) — is_hidden is a display preference that
 * removes a site from the map, autocomplete, favorites, and Management
 * task list without changing its workflow status or losing its history.
 */
function migrateSitesAddIsHidden(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(sites)").all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "is_hidden")) {
    db.exec("ALTER TABLE sites ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0");
    db.exec("CREATE INDEX IF NOT EXISTS idx_sites_is_hidden ON sites(is_hidden)");
  }
}


function migrateCrmContactsAddSplitNameColumns(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(crm_contacts)").all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  const added: string[] = [];
  for (const c of ["first_name", "last_name"] as const) {
    if (!have.has(c)) {
      try {
        db.exec(`ALTER TABLE crm_contacts ADD COLUMN ${c} TEXT`);
        added.push(c);
      } catch (err) {
        console.warn(`ALTER TABLE crm_contacts ADD ${c} failed:`, (err as Error).message);
      }
    }
  }
  if (added.length === 0) return;
  // Backfill: best-effort split of full_name on the FIRST whitespace.
  // last_name is what Salesforce considers required, so when there is no
  // space we treat the whole string as last_name. Existing rows that the
  // operator later corrects via the form will overwrite this.
  const rows = db.prepare(
    "SELECT id, full_name FROM crm_contacts WHERE (first_name IS NULL OR first_name = '') AND (last_name IS NULL OR last_name = '')"
  ).all() as Array<{ id: number; full_name: string }>;
  const upd = db.prepare("UPDATE crm_contacts SET first_name = ?, last_name = ? WHERE id = ?");
  for (const r of rows) {
    const trimmed = (r.full_name ?? "").trim();
    const idx = trimmed.search(/\s+/);
    let first = "", last = trimmed;
    if (idx > 0) {
      first = trimmed.slice(0, idx).trim();
      last  = trimmed.slice(idx).trim();
    }
    upd.run(first || null, last || null, r.id);
  }
  if (rows.length > 0) {
    console.log(`Backfilled first_name/last_name on ${rows.length} crm_contacts rows.`);
  }
}


function migrateImportBatchesAddSelectiveColumns(db: Database.Database): void {
  const cols = db.prepare("PRAGMA table_info(import_batches)").all() as Array<{ name: string }>;
  const have = new Set(cols.map((c) => c.name));
  const tryAdd = (col: string, decl: string) => {
    if (!have.has(col)) {
      try {
        db.exec(`ALTER TABLE import_batches ADD COLUMN ${col} ${decl}`);
      } catch (err) {
        console.warn(`ALTER TABLE import_batches ADD ${col} failed:`, (err as Error).message);
      }
    }
  };
  tryAdd("import_type", "TEXT");
  tryAdd("selected_records_count", "INTEGER");
  tryAdd("source_created_count", "INTEGER");
  tryAdd("source_reused_count", "INTEGER");
  tryAdd("source_conflict_count", "INTEGER");
}


function migrateRenameActivityTables(db: Database.Database): void {
  const KEY = "tables_rename_v2";
  const done = db.prepare("SELECT value FROM app_meta WHERE key = ?").get(KEY);
  if (done) return;

  const txn = db.transaction(() => {
    const legacyTimeline = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='site_activities'"
    ).get();
    const legacyRange = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='activities'"
    ).get();

    let migratedTimeline = 0;
    let migratedRange = 0;

    if (legacyTimeline) {
      const alreadyEmpty = (db.prepare(
        "SELECT COUNT(*) AS n FROM site_timeline_activities"
      ).get() as { n: number }).n === 0;
      if (alreadyEmpty) {
        // Copy ALL columns explicitly (same schema), preserving primary keys
        // so parent_activity_id references stay intact.
        db.exec(`
          INSERT INTO site_timeline_activities
            (id, site_id, activity_type, subject, body, status, priority,
             due_date, assigned_to, created_by, created_at, updated_at,
             completed_at, parent_activity_id)
          SELECT
            id, site_id, activity_type, subject, body, status, priority,
            due_date, assigned_to, created_by, created_at, updated_at,
            completed_at, parent_activity_id
          FROM site_activities
        `);
        migratedTimeline = (db.prepare(
          "SELECT COUNT(*) AS n FROM site_timeline_activities"
        ).get() as { n: number }).n;
      }
      // Drop the legacy table. Nothing else FKs to it.
      db.exec("DROP TABLE site_activities");
    }

    if (legacyRange) {
      const alreadyEmpty = (db.prepare(
        "SELECT COUNT(*) AS n FROM site_range_activities"
      ).get() as { n: number }).n === 0;
      if (alreadyEmpty) {
        db.exec(`
          INSERT INTO site_range_activities
            (activity_id, site_id, activity_category, activity_description,
             missile_or_system_type, start_year, end_year, status, source_id,
             confidence_level)
          SELECT
            activity_id, site_id, activity_category, activity_description,
            missile_or_system_type, start_year, end_year, status, source_id,
            confidence_level
          FROM activities
        `);
        migratedRange = (db.prepare(
          "SELECT COUNT(*) AS n FROM site_range_activities"
        ).get() as { n: number }).n;
      }
      db.exec("DROP TABLE activities");
    }

    db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(
      KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        migrated_timeline_rows: migratedTimeline,
        migrated_range_rows: migratedRange,
      }),
    );

    if (migratedTimeline > 0 || migratedRange > 0) {
      console.log(
        `Renamed activity tables: copied ${migratedTimeline} timeline rows into ` +
        `site_timeline_activities and ${migratedRange} range rows into site_range_activities.`
      );
    }
  });

  txn();
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
        INSERT INTO site_timeline_activities
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
        INSERT INTO site_timeline_activities
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
