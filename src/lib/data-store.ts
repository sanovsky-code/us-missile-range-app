/**
 * Data access layer.
 *
 * Thin wrapper over SQLite (data/app.db). Every method runs a prepared SQL
 * statement; nothing is cached in memory. Read queries are sub-ms thanks to
 * the indexes defined in db.ts.
 *
 * Replaces the previous Excel/in-memory implementation. The old class API
 * (getAllSites, getSiteById, etc.) is preserved so the API routes don't need
 * to change.
 */
import fs from "fs";
import path from "path";
import {
  Site,
  Radar,
  SiteActivity,
  Source,
  Contact,
  SiteListItem,
  FilterState,
  FilterOptions,
} from "./types";
import { getDb, getDbPath, transaction } from "./db";


// --- helpers ---------------------------------------------------------------

function toUndef<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v;
}

function rowToSite(row: Record<string, unknown>): Site {
  return {
    site_id: String(row.site_id ?? ""),
    site_name: String(row.site_name ?? ""),
    site_type: String(row.site_type ?? ""),
    size_category: String(row.size_category ?? ""),
    size_score: toUndef(row.size_score as number | null),
    country: String(row.country ?? ""),
    state: String(row.state ?? ""),
    latitude: Number(row.latitude ?? 0),
    longitude: Number(row.longitude ?? 0),
    coordinate_type: String(row.coordinate_type ?? ""),
    managing_organization: String(row.managing_organization ?? ""),
    operator: toUndef(row.operator as string | null) ?? undefined,
    missile_relevance: toUndef(row.missile_relevance as string | null) ?? undefined,
    launch_relevance: toUndef(row.launch_relevance as string | null) ?? undefined,
    radar_relevance: toUndef(row.radar_relevance as string | null) ?? undefined,
    public_contact_email: toUndef(row.public_contact_email as string | null) ?? undefined,
    public_contact_phone: toUndef(row.public_contact_phone as string | null) ?? undefined,
    website: toUndef(row.website as string | null) ?? undefined,
    description: String(row.description ?? ""),
    citations: toUndef(row.citations as string | null) ?? undefined,
    confidence_level: String(row.confidence_level ?? ""),
    last_verified_date: String(row.last_verified_date ?? ""),
    record_status: String(row.record_status ?? ""),
  };
}

function rowToRadar(row: Record<string, unknown>): Radar {
  return {
    radar_id: String(row.radar_id ?? ""),
    site_id: String(row.site_id ?? ""),
    radar_name: String(row.radar_name ?? ""),
    radar_model: toUndef(row.radar_model as string | null) ?? undefined,
    radar_type: String(row.radar_type ?? ""),
    frequency_band: toUndef(row.frequency_band as string | null) ?? undefined,
    purpose: String(row.purpose ?? ""),
    owner: toUndef(row.owner as string | null) ?? undefined,
    operator: toUndef(row.operator as string | null) ?? undefined,
    manufacturer: toUndef(row.manufacturer as string | null) ?? undefined,
    installation_date: toUndef(row.installation_date as string | null) ?? undefined,
    upgrade_date: toUndef(row.upgrade_date as string | null) ?? undefined,
    fix_date: toUndef(row.fix_date as string | null) ?? undefined,
    operational_status: String(row.operational_status ?? ""),
    public_description: String(row.public_description ?? ""),
    citations: toUndef(row.citations as string | null) ?? undefined,
    confidence_level: String(row.confidence_level ?? ""),
    last_verified_date: String(row.last_verified_date ?? ""),
    source_id: String(row.source_id ?? ""),
    record_status: String(row.record_status ?? ""),
  };
}

function rowToActivity(row: Record<string, unknown>): SiteActivity {
  return {
    activity_id: String(row.activity_id ?? ""),
    site_id: String(row.site_id ?? ""),
    activity_category: String(row.activity_category ?? ""),
    activity_description: String(row.activity_description ?? ""),
    missile_or_system_type: toUndef(row.missile_or_system_type as string | null) ?? undefined,
    start_year: toUndef(row.start_year as number | null),
    end_year: toUndef(row.end_year as number | null),
    status: String(row.status ?? ""),
    source_id: String(row.source_id ?? ""),
    confidence_level: String(row.confidence_level ?? ""),
  };
}

