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
  SiteRangeActivity,
  Source,
  Contact,
  SiteListItem,
  FilterState,
  FilterOptions,
  SiteTimelineActivity,
  SiteTimelineActivityWithSite,
  ActivityType,
  ACTIVITY_TYPES,
  TaskStatus,
  TaskPriority,
  TASK_STATUSES,
  TASK_PRIORITIES,
  SiteContact,
  FavoriteSiteListItem,
  CrmContact,
  CrmContactListItem,
  ContactTimelineActivity,
} from "./types";
import { getDb, getDbPath, transaction } from "./db";


// --- helpers ---------------------------------------------------------------

function toUndef<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v;
}

/** Trim a string and turn empty into NULL for SQLite columns. Used by the
 * CRM-contact CRUD so blank inputs don't insert empty strings. */
function norm(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = v.trim();
  return s === "" ? null : s;
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

function rowToRangeActivity(row: Record<string, unknown>): SiteRangeActivity {
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


function computeSpecializations(site: Site, radars: Radar[], activities: SiteRangeActivity[]): string[] {
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

  /**
   * Upsert every row from the Excel source.
   *
   * IMPORTANT: never DELETE FROM sites or use INSERT OR REPLACE on sites.
   * sites.site_id has ON DELETE CASCADE from every user-data table
   * (site_timeline_activities, site_contacts, site_comments, site_tasks), so any
   * delete-and-reinsert pattern would silently wipe customer comments,
   * tasks, and contacts. We use an ON CONFLICT DO UPDATE upsert on sites
   * (a true UPDATE — no DELETE fires) to preserve those rows.
   *
   * Reference tables that have NO user-data linked to them (radars,
   * activities, sources, contacts) are still cleared first and rewritten,
   * which is fine because nothing cascades from them.
   */
  loadFromImport(
    sites: Site[], radars: Radar[], activities: SiteRangeActivity[],
    sources: Source[], contacts: Contact[],
  ): void {
    transaction((db) => {
      // Wipe operational reference tables. None of these are FK targets of
      // user-data tables, so this is safe.
      db.exec("DELETE FROM contacts; DELETE FROM site_range_activities; DELETE FROM radars; DELETE FROM sources;");

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

      // UPSERT (true UPDATE on conflict) so existing sites are updated in
      // place instead of delete-then-inserted. This is what preserves any
      // site_timeline_activities / site_contacts / site_comments / site_tasks rows
      // attached to a site that's being re-imported.
      const insSite = db.prepare(`INSERT INTO sites (
        site_id, site_name, site_type, size_category, size_score, country, state,
        latitude, longitude, coordinate_type, managing_organization, operator,
        missile_relevance, launch_relevance, radar_relevance,
        public_contact_email, public_contact_phone, website, description, citations,
        confidence_level, last_verified_date, record_status
      ) VALUES (@site_id, @site_name, @site_type, @size_category, @size_score, @country, @state,
                @latitude, @longitude, @coordinate_type, @managing_organization, @operator,
                @missile_relevance, @launch_relevance, @radar_relevance,
                @public_contact_email, @public_contact_phone, @website, @description, @citations,
                @confidence_level, @last_verified_date, @record_status)
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
          updated_at = CURRENT_TIMESTAMP`);
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

      const insAct = db.prepare(`INSERT INTO site_range_activities (
        activity_id, site_id, activity_category, activity_description,
        missile_or_system_type, start_year, end_year, status, source_id, confidence_level
      ) VALUES (@activity_id, @site_id, @activity_category, @activity_description,
                @missile_or_system_type, @start_year, @end_year, @status, @source_id, @confidence_level)
        ON CONFLICT(activity_id) DO UPDATE SET
          site_id = excluded.site_id,
          activity_category = excluded.activity_category,
          activity_description = excluded.activity_description,
          missile_or_system_type = excluded.missile_or_system_type,
          start_year = excluded.start_year,
          end_year = excluded.end_year,
          status = excluded.status,
          source_id = excluded.source_id,
          confidence_level = excluded.confidence_level,
          updated_at = CURRENT_TIMESTAMP`);
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
        where.push(`site_id IN (SELECT site_id FROM site_range_activities WHERE activity_category IN (${placeholders}))`);
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
        (SELECT COUNT(*) FROM site_range_activities WHERE site_range_activities.site_id = sites.site_id) AS activity_count
      FROM sites
      WHERE ${where.join(" AND ")}
      ORDER BY site_name
    `;
    const rows = db.prepare(sql).all(params) as Record<string, unknown>[];

    // Bulk-fetch radars, activities, and favorite flags for ALL matching
    // sites in three queries (instead of N+N+N per-site lookups inside the
    // map below).
    const radarsBySite = new Map<string, Radar[]>();
    const activitiesBySite = new Map<string, SiteRangeActivity[]>();
    const favoriteSiteIds = new Set<string>();
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
        `SELECT * FROM site_range_activities WHERE site_id IN (${placeholders})`
      ).all(...siteIds) as Record<string, unknown>[];
      for (const a of actRows) {
        const sid = String(a.site_id);
        const list = activitiesBySite.get(sid) ?? [];
        list.push(rowToRangeActivity(a));
        activitiesBySite.set(sid, list);
      }

      const favRows = db.prepare(
        `SELECT site_id FROM site_favorites WHERE site_id IN (${placeholders})`
      ).all(...siteIds) as { site_id: string }[];
      for (const f of favRows) favoriteSiteIds.add(f.site_id);
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
        is_favorite: favoriteSiteIds.has(siteId),
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
    site.is_favorite = this.isSiteFavorite(siteId);
    return site;
  }

  private getRadarsBySite(siteId: string): Radar[] {
    const rows = getDb().prepare("SELECT * FROM radars WHERE site_id = ?").all(siteId) as Record<string, unknown>[];
    return rows.map(rowToRadar);
  }

  private getActivitiesBySite(siteId: string): SiteRangeActivity[] {
    const rows = getDb().prepare("SELECT * FROM site_range_activities WHERE site_id = ?").all(siteId) as Record<string, unknown>[];
    return rows.map(rowToRangeActivity);
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
    const actRows = db.prepare("SELECT source_id FROM site_range_activities WHERE site_id = ?").all(siteId) as { source_id?: string }[];
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
      "SELECT site_id FROM site_range_activities WHERE source_id = ?"
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
      `SELECT DISTINCT activity_category AS v FROM site_range_activities WHERE activity_category IS NOT NULL ORDER BY activity_category`
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
  getAll(): { sites: Site[]; radars: Radar[]; activities: SiteRangeActivity[]; sources: Source[]; contacts: Contact[] } {
    const db = getDb();
    return {
      sites: (db.prepare("SELECT * FROM sites ORDER BY site_id").all() as Record<string, unknown>[]).map(rowToSite),
      radars: (db.prepare("SELECT * FROM radars ORDER BY radar_id").all() as Record<string, unknown>[]).map(rowToRadar),
      activities: (db.prepare("SELECT * FROM site_range_activities ORDER BY activity_id").all() as Record<string, unknown>[]).map(rowToRangeActivity),
      sources: (db.prepare("SELECT * FROM sources ORDER BY source_id").all() as Record<string, unknown>[]).map(rowToSource),
      contacts: (db.prepare("SELECT * FROM contacts ORDER BY contact_id").all() as Record<string, unknown>[]).map(rowToContact),
    };
  }


  // --- Activity Timeline --------------------------------------------------
  //
  // The site_timeline_activities table holds every user action on a site (comments,
  // tasks, task updates). A status change on a task is persisted in TWO
  // places: the original row's status field is updated, AND a new
  // "Task Update" row is inserted with parent_activity_id pointing at the
  // original task. That history record is what makes the timeline complete.

  listActivitiesForSite(siteId: string, type?: ActivityType): SiteTimelineActivity[] {
    if (type) {
      return getDb()
        .prepare(`SELECT * FROM site_timeline_activities
                  WHERE site_id = ? AND activity_type = ?
                  ORDER BY datetime(created_at) DESC, id DESC`)
        .all(siteId, type) as SiteTimelineActivity[];
    }
    return getDb()
      .prepare(`SELECT * FROM site_timeline_activities WHERE site_id = ?
                ORDER BY datetime(created_at) DESC, id DESC`)
      .all(siteId) as SiteTimelineActivity[];
  }

  getActivityById(id: number): SiteTimelineActivity | null {
    const row = getDb().prepare("SELECT * FROM site_timeline_activities WHERE id = ?").get(id);
    return (row as SiteTimelineActivity | undefined) ?? null;
  }

  /**
   * Create a comment, task, or task-update row. Tasks default to status=Open,
   * priority=Medium. The caller (API route or migration) controls activity_type.
   */
  createActivity(input: {
    site_id: string;
    activity_type: ActivityType;
    subject: string;
    body?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    due_date?: string;
    assigned_to?: string;
    created_by?: string;
    parent_activity_id?: number;
  }): SiteTimelineActivity {
    if (!ACTIVITY_TYPES.includes(input.activity_type)) {
      throw new Error(`Invalid activity_type: ${input.activity_type}`);
    }
    if (!input.subject || !input.subject.trim()) {
      throw new Error("subject is required");
    }
    const siteExists = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(input.site_id);
    if (!siteExists) throw new Error(`Site "${input.site_id}" not found`);

    let status: TaskStatus | null = null;
    let priority: TaskPriority | null = null;
    if (input.activity_type === "Task") {
      status = input.status && TASK_STATUSES.includes(input.status) ? input.status : "Open";
      priority = input.priority && TASK_PRIORITIES.includes(input.priority) ? input.priority : "Medium";
    } else if (input.status && TASK_STATUSES.includes(input.status)) {
      status = input.status;
    }

    const result = getDb().prepare(`
      INSERT INTO site_timeline_activities (
        site_id, activity_type, subject, body, status, priority, due_date,
        assigned_to, created_by, parent_activity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.site_id,
      input.activity_type,
      input.subject.trim(),
      input.body?.trim() || null,
      status,
      priority,
      input.due_date || null,
      input.assigned_to || null,
      input.created_by || null,
      input.parent_activity_id ?? null,
    );
    return this.getActivityById(Number(result.lastInsertRowid))!;
  }

  /**
   * Patch an activity. When a Task's status actually changes, this method
   * also writes a "Task Update" history row that references the original
   * task via parent_activity_id, and stamps completed_at when the new
   * status is "Done".
   */
  updateActivity(id: number, patch: Partial<{
    subject: string;
    body: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    assigned_to: string | null;
    created_by: string | null;
  }>): SiteTimelineActivity | null {
    const existing = this.getActivityById(id);
    if (!existing) return null;

    if (patch.status && !TASK_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`);
    }
    if (patch.priority && !TASK_PRIORITIES.includes(patch.priority)) {
      throw new Error(`Invalid priority: ${patch.priority}`);
    }

    const isTask = existing.activity_type === "Task";
    const statusChanged = isTask && patch.status !== undefined && patch.status !== existing.status;

    return transaction((db) => {
      const updates: string[] = [];
      const params: unknown[] = [];
      if (patch.subject !== undefined) { updates.push("subject = ?"); params.push(patch.subject.trim()); }
      if (patch.body !== undefined) { updates.push("body = ?"); params.push(patch.body?.trim() || null); }
      if (patch.status !== undefined) { updates.push("status = ?"); params.push(patch.status); }
      if (patch.priority !== undefined) { updates.push("priority = ?"); params.push(patch.priority); }
      if (patch.due_date !== undefined) { updates.push("due_date = ?"); params.push(patch.due_date || null); }
      if (patch.assigned_to !== undefined) { updates.push("assigned_to = ?"); params.push(patch.assigned_to || null); }
      if (statusChanged && patch.status === "Done") {
        updates.push("completed_at = CURRENT_TIMESTAMP");
      }
      if (statusChanged && existing.status === "Done" && patch.status !== "Done") {
        // Re-opening a completed task clears completed_at
        updates.push("completed_at = NULL");
      }
      if (updates.length === 0) return existing;
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(id);
      db.prepare(`UPDATE site_timeline_activities SET ${updates.join(", ")} WHERE id = ?`).run(...params);

      // Insert the Task Update history row.
      if (statusChanged) {
        db.prepare(`
          INSERT INTO site_timeline_activities (
            site_id, activity_type, subject, body, parent_activity_id, created_by
          ) VALUES (?, 'Task Update', ?, ?, ?, ?)
        `).run(
          existing.site_id,
          "Task status changed",
          `Status changed from ${existing.status ?? "(unset)"} to ${patch.status}.`,
          id,
          patch.created_by ?? null,
        );
      }

      return this.getActivityById(id);
    });
  }

  deleteActivity(id: number): boolean {
    // ON DELETE CASCADE removes any Task Update children as well.
    const result = getDb().prepare("DELETE FROM site_timeline_activities WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /**
   * Tasks across every site, joined with the site name + country. The
   * Management page calls this. Defaults to active tasks only.
   */
  listAllTaskActivities(filters?: {
    status?: TaskStatus[];
    priority?: TaskPriority[];
    site_id?: string;
  }): SiteTimelineActivityWithSite[] {
    const where: string[] = ["a.activity_type = 'Task'"];
    const params: unknown[] = [];

    const statuses = filters?.status && filters.status.length > 0
      ? filters.status
      : (["Open", "In Progress"] as TaskStatus[]);
    where.push(`a.status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);

    if (filters?.priority && filters.priority.length > 0) {
      where.push(`a.priority IN (${filters.priority.map(() => "?").join(",")})`);
      params.push(...filters.priority);
    }
    if (filters?.site_id) {
      where.push("a.site_id = ?");
      params.push(filters.site_id);
    }

    const sql = `
      SELECT a.*, s.site_name AS site_name, s.country AS country
      FROM site_timeline_activities a
      JOIN sites s ON s.site_id = a.site_id
      WHERE ${where.join(" AND ")}
      ORDER BY
        datetime(a.due_date) IS NULL,
        datetime(a.due_date) ASC,
        a.id DESC
    `;
    return getDb().prepare(sql).all(...params) as SiteTimelineActivityWithSite[];
  }

  // --- Site contacts ------------------------------------------------------
  //
  // User-managed contacts attached to a site. Independent of the
  // Excel-imported Contact records (which live in the `contacts` table and
  // remain read-only).

  listSiteContacts(siteId: string): SiteContact[] {
    return getDb()
      .prepare(`SELECT * FROM site_contacts WHERE site_id = ?
                ORDER BY datetime(created_at) DESC, id DESC`)
      .all(siteId) as SiteContact[];
  }

  getSiteContact(id: number): SiteContact | null {
    const row = getDb().prepare("SELECT * FROM site_contacts WHERE id = ?").get(id);
    return (row as SiteContact | undefined) ?? null;
  }

  createSiteContact(input: {
    site_id: string;
    full_name: string;
    role_title?: string;
    organization?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }): SiteContact {
    if (!input.full_name || !input.full_name.trim()) {
      throw new Error("full_name is required");
    }
    const siteExists = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(input.site_id);
    if (!siteExists) throw new Error(`Site "${input.site_id}" not found`);

    const result = getDb().prepare(`
      INSERT INTO site_contacts
        (site_id, full_name, role_title, organization, phone, email, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.site_id,
      input.full_name.trim(),
      input.role_title?.trim() || null,
      input.organization?.trim() || null,
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.notes?.trim() || null,
    );
    return this.getSiteContact(Number(result.lastInsertRowid))!;
  }

  updateSiteContact(id: number, patch: Partial<{
    full_name: string;
    role_title: string;
    organization: string;
    phone: string;
    email: string;
    notes: string;
  }>): SiteContact | null {
    const existing = this.getSiteContact(id);
    if (!existing) return null;

    const updates: string[] = [];
    const params: unknown[] = [];
    const setStringField = (col: string, val: string | undefined) => {
      if (val === undefined) return;
      updates.push(`${col} = ?`);
      params.push(val.trim() || null);
    };
    setStringField("full_name", patch.full_name);
    setStringField("role_title", patch.role_title);
    setStringField("organization", patch.organization);
    setStringField("phone", patch.phone);
    setStringField("email", patch.email);
    setStringField("notes", patch.notes);

    // Disallow blanking full_name.
    if (patch.full_name !== undefined && !patch.full_name.trim()) {
      throw new Error("full_name cannot be empty");
    }

    if (updates.length === 0) return existing;
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(id);
    getDb().prepare(`UPDATE site_contacts SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return this.getSiteContact(id);
  }

  deleteSiteContact(id: number): boolean {
    const result = getDb().prepare("DELETE FROM site_contacts WHERE id = ?").run(id);
    return result.changes > 0;
  }


  // --- Favorites ----------------------------------------------------------
  //
  // site_favorites stores nothing about the Site itself; it only points at
  // sites.site_id via FK. Both add/remove are idempotent (UNIQUE(site_id) +
  // INSERT OR IGNORE / DELETE ... WHERE site_id = ?).

  isSiteFavorite(siteId: string): boolean {
    const row = getDb().prepare("SELECT 1 AS v FROM site_favorites WHERE site_id = ?").get(siteId);
    return !!row;
  }

  /** Add a site to favorites. Safe to call repeatedly — UNIQUE(site_id)
   * keeps the row count at one. Returns true if a new row was inserted. */
  addSiteFavorite(siteId: string, opts?: { created_by?: string; notes?: string }): boolean {
    const siteExists = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(siteId);
    if (!siteExists) throw new Error(`Site "${siteId}" not found`);
    const result = getDb().prepare(`
      INSERT OR IGNORE INTO site_favorites (site_id, created_by, notes)
      VALUES (?, ?, ?)
    `).run(siteId, opts?.created_by ?? null, opts?.notes ?? null);
    return result.changes > 0;
  }

  /** Remove a site from favorites. Idempotent; returns true if a row was
   * deleted, false if it wasn't a favorite. */
  removeSiteFavorite(siteId: string): boolean {
    const result = getDb().prepare("DELETE FROM site_favorites WHERE site_id = ?").run(siteId);
    return result.changes > 0;
  }

  /** Joined list for the /favorites page. One query — joins site_favorites
   * onto sites and counts open tasks on site_timeline_activities. Filters
   * out Archived sites the same way getAllSites does. */
  listFavoriteSites(): FavoriteSiteListItem[] {
    const rows = getDb().prepare(`
      SELECT
        s.site_id, s.site_name, s.site_type, s.size_category, s.country, s.state,
        s.latitude, s.longitude, s.coordinate_type, s.operator, s.managing_organization,
        s.confidence_level, s.record_status, s.description, s.last_verified_date,
        s.missile_relevance, s.launch_relevance, s.radar_relevance,
        f.created_at AS favorite_created_at, f.notes AS favorite_notes,
        (SELECT COUNT(*) FROM radars             WHERE radars.site_id             = s.site_id) AS radar_count,
        (SELECT COUNT(*) FROM site_range_activities WHERE site_range_activities.site_id = s.site_id) AS activity_count,
        (SELECT COUNT(*) FROM site_timeline_activities a
                            WHERE a.site_id = s.site_id
                              AND a.activity_type = 'Task'
                              AND a.status IN ('Open', 'In Progress')) AS open_task_count
      FROM site_favorites f
      JOIN sites s ON s.site_id = f.site_id
      WHERE s.record_status != 'Archived'
      ORDER BY datetime(f.created_at) DESC, s.site_name
    `).all() as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const site = rowToSite(r);
      // computeSpecializations needs radars and activities; we don't pull
      // them on this page, so fall back to a content-only pass over the
      // site text fields.
      const specializations = computeSpecializations(site, [], []);
      return {
        site_id: site.site_id,
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
        is_favorite: true,
        description: site.description,
        last_verified_date: site.last_verified_date,
        favorite_created_at: String(r.favorite_created_at ?? ""),
        favorite_notes: toUndef(r.favorite_notes as string | null) ?? undefined,
        open_task_count: Number(r.open_task_count ?? 0),
      };
    });
  }


  // --- CRM Contacts (Salesforce-style standalone contacts) ----------------
  //
  // Organization-level contacts managed from the /contacts tab. Optionally
  // linked to a Site via site_id (Salesforce "Account"). Distinct from
  // site_contacts (per-site) and the Excel-imported contacts table.

  listCrmContacts(): CrmContactListItem[] {
    return getDb().prepare(`
      SELECT c.id, c.full_name, c.organization_name, c.contact_type,
             c.email, c.phone, c.mobile, c.title, c.owner, c.site_id,
             s.site_name AS site_name
      FROM crm_contacts c
      LEFT JOIN sites s ON s.site_id = c.site_id
      ORDER BY COALESCE(c.organization_name, '~') ASC, c.full_name ASC
    `).all() as CrmContactListItem[];
  }

  getCrmContact(id: number): CrmContact | null {
    const row = getDb().prepare(`
      SELECT c.*, s.site_name AS site_name
      FROM crm_contacts c
      LEFT JOIN sites s ON s.site_id = c.site_id
      WHERE c.id = ?
    `).get(id) as CrmContact | undefined;
    return row ?? null;
  }

  createCrmContact(input: Partial<CrmContact> & { full_name: string; created_by?: string }): CrmContact {
    if (!input.full_name || !input.full_name.trim()) {
      throw new Error("full_name is required");
    }
    if (input.site_id) {
      const ok = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(input.site_id);
      if (!ok) throw new Error(`Site "${input.site_id}" not found`);
    }
    const result = getDb().prepare(`
      INSERT INTO crm_contacts (
        salutation, full_name, title, organization_name, contact_type,
        email, phone, mobile, contact_url, department, reports_to, owner,
        site_id, mailing_address, notes, source_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      norm(input.salutation), input.full_name.trim(), norm(input.title),
      norm(input.organization_name), norm(input.contact_type),
      norm(input.email), norm(input.phone), norm(input.mobile),
      norm(input.contact_url), norm(input.department), norm(input.reports_to),
      norm(input.owner), norm(input.site_id), norm(input.mailing_address),
      norm(input.notes), norm(input.source_id), norm(input.created_by),
    );
    return this.getCrmContact(Number(result.lastInsertRowid))!;
  }

  updateCrmContact(id: number, patch: Partial<CrmContact> & { updated_by?: string }): CrmContact | null {
    const existing = this.getCrmContact(id);
    if (!existing) return null;
    const fields: Array<keyof CrmContact> = [
      "salutation","full_name","title","organization_name","contact_type",
      "email","phone","mobile","contact_url","department","reports_to","owner",
      "site_id","mailing_address","notes","source_id",
    ];
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const f of fields) {
      if (patch[f] === undefined) continue;
      updates.push(`${f} = ?`);
      params.push(norm(patch[f] as string | undefined));
    }
    if (patch.full_name !== undefined && (!patch.full_name || !patch.full_name.trim())) {
      throw new Error("full_name cannot be empty");
    }
    if (patch.site_id) {
      const ok = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(patch.site_id);
      if (!ok) throw new Error(`Site "${patch.site_id}" not found`);
    }
    if (updates.length === 0) return existing;
    updates.push("updated_at = CURRENT_TIMESTAMP");
    if (patch.updated_by !== undefined) {
      updates.push("updated_by = ?");
      params.push(norm(patch.updated_by));
    }
    params.push(id);
    getDb().prepare(`UPDATE crm_contacts SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return this.getCrmContact(id);
  }

  deleteCrmContact(id: number): boolean {
    // ON DELETE CASCADE removes child timeline rows.
    const r = getDb().prepare("DELETE FROM crm_contacts WHERE id = ?").run(id);
    return r.changes > 0;
  }


  // --- Contact timeline activities ----------------------------------------
  //
  // Per-contact Comment / Task / Task Update / Call rows. Mirrors
  // listActivitiesForSite + friends, but writes to contact_timeline_activities.

  listActivitiesForContact(contactId: number, type?: string): ContactTimelineActivity[] {
    if (type) {
      return getDb()
        .prepare(`SELECT * FROM contact_timeline_activities
                  WHERE contact_id = ? AND activity_type = ?
                  ORDER BY datetime(created_at) DESC, id DESC`)
        .all(contactId, type) as ContactTimelineActivity[];
    }
    return getDb()
      .prepare(`SELECT * FROM contact_timeline_activities WHERE contact_id = ?
                ORDER BY datetime(created_at) DESC, id DESC`)
      .all(contactId) as ContactTimelineActivity[];
  }

  getContactActivityById(id: number): ContactTimelineActivity | null {
    const row = getDb().prepare("SELECT * FROM contact_timeline_activities WHERE id = ?").get(id);
    return (row as ContactTimelineActivity | undefined) ?? null;
  }

  createContactActivity(input: {
    contact_id: number;
    activity_type: string;
    subject: string;
    body?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    due_date?: string;
    assigned_to?: string;
    created_by?: string;
    parent_activity_id?: number;
  }): ContactTimelineActivity {
    if (!input.subject || !input.subject.trim()) {
      throw new Error("subject is required");
    }
    const contactExists = getDb().prepare("SELECT 1 FROM crm_contacts WHERE id = ?").get(input.contact_id);
    if (!contactExists) throw new Error(`Contact ${input.contact_id} not found`);

    let status: TaskStatus | null = null;
    let priority: TaskPriority | null = null;
    if (input.activity_type === "Task") {
      status = input.status && TASK_STATUSES.includes(input.status) ? input.status : "Open";
      priority = input.priority && TASK_PRIORITIES.includes(input.priority) ? input.priority : "Medium";
    } else if (input.status && TASK_STATUSES.includes(input.status)) {
      status = input.status;
    }

    const result = getDb().prepare(`
      INSERT INTO contact_timeline_activities (
        contact_id, activity_type, subject, body, status, priority, due_date,
        assigned_to, created_by, parent_activity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.contact_id, input.activity_type, input.subject.trim(),
      input.body?.trim() || null, status, priority, input.due_date || null,
      input.assigned_to || null, input.created_by || null,
      input.parent_activity_id ?? null,
    );
    return this.getContactActivityById(Number(result.lastInsertRowid))!;
  }

  updateContactActivity(id: number, patch: Partial<{
    subject: string;
    body: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    assigned_to: string | null;
    created_by: string | null;
  }>): ContactTimelineActivity | null {
    const existing = this.getContactActivityById(id);
    if (!existing) return null;
    if (patch.status && !TASK_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`);
    }
    if (patch.priority && !TASK_PRIORITIES.includes(patch.priority)) {
      throw new Error(`Invalid priority: ${patch.priority}`);
    }
    const isTask = existing.activity_type === "Task";
    const statusChanged = isTask && patch.status !== undefined && patch.status !== existing.status;

    return transaction((db) => {
      const updates: string[] = [];
      const params: unknown[] = [];
      if (patch.subject !== undefined) { updates.push("subject = ?"); params.push(patch.subject.trim()); }
      if (patch.body !== undefined) { updates.push("body = ?"); params.push(patch.body?.trim() || null); }
      if (patch.status !== undefined) { updates.push("status = ?"); params.push(patch.status); }
      if (patch.priority !== undefined) { updates.push("priority = ?"); params.push(patch.priority); }
      if (patch.due_date !== undefined) { updates.push("due_date = ?"); params.push(patch.due_date || null); }
      if (patch.assigned_to !== undefined) { updates.push("assigned_to = ?"); params.push(patch.assigned_to || null); }
      if (statusChanged && patch.status === "Done") updates.push("completed_at = CURRENT_TIMESTAMP");
      if (statusChanged && existing.status === "Done" && patch.status !== "Done") updates.push("completed_at = NULL");
      if (updates.length === 0) return existing;
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(id);
      db.prepare(`UPDATE contact_timeline_activities SET ${updates.join(", ")} WHERE id = ?`).run(...params);

      if (statusChanged) {
        db.prepare(`
          INSERT INTO contact_timeline_activities (
            contact_id, activity_type, subject, body, parent_activity_id, created_by
          ) VALUES (?, 'Task Update', ?, ?, ?, ?)
        `).run(
          existing.contact_id, "Task status changed",
          `Status changed from ${existing.status ?? "(unset)"} to ${patch.status}.`,
          id, patch.created_by ?? null,
        );
      }
      return this.getContactActivityById(id);
    });
  }

  deleteContactActivity(id: number): boolean {
    const r = getDb().prepare("DELETE FROM contact_timeline_activities WHERE id = ?").run(id);
    return r.changes > 0;
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
