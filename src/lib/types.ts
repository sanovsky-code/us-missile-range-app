export interface Site {
  site_id: string;
  site_name: string;
  site_type: string;
  size_category: string;
  size_score?: number;
  country: string;
  state: string;
  latitude: number;
  longitude: number;
  coordinate_type: string;
  managing_organization: string;
  operator?: string;
  missile_relevance?: string;
  launch_relevance?: string;
  radar_relevance?: string;
  public_contact_email?: string;
  public_contact_phone?: string;
  website?: string;
  description: string;
  citations?: string;
  confidence_level: string;
  last_verified_date: string;
  record_status: string;
  created_by?: string;
  created_date?: string;
  updated_by?: string;
  updated_date?: string;
  radars?: Radar[];
  systems?: System[];
  activities?: SiteRangeActivity[];
  contacts?: Contact[];
  sources?: Source[];
  is_favorite?: boolean;
  /** Display visibility — when true the site is excluded from the map,
   * autocomplete, favorites, and Management task feed. The detail page
   * still loads via a direct URL so bookmarks keep working. */
  is_hidden?: boolean;
}

export interface SiteListItem {
  site_id: string;
  site_name: string;
  site_type: string;
  size_category: string;
  country: string;
  state: string;
  latitude: number;
  longitude: number;
  coordinate_type: string;
  operator?: string;
  managing_organization: string;
  confidence_level: string;
  record_status: string;
  activity_count: number;
  radar_count: number;
  system_count: number;
  specializations: string[];
  /** True when the site has a row in site_favorites. Populated by
   * getAllSites() so list/map views can show a filled star without a
   * second query per row. */
  is_favorite: boolean;
}

/** One row of the site_favorites table (Salesforce-style favorite pointer,
 * not a copy of the Site itself). */
export interface SiteFavorite {
  id: number;
  site_id: string;
  created_by?: string;
  created_at: string;
  sort_order?: number;
  notes?: string;
}

// --- Country portal (Salesforce-style aggregate view) ---------------------
//
// Country is not a stored entity — it's a virtual aggregate built on top of
// sites.country. The portal page joins across sites, radars,
// site_range_activities, site_timeline_activities, contacts /
// site_contacts / crm_contacts, and sources to give the operator a single
// "what's going on in <country>" view.

export interface CountryOverviewMeta {
  name: string;
  total_sites: number;
  visible_sites: number;
  hidden_sites: number;
  country_hidden: boolean;
  total_radars: number;
  total_systems: number;
  total_operational_activities: number;
  open_tasks: number;
}

export interface CountryDataQuality {
  /** Counts by confidence_level — High / Medium / Low / (unknown) — across
   * every site in the country (visible AND hidden). */
  by_confidence: Array<{ level: string; count: number }>;
  /** Counts by record_status — Draft / Verified / Published / etc. */
  by_record_status: Array<{ status: string; count: number }>;
}

export interface CountrySiteRow {
  site_id: string;
  site_name: string;
  site_type?: string;
  size_category?: string;
  confidence_level?: string;
  record_status?: string;
  state?: string;
  is_hidden: boolean;
  radar_count: number;
  system_count: number;
  activity_count: number;
  open_task_count: number;
}

export interface CountryRadarBreakdown {
  by_type: Array<{ key: string; count: number }>;
  by_band: Array<{ key: string; count: number }>;
  top_models: Array<{ key: string; count: number }>;
}

/** Country-portal breakdown of every System row attached to a Site whose
 * country matches. Mirrors CountryRadarBreakdown. */
export interface CountrySystemBreakdown {
  by_category: Array<{ key: string; count: number }>;
  by_status: Array<{ key: string; count: number }>;
  top_owners: Array<{ key: string; count: number }>;
}

export interface CountryActivityBreakdown {
  by_category: Array<{ key: string; count: number }>;
  recent: Array<{
    activity_id: string;
    site_id: string;
    site_name: string;
    activity_category?: string;
    activity_description?: string;
    start_year?: number;
    end_year?: number;
    status?: string;
  }>;
}

