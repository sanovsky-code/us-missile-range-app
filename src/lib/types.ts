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
  confidence_level: string;
  last_verified_date: string;
  record_status: string;
  created_by?: string;
  created_date?: string;
  updated_by?: string;
  updated_date?: string;
  radars?: Radar[];
  activities?: SiteActivity[];
  contacts?: Contact[];
  sources?: Source[];
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
  operator?: string;
  managing_organization: string;
  confidence_level: string;
  record_status: string;
  activity_count: number;
  radar_count: number;
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
  confidence_level: string;
  last_verified_date: string;
  source_id: string;
  record_status: string;
}

export interface SiteActivity {
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
  activities: SiteActivity[];
  contacts: Contact[];
  sources: Source[];
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface FilterState {
  search: string;
  countries: string[];
  states: string[];
  siteTypes: string[];
  sizeCategories: string[];
  activityTypes: string[];
  confidenceLevels: string[];
}

export interface FilterOptions {
  countries: string[];
  states: string[];
  siteTypes: string[];
  sizeCategories: string[];
  activityTypes: string[];
  confidenceLevels: string[];
}
