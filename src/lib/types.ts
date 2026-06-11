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
  activities?: SiteRangeActivity[];
  contacts?: Contact[];
  sources?: Source[];
  is_favorite?: boolean;
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

/** Joined favorite row + the Site columns the /favorites page needs to
 * render without a second round-trip. */
export interface FavoriteSiteListItem extends SiteListItem {
  favorite_created_at: string;
  favorite_notes?: string;
  description: string;
  last_verified_date: string;
  open_task_count: number;
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