export interface CountryContactRow {
  /** Where this contact lives in the model. Drives the "פתח" link. */
  source: "site_contact" | "imported_contact" | "crm_contact";
  /** Stringified id of the underlying row, namespaced by source so the
   * portal can build a stable React key. */
  ref_id: string;
  full_name: string;
  organization?: string;
  contact_type?: string;
  email?: string;
  phone?: string;
  site_id: string;
  site_name: string;
}

export interface CountrySourceRow {
  source_id: string;
  source_title: string;
  source_type?: string;
  publisher?: string;
  /** How many entities in the country (sites/radars/activities/contacts)
   * cite this source. */
  citation_count: number;
}

export interface CountryOverview {
  meta: CountryOverviewMeta;
  data_quality: CountryDataQuality;
  sites: CountrySiteRow[];
  radar_breakdown: CountryRadarBreakdown;
  system_breakdown: CountrySystemBreakdown;
  activity_breakdown: CountryActivityBreakdown;
  contacts: CountryContactRow[];
  sources: CountrySourceRow[];
}


/** Joined favorite row + the Site columns the /favorites page needs to
 * render without a second round-trip. */
export interface FavoriteSiteListItem extends SiteListItem {
  favorite_created_at: string;
  favorite_notes?: string;
  description: string;
  last_verified_date: string;
  open_task_count: number;
}

/** Fixed picklist for system_category. Same constant powers the Excel
 * template dropdown, the import-side enum validation, the Site profile
 * card filter, and the Country portal breakdown. Add new categories here
 * (DB column is plain TEXT, so historical rows survive). */
export const SYSTEM_CATEGORIES = [
  "Optical Tracking",
  "Telemetry / Range Safety",
  "Electronic Warfare",
  "Communications",
  "Command & Control",
  "Test Instrumentation",
  "Weapons Test",
  "Other",
] as const;
export type SystemCategory = (typeof SYSTEM_CATEGORIES)[number];

/** One row of the `systems` table — a site capability that isn't a radar
 * (optical tracking, telemetry, EW, etc.). One Site has many Systems,
 * joined by site_id. Shape mirrors the Radar interface so the Site
 * profile card and the import handler can share helpers. */
