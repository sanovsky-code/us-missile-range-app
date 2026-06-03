/**
 * Migrate data/us_missile_range_data.xlsx into data/app.db.
 *
 * Run with:    npx tsx scripts/import-excel-to-sqlite.ts
 * Or via npm:  npm run db:import
 *
 * Safe to re-run: the script wraps everything in a transaction. Before clearing
 * the existing rows, it copies data/app.db to backups/app.db.<timestamp>.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getDb, getDbPath } from "../src/lib/db";

const EXCEL_PATH = path.join(process.cwd(), "data", "us_missile_range_data.xlsx");
const BACKUP_DIR = path.join(process.cwd(), "backups");


function backupExistingDb() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) return;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(BACKUP_DIR, `app.db.${stamp}`);
  fs.copyFileSync(dbPath, dest);
  console.log(`  Backed up existing DB -> ${path.relative(process.cwd(), dest)}`);
}


function readSheet(workbook: ExcelJS.Workbook, name: string): Record<string, unknown>[] {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) {
    console.warn(`  Sheet "${name}" not found, skipping`);
    return [];
  }
  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, col) => {
    const v = cell.value;
    headers[col] = typeof v === "string" ? v.trim() : String(v ?? "").trim();
  });

  const rows: Record<string, unknown>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell((cell, col) => {
      const h = headers[col];
      if (!h) return;
      let v: unknown = cell.value;
      if (v && typeof v === "object" && "result" in (v as Record<string, unknown>)) {
        v = (v as { result?: unknown }).result ?? null;
      }
      rec[h] = v;
      if (v !== null && v !== undefined && v !== "") hasValue = true;
    });
    if (hasValue) rows.push(rec);
  });
  return rows;
}


function toText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  return String(v);
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: unknown): number | null {
  const n = toNumber(v);
  return n === null ? null : Math.trunc(n);
}


function main() {
  if (!fs.existsSync(EXCEL_PATH)) {
    console.error(`Excel source not found at ${EXCEL_PATH}`);
    console.error(`Place the .xlsx file there or run db:init alone to create an empty database.`);
    process.exit(1);
  }

  console.log(`Importing ${path.relative(process.cwd(), EXCEL_PATH)}`);
  backupExistingDb();

  const db = getDb();

  const workbook = new ExcelJS.Workbook();
  // Top-level await isn't available in ts-node/tsx CommonJS default; wrap in async IIFE
  (async () => {
    await workbook.xlsx.readFile(EXCEL_PATH);

    const sites = readSheet(workbook, "Sites");
    const radars = readSheet(workbook, "Radars");
    const activities = readSheet(workbook, "Site_Activities");
    const sources = readSheet(workbook, "Sources");
    const contacts = readSheet(workbook, "Contacts");

    console.log(
      `  Read: ${sites.length} sites, ${radars.length} radars, ${activities.length} activities, ` +
      `${sources.length} sources, ${contacts.length} contacts`
    );

    // UPSERT on conflict instead of INSERT OR REPLACE. The latter would
    // delete the existing row and re-insert it, triggering ON DELETE
    // CASCADE on site_activities / site_contacts / site_comments /
    // site_tasks - wiping all user-added data attached to the site. The
    // ON CONFLICT DO UPDATE form is a true UPDATE; no DELETE fires and
    // user data is preserved across re-imports of the Excel source.
    const insertSite = db.prepare(`
      INSERT INTO sites (
        site_id, site_name, site_type, size_category, size_score, country, state,
        latitude, longitude, coordinate_type, managing_organization, operator,
        missile_relevance, launch_relevance, radar_relevance,
        public_contact_email, public_contact_phone, website, description, citations,
        confidence_level, last_verified_date, record_status
      ) VALUES (
        @site_id, @site_name, @site_type, @size_category, @size_score, @country, @state,
        @latitude, @longitude, @coordinate_type, @managing_organization, @operator,
        @missile_relevance, @launch_relevance, @radar_relevance,
        @public_contact_email, @public_contact_phone, @website, @description, @citations,
        @confidence_level, @last_verified_date, @record_status
      )
      ON CONFLICT(site_id) DO UPDATE SET
        site_name = excluded.site_name,
        site_type = excluded.site_type,
        size_category = excluded.size_category,
        size_score = excluded.size_score,
        country = excluded.country,
        state = excluded.state,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        coordinate_type = excluded.coordinate_type,
        managing_organization = excluded.managing_organization,
        operator = excluded.operator,
        missile_relevance = excluded.missile_relevance,
        launch_relevance = excluded.launch_relevance,
        radar_relevance = excluded.radar_relevance,
        public_contact_email = excluded.public_contact_email,
        public_contact_phone = excluded.public_contact_phone,
        website = excluded.website,
        description = excluded.description,
        citations = excluded.citations,
        confidence_level = excluded.confidence_level,
        last_verified_date = excluded.last_verified_date,
        record_status = excluded.record_status,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertRadar = db.prepare(`
      INSERT OR REPLACE INTO radars (
        radar_id, site_id, radar_name, radar_model, radar_type, frequency_band, purpose,
        owner, operator, manufacturer, installation_date, upgrade_date, fix_date,
        operational_status, public_description, citations, confidence_level,
        last_verified_date, source_id, record_status
      ) VALUES (
        @radar_id, @site_id, @radar_name, @radar_model, @radar_type, @frequency_band, @purpose,
        @owner, @operator, @manufacturer, @installation_date, @upgrade_date, @fix_date,
        @operational_status, @public_description, @citations, @confidence_level,
        @last_verified_date, @source_id, @record_status
      )
    `);

    const insertActivity = db.prepare(`
      INSERT OR REPLACE INTO activities (
        activity_id, site_id, activity_category, activity_description,
        missile_or_system_type, start_year, end_year, status, source_id, confidence_level
      ) VALUES (
        @activity_id, @site_id, @activity_category, @activity_description,
        @missile_or_system_type, @start_year, @end_year, @status, @source_id, @confidence_level
      )
    `);

    const insertSource = db.prepare(`
      INSERT OR REPLACE INTO sources (
        source_id, source_title, source_url, source_type, publisher,
        publication_date, access_date, reliability_score, notes, notebook_uuid
      ) VALUES (
        @source_id, @source_title, @source_url, @source_type, @publisher,
        @publication_date, @access_date, @reliability_score, @notes, @notebook_uuid
      )
    `);

    const insertContact = db.prepare(`
      INSERT OR REPLACE INTO contacts (
        contact_id, site_id, organization_name, contact_type,
        contact_email, contact_phone, contact_url, notes, source_id
      ) VALUES (
        @contact_id, @site_id, @organization_name, @contact_type,
        @contact_email, @contact_phone, @contact_url, @notes, @source_id
      )
    `);

    const runImport = db.transaction(() => {
      // Wipe operational reference tables (no user-data is FK-linked to
      // these, so it's safe). DO NOT delete from `sites` - that would
      // cascade and erase site_activities / site_contacts /
      // site_comments / site_tasks. The sites table is updated row-by-
      // row via the ON CONFLICT DO UPDATE upsert defined above.
      db.exec("DELETE FROM contacts; DELETE FROM activities; DELETE FROM radars; DELETE FROM sources;");

      for (const s of sources) {
        insertSource.run({
          source_id: toText(s.source_id) ?? "",
          source_title: toText(s.source_title),
          source_url: toText(s.source_url),
          source_type: toText(s.source_type),
          publisher: toText(s.publisher),
          publication_date: toText(s.publication_date),
          access_date: toText(s.access_date),
          reliability_score: toInt(s.reliability_score),
          notes: toText(s.notes),
          notebook_uuid: toText(s.notebook_uuid),
        });
      }

      for (const s of sites) {
        insertSite.run({
          site_id: toText(s.site_id) ?? "",
          site_name: toText(s.site_name) ?? "",
          site_type: toText(s.site_type),
          size_category: toText(s.size_category),
          size_score: toInt(s.size_score),
          country: toText(s.country),
          state: toText(s.state),
          latitude: toNumber(s.latitude),
          longitude: toNumber(s.longitude),
          coordinate_type: toText(s.coordinate_type),
          managing_organization: toText(s.managing_organization),
          operator: toText(s.operator),
          missile_relevance: toText(s.missile_relevance),
          launch_relevance: toText(s.launch_relevance),
          radar_relevance: toText(s.radar_relevance),
          public_contact_email: toText(s.public_contact_email),
          public_contact_phone: toText(s.public_contact_phone),
          website: toText(s.website),
          description: toText(s.description),
          citations: toText(s.citations),
          confidence_level: toText(s.confidence_level),
          last_verified_date: toText(s.last_verified_date),
          record_status: toText(s.record_status),
        });
      }

      const validSiteIds = new Set<string>();
      for (const s of sites) {
        const id = toText(s.site_id);
        if (id) validSiteIds.add(id);
      }

      let skippedRadars = 0;
      for (const r of radars) {
        const siteId = toText(r.site_id);
        if (!siteId || !validSiteIds.has(siteId)) {
          skippedRadars++;
          continue;
        }
        insertRadar.run({
          radar_id: toText(r.radar_id) ?? "",
          site_id: siteId,
          radar_name: toText(r.radar_name),
          radar_model: toText(r.radar_model),
          radar_type: toText(r.radar_type),
          frequency_band: toText(r.frequency_band),
          purpose: toText(r.purpose),
          owner: toText(r.owner),
          operator: toText(r.operator),
          manufacturer: toText(r.manufacturer),
          installation_date: toText(r.installation_date),
          upgrade_date: toText(r.upgrade_date),
          fix_date: toText(r.fix_date),
          operational_status: toText(r.operational_status),
          public_description: toText(r.public_description),
          citations: toText(r.citations),
          confidence_level: toText(r.confidence_level),
          last_verified_date: toText(r.last_verified_date),
          source_id: toText(r.source_id),
          record_status: toText(r.record_status),
        });
      }

      let skippedActivities = 0;
      for (const a of activities) {
        const siteId = toText(a.site_id);
        if (!siteId || !validSiteIds.has(siteId)) {
          skippedActivities++;
          continue;
        }
        insertActivity.run({
          activity_id: toText(a.activity_id) ?? "",
          site_id: siteId,
          activity_category: toText(a.activity_category),
          activity_description: toText(a.activity_description),
          missile_or_system_type: toText(a.missile_or_system_type),
          start_year: toInt(a.start_year),
          end_year: toInt(a.end_year),
          status: toText(a.status),
          source_id: toText(a.source_id),
          confidence_level: toText(a.confidence_level),
        });
      }

      let skippedContacts = 0;
      for (const c of contacts) {
        const siteId = toText(c.site_id);
        if (!siteId || !validSiteIds.has(siteId)) {
          skippedContacts++;
          continue;
        }
        insertContact.run({
          contact_id: toText(c.contact_id) ?? "",
          site_id: siteId,
          organization_name: toText(c.organization_name),
          contact_type: toText(c.contact_type),
          contact_email: toText(c.contact_email),
          contact_phone: toText(c.contact_phone),
          contact_url: toText(c.contact_url),
          notes: toText(c.notes),
          source_id: toText(c.source_id),
        });
      }

      db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)")
        .run("last_import_at", new Date().toISOString());

      console.log(`  Skipped (no matching site_id): ${skippedRadars} radars, ${skippedActivities} activities, ${skippedContacts} contacts`);
    });

    runImport();

    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sites) AS sites,
        (SELECT COUNT(*) FROM radars) AS radars,
        (SELECT COUNT(*) FROM activities) AS activities,
        (SELECT COUNT(*) FROM sources) AS sources,
        (SELECT COUNT(*) FROM contacts) AS contacts
    `).get();

    console.log(`Done. Final counts:`, stats);
    console.log(`Database: ${path.relative(process.cwd(), getDbPath())}`);
  })().catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
}

main();