function rowToSource(row: Record<string, unknown>): Source {
  return {
    source_id: String(row.source_id ?? ""),
    source_title: String(row.source_title ?? ""),
    source_url: String(row.source_url ?? ""),
    source_type: String(row.source_type ?? ""),
    publisher: toUndef(row.publisher as string | null) ?? undefined,
    publication_date: toUndef(row.publication_date as string | null) ?? undefined,
    access_date: String(row.access_date ?? ""),
    reliability_score: toUndef(row.reliability_score as number | null),
    notes: toUndef(row.notes as string | null) ?? undefined,
    notebook_uuid: toUndef(row.notebook_uuid as string | null) ?? undefined,
  };
}

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    contact_id: String(row.contact_id ?? ""),
    site_id: String(row.site_id ?? ""),
    organization_name: String(row.organization_name ?? ""),
    contact_type: String(row.contact_type ?? ""),
    contact_email: toUndef(row.contact_email as string | null) ?? undefined,
    contact_phone: toUndef(row.contact_phone as string | null) ?? undefined,
    contact_url: toUndef(row.contact_url as string | null) ?? undefined,
    notes: toUndef(row.notes as string | null) ?? undefined,
    source_id: String(row.source_id ?? ""),
  };
}


function computeSpecializations(site: Site, radars: Radar[], activities: SiteActivity[]): string[] {
  const out: string[] = [];
  const cats = new Set(activities.map((a) => a.activity_category));
  const text = [
    site.description, site.missile_relevance, site.radar_relevance, site.launch_relevance,
    ...radars.map((r) => `${r.purpose ?? ""} ${r.public_description ?? ""}`),
    ...activities.map((a) => a.activity_description ?? ""),
  ].join("  ").toLowerCase();

  const bmKeywords = [
    "ballistic missile", "icbm", "slbm", "bmd", "missile defense", "missile defence",
    "early warning", "midcourse", "terminal phase", "interceptor", "thaad", "patriot",
    "aegis bmd", "ground-based midcourse", "gbm", "missile tracking",
    "ballistic", "warhead", "reentry vehicle", "rentry",
  ];
  if (cats.has("Missile Defense") || cats.has("Radar Tracking") || bmKeywords.some((k) => text.includes(k))) {
    out.push("Ballistic Missile Tracking");
  }

  const satKeywords = [
    "satellite", "orbital", "space surveillance", "telemetry", "space domain",
    "geodss", "launch vehicle tracking", "space-track", "spacetrack",
    "space object", "earth orbit", "leo", "geo", "polar orbit",
    "launch range", "downrange tracking",
  ];
  if (cats.has("Space Launch") || cats.has("Telemetry") || cats.has("Radar Tracking") || satKeywords.some((k) => text.includes(k))) {
    out.push("Satellite Launch Tracking");
  }
  return out;
}


// --- DataStore -------------------------------------------------------------

class DataStore {
  static getInstance(): DataStore {
    return new DataStore();
  }

  /**
   * Backwards-compat shim. The old in-memory store needed an async warm-up;
   * SQLite is opened lazily and synchronously so this is a no-op.
   */
  async ensureLoaded(): Promise<void> {
    if (!fs.existsSync(getDbPath())) {
      throw new Error(
        `SQLite database not found at ${getDbPath()}. ` +
        `Run "npm run db:import" once to create it from the Excel file.`
      );
    }
    getDb();
  }

