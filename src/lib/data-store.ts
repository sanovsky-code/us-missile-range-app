import { Site, Radar, SiteActivity, Source, Contact, SiteListItem, FilterState, FilterOptions } from "./types";
import { seedSites, seedRadars, seedActivities, seedSources, seedContacts } from "./seed-data";

class DataStore {
  private static instance: DataStore;
  private sites: Map<string, Site> = new Map();
  private radars: Map<string, Radar> = new Map();
  private activities: Map<string, SiteActivity> = new Map();
  private sources: Map<string, Source> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private initialized = false;

  static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    if (!DataStore.instance.initialized) {
      DataStore.instance.initialize();
    }
    return DataStore.instance;
  }

  private initialize(): void {
    seedSites.forEach((s) => this.sites.set(s.site_id, s));
    seedRadars.forEach((r) => this.radars.set(r.radar_id, r));
    seedActivities.forEach((a) => this.activities.set(a.activity_id, a));
    seedSources.forEach((s) => this.sources.set(s.source_id, s));
    seedContacts.forEach((c) => this.contacts.set(c.contact_id, c));
    this.initialized = true;
  }

  loadFromImport(
    sites: Site[],
    radars: Radar[],
    activities: SiteActivity[],
    sources: Source[],
    contacts: Contact[]
  ): void {
    this.sites.clear();
    this.radars.clear();
    this.activities.clear();
    this.sources.clear();
    this.contacts.clear();
    sites.forEach((s) => this.sites.set(s.site_id, s));
    radars.forEach((r) => this.radars.set(r.radar_id, r));
    activities.forEach((a) => this.activities.set(a.activity_id, a));
    sources.forEach((s) => this.sources.set(s.source_id, s));
    contacts.forEach((c) => this.contacts.set(c.contact_id, c));
  }

  getAllSites(filters?: FilterState): SiteListItem[] {
    let sites = Array.from(this.sites.values()).filter(
      (s) => s.record_status !== "Archived"
    );

    if (filters) {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const radarNames = Array.from(this.radars.values());
        sites = sites.filter((s) => {
          const matchesSite =
            s.site_name.toLowerCase().includes(q) ||
            s.state.toLowerCase().includes(q) ||
            s.managing_organization.toLowerCase().includes(q) ||
            (s.operator?.toLowerCase().includes(q) ?? false);
          const matchesRadar = radarNames.some(
            (r) => r.site_id === s.site_id && r.radar_name.toLowerCase().includes(q)
          );
          return matchesSite || matchesRadar;
        });
      }

      if (filters.states.length > 0) {
        sites = sites.filter((s) => filters.states.includes(s.state));
      }
      if (filters.siteTypes.length > 0) {
        sites = sites.filter((s) => filters.siteTypes.includes(s.site_type));
      }
      if (filters.sizeCategories.length > 0) {
        sites = sites.filter((s) => filters.sizeCategories.includes(s.size_category));
      }
      if (filters.confidenceLevels.length > 0) {
        sites = sites.filter((s) => filters.confidenceLevels.includes(s.confidence_level));
      }
      if (filters.activityTypes.length > 0) {
        const siteActivities = Array.from(this.activities.values());
        const matchingSiteIds = new Set(
          siteActivities
            .filter((a) => filters.activityTypes.includes(a.activity_category))
            .map((a) => a.site_id)
        );
        sites = sites.filter((s) => matchingSiteIds.has(s.site_id));
      }
    }

    return sites.map((s) => this.toListItem(s));
  }

  private toListItem(site: Site): SiteListItem {
    const radars = Array.from(this.radars.values()).filter(
      (r) => r.site_id === site.site_id
    );
    const activities = Array.from(this.activities.values()).filter(
      (a) => a.site_id === site.site_id
    );
    return {
      site_id: site.site_id,
      site_name: site.site_name,
      site_type: site.site_type,
      size_category: site.size_category,
      state: site.state,
      latitude: site.latitude,
      longitude: site.longitude,
      operator: site.operator,
      managing_organization: site.managing_organization,
      confidence_level: site.confidence_level,
      record_status: site.record_status,
      activity_count: activities.length,
      radar_count: radars.length,
    };
  }

  getSiteById(siteId: string): Site | null {
    const site = this.sites.get(siteId);
    if (!site) return null;
    return {
      ...site,
      radars: Array.from(this.radars.values()).filter((r) => r.site_id === siteId),
      activities: Array.from(this.activities.values()).filter((a) => a.site_id === siteId),
      contacts: Array.from(this.contacts.values()).filter((c) => c.site_id === siteId),
      sources: this.getSourcesForSite(siteId),
    };
  }

  private getSourcesForSite(siteId: string): Source[] {
    const sourceIds = new Set<string>();
    Array.from(this.radars.values())
      .filter((r) => r.site_id === siteId)
      .forEach((r) => sourceIds.add(r.source_id));
    Array.from(this.activities.values())
      .filter((a) => a.site_id === siteId)
      .forEach((a) => sourceIds.add(a.source_id));
    Array.from(this.contacts.values())
      .filter((c) => c.site_id === siteId)
      .forEach((c) => sourceIds.add(c.source_id));

    return Array.from(sourceIds)
      .map((id) => this.sources.get(id))
      .filter((s): s is Source => s !== undefined);
  }

  getFilterOptions(): FilterOptions {
    const sites = Array.from(this.sites.values()).filter(
      (s) => s.record_status !== "Archived"
    );
    const activities = Array.from(this.activities.values());

    return {
      states: [...new Set(sites.map((s) => s.state))].sort(),
      siteTypes: [...new Set(sites.map((s) => s.site_type))].sort(),
      sizeCategories: [...new Set(sites.map((s) => s.size_category))],
      activityTypes: [...new Set(activities.map((a) => a.activity_category))].sort(),
      confidenceLevels: ["High", "Medium", "Low"],
    };
  }
}

export function getDataStore(): DataStore {
  return DataStore.getInstance();
}