export interface System {
  system_id: string;
  site_id: string;
  system_name: string;
  system_category: string;
  purpose?: string;
  owner?: string;
  operator?: string;
  manufacturer?: string;
  operational_status: string;
  public_description?: string;
  citations?: string;
  confidence_level: string;
  last_verified_date?: string;
  source_id?: string;
  record_status: string;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface Radar {
  radar_id: string;
  site_id: string;
  radar_name: string;
  radar_model?: string;
  radar_type: string;
  frequency_band?: string;
  purpose: string;
  owner?: string;
  operator?: string;
  manufacturer?: string;
  installation_date?: string;
  upgrade_date?: string;
  fix_date?: string;
  operational_status: string;
  public_description: string;
  citations?: string;
  confidence_level: string;
  last_verified_date: string;
  source_id: string;
  record_status: string;
  /** Set by getRadarsBySite() so the table can show a "⏱ N" chip without a
   * second query per row. Number of rows in radar_lifecycle_events with
   * this radar_id. Counts hidden / archived events too. */
  lifecycle_count?: number;
  /** Set by getRadarsBySite() — TRUE when radar_favorites has a row for
   * this radar_id under the current installation. */
  is_favorite?: boolean;
}

/** Salesforce-style fixed picklist of lifecycle event types. The DB column
 * is plain TEXT so historical rows survive future picklist edits; UI uses
 * this list for the modal dropdown and the import template's data
 * validation. */
export const RADAR_LIFECYCLE_EVENT_TYPES = [
  "Procurement specification",
  "Procurement award",
  "Contract award",
  "Delivery / modernization",
  "Acceptance",
  "Commissioning",
  "Planned acquisition",
  "Historical reference",
  "Decommissioning",
  "Other",
] as const;
export type RadarLifecycleEventType = (typeof RADAR_LIFECYCLE_EVENT_TYPES)[number];

/** One row of radar_lifecycle_events. disclosed_value is text on purpose
 * — operators record approximate / qualified values ("195583823",
 * ">100000000", "undisclosed") so a numeric column would be lossy. */
export interface RadarLifecycleEvent {
  event_id: string;
  radar_id: string;
  site_id: string;
  event_type: string;
  event_date?: string;
  event_year?: number;
  event_title?: string;
  event_description?: string;
  authority_or_owner?: string;
  supplier_or_contractor?: string;
  disclosed_value?: string;
  currency?: string;
  value_scope?: string;
  evidence_status?: string;
  /** Comma-separated SRC-* ids, matching the radars.citations / systems.citations convention. */
  source_ids?: string;
  analyst_note?: string;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

/** One row of radar_favorites — pointer to a Radar, NOT a copy of it. */
export interface RadarFavorite {
  id: number;
  radar_id: string;
  created_by?: string;
  created_at: string;
  sort_order?: number;
  notes?: string;
}

/** Joined favorite-row + the radar/site columns the /favorites page needs
 * to render without a second round-trip per row. */
export interface FavoriteRadarListItem {
  radar_id: string;
  radar_name: string;
  radar_model?: string;
  radar_type?: string;
  operational_status?: string;
  confidence_level?: string;
  site_id: string;
  site_name: string;
  country?: string;
  lifecycle_count: number;
  favorite_created_at: string;
  favorite_notes?: string;
}

/**
 * Operational / domain activity (missile tests, space launches, historical
 * activity windows) imported from the Excel "Site_Activities" sheet into
 * the `site_range_activities` table.
 *
 * NOT to be confused with SiteTimelineActivity (Salesforce-style user
 * timeline comments / tasks / task updates) defined further down.
 */
export interface SiteRangeActivity {
  activity_id: string;
  site_id: string;
  activity_category: string;
  activity_description: string;
  missile_or_system_type?: string;
  start_year?: number;
  end_year?: number;
  status: string;
  source_id: string;
  confidence_level: string;
}

export interface Source {
  source_id: string;
  source_title: string;
  source_url: string;
  source_type: string;
  publisher?: string;
  publication_date?: string;
  access_date: string;
  reliability_score?: number;
  notes?: string;
  notebook_uuid?: string;
}

export interface Contact {
  contact_id: string;
  site_id: string;
  organization_name: string;
  contact_type: string;
  contact_email?: string;
  contact_phone?: string;
  contact_url?: string;
  notes?: string;
  source_id: string;
}

export interface ValidationError {
  sheet: string;
  row: number;
  field: string;
  value: string;
  rule: string;
  message: string;
  severity: "error" | "warning";
}

export interface ImportResult {
  success: boolean;
  sites: Site[];
  radars: Radar[];
  activities: SiteRangeActivity[];
  contacts: Contact[];
  sources: Source[];
  errors: ValidationError[];
  warnings: ValidationError[];
}

// --- Site contacts (user-managed, CRUD) -----------------------------------
//
// Distinct from the existing `Contact` interface above (Excel-imported public
// contacts that go through the `contacts` table). These are added/edited by
// the customer from the UI and live in the `site_contacts` table.

export interface SiteContact {
  id: number;
  site_id: string;
  full_name: string;
  role_title?: string;
  organization?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

// --- Activity timeline -----------------------------------------------------

export const ACTIVITY_TYPES = [
  "Comment",
  "Task",
  "Task Update",
  // Reserved for future use; the table already supports these:
  // "Call", "Email", "Meeting", "Note",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const TASK_STATUSES = ["Open", "In Progress", "Done", "Cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["Low", "Medium", "High"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/**
 * One row in the unified Activity Timeline. The same shape covers comments,
 * tasks, and task-update history entries. The activity_type field is the
 * discriminator; task-only fields (status/priority/due_date/completed_at)
 * are null for comments. parent_activity_id points a "Task Update" row back
 * at the original "Task" it describes.
 */
export interface SiteTimelineActivity {
  id: number;
  site_id: string;
  activity_type: ActivityType;
  subject: string;
  body?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  parent_activity_id?: number;
}

export interface SiteTimelineActivityWithSite extends SiteTimelineActivity {
  site_name: string;
  country: string;
}

/**
 * One row in the unified task list shown on the Management page.
 *
 * Tasks live in two parallel tables — site_timeline_activities (per-site
 * Salesforce timeline) and contact_timeline_activities (per-contact
 * Salesforce timeline). The Management page UNIONs them so the operator
 * sees every open task regardless of which parent it belongs to. The
 * `parent_type` discriminator lets the UI render the right badge,
 * navigate to the right detail page, and open the right modal.
 */
export type TaskParentKind = "site" | "contact";

export interface UnifiedTaskRow {
  id: number;
  parent_type: TaskParentKind;
  /** site_id for a site task, stringified contact id for a contact task. */
  parent_id: string;
  /** site_name for a site task, full_name for a contact task. */
  parent_name: string;
  /** Country (sites) OR organization_name (contacts). Used as a secondary
   * line under the parent name in the Management table. */
  parent_subtitle?: string;

  // Task columns (same shape as the timeline activities)
  activity_type: "Task";
  subject: string;
  body?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
}

// --- Salesforce-style standalone Contacts module ---------------------------
//
// Distinct from the existing `Contact` (Excel-imported per-site) and
// `SiteContact` (per-site user CRUD) types. CrmContact is an
// organization-level record managed from the /contacts tab.

export const CRM_CONTACT_TYPES = [
  "Customer",
  "Partner",
  "Vendor",
  "Public Affairs",
  "Media",
  "Internal",
  "Other",
] as const;
export type CrmContactType = (typeof CRM_CONTACT_TYPES)[number];

export interface CrmContact {
  id: number;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  /** Derived for display: trim(first_name + " " + last_name).
   * Kept as a column so legacy queries that select it continue to work and
   * so list views can sort/search without re-deriving on every row. */
  full_name: string;
  title?: string;
  organization_name?: string;
  contact_type?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  contact_url?: string;
  department?: string;
  reports_to?: string;
  owner?: string;
  site_id?: string;
  mailing_address?: string;
  notes?: string;
  source_id?: string;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
  /** Set on the detail page response only — joined Site name for display. */
  site_name?: string;
}

/** Row shape returned by the list endpoint. Keeps the payload small. */
export interface CrmContactListItem {
  id: number;
  full_name: string;
  organization_name?: string;
  contact_type?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  owner?: string;
  site_id?: string;
  site_name?: string;
}

/** Timeline row for a contact (Comment / Task / Task Update / Call). Same
 * shape as SiteTimelineActivity but with contact_id as the parent. */
export interface ContactTimelineActivity {
  id: number;
  contact_id: number;
  activity_type: ActivityType | "Call";   // "Call" is a contact-only addition
  subject: string;
  body?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  assigned_to?: string;
  created_by?: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  parent_activity_id?: number;
}

// --- Opportunities (Salesforce-style sales pipeline) -----------------------
//
// One Opportunity = one sale of a radar / system to a customer. Always linked
// to exactly one Site (the customer is picked in the UI via Country → Site).
// Stages and probabilities are tailored to the defense-industry sales cycle.
// Hebrew labels live in STAGE_HEBREW; the DB stores the English value.

export const OPPORTUNITY_STAGES = [
  "Initial Contact",
  "RFI Submitted",
  "Demo",
  "Proposal",
  "Negotiation",
  "Awarded",
  "Lost",
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** Salesforce-style default win probability per stage. Overridable per
 * opportunity but seeded from this map whenever the stage changes. */
export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  "Initial Contact": 10,
  "RFI Submitted": 25,
  Demo: 40,
  Proposal: 60,
  Negotiation: 80,
  Awarded: 100,
  Lost: 0,
};

/** Hebrew labels for picklist rendering. DB always stores the English key. */
export const STAGE_HEBREW: Record<OpportunityStage, string> = {
  "Initial Contact": "קשר ראשוני",
  "RFI Submitted": "הוגש RFI",
  Demo: "הדגמה",
  Proposal: "הצעה",
  Negotiation: "משא ומתן",
  Awarded: "זכייה",
  Lost: "אבדה",
};

export const OPPORTUNITY_DOC_TYPES = [
  "Proposal",
  "RFI",
  "Contract",
  "Presentation",
  "Spec",
  "Other",
] as const;
export type OpportunityDocType = (typeof OPPORTUNITY_DOC_TYPES)[number];

/** Activity type subset for the opportunity timeline. Mirrors the contact
 * timeline plus the Salesforce "New Event" type with start/end/location. */
export const OPPORTUNITY_ACTIVITY_TYPES = [
  "Comment",
  "Task",
  "Task Update",
  "Call",
  "Event",
] as const;
export type OpportunityActivityType = (typeof OPPORTUNITY_ACTIVITY_TYPES)[number];

export interface Opportunity {
  id: number;
  name: string;
  site_id: string;
  stage: OpportunityStage;
  probability?: number;
  amount?: number;
  close_date?: string;
  owner?: string;
  next_step?: string;
  description?: string;
  budget_confirmed: boolean;
  discovery_completed: boolean;
  roi_analysis_completed: boolean;
  loss_reason?: string;
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
  /** Joined for display on the detail page. */
  site_name?: string;
  country?: string;
}

export interface OpportunityListItem {
  id: number;
  name: string;
  site_id: string;
  site_name: string;
  country: string;
  stage: OpportunityStage;
  probability?: number;
  amount?: number;
  close_date?: string;
  owner?: string;
  updated_at?: string;
}

export interface OpportunityTimelineActivity {
  id: number;
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
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  parent_activity_id?: number;
}

export interface OpportunityDocument {
  id: number;
  opportunity_id: number;
  title: string;
  url: string;
  doc_type?: OpportunityDocType;
  notes?: string;
  created_by?: string;
  created_at: string;
}

/** One row of the Salesforce-style "Field History Tracking" log for an
 * Opportunity. field_name="__created__" is the lifecycle anchor written
 * by createOpportunity(); all other rows are diffs produced by
 * updateOpportunity(). Append-only. */
export interface OpportunityFieldHistoryEntry {
  id: number;
  opportunity_id: number;
  field_name: string;
  old_value?: string;
  new_value?: string;
  changed_by?: string;
  changed_at: string;
}

/** Which Opportunity columns get diffed into the field-history log on
 * UPDATE. Kept as a constant tuple so TypeScript can narrow the keys and
 * the data-store loop stays in sync with the Hebrew label map below. */
export const OPPORTUNITY_TRACKED_FIELDS = [
  "name",
  "site_id",
  "stage",
  "probability",
  "amount",
  "close_date",
  "owner",
  "next_step",
  "description",
  "budget_confirmed",
  "discovery_completed",
  "roi_analysis_completed",
  "loss_reason",
] as const;
export type OpportunityTrackedField = (typeof OPPORTUNITY_TRACKED_FIELDS)[number];

/** Hebrew display labels for tracked fields, used by the history card. */
export const OPPORTUNITY_FIELD_LABELS_HE: Record<OpportunityTrackedField, string> = {
  name: "שם",
  site_id: "אתר",
  stage: "Stage",
  probability: "Probability",
  amount: "Amount",
  close_date: "Close Date",
  owner: "Owner",
  next_step: "Next Step",
  description: "תיאור",
  budget_confirmed: "תקציב מאושר",
  discovery_completed: "Discovery הושלם",
  roi_analysis_completed: "ניתוח ROI הושלם",
  loss_reason: "Loss Reason",
};

export interface FilterState {
  search: string;
  countries: string[];
  states: string[];
  siteTypes: string[];
  sizeCategories: string[];
  activityTypes: string[];
  confidenceLevels: string[];
  specializations: string[];
}

export interface FilterOptions {
  countries: string[];
  states: string[];
  siteTypes: string[];
  sizeCategories: string[];
  activityTypes: string[];
  confidenceLevels: string[];
  specializations: string[];
}