  /** Replace every row across all tables. Wrapped in a single transaction. */
  loadFromImport(
    sites: Site[], radars: Radar[], activities: SiteActivity[],
    sources: Source[], contacts: Contact[],
  ): void {
    transaction((db) => {
      db.exec("DELETE FROM contacts; DELETE FROM activities; DELETE FROM radars; DELETE FROM sites; DELETE FROM sources;");

      const insSource = db.prepare(`INSERT OR REPLACE INTO sources (
        source_id, source_title, source_url, source_type, publisher,
        publication_date, access_date, reliability_score, notes, notebook_uuid
      ) VALUES (@source_id, @source_title, @source_url, @source_type, @publisher,
                @publication_date, @access_date, @reliability_score, @notes, @notebook_uuid)`);
      for (const s of sources) {
        insSource.run({
          source_id: s.source_id,
          source_title: s.source_title ?? null,
          source_url: s.source_url ?? null,
          source_type: s.source_type ?? null,
          publisher: s.publisher ?? null,
          publication_date: s.publication_date ?? null,
          access_date: s.access_date ?? null,
          reliability_score: s.reliability_score ?? null,
          notes: s.notes ?? null,
          notebook_uuid: s.notebook_uuid ?? null,
        });
      }

      const insSite = db.prepare(`INSERT OR REPLACE INTO sites (
        site_id, site_name, site_type, size_category, size_score, country, state,
        latitude, longitude, coordinate_type, managing_organization, operator,
        missile_relevance, launch_relevance, radar_relevance,
        public_contact_email, public_contact_phone, website, description, citations,
        confidence_level, last_verified_date, record_status
      ) VALUES (@site_id, @site_name, @site_type, @size_category, @size_score, @country, @state,
                @latitude, @longitude, @coordinate_type, @managing_organization, @operator,
                @missile_relevance, @launch_relevance, @radar_relevance,
                @public_contact_email, @public_contact_phone, @website, @description, @citations,
                @confidence_level, @last_verified_date, @record_status)`);
      for (const s of sites) {
        insSite.run({
          site_id: s.site_id,
          site_name: s.site_name,
          site_type: s.site_type ?? null,
          size_category: s.size_category ?? null,
          size_score: s.size_score ?? null,
          country: s.country ?? null,
          state: s.state ?? null,
          latitude: s.latitude ?? null,
          longitude: s.longitude ?? null,
          coordinate_type: s.coordinate_type ?? null,
          managing_organization: s.managing_organization ?? null,
          operator: s.operator ?? null,
          missile_relevance: s.missile_relevance ?? null,
          launch_relevance: s.launch_relevance ?? null,
          radar_relevance: s.radar_relevance ?? null,
          public_contact_email: s.public_contact_email ?? null,
          public_contact_phone: s.public_contact_phone ?? null,
          website: s.website ?? null,
          description: s.description ?? null,
          citations: s.citations ?? null,
          confidence_level: s.confidence_level ?? null,
          last_verified_date: s.last_verified_date ?? null,
          record_status: s.record_status ?? null,
        });
      }

      const validSiteIds = new Set(sites.map((s) => s.site_id));

      const insRadar = db.prepare(`INSERT OR REPLACE INTO radars (
        radar_id, site_id, radar_name, radar_model, radar_type, frequency_band, purpose,
        owner, operator, manufacturer, installation_date, upgrade_date, fix_date,
        operational_status, public_description, citations, confidence_level,
        last_verified_date, source_id, record_status
      ) VALUES (@radar_id, @site_id, @radar_name, @radar_model, @radar_type, @frequency_band, @purpose,
                @owner, @operator, @manufacturer, @installation_date, @upgrade_date, @fix_date,
                @operational_status, @public_description, @citations, @confidence_level,
                @last_verified_date, @source_id, @record_status)`);
      for (const r of radars) {
        if (!validSiteIds.has(r.site_id)) continue;
        insRadar.run({
          radar_id: r.radar_id,
          site_id: r.site_id,
          radar_name: r.radar_name ?? null,
          radar_model: r.radar_model ?? null,
          radar_type: r.radar_type ?? null,
          frequency_band: r.frequency_band ?? null,
          purpose: r.purpose ?? null,
          owner: r.owner ?? null,
          operator: r.operator ?? null,
          manufacturer: r.manufacturer ?? null,
          installation_date: r.installation_date ?? null,
          upgrade_date: r.upgrade_date ?? null,
          fix_date: r.fix_date ?? null,
          operational_status: r.operational_status ?? null,
          public_description: r.public_description ?? null,
          citations: r.citations ?? null,
          confidence_level: r.confidence_level ?? null,
          last_verified_date: r.last_verified_date ?? null,
          source_id: r.source_id ?? null,
          record_status: r.record_status ?? null,
        });
      }

      const insAct = db.prepare(`INSERT OR REPLACE INTO activities (
        activity_id, site_id, activity_category, activity_description,
        missile_or_system_type, start_year, end_year, status, source_id, confidence_level
      ) VALUES (@activity_id, @site_id, @activity_category, @activity_description,
                @missile_or_system_type, @start_year, @end_year, @status, @source_id, @confidence_level)`);
      for (const a of activities) {
        if (!validSiteIds.has(a.site_id)) continue;
        insAct.run({
          activity_id: a.activity_id,
          site_id: a.site_id,
          activity_category: a.activity_category ?? null,
          activity_description: a.activity_description ?? null,
          missile_or_system_type: a.missile_or_system_type ?? null,
          start_year: a.start_year ?? null,
          end_year: a.end_year ?? null,
          status: a.status ?? null,
          source_id: a.source_id ?? null,
          confidence_level: a.confidence_level ?? null,
        });
      }

      const insCon = db.prepare(`INSERT OR REPLACE INTO contacts (
        contact_id, site_id, organization_name, contact_type,
        contact_email, contact_phone, contact_url, notes, source_id
      ) VALUES (@contact_id, @site_id, @organization_name, @contact_type,
                @contact_email, @contact_phone, @contact_url, @notes, @source_id)`);
      for (const c of contacts) {
        if (!validSiteIds.has(c.site_id)) continue;
        insCon.run({
          contact_id: c.contact_id,
          site_id: c.site_id,
          organization_name: c.organization_name ?? null,
          contact_type: c.contact_type ?? null,
          contact_email: c.contact_email ?? null,
          contact_phone: c.contact_phone ?? null,
          contact_url: c.contact_url ?? null,
          notes: c.notes ?? null,
          source_id: c.source_id ?? null,
        });
      }

      db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)")
        .run("last_upload_at", new Date().toISOString());
    });
  }


  saveToFile(): void {
    // Kept for API compatibility with the old in-memory store. SQLite writes
    // are already durable, so this is a no-op.
  }


  getAllSites(filters?: FilterState): SiteListItem[] {
    const db = getDb();

    const where: string[] = ["record_status != 'Archived'"];
    const params: Record<string, unknown> = {};

    if (filters) {
      if (filters.search) {
        params.q = `%${filters.search.toLowerCase()}%`;
        where.push(`(
          LOWER(site_name) LIKE @q OR
          LOWER(COALESCE(country, '')) LIKE @q OR
          LOWER(COALESCE(state, '')) LIKE @q OR
          LOWER(COALESCE(managing_organization, '')) LIKE @q OR
          LOWER(COALESCE(operator, '')) LIKE @q OR
          EXISTS (SELECT 1 FROM radars WHERE radars.site_id = sites.site_id AND LOWER(COALESCE(radar_name, '')) LIKE @q)
        )`);
      }
      const addIn = (col: string, vals: string[] | undefined, key: string) => {
        if (vals && vals.length > 0) {
          const placeholders = vals.map((_, i) => `@${key}${i}`).join(",");
          where.push(`${col} IN (${placeholders})`);
          vals.forEach((v, i) => { params[`${key}${i}`] = v; });
        }
      };
      addIn("country", filters.countries, "c");
      addIn("state", filters.states, "st");
      addIn("site_type", filters.siteTypes, "t");
      addIn("size_category", filters.sizeCategories, "sc");
      addIn("confidence_level", filters.confidenceLevels, "cl");
      if (filters.activityTypes && filters.activityTypes.length > 0) {
        const placeholders = filters.activityTypes.map((_, i) => `@at${i}`).join(",");
        where.push(`site_id IN (SELECT site_id FROM activities WHERE activity_category IN (${placeholders}))`);
        filters.activityTypes.forEach((v, i) => { params[`at${i}`] = v; });
      }
    }

    // Select the fields needed for the list item PLUS the relevance/description
    // fields required by computeSpecializations. One round-trip.
    const sql = `
      SELECT
        site_id, site_name, site_type, size_category, country, state,
        latitude, longitude, coordinate_type, operator, managing_organization,
        confidence_level, record_status,
        description, missile_relevance, launch_relevance, radar_relevance,
        (SELECT COUNT(*) FROM radars WHERE radars.site_id = sites.site_id) AS radar_count,
        (SELECT COUNT(*) FROM activities WHERE activities.site_id = sites.site_id) AS activity_count
      FROM sites
      WHERE ${where.join(" AND ")}
      ORDER BY site_name
    `;
    const rows = db.prepare(sql).all(params) as Record<string, unknown>[];

    // Bulk-fetch radars and activities for ALL matching sites in two queries
    // (instead of N+N per-site lookups inside the map below).
    const radarsBySite = new Map<string, Radar[]>();
    const activitiesBySite = new Map<string, SiteActivity[]>();
    if (rows.length > 0) {
      const siteIds = rows.map((r) => String(r.site_id));
      const placeholders = siteIds.map(() => "?").join(",");

      const radarRows = db.prepare(
        `SELECT * FROM radars WHERE site_id IN (${placeholders})`
      ).all(...siteIds) as Record<string, unknown>[];
      for (const r of radarRows) {
        const sid = String(r.site_id);
        const list = radarsBySite.get(sid) ?? [];
        list.push(rowToRadar(r));
        radarsBySite.set(sid, list);
      }

      const actRows = db.prepare(
        `SELECT * FROM activities WHERE site_id IN (${placeholders})`
      ).all(...siteIds) as Record<string, unknown>[];
      for (const a of actRows) {
        const sid = String(a.site_id);
        const list = activitiesBySite.get(sid) ?? [];
        list.push(rowToActivity(a));
        activitiesBySite.set(sid, list);
      }
    }

    let items: SiteListItem[] = rows.map((r) => {
      const siteId = String(r.site_id);
      const site = rowToSite(r);
      const radars = radarsBySite.get(siteId) ?? [];
      const activities = activitiesBySite.get(siteId) ?? [];
      const specializations = computeSpecializations(site, radars, activities);
      return {
        site_id: siteId,
        site_name: site.site_name,
        site_type: site.site_type,
        size_category: site.size_category,
        country: site.country,
        state: site.state,
        latitude: site.latitude,
        longitude: site.longitude,
        coordinate_type: site.coordinate_type || "Site centroid",
        operator: site.operator,
        managing_organization: site.managing_organization,
        confidence_level: site.confidence_level,
        record_status: site.record_status,
        activity_count: Number(r.activity_count ?? 0),
        radar_count: Number(r.radar_count ?? 0),
        specializations,
      };
    });

    if (filters?.specializations && filters.specializations.length > 0) {
      items = items.filter((it) =>
        filters.specializations.some((spec) => it.specializations.includes(spec))
      );
    }

    return items;
  }


  getSiteById(siteId: string): Site | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM sites WHERE site_id = ?").get(siteId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const site = rowToSite(row);
    site.radars = this.getRadarsBySite(siteId);
    site.activities = this.getActivitiesBySite(siteId);
    site.contacts = this.getContactsBySite(siteId);
    site.sources = this.getSourcesForSite(siteId);
    return site;
  }

  private getRadarsBySite(siteId: string): Radar[] {
    const rows = getDb().prepare("SELECT * FROM radars WHERE site_id = ?").all(siteId) as Record<string, unknown>[];
    return rows.map(rowToRadar);
  }

  private getActivitiesBySite(siteId: string): SiteActivity[] {
    const rows = getDb().prepare("SELECT * FROM activities WHERE site_id = ?").all(siteId) as Record<string, unknown>[];
    return rows.map(rowToActivity);
  }

  private getContactsBySite(siteId: string): Contact[] {
    const rows = getDb().prepare("SELECT * FROM contacts WHERE site_id = ?").all(siteId) as Record<string, unknown>[];
    return rows.map(rowToContact);
  }

  private getSourcesForSite(siteId: string): Source[] {
    const db = getDb();
    const site = db.prepare("SELECT citations FROM sites WHERE site_id = ?").get(siteId) as { citations?: string } | undefined;

    const ids = new Set<string>();
    if (site?.citations) {
      for (const id of site.citations.split(/[,\s]+/)) {
        if (id.startsWith("SRC-")) ids.add(id);
      }
    }
    const radarRows = db.prepare("SELECT source_id, citations FROM radars WHERE site_id = ?").all(siteId) as { source_id?: string; citations?: string }[];
    for (const r of radarRows) {
      if (r.source_id) ids.add(r.source_id);
      if (r.citations) {
        for (const id of r.citations.split(/[,\s]+/)) {
          if (id.startsWith("SRC-")) ids.add(id);
        }
      }
    }
    const actRows = db.prepare("SELECT source_id FROM activities WHERE site_id = ?").all(siteId) as { source_id?: string }[];
    for (const a of actRows) if (a.source_id) ids.add(a.source_id);
    const conRows = db.prepare("SELECT source_id FROM contacts WHERE site_id = ?").all(siteId) as { source_id?: string }[];
    for (const c of conRows) if (c.source_id) ids.add(c.source_id);

    if (ids.size === 0) return [];
    const placeholders = Array.from(ids).map(() => "?").join(",");
    const rows = db.prepare(`SELECT * FROM sources WHERE source_id IN (${placeholders})`).all(...Array.from(ids)) as Record<string, unknown>[];
    return rows.map(rowToSource);
  }


  getSourceById(sourceId: string): Source | null {
    const row = getDb().prepare("SELECT * FROM sources WHERE source_id = ?").get(sourceId) as Record<string, unknown> | undefined;
    return row ? rowToSource(row) : null;
  }


  getSitesCitingSource(sourceId: string): Site[] {
    const db = getDb();
    const ids = new Set<string>();

    const sites = db.prepare(
      "SELECT site_id FROM sites WHERE citations LIKE ?"
    ).all(`%${sourceId}%`) as { site_id: string }[];
    sites.forEach((s) => ids.add(s.site_id));

    const radars = db.prepare(
      "SELECT site_id FROM radars WHERE citations LIKE ? OR source_id = ?"
    ).all(`%${sourceId}%`, sourceId) as { site_id: string }[];
    radars.forEach((r) => ids.add(r.site_id));

    const acts = db.prepare(
      "SELECT site_id FROM activities WHERE source_id = ?"
    ).all(sourceId) as { site_id: string }[];
    acts.forEach((a) => ids.add(a.site_id));

    const cons = db.prepare(
      "SELECT site_id FROM contacts WHERE source_id = ?"
    ).all(sourceId) as { site_id: string }[];
    cons.forEach((c) => ids.add(c.site_id));

    if (ids.size === 0) return [];
    const placeholders = Array.from(ids).map(() => "?").join(",");
    const rows = db.prepare(`SELECT * FROM sites WHERE site_id IN (${placeholders})`).all(...Array.from(ids)) as Record<string, unknown>[];
    return rows.map(rowToSite);
  }


  getFilterOptions(): FilterOptions {
    const db = getDb();
    const distinct = (col: string) =>
      (db.prepare(`SELECT DISTINCT ${col} AS v FROM sites WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY ${col}`)
        .all() as { v: string }[])
        .map((r) => r.v);
    const activityCats = (db.prepare(
      `SELECT DISTINCT activity_category AS v FROM activities WHERE activity_category IS NOT NULL ORDER BY activity_category`
    ).all() as { v: string }[]).map((r) => r.v);

    return {
      countries: distinct("country"),
      states: distinct("state"),
      siteTypes: distinct("site_type"),
      sizeCategories: distinct("size_category"),
      activityTypes: activityCats,
      confidenceLevels: ["High", "Medium", "Low"],
      specializations: ["Ballistic Missile Tracking", "Satellite Launch Tracking"],
    };
  }


  /** Return every row across each table (for export). */
  getAll(): { sites: Site[]; radars: Radar[]; activities: SiteActivity[]; sources: Source[]; contacts: Contact[] } {
    const db = getDb();
    return {
      sites: (db.prepare("SELECT * FROM sites ORDER BY site_id").all() as Record<string, unknown>[]).map(rowToSite),
      radars: (db.prepare("SELECT * FROM radars ORDER BY radar_id").all() as Record<string, unknown>[]).map(rowToRadar),
      activities: (db.prepare("SELECT * FROM activities ORDER BY activity_id").all() as Record<string, unknown>[]).map(rowToActivity),
      sources: (db.prepare("SELECT * FROM sources ORDER BY source_id").all() as Record<string, unknown>[]).map(rowToSource),
      contacts: (db.prepare("SELECT * FROM contacts ORDER BY contact_id").all() as Record<string, unknown>[]).map(rowToContact),
    };
  }


  /** Copy data/app.db to backups/app.db.<timestamp> before destructive operations. */
  backup(): string | null {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) return null;
    const backupDir = path.join(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dest = path.join(backupDir, `app.db.${stamp}`);
    fs.copyFileSync(dbPath, dest);
    return dest;
  }
}


export function getDataStore(): DataStore {
  return DataStore.getInstance();
}
