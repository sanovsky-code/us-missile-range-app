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
  UnifiedTaskRow,
  TaskParentKind,
  CountryOverview,
  CountryOverviewMeta,
  CountrySiteRow,
  CountryRadarBreakdown,
  CountryActivityBreakdown,
  CountryContactRow,
  CountrySourceRow,
  CountryDataQuality,
  Opportunity,
  OpportunityListItem,
  OpportunityStage,
  OpportunityTimelineActivity,
  OpportunityActivityType,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_ACTIVITY_TYPES,
  STAGE_PROBABILITY,
  OpportunityDocument,
  OpportunityDocType,
  OPPORTUNITY_DOC_TYPES,
  OpportunityFieldHistoryEntry,
  OpportunityTrackedField,
  OPPORTUNITY_TRACKED_FIELDS,
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

/** Salesforce-style name composition.
 *
 * Priority: explicit `full` wins; otherwise compose from `first` + `last`.
 * Returns null if neither path produces a non-empty string — the caller
 * decides whether to treat that as an error (Create requires it; Update
 * tolerates "no change to name fields"). */
function deriveFullName(
  first?: string | null,
  last?: string | null,
  full?: string | null,
): string | null {
  if (full !== undefined && full !== null) {
    const f = full.trim();
    if (f) return f;
  }
  const composed = [first, last].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  return composed || null;
}

function rowToSite(row: Record<string, unknown>): Site {
  return {
    site_id: String(row.site_id ?? ""),
    site_name: String(row.site_name ?? ""),
    is_hidden: Boolean(row.is_hidden),
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

    // Stale-filter silent reset (Q4 behavior (א)). If the URL preserved a
    // selection like ?country=Algeria from before Algeria was hidden, drop
    // the orphan values from the filter arrays in place. The user sees
    // ALL visible sites instead of an empty list with an inexplicable
    // dangling selection.
    if (filters) {
      const opts = this.getFilterOptions();
      filters.countries        = filters.countries.filter((v)        => opts.countries.includes(v));
      filters.states           = filters.states.filter((v)           => opts.states.includes(v));
      filters.siteTypes        = filters.siteTypes.filter((v)        => opts.siteTypes.includes(v));
      filters.sizeCategories   = filters.sizeCategories.filter((v)   => opts.sizeCategories.includes(v));
      filters.confidenceLevels = filters.confidenceLevels.filter((v) => opts.confidenceLevels.includes(v));
      filters.activityTypes    = filters.activityTypes.filter((v)    => opts.activityTypes.includes(v));
    }

    // Visibility layer: filter out individually-hidden sites AND sites in
    // any country listed in hidden_countries. The map, search autocomplete,
    // sidebar list, and Management feed all flow through here, so this
    // single WHERE pair drives the entire hide behavior. Direct URL to
    // /site/:id (via getSiteById) intentionally bypasses this so bookmarks
    // still work.
    const where: string[] = [
      "record_status != 'Archived'",
      "is_hidden = 0",
      "country NOT IN (SELECT country FROM hidden_countries)",
    ];
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

  /** Lightweight list used by the source lookup. Returns only the columns
   * the typeahead needs (id, title, type, publisher) to keep payloads small. */
  listSources(): Array<{ source_id: string; source_title: string; source_type: string; publisher?: string }> {
    return getDb().prepare(
      "SELECT source_id, source_title, source_type, publisher FROM sources ORDER BY source_id"
    ).all() as Array<{ source_id: string; source_title: string; source_type: string; publisher?: string }>;
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


  /**
   * Filter dropdowns shown in the map sidebar and any other user-facing UI.
   * EVERY option list (countries, states, site types, sizes, confidence
   * levels, activity categories) is derived from VISIBLE sites only, so a
   * country / state / value that only exists on hidden sites disappears
   * from the dropdown. The /countries admin page remains the only place
   * where hidden countries are visible.
   *
   * Specializations stay hardcoded — they are computed strings, not a DB
   * column, and computing them across all visible sites is expensive.
   * Selecting a "stale" specialization just returns an empty list.
   */
  getFilterOptions(): FilterOptions {
    const db = getDb();
    const distinctFromVisible = (col: string) =>
      (db.prepare(`
        SELECT DISTINCT ${col} AS v FROM sites
        WHERE ${col} IS NOT NULL AND ${col} != ''
          AND record_status != 'Archived'
          AND is_hidden = 0
          AND country NOT IN (SELECT country FROM hidden_countries)
        ORDER BY ${col}
      `).all() as { v: string }[]).map((r) => r.v);

    const activityCats = (db.prepare(`
      SELECT DISTINCT activity_category AS v
      FROM site_range_activities
      WHERE activity_category IS NOT NULL
        AND site_id IN (
          SELECT site_id FROM sites
          WHERE record_status != 'Archived'
            AND is_hidden = 0
            AND country NOT IN (SELECT country FROM hidden_countries)
        )
      ORDER BY activity_category
    `).all() as { v: string }[]).map((r) => r.v);

    return {
      countries: distinctFromVisible("country"),
      states: distinctFromVisible("state"),
      siteTypes: distinctFromVisible("site_type"),
      sizeCategories: distinctFromVisible("size_category"),
      activityTypes: activityCats,
      confidenceLevels: distinctFromVisible("confidence_level"),
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
   * Unified task list for the Management page. UNIONs:
   *   - site_timeline_activities (parent = site, parent_subtitle = country)
   *   - contact_timeline_activities (parent = contact, parent_subtitle = org)
   *
   * Each row carries a `parent_type` discriminator so the UI can render the
   * right origin badge, link to the right detail page, and open the right
   * task-detail modal flavor. Defaults to active tasks only.
   */
  listAllTaskActivities(filters?: {
    status?: TaskStatus[];
    priority?: TaskPriority[];
    parent_type?: TaskParentKind;
    /** Either a site_id or a stringified contact id, depending on
     * parent_type. The Management page exposes this through the unified
     * parent filter dropdown. */
    parent_id?: string;
  }): UnifiedTaskRow[] {
    const statuses = filters?.status && filters.status.length > 0
      ? filters.status
      : (["Open", "In Progress"] as TaskStatus[]);
    const statusPlaceholders = statuses.map(() => "?").join(",");

    // Build the per-source WHERE pieces. Status filter applies to both
    // branches; priority too. The parent filter applies to the branch that
    // matches the requested parent_type (and excludes the other branch).
    const siteParams: unknown[] = [...statuses];
    const contactParams: unknown[] = [...statuses];
    let siteWhere = `activity_type = 'Task' AND status IN (${statusPlaceholders})`;
    let contactWhere = `activity_type = 'Task' AND status IN (${statusPlaceholders})`;

    if (filters?.priority && filters.priority.length > 0) {
      const ph = filters.priority.map(() => "?").join(",");
      siteWhere    += ` AND priority IN (${ph})`;
      contactWhere += ` AND priority IN (${ph})`;
      siteParams.push(...filters.priority);
      contactParams.push(...filters.priority);
    }

    // parent_type filters out one branch entirely. parent_id narrows the
    // surviving branch.
    let includeSite = true;
    let includeContact = true;
    if (filters?.parent_type === "site") includeContact = false;
    if (filters?.parent_type === "contact") includeSite = false;

    if (filters?.parent_id) {
      if (filters.parent_type === "site") {
        // a.site_id qualifier — sites.site_id is the joined column, so an
        // unqualified site_id is ambiguous.
        siteWhere += " AND a.site_id = ?";
        siteParams.push(filters.parent_id);
      } else if (filters.parent_type === "contact") {
        const cid = Number(filters.parent_id);
        if (Number.isFinite(cid)) {
          contactWhere += " AND a.contact_id = ?";
          contactParams.push(cid);
        }
      }
    }

    const branches: string[] = [];
    const allParams: unknown[] = [];

    if (includeSite) {
      // Site task branch — hide tasks whose parent site is hidden (per
      // sites.is_hidden) or whose parent site's country is hidden (per
      // hidden_countries). Contact tasks intentionally do NOT have an
      // equivalent filter: a contact stands on its own and its tasks stay
      // visible even if its linked site happens to be hidden.
      branches.push(`
        SELECT
          a.id, 'site' AS parent_type, a.site_id AS parent_id,
          s.site_name AS parent_name, s.country AS parent_subtitle,
          a.activity_type, a.subject, a.body, a.status, a.priority,
          a.due_date, a.assigned_to, a.created_by, a.created_at,
          a.updated_at, a.completed_at
        FROM site_timeline_activities a
        JOIN sites s ON s.site_id = a.site_id
        WHERE ${siteWhere}
          AND s.is_hidden = 0
          AND s.country NOT IN (SELECT country FROM hidden_countries)
      `);
      allParams.push(...siteParams);
    }

    if (includeContact) {
      branches.push(`
        SELECT
          a.id, 'contact' AS parent_type, CAST(a.contact_id AS TEXT) AS parent_id,
          c.full_name AS parent_name, c.organization_name AS parent_subtitle,
          a.activity_type, a.subject, a.body, a.status, a.priority,
          a.due_date, a.assigned_to, a.created_by, a.created_at,
          a.updated_at, a.completed_at
        FROM contact_timeline_activities a
        JOIN crm_contacts c ON c.id = a.contact_id
        WHERE ${contactWhere}
      `);
      allParams.push(...contactParams);
    }

    if (branches.length === 0) return [];

    // Wrap the UNION in a subquery so the outer ORDER BY operates on the
    // merged projection — SQLite otherwise reports "ambiguous column name"
    // when it tries to resolve `id` / `due_date` against the unmerged
    // inner SELECTs.
    const sql = `
      SELECT * FROM (
        ${branches.join("\nUNION ALL\n")}
      ) AS unified
      ORDER BY
        datetime(due_date) IS NULL,
        datetime(due_date) ASC,
        id DESC
    `;
    return getDb().prepare(sql).all(...allParams) as UnifiedTaskRow[];
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


  // --- Visibility (hide/show sites and countries) -------------------------
  //
  // A site can be hidden in two layers:
  //   1. Per-site:    sites.is_hidden = 1
  //   2. Per-country: an entry in hidden_countries.country
  //
  // Both filters live in getAllSites / listFavoriteSites /
  // listAllTaskActivities (site branch only). getSiteById intentionally
  // does NOT filter — a direct URL or bookmark to /site/:id still works.

  /** Toggle the is_hidden flag on one site. Idempotent. */
  setSiteHidden(siteId: string, hidden: boolean): Site | null {
    const exists = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(siteId);
    if (!exists) return null;
    getDb().prepare("UPDATE sites SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE site_id = ?")
      .run(hidden ? 1 : 0, siteId);
    return this.getSiteById(siteId);
  }

  listHiddenCountries(): Array<{ country: string; hidden_by?: string; hidden_at: string }> {
    return getDb().prepare(
      "SELECT country, hidden_by, hidden_at FROM hidden_countries ORDER BY country"
    ).all() as Array<{ country: string; hidden_by?: string; hidden_at: string }>;
  }

  isCountryHidden(country: string): boolean {
    const row = getDb().prepare("SELECT 1 AS v FROM hidden_countries WHERE country = ?").get(country);
    return !!row;
  }

  /** Add a country to the hide list. Idempotent. */
  addHiddenCountry(country: string, hiddenBy?: string): boolean {
    const result = getDb().prepare(
      "INSERT OR IGNORE INTO hidden_countries (country, hidden_by) VALUES (?, ?)"
    ).run(country, hiddenBy ?? null);
    return result.changes > 0;
  }

  /** Remove a country from the hide list. Idempotent. */
  removeHiddenCountry(country: string): boolean {
    const result = getDb().prepare("DELETE FROM hidden_countries WHERE country = ?").run(country);
    return result.changes > 0;
  }

  /**
   * Full country list with counts — drives the /admin/countries page.
   * `hidden_in_list` flags the country-level hide; the per-site numbers
   * come straight from the sites table without applying any visibility
   * filter so the admin sees the true totals.
   */
  listAllCountriesWithCounts(): Array<{
    country: string;
    total: number;
    hidden_sites: number;
    visible_sites: number;
    country_hidden: boolean;
  }> {
    const rows = getDb().prepare(`
      SELECT
        country,
        COUNT(*) AS total,
        SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END) AS hidden_sites,
        SUM(CASE WHEN is_hidden = 0 THEN 1 ELSE 0 END) AS visible_sites
      FROM sites
      WHERE country IS NOT NULL AND country != ''
      GROUP BY country
      ORDER BY country
    `).all() as Array<{ country: string; total: number; hidden_sites: number; visible_sites: number }>;
    const hidden = new Set(this.listHiddenCountries().map((r) => r.country));
    return rows.map((r) => ({ ...r, country_hidden: hidden.has(r.country) }));
  }


  // --- Country portal (Salesforce-style aggregate view) -------------------
  //
  // Country is not a stored entity — these methods build a virtual
  // "Country" record by aggregating across sites and their related tables.
  // Used by /country/[name]. Each method is independent so the page can
  // call them in parallel (server component) or future API endpoints can
  // expose subsets.
  //
  // Note: unlike the regular getAllSites visibility filter, these methods
  // DO NOT hide individually-hidden sites or sites in hidden countries —
  // the operator opened the portal explicitly, so they want the full
  // picture. The visible_sites / hidden_sites split is surfaced in the
  // meta block instead.

  getCountryMeta(country: string): CountryOverviewMeta | null {
    const db = getDb();
    const row = db.prepare(`
      SELECT
        COUNT(*) AS total_sites,
        SUM(CASE WHEN is_hidden = 0 THEN 1 ELSE 0 END) AS visible_sites,
        SUM(CASE WHEN is_hidden = 1 THEN 1 ELSE 0 END) AS hidden_sites
      FROM sites WHERE country = ?
    `).get(country) as { total_sites: number; visible_sites: number; hidden_sites: number };
    if (row.total_sites === 0) return null;

    const radarRow = db.prepare(
      "SELECT COUNT(*) AS n FROM radars WHERE site_id IN (SELECT site_id FROM sites WHERE country = ?)"
    ).get(country) as { n: number };
    const actRow = db.prepare(
      "SELECT COUNT(*) AS n FROM site_range_activities WHERE site_id IN (SELECT site_id FROM sites WHERE country = ?)"
    ).get(country) as { n: number };
    const taskRow = db.prepare(`
      SELECT COUNT(*) AS n FROM site_timeline_activities
       WHERE activity_type = 'Task' AND status IN ('Open','In Progress')
         AND site_id IN (SELECT site_id FROM sites WHERE country = ?)
    `).get(country) as { n: number };
    const hiddenRow = db.prepare("SELECT 1 AS v FROM hidden_countries WHERE country = ?").get(country);

    return {
      name: country,
      total_sites: row.total_sites,
      visible_sites: row.visible_sites,
      hidden_sites: row.hidden_sites,
      country_hidden: !!hiddenRow,
      total_radars: radarRow.n,
      total_operational_activities: actRow.n,
      open_tasks: taskRow.n,
    };
  }

  getCountrySites(country: string): CountrySiteRow[] {
    return getDb().prepare(`
      SELECT
        s.site_id, s.site_name, s.site_type, s.size_category,
        s.confidence_level, s.record_status, s.state, s.is_hidden,
        (SELECT COUNT(*) FROM radars r WHERE r.site_id = s.site_id) AS radar_count,
        (SELECT COUNT(*) FROM site_range_activities a WHERE a.site_id = s.site_id) AS activity_count,
        (SELECT COUNT(*) FROM site_timeline_activities a
          WHERE a.site_id = s.site_id AND a.activity_type = 'Task'
            AND a.status IN ('Open','In Progress')) AS open_task_count
      FROM sites s
      WHERE s.country = ?
      ORDER BY s.is_hidden ASC, s.site_name ASC
    `).all(country) as CountrySiteRow[];
  }

  getCountryDataQuality(country: string): CountryDataQuality {
    const byConf = getDb().prepare(`
      SELECT COALESCE(NULLIF(confidence_level, ''), 'Unknown') AS level, COUNT(*) AS count
      FROM sites WHERE country = ?
      GROUP BY level
      ORDER BY CASE level WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Low' THEN 2 ELSE 3 END
    `).all(country) as Array<{ level: string; count: number }>;
    const byStatus = getDb().prepare(`
      SELECT COALESCE(NULLIF(record_status, ''), 'Unknown') AS status, COUNT(*) AS count
      FROM sites WHERE country = ?
      GROUP BY status
      ORDER BY count DESC
    `).all(country) as Array<{ status: string; count: number }>;
    return { by_confidence: byConf, by_record_status: byStatus };
  }

  getCountryRadarBreakdown(country: string): CountryRadarBreakdown {
    const sub = "(SELECT site_id FROM sites WHERE country = ?)";
    const byType = getDb().prepare(`
      SELECT COALESCE(NULLIF(radar_type, ''), 'Unknown') AS key, COUNT(*) AS count
      FROM radars WHERE site_id IN ${sub}
      GROUP BY key ORDER BY count DESC LIMIT 12
    `).all(country) as Array<{ key: string; count: number }>;
    const byBand = getDb().prepare(`
      SELECT COALESCE(NULLIF(frequency_band, ''), 'Unknown') AS key, COUNT(*) AS count
      FROM radars WHERE site_id IN ${sub}
      GROUP BY key ORDER BY count DESC LIMIT 12
    `).all(country) as Array<{ key: string; count: number }>;
    const topModels = getDb().prepare(`
      SELECT COALESCE(NULLIF(radar_model, ''), 'Unknown') AS key, COUNT(*) AS count
      FROM radars WHERE site_id IN ${sub}
      GROUP BY key ORDER BY count DESC LIMIT 10
    `).all(country) as Array<{ key: string; count: number }>;
    return { by_type: byType, by_band: byBand, top_models: topModels };
  }

  getCountryActivityBreakdown(country: string): CountryActivityBreakdown {
    const sub = "(SELECT site_id FROM sites WHERE country = ?)";
    const byCat = getDb().prepare(`
      SELECT COALESCE(NULLIF(activity_category, ''), 'Unknown') AS key, COUNT(*) AS count
      FROM site_range_activities WHERE site_id IN ${sub}
      GROUP BY key ORDER BY count DESC LIMIT 12
    `).all(country) as Array<{ key: string; count: number }>;
    const recent = getDb().prepare(`
      SELECT a.activity_id, a.site_id, s.site_name,
             a.activity_category, a.activity_description,
             a.start_year, a.end_year, a.status
      FROM site_range_activities a
      JOIN sites s ON s.site_id = a.site_id
      WHERE s.country = ?
      ORDER BY COALESCE(a.start_year, 0) DESC, a.activity_id DESC
      LIMIT 10
    `).all(country) as CountryActivityBreakdown["recent"];
    return { by_category: byCat, recent };
  }

  getCountryContacts(country: string): CountryContactRow[] {
    const db = getDb();
    const sub = "(SELECT site_id FROM sites WHERE country = ?)";

    // Layer 3 user-managed site_contacts
    const a = db.prepare(`
      SELECT 'site_contact' AS source,
             CAST(sc.id AS TEXT) AS ref_id,
             sc.full_name, sc.organization, NULL AS contact_type,
             sc.email, sc.phone, sc.site_id, s.site_name
      FROM site_contacts sc
      JOIN sites s ON s.site_id = sc.site_id
      WHERE sc.site_id IN ${sub}
    `).all(country) as CountryContactRow[];

    // Layer 1 Excel-imported contacts
    const b = db.prepare(`
      SELECT 'imported_contact' AS source,
             c.contact_id AS ref_id,
             COALESCE(c.organization_name, '(Unknown)') AS full_name,
             c.organization_name AS organization,
             c.contact_type, c.contact_email AS email, c.contact_phone AS phone,
             c.site_id, s.site_name
      FROM contacts c
      JOIN sites s ON s.site_id = c.site_id
      WHERE c.site_id IN ${sub}
    `).all(country) as CountryContactRow[];

    // CRM contacts whose site_id falls in this country
    const c = db.prepare(`
      SELECT 'crm_contact' AS source,
             CAST(cc.id AS TEXT) AS ref_id,
             cc.full_name, cc.organization_name AS organization,
             cc.contact_type, cc.email, cc.phone,
             cc.site_id, s.site_name
      FROM crm_contacts cc
      JOIN sites s ON s.site_id = cc.site_id
      WHERE cc.site_id IS NOT NULL AND cc.site_id IN ${sub}
    `).all(country) as CountryContactRow[];

    return [...a, ...b, ...c].sort((x, y) =>
      (x.organization ?? "").localeCompare(y.organization ?? "")
      || x.full_name.localeCompare(y.full_name)
    );
  }

  getCountrySources(country: string): CountrySourceRow[] {
    // Aggregate all sources cited from any site, radar, or activity in
    // this country, plus citation strings that contain SRC- ids.
    const db = getDb();
    const ids = new Map<string, number>();
    const bump = (id?: string | null) => {
      if (!id) return;
      const trimmed = id.trim();
      if (!/^SRC-/.test(trimmed)) return;
      ids.set(trimmed, (ids.get(trimmed) ?? 0) + 1);
    };

    const sub = "(SELECT site_id FROM sites WHERE country = ?)";

    // 1. Direct source_id columns on radars / activities / contacts
    for (const r of (db.prepare(`SELECT source_id, citations FROM radars WHERE site_id IN ${sub}`).all(country) as Array<{ source_id?: string; citations?: string }>)) {
      bump(r.source_id);
      if (r.citations) for (const tok of r.citations.split(/[,\s]+/)) bump(tok);
    }
    for (const r of (db.prepare(`SELECT source_id FROM site_range_activities WHERE site_id IN ${sub}`).all(country) as Array<{ source_id?: string }>)) {
      bump(r.source_id);
    }
    for (const r of (db.prepare(`SELECT source_id FROM contacts WHERE site_id IN ${sub}`).all(country) as Array<{ source_id?: string }>)) {
      bump(r.source_id);
    }

    // 2. Sites' own citations text
    for (const r of (db.prepare("SELECT citations FROM sites WHERE country = ?").all(country) as Array<{ citations?: string }>)) {
      if (r.citations) for (const tok of r.citations.split(/[,\s]+/)) bump(tok);
    }

    if (ids.size === 0) return [];

    const idList = Array.from(ids.keys());
    const placeholders = idList.map(() => "?").join(",");
    const rows = db.prepare(
      `SELECT source_id, source_title, source_type, publisher FROM sources WHERE source_id IN (${placeholders})`
    ).all(...idList) as Array<{ source_id: string; source_title: string; source_type?: string; publisher?: string }>;
    const titleById = new Map(rows.map((r) => [r.source_id, r]));

    return idList
      .map((id) => {
        const meta = titleById.get(id);
        return {
          source_id: id,
          source_title: meta?.source_title ?? "(לא נמצא במאגר)",
          source_type: meta?.source_type,
          publisher: meta?.publisher,
          citation_count: ids.get(id)!,
        };
      })
      .sort((a, b) => b.citation_count - a.citation_count);
  }

  /** Convenience: build the whole CountryOverview in one shot. */
  getCountryOverview(country: string): CountryOverview | null {
    const meta = this.getCountryMeta(country);
    if (!meta) return null;
    return {
      meta,
      data_quality: this.getCountryDataQuality(country),
      sites: this.getCountrySites(country),
      radar_breakdown: this.getCountryRadarBreakdown(country),
      activity_breakdown: this.getCountryActivityBreakdown(country),
      contacts: this.getCountryContacts(country),
      sources: this.getCountrySources(country),
    };
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
        AND s.is_hidden = 0
        AND s.country NOT IN (SELECT country FROM hidden_countries)
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
    // site_name resolves only when the linked site is visible. If the
    // operator linked the contact to a site that's now hidden (per-site
    // is_hidden OR country in hidden_countries), the column comes back
    // NULL — the contact row itself stays in the list, but its site
    // reference becomes silent so we don't leak the hidden site name.
    return getDb().prepare(`
      SELECT c.id, c.full_name, c.organization_name, c.contact_type,
             c.email, c.phone, c.mobile, c.title, c.owner, c.site_id,
             CASE
               WHEN s.site_id IS NOT NULL
                 AND s.record_status != 'Archived'
                 AND s.is_hidden = 0
                 AND s.country NOT IN (SELECT country FROM hidden_countries)
               THEN s.site_name
               ELSE NULL
             END AS site_name
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

  createCrmContact(input: Partial<CrmContact> & { created_by?: string }): CrmContact {
    // Salesforce convention: last_name is required; first_name is optional.
    // If the caller passes an explicit non-empty full_name we honor it (this
    // path is used by legacy API consumers); otherwise we require last_name
    // and derive full_name from first + last.
    let fullName: string;
    if (input.full_name && input.full_name.trim()) {
      fullName = input.full_name.trim();
    } else {
      if (!input.last_name || !input.last_name.trim()) {
        throw new Error("last_name is required");
      }
      fullName = deriveFullName(input.first_name, input.last_name, undefined)!;
    }
    if (input.site_id) {
      const ok = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(input.site_id);
      if (!ok) throw new Error(`Site "${input.site_id}" not found`);
    }
    if (input.source_id) {
      const ok = getDb().prepare("SELECT 1 FROM sources WHERE source_id = ?").get(input.source_id);
      if (!ok) throw new Error(`Source "${input.source_id}" not found`);
    }
    const result = getDb().prepare(`
      INSERT INTO crm_contacts (
        salutation, first_name, last_name, full_name, title,
        organization_name, contact_type, email, phone, mobile,
        contact_url, department, reports_to, owner, site_id,
        mailing_address, notes, source_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      norm(input.salutation), norm(input.first_name), norm(input.last_name), fullName,
      norm(input.title), norm(input.organization_name), norm(input.contact_type),
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

    // FK validations
    if (patch.site_id) {
      const ok = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(patch.site_id);
      if (!ok) throw new Error(`Site "${patch.site_id}" not found`);
    }
    if (patch.source_id) {
      const ok = getDb().prepare("SELECT 1 FROM sources WHERE source_id = ?").get(patch.source_id);
      if (!ok) throw new Error(`Source "${patch.source_id}" not found`);
    }

    // If first_name OR last_name changed, re-derive full_name. If the
    // operator explicitly passes full_name (legacy callers / API), honor
    // their value instead.
    let derivedFullName: string | undefined;
    if (patch.first_name !== undefined || patch.last_name !== undefined) {
      derivedFullName = deriveFullName(
        patch.first_name !== undefined ? patch.first_name : existing.first_name,
        patch.last_name  !== undefined ? patch.last_name  : existing.last_name,
        undefined,
      ) ?? undefined;
      if (!derivedFullName) throw new Error("last_name cannot be empty");
    }
    if (patch.full_name !== undefined) {
      if (!patch.full_name || !patch.full_name.trim()) {
        throw new Error("full_name cannot be empty");
      }
      derivedFullName = patch.full_name.trim();
    }

    const fields: Array<keyof CrmContact> = [
      "salutation","first_name","last_name","title","organization_name","contact_type",
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
    if (derivedFullName !== undefined) {
      updates.push("full_name = ?");
      params.push(derivedFullName);
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



  // --- Opportunities (Salesforce-style pipeline) ---------------------------
  //
  // Opportunities are visibility-aware: rows whose linked Site is hidden
  // (is_hidden=1 OR country in hidden_countries) are excluded from the list
  // view. The detail page still loads via direct URL — that mirrors the
  // bookmark-friendly behavior of /site/[id].

  listOpportunities(filters?: {
    stage?: OpportunityStage;
    country?: string;
    owner?: string;
    search?: string;
  }): OpportunityListItem[] {
    const where: string[] = [
      "s.is_hidden = 0",
      "s.country NOT IN (SELECT country FROM hidden_countries)",
    ];
    const params: unknown[] = [];
    if (filters?.stage) { where.push("o.stage = ?"); params.push(filters.stage); }
    if (filters?.country) { where.push("s.country = ?"); params.push(filters.country); }
    if (filters?.owner) { where.push("o.owner = ?"); params.push(filters.owner); }
    if (filters?.search && filters.search.trim()) {
      where.push("(LOWER(o.name) LIKE ? OR LOWER(s.site_name) LIKE ?)");
      const q = `%${filters.search.trim().toLowerCase()}%`;
      params.push(q, q);
    }
    return getDb().prepare(`
      SELECT o.id, o.name, o.site_id, s.site_name, s.country,
             o.stage, o.probability, o.amount, o.close_date, o.owner, o.updated_at
      FROM opportunities o
      JOIN sites s ON s.site_id = o.site_id
      WHERE ${where.join(" AND ")}
      ORDER BY datetime(COALESCE(o.updated_at, o.created_at)) DESC, o.id DESC
    `).all(...params) as OpportunityListItem[];
  }

  getOpportunity(id: number): Opportunity | null {
    const row = getDb().prepare(`
      SELECT o.*, s.site_name AS site_name, s.country AS country
      FROM opportunities o
      LEFT JOIN sites s ON s.site_id = o.site_id
      WHERE o.id = ?
    `).get(id) as (Omit<Opportunity, "budget_confirmed" | "discovery_completed" | "roi_analysis_completed"> & {
      budget_confirmed: number;
      discovery_completed: number;
      roi_analysis_completed: number;
    }) | undefined;
    if (!row) return null;
    return {
      ...row,
      budget_confirmed: !!row.budget_confirmed,
      discovery_completed: !!row.discovery_completed,
      roi_analysis_completed: !!row.roi_analysis_completed,
    };
  }

  createOpportunity(input: {
    name: string;
    site_id: string;
    stage: OpportunityStage;
    probability?: number;
    amount?: number;
    close_date?: string;
    owner?: string;
    next_step?: string;
    description?: string;
    budget_confirmed?: boolean;
    discovery_completed?: boolean;
    roi_analysis_completed?: boolean;
    loss_reason?: string;
    created_by?: string;
  }): Opportunity {
    if (!input.name || !input.name.trim()) throw new Error("name is required");
    if (!input.site_id || !input.site_id.trim()) throw new Error("site_id is required");
    if (!OPPORTUNITY_STAGES.includes(input.stage)) {
      throw new Error(`Invalid stage: ${input.stage}`);
    }
    const siteExists = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(input.site_id);
    if (!siteExists) throw new Error(`Site "${input.site_id}" not found`);

    // If probability is not provided, default from stage map. Operator can
    // override later via update.
    const probability = input.probability ?? STAGE_PROBABILITY[input.stage];

    // Wrap the INSERT + history anchor in one transaction so the
    // "__created__" marker can never go missing for a row that exists.
    return transaction((db) => {
      const result = db.prepare(`
        INSERT INTO opportunities (
          name, site_id, stage, probability, amount, close_date, owner,
          next_step, description, budget_confirmed, discovery_completed,
          roi_analysis_completed, loss_reason, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.name.trim(), input.site_id, input.stage, probability,
        input.amount ?? null, norm(input.close_date), norm(input.owner),
        norm(input.next_step), norm(input.description),
        input.budget_confirmed ? 1 : 0,
        input.discovery_completed ? 1 : 0,
        input.roi_analysis_completed ? 1 : 0,
        norm(input.loss_reason), norm(input.created_by),
      );
      const id = Number(result.lastInsertRowid);
      // Sentinel "__created__" row. The UI renders this differently —
      // "ההזדמנות נוצרה" with stage/amount summary instead of Field/Old/New.
      const summary = `Stage: ${input.stage}` +
        (input.amount !== undefined ? `; Amount: $${input.amount}` : "") +
        (input.owner ? `; Owner: ${input.owner}` : "");
      db.prepare(`
        INSERT INTO opportunity_field_history (
          opportunity_id, field_name, old_value, new_value, changed_by
        ) VALUES (?, '__created__', NULL, ?, ?)
      `).run(id, summary, norm(input.created_by));
      return this.getOpportunity(id)!;
    });
  }

  updateOpportunity(id: number, patch: Partial<{
    name: string;
    site_id: string;
    stage: OpportunityStage;
    probability: number | null;
    amount: number | null;
    close_date: string | null;
    owner: string | null;
    next_step: string | null;
    description: string | null;
    budget_confirmed: boolean;
    discovery_completed: boolean;
    roi_analysis_completed: boolean;
    loss_reason: string | null;
    updated_by: string;
  }>): Opportunity | null {
    const existing = this.getOpportunity(id);
    if (!existing) return null;

    if (patch.stage && !OPPORTUNITY_STAGES.includes(patch.stage)) {
      throw new Error(`Invalid stage: ${patch.stage}`);
    }
    if (patch.site_id) {
      const ok = getDb().prepare("SELECT 1 FROM sites WHERE site_id = ?").get(patch.site_id);
      if (!ok) throw new Error(`Site "${patch.site_id}" not found`);
    }

    // Compute the effective patch: the cascading stage→probability rule
    // matters for history too — if the operator changed Stage without
    // touching Probability, the auto-bumped Probability still gets a
    // history row.
    const effective: Record<string, unknown> = {};
    if (patch.name !== undefined) effective.name = patch.name.trim();
    if (patch.site_id !== undefined) effective.site_id = patch.site_id;
    if (patch.stage !== undefined) {
      effective.stage = patch.stage;
      if (patch.probability === undefined) {
        effective.probability = STAGE_PROBABILITY[patch.stage];
      }
    }
    if (patch.probability !== undefined) effective.probability = patch.probability;
    if (patch.amount !== undefined) effective.amount = patch.amount;
    if (patch.close_date !== undefined) effective.close_date = norm(patch.close_date);
    if (patch.owner !== undefined) effective.owner = norm(patch.owner);
    if (patch.next_step !== undefined) effective.next_step = norm(patch.next_step);
    if (patch.description !== undefined) effective.description = norm(patch.description);
    if (patch.budget_confirmed !== undefined) effective.budget_confirmed = patch.budget_confirmed ? 1 : 0;
    if (patch.discovery_completed !== undefined) effective.discovery_completed = patch.discovery_completed ? 1 : 0;
    if (patch.roi_analysis_completed !== undefined) effective.roi_analysis_completed = patch.roi_analysis_completed ? 1 : 0;
    if (patch.loss_reason !== undefined) effective.loss_reason = norm(patch.loss_reason);

    if (Object.keys(effective).length === 0) return existing;

    return transaction((db) => {
      const updates: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(effective)) {
        updates.push(`${k} = ?`);
        params.push(v);
      }
      updates.push("updated_at = CURRENT_TIMESTAMP");
      if (patch.updated_by !== undefined) {
        updates.push("updated_by = ?");
        params.push(norm(patch.updated_by));
      }
      params.push(id);
      db.prepare(`UPDATE opportunities SET ${updates.join(", ")} WHERE id = ?`).run(...params);

      // Diff the tracked fields and write one history row per real change.
      // Booleans are normalized to 0/1 on both sides so "true → 1" doesn't
      // get logged as a spurious change.
      const stmt = db.prepare(`
        INSERT INTO opportunity_field_history (
          opportunity_id, field_name, old_value, new_value, changed_by
        ) VALUES (?, ?, ?, ?, ?)
      `);
      const existingRaw: Record<OpportunityTrackedField, unknown> = {
        name: existing.name,
        site_id: existing.site_id,
        stage: existing.stage,
        probability: existing.probability ?? null,
        amount: existing.amount ?? null,
        close_date: existing.close_date ?? null,
        owner: existing.owner ?? null,
        next_step: existing.next_step ?? null,
        description: existing.description ?? null,
        budget_confirmed: existing.budget_confirmed ? 1 : 0,
        discovery_completed: existing.discovery_completed ? 1 : 0,
        roi_analysis_completed: existing.roi_analysis_completed ? 1 : 0,
        loss_reason: existing.loss_reason ?? null,
      };
      for (const field of OPPORTUNITY_TRACKED_FIELDS) {
        if (!(field in effective)) continue;
        const oldVal = existingRaw[field];
        const newVal = effective[field];
        if (oldVal === newVal) continue;
        // Coalesce nullish to empty string for comparison so NULL→NULL no-ops
        // (rare but happens when normalizing whitespace) are also skipped.
        if ((oldVal ?? "") === (newVal ?? "")) continue;
        stmt.run(
          id, field,
          oldVal === null || oldVal === undefined ? null : String(oldVal),
          newVal === null || newVal === undefined ? null : String(newVal),
          norm(patch.updated_by),
        );
      }
      return this.getOpportunity(id);
    });
  }

  /** Append-only field-history feed for an opportunity, newest first.
   * Includes the "__created__" sentinel row as the lifecycle anchor. */
  listOpportunityHistory(opportunityId: number): OpportunityFieldHistoryEntry[] {
    return getDb()
      .prepare(`SELECT * FROM opportunity_field_history WHERE opportunity_id = ?
                ORDER BY datetime(changed_at) DESC, id DESC`)
      .all(opportunityId) as OpportunityFieldHistoryEntry[];
  }

  deleteOpportunity(id: number): boolean {
    const r = getDb().prepare("DELETE FROM opportunities WHERE id = ?").run(id);
    return r.changes > 0;
  }

  // --- Opportunity timeline activities -----------------------------------

  listOpportunityActivities(opportunityId: number, type?: string): OpportunityTimelineActivity[] {
    if (type) {
      return getDb()
        .prepare(`SELECT * FROM opportunity_timeline_activities
                  WHERE opportunity_id = ? AND activity_type = ?
                  ORDER BY datetime(created_at) DESC, id DESC`)
        .all(opportunityId, type) as OpportunityTimelineActivity[];
    }
    return getDb()
      .prepare(`SELECT * FROM opportunity_timeline_activities WHERE opportunity_id = ?
                ORDER BY datetime(created_at) DESC, id DESC`)
      .all(opportunityId) as OpportunityTimelineActivity[];
  }

  getOpportunityActivity(id: number): OpportunityTimelineActivity | null {
    const row = getDb().prepare("SELECT * FROM opportunity_timeline_activities WHERE id = ?").get(id);
    return (row as OpportunityTimelineActivity | undefined) ?? null;
  }

  createOpportunityActivity(input: {
    opportunity_id: number;
    activity_type: OpportunityActivityType;
    subject: string;
    body?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    due_date?: string;
    assigned_to?: string;
    start_at?: string;
    end_at?: string;
    location?: string;
    attendees?: string;
    created_by?: string;
    parent_activity_id?: number;
  }): OpportunityTimelineActivity {
    if (!input.subject || !input.subject.trim()) {
      throw new Error("subject is required");
    }
    if (!OPPORTUNITY_ACTIVITY_TYPES.includes(input.activity_type)) {
      throw new Error(`Invalid activity_type: ${input.activity_type}`);
    }
    const oppExists = getDb().prepare("SELECT 1 FROM opportunities WHERE id = ?").get(input.opportunity_id);
    if (!oppExists) throw new Error(`Opportunity ${input.opportunity_id} not found`);

    let status: TaskStatus | null = null;
    let priority: TaskPriority | null = null;
    if (input.activity_type === "Task") {
      status = input.status && TASK_STATUSES.includes(input.status) ? input.status : "Open";
      priority = input.priority && TASK_PRIORITIES.includes(input.priority) ? input.priority : "Medium";
    } else if (input.status && TASK_STATUSES.includes(input.status)) {
      status = input.status;
    }

    const result = getDb().prepare(`
      INSERT INTO opportunity_timeline_activities (
        opportunity_id, activity_type, subject, body, status, priority,
        due_date, assigned_to, start_at, end_at, location, attendees,
        created_by, parent_activity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.opportunity_id, input.activity_type, input.subject.trim(),
      input.body?.trim() || null, status, priority,
      input.due_date || null, input.assigned_to || null,
      input.start_at || null, input.end_at || null,
      input.location?.trim() || null, input.attendees?.trim() || null,
      input.created_by || null, input.parent_activity_id ?? null,
    );
    return this.getOpportunityActivity(Number(result.lastInsertRowid))!;
  }

  updateOpportunityActivity(id: number, patch: Partial<{
    subject: string;
    body: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    assigned_to: string | null;
    start_at: string | null;
    end_at: string | null;
    location: string | null;
    attendees: string | null;
    created_by: string | null;
  }>): OpportunityTimelineActivity | null {
    const existing = this.getOpportunityActivity(id);
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
      if (patch.start_at !== undefined) { updates.push("start_at = ?"); params.push(patch.start_at || null); }
      if (patch.end_at !== undefined) { updates.push("end_at = ?"); params.push(patch.end_at || null); }
      if (patch.location !== undefined) { updates.push("location = ?"); params.push(patch.location?.trim() || null); }
      if (patch.attendees !== undefined) { updates.push("attendees = ?"); params.push(patch.attendees?.trim() || null); }
      if (statusChanged && patch.status === "Done") updates.push("completed_at = CURRENT_TIMESTAMP");
      if (statusChanged && existing.status === "Done" && patch.status !== "Done") updates.push("completed_at = NULL");
      if (updates.length === 0) return existing;
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(id);
      db.prepare(`UPDATE opportunity_timeline_activities SET ${updates.join(", ")} WHERE id = ?`).run(...params);

      if (statusChanged) {
        db.prepare(`
          INSERT INTO opportunity_timeline_activities (
            opportunity_id, activity_type, subject, body, parent_activity_id, created_by
          ) VALUES (?, 'Task Update', ?, ?, ?, ?)
        `).run(
          existing.opportunity_id, "Task status changed",
          `Status changed from ${existing.status ?? "(unset)"} to ${patch.status}.`,
          id, patch.created_by ?? null,
        );
      }
      return this.getOpportunityActivity(id);
    });
  }

  deleteOpportunityActivity(id: number): boolean {
    const r = getDb().prepare("DELETE FROM opportunity_timeline_activities WHERE id = ?").run(id);
    return r.changes > 0;
  }

  // --- Opportunity documents (URL links only) ----------------------------

  listOpportunityDocuments(opportunityId: number): OpportunityDocument[] {
    return getDb()
      .prepare(`SELECT * FROM opportunity_documents WHERE opportunity_id = ?
                ORDER BY datetime(created_at) DESC, id DESC`)
      .all(opportunityId) as OpportunityDocument[];
  }

  createOpportunityDocument(input: {
    opportunity_id: number;
    title: string;
    url: string;
    doc_type?: OpportunityDocType;
    notes?: string;
    created_by?: string;
  }): OpportunityDocument {
    if (!input.title || !input.title.trim()) throw new Error("title is required");
    if (!input.url || !input.url.trim()) throw new Error("url is required");
    if (input.doc_type && !OPPORTUNITY_DOC_TYPES.includes(input.doc_type)) {
      throw new Error(`Invalid doc_type: ${input.doc_type}`);
    }
    const oppExists = getDb().prepare("SELECT 1 FROM opportunities WHERE id = ?").get(input.opportunity_id);
    if (!oppExists) throw new Error(`Opportunity ${input.opportunity_id} not found`);

    const result = getDb().prepare(`
      INSERT INTO opportunity_documents (
        opportunity_id, title, url, doc_type, notes, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      input.opportunity_id, input.title.trim(), input.url.trim(),
      input.doc_type || null, input.notes?.trim() || null,
      input.created_by || null,
    );
    return getDb().prepare("SELECT * FROM opportunity_documents WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as OpportunityDocument;
  }

  deleteOpportunityDocument(id: number): boolean {
    const r = getDb().prepare("DELETE FROM opportunity_documents WHERE id = ?").run(id);
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
